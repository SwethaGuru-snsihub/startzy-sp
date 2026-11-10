import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MemoryAdapter } from '@/services/coreStorage';
import { aiKey } from '../ai/hash';
import { MAX_RESTARTS, TIMING, createAiService, type AiServiceDeps } from '../ai/service';
import type { AiRecord } from '../ai/records';
import { ideaBriefSpec } from '../ai/specs/ideaBrief';
import type { AiTaskSpec } from '../ai/task';
import { createDocStore } from '../docStore';
import { EXAMPLE_IDEA } from '../idea';

type Echo = { word: string };
const echo: AiTaskSpec<Echo, { shout: string }> = {
  id: 'echo', title: 'Echo', version: 1, systemPrompt: 'Repeat the word loudly.', jsonSchema: { type: 'object' }, dependsOn: ['word'],
  parseInput: raw => ({ ok: true, value: raw as Echo }), buildMessage: i => i.word,
  validate: raw => ({ ok: true, value: raw as { shout: string } }), simulate: i => ({ shout: i.word.toUpperCase() }),
  checkResult: v => typeof (v as { shout?: unknown } | null)?.shout === 'string',
};
const cat: Echo = { word: 'cat' }, dog: Echo = { word: 'dog' };

/** A clock and timers the test moves by hand, so no test waits for real time. */
function clock() {
  let t = Date.parse('2026-11-10T10:00:00.000Z'), id = 0;
  const tos = new Map<number, { at: number; fn: () => void }>(), ivs = new Map<number, { every: number; next: number; fn: () => void }>();
  const timers = {
    setTimeout: (fn: () => void, ms: number) => { tos.set(++id, { at: t + ms, fn }); return id as never; },
    clearTimeout: (h: never) => { tos.delete(h); },
    setInterval: (fn: () => void, ms: number) => { ivs.set(++id, { every: ms, next: t + ms, fn }); return id as never; },
    clearInterval: (h: never) => { ivs.delete(h); },
  };
  const tick = () => new Promise<void>(r => setTimeout(r, 0));
  async function advance(ms: number) {
    const end = t + ms;
    for (;;) {
      const nextTo = [...tos.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      const nextIv = [...ivs.entries()].sort((a, b) => a[1].next - b[1].next)[0];
      const at = Math.min(nextTo?.[1].at ?? Infinity, nextIv?.[1].next ?? Infinity);
      if (at > end) break;
      t = at;
      if (nextTo && nextTo[1].at === at) { tos.delete(nextTo[0]); nextTo[1].fn(); }
      else if (nextIv) { nextIv[1].next += nextIv[1].every; nextIv[1].fn(); }
      await tick();
    }
    t = end;
    await tick();
  }
  return { now: () => t, advance, timers, tick, pendingTimers: () => tos.size + ivs.size };
}

/** A fake of /api/ai that answers only when told to. */
type Call = { body: { task: string; input: unknown }; signal?: AbortSignal; ok(provider?: 'claude-cli' | 'simulated', result?: unknown): void; fail(status: number, error?: string): void; wrongKey(): void; neverEnds: boolean };
function server() {
  const calls: Call[] = [];
  const fetchFn = ((_url: string, init: RequestInit) => new Promise<Response>((resolve, reject) => {
    const body = JSON.parse(String(init.body));
    init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    const spec = body.task === 'idea-brief' ? ideaBriefSpec : echo;
    calls.push({
      body, signal: init.signal ?? undefined, neverEnds: false,
      ok: (provider = 'claude-cli', result = { shout: 'HI' }) => resolve(new Response(JSON.stringify({ task: body.task, key: aiKey(spec as AiTaskSpec, body.input), provider, result }), { status: 200 })),
      fail: (status, error = 'nope') => resolve(new Response(JSON.stringify({ error }), { status })),
      wrongKey: () => resolve(new Response(JSON.stringify({ task: body.task, key: `${body.task}:deadbeef`, provider: 'claude-cli', result: { shout: 'X' } }), { status: 200 })),
    });
  })) as unknown as typeof fetch;
  return { calls, fetchFn };
}

function setup(over: Partial<AiServiceDeps> = {}, store = createDocStore(new MemoryAdapter(), 'p1')) {
  const c = clock(), s = server();
  const svc = createAiService({ store, fetch: s.fetchFn, now: c.now, timers: c.timers as unknown as AiServiceDeps['timers'], newId: (() => { let n = 0; return () => `id${++n}`; })(), session: 'tab1', ...over });
  return { c, s, svc, store };
}

describe('one request per key', () => {
  it('starts a request, records it as pending with its owner and deadline, and reuses it', async () => {
    const { s, svc, store, c } = setup();
    const v = svc.ensure(echo, cat);
    expect(v.status).toBe('pending');
    expect(s.calls).toHaveLength(1);
    expect(s.calls[0].body).toEqual({ task: 'echo', input: cat });
    const rec = store.aiRecord(v.key)!;
    expect(rec).toMatchObject({ status: 'pending', task: 'echo', attempts: 1, session: 'tab1', requestId: 'id1' });
    expect(Date.parse(rec.deadline!) - c.now()).toBe(TIMING.deadlineMs);
    expect(svc.ensure(echo, cat).status).toBe('pending');
    expect(s.calls).toHaveLength(1);                     // single flight
  });
  it('turns fifty simultaneous callers into one request', () => {
    const { s, svc } = setup();
    for (let i = 0; i < 50; i++) svc.ensure(echo, cat);
    expect(s.calls).toHaveLength(1);
  });
  it('stores the answer with who produced it, and never asks again for the same input', async () => {
    const { s, svc, store, c } = setup();
    const { key } = svc.ensure(echo, cat);
    s.calls[0].ok('claude-cli', { shout: 'MEOW' });
    await c.tick();
    expect(svc.peek(echo, cat)).toMatchObject({ key, status: 'ready', provider: 'claude-cli', value: { shout: 'MEOW' }, attempts: 1 });
    expect(store.aiRecord(key)).toMatchObject({ status: 'ready', provider: 'claude-cli' });
    expect(store.aiRecord(key)?.session).toBeUndefined();
    for (let i = 0; i < 5; i++) expect(svc.ensure(echo, cat).status).toBe('ready');
    expect(s.calls).toHaveLength(1);
  });
  it('keeps different inputs apart: each has its own key, request and answer', async () => {
    const { s, svc, c } = setup();
    const a = svc.ensure(echo, cat), b = svc.ensure(echo, dog);
    expect(a.key).not.toBe(b.key);
    expect(s.calls).toHaveLength(2);
    s.calls[1].ok('claude-cli', { shout: 'WOOF' });
    await c.tick();
    expect(svc.peek(echo, dog)).toMatchObject({ status: 'ready', value: { shout: 'WOOF' } });
    expect(svc.peek(echo, cat).status).toBe('pending');
  });
  it('reports the provider the server named, with no fallback when the server itself used the simulated one', async () => {
    const { s, svc, c } = setup();
    svc.ensure(echo, cat);
    s.calls[0].ok('simulated', { shout: 'CAT' });
    await c.tick();
    expect(svc.peek(echo, cat)).toMatchObject({ status: 'ready', provider: 'simulated' });
    expect(svc.peek(echo, cat).fallback).toBeUndefined();
  });
});

describe('overlapping requests for one task', () => {
  it('keeps the failure of one visible while two others are still running (found by a live run)', async () => {
    const { s, svc, c } = setup();
    const a = { word: 'a-word' }, b = { word: 'b-word' }, third = { word: 'third-word' };
    svc.ensure(echo, a); svc.ensure(echo, b); svc.ensure(echo, third);
    s.calls[2].fail(429, 'Claude is busy.'); await c.tick();
    await c.advance(TIMING.retryDelayMs);
    s.calls[3].fail(429, 'Claude is busy.'); await c.tick();                // the one automatic retry is also turned away
    expect(svc.peek(echo, third)).toMatchObject({ status: 'failed', error: 'Claude is busy.', retryable: true });
    expect(svc.peek(echo, a).status).toBe('pending');
    expect(svc.peek(echo, b).status).toBe('pending');
    s.calls[0].ok(); s.calls[1].ok(); await c.tick();
    expect(svc.peek(echo, a).status).toBe('ready');
    expect(svc.peek(echo, b).status).toBe('ready');
    expect(svc.peek(echo, third).status).toBe('failed');                    // still there for whoever retries
  });
});

describe('stale and late answers', () => {
  it('abandons a request when the input moved on: it is aborted, forgotten, and its late answer is never stored', async () => {
    const { s, svc, store, c } = setup();
    const old = svc.ensure(echo, cat);
    const now = svc.ensure(echo, dog);
    svc.cancelOthers('echo', now.key);
    expect(s.calls[0].signal?.aborted).toBe(true);
    expect(s.calls[1].signal?.aborted).toBe(false);
    expect(store.aiRecord(old.key)).toBeNull();
    expect(svc.inFlight()).toEqual([now.key]);
    s.calls[0].ok();                                     // the old answer turns up anyway
    await c.tick();
    expect(store.aiRecord(old.key)).toBeNull();
    expect(svc.peek(echo, cat).status).toBe('idle');
    s.calls[1].ok('claude-cli', { shout: 'WOOF' });
    await c.tick();
    expect(svc.peek(echo, dog).status).toBe('ready');
  });
  it('never lets an answer replace a record that another request now owns', async () => {
    const { s, svc, store, c } = setup();
    const { key } = svc.ensure(echo, cat);
    const mine = store.aiRecord(key)!;
    store.putAi({ ...mine, requestId: 'someone-else', session: 'tab2' });          // another tab took the key over
    s.calls[0].ok('claude-cli', { shout: 'LATE' });
    await c.tick();
    expect(store.aiRecord(key)).toMatchObject({ status: 'pending', requestId: 'someone-else' });
  });
  it('stops fetching when it notices another request owns the key', async () => {
    const { s, svc, store, c } = setup();
    const { key } = svc.ensure(echo, cat);
    store.putAi({ ...store.aiRecord(key)!, requestId: 'someone-else', session: 'tab2' });
    await c.advance(TIMING.heartbeatMs);
    expect(s.calls[0].signal?.aborted).toBe(true);
    expect(svc.inFlight()).toEqual([]);
  });
  it('does not trust an answer for a different request, or one in the wrong shape', async () => {
    const { s, svc, c } = setup();
    svc.ensure(echo, cat); svc.ensure(echo, dog);
    s.calls[0].wrongKey();
    s.calls[1].ok('claude-cli', { nope: 1 });
    await c.tick();
    expect(svc.peek(echo, cat)).toMatchObject({ status: 'failed', error: 'The service answered a different request.', retryable: false });
    expect(svc.peek(echo, dog)).toMatchObject({ status: 'failed', error: 'The AI answer was not in the expected shape.', retryable: false });
  });
  it('checks the Idea Brief answer shape too', () => {
    const good = ideaBriefSpec.simulate({ text: EXAMPLE_IDEA, option: 'idea' });
    expect(ideaBriefSpec.checkResult!(good)).toBe(true);
    for (const bad of [null, 'x', {}, { ...good, source: 'gpt' }, { ...good, slots: good.slots.slice(1) }, { ...good, slots: [...good.slots].reverse() }, { ...good, assumptions: [1] }]) expect(ideaBriefSpec.checkResult!(bad)).toBe(false);
  });
});

describe('two tabs and dead requests', () => {
  it('waits on a live request started by another tab instead of starting a second one', async () => {
    const adapter = new MemoryAdapter();
    const a = setup({ session: 'tab1' }, createDocStore(adapter, 'p1'));
    const bStore = createDocStore(adapter, 'p1');
    const b = setup({ session: 'tab2', now: a.c.now }, bStore);
    const key = a.svc.ensure(echo, cat).key;
    bStore.refresh();
    expect(b.svc.ensure(echo, cat).status).toBe('pending');
    expect(b.s.calls).toHaveLength(0);
    a.s.calls[0].ok('claude-cli', { shout: 'MEOW' });
    await a.c.tick();
    bStore.refresh();
    expect(b.svc.peek(echo, cat)).toMatchObject({ key, status: 'ready', value: { shout: 'MEOW' } });
    expect(b.s.calls).toHaveLength(0);
  });
  const orphan = (over: Partial<AiRecord> = {}): AiRecord => ({ key: aiKey(echo, cat), task: 'echo', status: 'pending', requestId: 'dead1', attempts: 1, requestedAt: '2026-11-10T09:59:00.000Z', session: 'old-page', heartbeatAt: '2026-11-10T09:59:50.000Z', deadline: '2026-11-10T10:03:00.000Z', ...over });
  it('takes over a request whose page went away (no heartbeat), counting the attempt', () => {
    const { s, svc, store } = setup();
    store.putAi(orphan());                                   // last heartbeat 10 s before "now": still alive
    expect(svc.ensure(echo, cat).status).toBe('pending');
    expect(s.calls).toHaveLength(0);
    store.putAi(orphan({ heartbeatAt: '2026-11-10T09:59:00.000Z' }));     // 60 s of silence: dead
    expect(svc.peek(echo, cat).status).toBe('idle');
    expect(svc.ensure(echo, cat).status).toBe('pending');
    expect(s.calls).toHaveLength(1);
    expect(store.aiRecord(aiKey(echo, cat))).toMatchObject({ attempts: 2, session: 'tab1', requestId: 'id1' });
  });
  it('takes over a request past its deadline however recent its heartbeat', () => {
    const { s, svc, store } = setup();
    store.putAi(orphan({ heartbeatAt: '2026-11-10T09:59:59.000Z', deadline: '2026-11-10T09:59:59.500Z' }));
    expect(svc.ensure(echo, cat).status).toBe('pending');
    expect(s.calls).toHaveLength(1);
  });
  it('does not keep restarting a request that keeps getting interrupted', () => {
    const { s, svc, store } = setup();
    store.putAi(orphan({ attempts: MAX_RESTARTS, heartbeatAt: '2026-11-10T09:50:00.000Z' }));
    const v = svc.ensure(echo, cat);
    expect(v).toMatchObject({ status: 'failed', error: 'The request was interrupted too many times.', retryable: true });
    expect(s.calls).toHaveLength(0);
    expect(svc.retry(echo, cat).status).toBe('pending');      // the founder or a caller can still ask again
    expect(s.calls).toHaveLength(1);
  });
  it('shows a heartbeat while a request runs, and stops when it ends', async () => {
    const { s, svc, store, c } = setup();
    const { key } = svc.ensure(echo, cat);
    const t0 = store.aiRecord(key)!.heartbeatAt!;
    await c.advance(TIMING.heartbeatMs);
    const t1 = store.aiRecord(key)!.heartbeatAt!;
    expect(Date.parse(t1) - Date.parse(t0)).toBe(TIMING.heartbeatMs);
    s.calls[0].ok();
    await c.tick();
    expect(c.pendingTimers()).toBe(0);                        // no heartbeat or deadline timer is left running
  });
});

describe('failures and retries', () => {
  it.each([[400], [403], [404], [500], [502]])('does not retry a %i: it fails at once, and stays failed', async status => {
    const { s, svc, c } = setup();
    svc.ensure(echo, cat);
    s.calls[0].fail(status, 'No.');
    await c.tick();
    expect(svc.peek(echo, cat)).toMatchObject({ status: 'failed', error: 'No.', retryable: false, attempts: 1 });
    for (let i = 0; i < 20; i++) svc.ensure(echo, cat);
    await c.advance(60_000);
    expect(s.calls).toHaveLength(1);                          // ensure never re-asks by itself
  });
  it('retries a busy server once after a pause, and succeeds if the second try does', async () => {
    const { s, svc, c } = setup();
    svc.ensure(echo, cat);
    s.calls[0].fail(429, 'Claude is busy. Try again in a moment.');
    await c.tick();
    expect(s.calls).toHaveLength(1);                          // still waiting out the pause
    expect(svc.peek(echo, cat).status).toBe('pending');
    await c.advance(TIMING.retryDelayMs);
    expect(s.calls).toHaveLength(2);
    s.calls[1].ok('claude-cli', { shout: 'MEOW' });
    await c.tick();
    expect(svc.peek(echo, cat)).toMatchObject({ status: 'ready', attempts: 2, provider: 'claude-cli' });
  });
  it('gives up after one automatic retry, and says a later try could help', async () => {
    const { s, svc, c } = setup();
    svc.ensure(echo, cat);
    s.calls[0].fail(429); await c.tick();
    await c.advance(TIMING.retryDelayMs);
    s.calls[1].fail(429, 'Claude is busy.'); await c.tick();
    expect(svc.peek(echo, cat)).toMatchObject({ status: 'failed', retryable: true, attempts: 2, error: 'Claude is busy.' });
    await c.advance(120_000);
    expect(s.calls).toHaveLength(2);
  });
  it('treats no answer at all (network down) the same way', async () => {
    let calls = 0;
    const down = (async () => { calls++; throw new Error('offline'); }) as unknown as typeof fetch;
    const { svc, c } = setup({ fetch: down });
    svc.ensure(echo, cat);
    await c.tick();
    await c.advance(TIMING.retryDelayMs);
    expect(calls).toBe(2);
    expect(svc.peek(echo, cat)).toMatchObject({ status: 'failed', retryable: true, error: 'Could not reach the AI service.' });
  });
  it('retries by choice: after a failure it asks again; a real answer is kept; a live request is left alone', async () => {
    const { s, svc, c } = setup();
    svc.ensure(echo, cat);
    s.calls[0].fail(502, 'Claude took too long to answer'); await c.tick();
    expect(svc.retry(echo, cat).status).toBe('pending');
    expect(s.calls).toHaveLength(2);
    expect(svc.retry(echo, cat).status).toBe('pending');      // already running
    expect(s.calls).toHaveLength(2);
    s.calls[1].ok('claude-cli', { shout: 'MEOW' }); await c.tick();
    expect(svc.peek(echo, cat)).toMatchObject({ status: 'ready', attempts: 2 });
    expect(svc.retry(echo, cat).status).toBe('ready');        // nothing to retry
    expect(s.calls).toHaveLength(2);
  });
  it('gives up on a request that runs past its deadline, and ends the fetch', async () => {
    const { s, svc, c } = setup();
    svc.ensure(echo, cat);
    await c.advance(TIMING.deadlineMs);
    expect(s.calls[0].signal?.aborted).toBe(true);
    expect(svc.peek(echo, cat)).toMatchObject({ status: 'failed', error: 'The AI request took too long.', retryable: false });
    expect(svc.inFlight()).toEqual([]);
    expect(c.pendingTimers()).toBe(0);
  });
});

describe('falling back to the simulated answer is explicit', () => {
  it('stores the simulated answer with the reason, only when the task says to', async () => {
    const { s, svc, store, c } = setup();
    svc.ensure(echo, cat, { onFailure: 'simulate' });
    s.calls[0].fail(502, 'Claude took too long to answer'); await c.tick();
    const v = svc.peek(echo, cat);
    expect(v).toMatchObject({ status: 'ready', provider: 'simulated', value: { shout: 'CAT' }, fallback: { from: 'claude-cli', reason: 'Claude took too long to answer' } });
    expect(store.aiRecord(v.key)?.fallback?.reason).toBe('Claude took too long to answer');
  });
  it('falls back after the automatic retry has also failed, not before', async () => {
    const { s, svc, c } = setup();
    svc.ensure(echo, cat, { onFailure: 'simulate' });
    s.calls[0].fail(429, 'Claude is busy.'); await c.tick();
    expect(svc.peek(echo, cat).status).toBe('pending');
    await c.advance(TIMING.retryDelayMs);
    s.calls[1].fail(429, 'Claude is busy.'); await c.tick();
    expect(svc.peek(echo, cat)).toMatchObject({ status: 'ready', provider: 'simulated', attempts: 2, fallback: { reason: 'Claude is busy.' } });
  });
  it('holds instead, by default, so nothing is replaced behind the founder\'s back', async () => {
    const { s, svc, c } = setup();
    svc.ensure(echo, cat);
    s.calls[0].fail(502, 'Claude took too long to answer'); await c.tick();
    expect(svc.peek(echo, cat)).toMatchObject({ status: 'failed' });
    expect(svc.peek(echo, cat).fallback).toBeUndefined();
  });
  it('can turn a held failure into a visible fallback, and a retry can replace the fallback with a real answer', async () => {
    const { s, svc, c } = setup();
    svc.ensure(echo, cat);
    s.calls[0].fail(502, 'Claude took too long to answer'); await c.tick();
    expect(svc.ensure(echo, cat, { onFailure: 'simulate' })).toMatchObject({ status: 'ready', provider: 'simulated', fallback: { reason: 'Claude took too long to answer' } });
    expect(svc.retry(echo, cat).status).toBe('pending');
    expect(s.calls).toHaveLength(2);
    s.calls[1].ok('claude-cli', { shout: 'MEOW' }); await c.tick();
    expect(svc.peek(echo, cat)).toMatchObject({ status: 'ready', provider: 'claude-cli' });
    expect(svc.peek(echo, cat).fallback).toBeUndefined();
  });
});

describe('cancelling', () => {
  it('aborts the request, forgets it and writes nothing when an answer arrives anyway', async () => {
    const { s, svc, store, c } = setup();
    const { key } = svc.ensure(echo, cat);
    svc.cancel(key);
    expect(s.calls[0].signal?.aborted).toBe(true);
    expect(store.aiRecord(key)).toBeNull();
    s.calls[0].ok(); await c.tick();
    expect(store.aiRecord(key)).toBeNull();
    expect(c.pendingTimers()).toBe(0);
    svc.cancel('echo:unknown');                              // nothing to cancel: fine
  });
  it('can be asked again after a cancel', () => {
    const { s, svc } = setup();
    svc.cancel(svc.ensure(echo, cat).key);
    svc.ensure(echo, cat);
    expect(s.calls).toHaveLength(2);
  });
});

describe('what the service can touch', () => {
  it('has no way to reach the core, the workflow actions or the founder\'s approvals', () => {
    const src = readFileSync(new URL('../ai/service.ts', import.meta.url), 'utf8');
    for (const forbidden of ['@/engine', '@/services/coreRuntime', "from '../actions'", 'approveTask', 'decideGate', 'reconfirm', 'setFact', 'setDelegation', 'startTask', 'submitTask']) expect(src).not.toContain(forbidden);
  });
  it('works with the Idea Brief task like with any other', async () => {
    const { s, svc, c } = setup();
    const input = { text: EXAMPLE_IDEA, option: 'idea' as const };
    const { key } = svc.ensure(ideaBriefSpec as AiTaskSpec, input);
    expect(key).toBe(aiKey(ideaBriefSpec as AiTaskSpec, input));
    s.calls[0].ok('simulated', ideaBriefSpec.simulate(input)); await c.tick();
    expect(svc.peek(ideaBriefSpec as AiTaskSpec, input)).toMatchObject({ status: 'ready', provider: 'simulated' });
  });
  it('still works when its methods are passed around', () => {
    const { s, svc } = setup();
    const { ensure, retry, cancel } = svc;
    ensure(echo, cat);
    expect(s.calls).toHaveLength(1);
    expect(() => { retry(echo, cat); cancel('echo:x'); }).not.toThrow();
  });
});
