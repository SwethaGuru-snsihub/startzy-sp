// The shared AI service, browser side. It asks the AI route for a task's answer, keeps one request per key
// in flight, records the outcome with the project's documents, and decides when a failure is retried or
// replaced by the simulated answer. It knows nothing about the workflow: it holds a slice of the document
// store (read and write AI records) and fetch, and no handle on the core, so it cannot approve, decide or
// change anything the founder owns. Whether a result is still the right one is decided by its key alone:
// a key is the task plus a hash of everything the answer depends on, so an answer for old input is simply
// never looked up again.
import type { Provider } from '../provenance';
import { fetchAi, type AiFetchResult } from './client';
import { aiKey } from './hash';
import type { AiFallback, AiRecord } from './records';
import type { AiTaskSpec } from './task';

/** What the service needs from storage. */
export type AiStoreLike = {
  aiRecord(key: string): AiRecord | null;
  putAi(record: AiRecord, onlyIf?: (current: AiRecord | null) => boolean): boolean;
  removeAi(key: string): void;
};

export type AiView = {
  key: string;
  /** idle: nothing usable yet and nobody on it. pending: a live request is on it. ready: an answer is stored. failed: it failed and is waiting for a retry. */
  status: 'idle' | 'pending' | 'ready' | 'failed';
  value?: unknown;
  provider?: Provider;
  fallback?: AiFallback;
  error?: string;
  retryable?: boolean;
  attempts: number;
};

/** What happens when the AI cannot answer: use the simulated answer (and say so), or stop and wait for a retry. */
export type OnFailure = 'simulate' | 'hold';
export type EnsureOptions = { onFailure?: OnFailure };

export const TIMING = {
  /** A request that has not finished by then is given up on, whoever started it. Longer than the server's own limits. */
  deadlineMs: 200_000,
  heartbeatMs: 5_000,
  /** A pending record whose owner has not shown a sign of life for this long is taken over. */
  deadAfterMs: 20_000,
  /** One automatic retry, only for a busy server or no answer at all. */
  autoRetries: 1,
  retryDelayMs: 3_000,
};
export type Timing = typeof TIMING;
/** A request interrupted this many times (page closed, tab crashed) is not restarted again by itself. */
export const MAX_RESTARTS = 3;

type Timers = {
  setTimeout: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimeout: (t: ReturnType<typeof setTimeout>) => void;
  setInterval: (fn: () => void, ms: number) => ReturnType<typeof setInterval>;
  clearInterval: (t: ReturnType<typeof setInterval>) => void;
};

export type AiServiceDeps = {
  store: AiStoreLike;
  fetch?: typeof fetch;
  now?: () => number;
  newId?: () => string;
  /** Names this page. Records started by another session are waited on only while it shows signs of life. */
  session?: string;
  timing?: Partial<Timing>;
  timers?: Partial<Timers>;
};

type InFlight = { requestId: string; task: string; ctl: AbortController };

const randomId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`);

export function createAiService(deps: AiServiceDeps) {
  const { store } = deps;
  const f = deps.fetch ?? fetch;
  const now = deps.now ?? Date.now;
  const newId = deps.newId ?? randomId;
  const session = deps.session ?? newId();
  const T: Timing = { ...TIMING, ...deps.timing };
  const timers: Timers = {
    setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: t => clearTimeout(t),
    setInterval: (fn, ms) => setInterval(fn, ms), clearInterval: t => clearInterval(t), ...deps.timers,
  };
  const iso = (ms: number) => new Date(ms).toISOString();
  const inflight = new Map<string, InFlight>();

  const alive = (r: AiRecord) =>
    r.status === 'pending' && !!r.deadline && !!r.heartbeatAt && now() < Date.parse(r.deadline) && now() - Date.parse(r.heartbeatAt) <= T.deadAfterMs;

  const view = (key: string, r: AiRecord | null): AiView => {
    if (!r) return { key, status: 'idle', attempts: 0 };
    if (r.status === 'ready') return { key, status: 'ready', value: r.value, provider: r.provider, ...(r.fallback ? { fallback: r.fallback } : {}), attempts: r.attempts };
    if (r.status === 'failed') return { key, status: 'failed', error: r.error, retryable: r.retryable, attempts: r.attempts };
    return alive(r) ? { key, status: 'pending', attempts: r.attempts } : { key, status: 'idle', attempts: r.attempts };   // a dead request is as good as none
  };

  const sleep = (ms: number, signal: AbortSignal) => new Promise<void>(resolve => {
    if (signal.aborted) return resolve();
    const t = timers.setTimeout(done, ms);
    function done() { timers.clearTimeout(t); signal.removeEventListener('abort', done); resolve(); }
    signal.addEventListener('abort', done, { once: true });
  });

  function simulatedRecord(spec: AiTaskSpec, input: unknown, base: AiRecord, reason: string): AiRecord {
    return { ...base, status: 'ready', value: spec.simulate(input), provider: 'simulated', fallback: { from: 'claude-cli', reason }, error: undefined, retryable: undefined, session: undefined, heartbeatAt: undefined, deadline: undefined, settledAt: iso(now()) };
  }

  /** Writes the outcome only while this attempt still owns the record; otherwise the answer is discarded. */
  const settle = (rec: AiRecord) => store.putAi(rec, cur => cur?.requestId === rec.requestId);

  async function run(spec: AiTaskSpec, input: unknown, key: string, start: AiRecord, opts: EnsureOptions, entry: InFlight) {
    const { ctl } = entry;
    let rec = start;
    const stillOurs = () => !ctl.signal.aborted;
    const beat = timers.setInterval(() => {
      const ok = store.putAi({ ...rec, heartbeatAt: iso(now()) }, cur => cur?.requestId === rec.requestId && cur.status === 'pending');
      if (!ok) ctl.abort();                              // the record was replaced or removed: someone else owns this key now
    }, T.heartbeatMs);
    let timedOut = false;
    const remaining = Date.parse(start.deadline ?? '') - now();
    const giveUp = timers.setTimeout(() => { timedOut = true; ctl.abort(); }, Math.max(1, Number.isFinite(remaining) ? remaining : T.deadlineMs));
    try {
      let autoTries = 0;
      for (;;) {
        const r: AiFetchResult = await fetchAi(spec.id, input, f, ctl.signal);
        if (!stillOurs() && !timedOut) return;           // cancelled: write nothing
        let failure: { error: string; retryable: boolean } | null = null;
        if (timedOut) failure = { error: 'The AI request took too long.', retryable: false };
        else if (r.ok) {
          if (r.key !== key) failure = { error: 'The service answered a different request.', retryable: false };
          else if (spec.checkResult && !spec.checkResult(r.result)) failure = { error: 'The AI answer was not in the expected shape.', retryable: false };
          else { settle({ ...rec, status: 'ready', value: r.result, provider: r.provider, error: undefined, retryable: undefined, session: undefined, heartbeatAt: undefined, deadline: undefined, settledAt: iso(now()) }); return; }
        } else failure = { error: r.error, retryable: r.retryable };

        if (failure.retryable && autoTries < T.autoRetries) {
          autoTries++;
          rec = { ...rec, attempts: rec.attempts + 1, heartbeatAt: iso(now()) };
          if (!store.putAi(rec, cur => cur?.requestId === rec.requestId)) return;
          await sleep(T.retryDelayMs, ctl.signal);
          if (!stillOurs()) return;
          continue;
        }
        const base: AiRecord = { ...rec, session: undefined, heartbeatAt: undefined, deadline: undefined, settledAt: iso(now()) };
        settle(opts.onFailure === 'simulate'
          ? simulatedRecord(spec, input, base, failure.error)
          : { ...base, status: 'failed', error: failure.error, retryable: failure.retryable });
        return;
      }
    } finally {
      timers.clearInterval(beat); timers.clearTimeout(giveUp);
      if (inflight.get(key) === entry) inflight.delete(key);
    }
  }

  /** Starts a request if storage still holds what the caller saw (`expect`), and returns who ended up owning the key. */
  function start(spec: AiTaskSpec, input: unknown, key: string, attempts: number, opts: EnsureOptions, expect: (cur: AiRecord | null) => boolean): AiView {
    const t0 = now();
    const requestId = newId();
    const pending: AiRecord = { key, task: spec.id, status: 'pending', requestId, attempts, requestedAt: iso(t0), session, heartbeatAt: iso(t0), deadline: iso(t0 + T.deadlineMs) };
    if (!store.putAi(pending, expect)) return view(key, store.aiRecord(key));   // another tab or an earlier call got there first
    const entry: InFlight = { requestId, task: spec.id, ctl: new AbortController() };
    inflight.set(key, entry);
    void run(spec, input, key, pending, opts, entry);
    return view(key, pending);
  }

  const ours = (key: string, r: AiRecord) => inflight.get(key)?.requestId === r.requestId;

  const api = {
    /** What is known for this exact input, with no side effects. */
    peek(spec: AiTaskSpec, input: unknown): AiView {
      const key = aiKey(spec, input);
      return view(key, store.aiRecord(key));
    },

    /**
     * Makes sure there is an answer, or a live request for one, for this exact input. Safe to call over and
     * over: a ready answer is reused, a live request (this page's or another tab's) is waited on, a request
     * whose owner has gone quiet is taken over, and a failure stays failed until `retry` (or, if the task
     * says so, is replaced by the simulated answer, with the reason recorded).
     */
    ensure(spec: AiTaskSpec, input: unknown, opts: EnsureOptions = {}): AiView {
      const key = aiKey(spec, input);
      const rec = store.aiRecord(key);
      if (!rec) return start(spec, input, key, 1, opts, cur => cur === null);
      if (rec.status === 'ready') return view(key, rec);
      if (rec.status === 'pending') {
        if (ours(key, rec) || alive(rec)) return view(key, rec);
        if (rec.attempts >= MAX_RESTARTS) {
          store.putAi({ ...rec, status: 'failed', error: 'The request was interrupted too many times.', retryable: true, session: undefined, heartbeatAt: undefined, deadline: undefined, settledAt: iso(now()) }, cur => cur?.requestId === rec.requestId);
          return api.ensure(spec, input, opts);
        }
        return start(spec, input, key, rec.attempts + 1, opts, cur => !!cur && cur.requestId === rec.requestId && !alive(cur));   // take over a dead request
      }
      // failed
      if (opts.onFailure === 'simulate') {
        store.putAi(simulatedRecord(spec, input, rec, rec.error ?? 'The AI could not answer.'), cur => cur?.requestId === rec.requestId);
        return view(key, store.aiRecord(key));
      }
      return view(key, rec);
    },

    /**
     * Asks again, because the founder or a caller chose to: after a failure, or to replace a simulated
     * fallback with a real answer. A ready real answer is kept; a request already running is left alone.
     */
    retry(spec: AiTaskSpec, input: unknown, opts: EnsureOptions = {}): AiView {
      const key = aiKey(spec, input);
      const rec = store.aiRecord(key);
      if (rec && (ours(key, rec) || alive(rec))) return view(key, rec);
      if (rec?.status === 'ready' && !rec.fallback) return view(key, rec);
      return start(spec, input, key, (rec?.attempts ?? 0) + 1, opts, cur => (rec ? !!cur && cur.requestId === rec.requestId : cur === null));
    },

    /** Stops asking for this key and forgets the request. Nothing is written when the answer arrives. */
    cancel(key: string) {
      const entry = inflight.get(key);
      if (!entry) return;
      entry.ctl.abort();
      inflight.delete(key);
      const cur = store.aiRecord(key);
      if (cur && cur.requestId === entry.requestId && cur.status === 'pending') store.removeAi(key);
    },

    /** Cancels every request this page has for the task except the one for `keepKey` (the input it now has). */
    cancelOthers(task: string, keepKey: string | null) {
      for (const [key, e] of [...inflight]) if (e.task === task && key !== keepKey) api.cancel(key);
    },

    /** Keys this page is fetching right now. */
    inFlight: (): string[] => [...inflight.keys()],
    session,
  };
  return api;
}
export type AiService = ReturnType<typeof createAiService>;
