// Binds workflow tasks to AI tasks. A binding says which workflow task an AI task writes the draft of, how to
// build that AI task's input from the project as it is now, and what to do if the AI cannot answer. The runner
// asks the gate, and only the gate, whether a draft is ready: it never talks to the AI service itself.
//
// The input a binding builds is everything the answer depends on: the founder's words, the answers, and the
// content of the approved documents the task is built from (use `docDigest` for those). Because the request's
// key is a hash of that input, changing any of it makes the old answer simply not the one that is looked up.
// The gate only reads the project. It has no way to start, submit, approve or decide anything.
import type { DocStore } from '../docStore';
import type { IdeaInput } from '../idea';
import type { Provider } from '../provenance';
import { aiKey, canonicalJson, sha256Hex } from './hash';
import type { AiFallback } from './records';
import type { AiService, AiView, OnFailure } from './service';
import type { AiTaskSpec } from './task';

/** What a binding may read. */
export type GateCtx = { idea: IdeaInput | null; docs: Pick<DocStore, 'latest' | 'versions'> };

export type AiBinding = {
  /** The workflow task whose draft the AI writes, for example 'research'. */
  task: string;
  spec: AiTaskSpec;
  /** The input for the project as it is now, or null while something it needs is not there yet. Reads only; called often, so keep it cheap. */
  input(ctx: GateCtx): unknown | null;
  /** When the AI cannot answer: use the simulated answer and say so, or hold and wait for a retry. */
  onFailure: OnFailure;
};

export type GateState = {
  /** none: nothing to ask yet (no binding, or the input is not ready). pending: a request is on it. ready: an answer is there. failed: it failed and is waiting for a retry. */
  status: 'none' | 'pending' | 'ready' | 'failed';
  key?: string;
  value?: unknown;
  provider?: Provider;
  fallback?: AiFallback;
  error?: string;
  retryable?: boolean;
};

export type AiGate = {
  /** Whether the AI writes this task's draft. */
  gated(task: string): boolean;
  /** Makes sure a request exists for the task's current input, and drops requests for input it no longer has. Safe to call every tick. */
  ensure(task: string): GateState;
  /** Where the current input stands, without asking for anything. */
  state(task: string): GateState;
  /** Asks again, because the founder or a caller chose to. */
  retry(task: string): GateState;
};

/** A fingerprint of a document's content (its section headings and texts), ignoring who wrote it or when. */
export function docDigest(docs: Pick<DocStore, 'latest'>, task: string): string | null {
  const v = docs.latest(task);
  return v ? sha256Hex(canonicalJson(v.secs.map(s => [s.h, s.b]))).slice(0, 32) : null;
}

const fromView = (v: AiView): GateState => {
  switch (v.status) {
    case 'ready': return { status: 'ready', key: v.key, value: v.value, provider: v.provider, ...(v.fallback ? { fallback: v.fallback } : {}) };
    case 'failed': return { status: 'failed', key: v.key, error: v.error, retryable: v.retryable };
    default: return { status: 'pending', key: v.key };   // idle (about to be asked for) and pending look the same to the runner
  }
};

export function createAiGate(deps: { service: AiService; docs: GateCtx['docs']; idea: () => IdeaInput | null; bindings: readonly AiBinding[] }): AiGate {
  const { service } = deps;
  const byTask = new Map(deps.bindings.map(b => [b.task, b]));

  /** The binding's input and the spec's key for it, or why there is none. A broken binding must not crash the office. */
  function resolve(task: string): { b: AiBinding; input: unknown; key: string } | { b: AiBinding; error: string } | null {
    const b = byTask.get(task);
    if (!b) return null;
    try {
      const input = b.input({ idea: deps.idea(), docs: deps.docs });
      if (input === null) return { b, error: '' };
      return { b, input, key: aiKey(b.spec, input) };
    } catch (e) {
      return { b, error: e instanceof Error ? e.message : 'The input for this AI task could not be built.' };
    }
  }

  const broken = (error: string): GateState => (error ? { status: 'failed', error, retryable: false } : { status: 'none' });

  return {
    gated: task => byTask.has(task),

    ensure(task) {
      const r = resolve(task);
      if (!r) return { status: 'none' };
      if ('error' in r) { service.cancelOthers(r.b.spec.id, null); return broken(r.error); }
      service.cancelOthers(r.b.spec.id, r.key);          // a request for input the project no longer has is dropped
      return fromView(service.ensure(r.b.spec, r.input, { onFailure: r.b.onFailure }));
    },

    state(task) {
      const r = resolve(task);
      if (!r) return { status: 'none' };
      if ('error' in r) return broken(r.error);
      return fromView(service.peek(r.b.spec, r.input));
    },

    retry(task) {
      const r = resolve(task);
      if (!r) return { status: 'none' };
      if ('error' in r) return broken(r.error);
      return fromView(service.retry(r.b.spec, r.input, { onFailure: r.b.onFailure }));
    },
  };
}
