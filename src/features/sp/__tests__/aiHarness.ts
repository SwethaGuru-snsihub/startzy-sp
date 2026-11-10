// Shared helpers for tests of the AI-driven parts of the runner and the screens. Not a test file itself.
import { aiKey } from '../ai/hash';
import { validateBrief, type IdeaBrief } from '../ai/briefSchema';
import { docDigest, type AiBinding } from '../ai/gate';
import type { AiTaskSpec } from '../ai/task';
import type { DocStore } from '../docStore';
import { EXAMPLE_IDEA } from '../idea';

/** A made-up AI task for the "research" workflow task, so no real epic 2 content is needed. */
export type ResearchIn = { text: string; brief: string };
export type ResearchOut = { facts: string[] };
export const researchSpec: AiTaskSpec<ResearchIn, ResearchOut> = {
  id: 'research', title: 'Desk research', version: 1, systemPrompt: 'Find facts about the idea.', jsonSchema: { type: 'object' }, dependsOn: ['text', 'brief'],
  parseInput: raw => ({ ok: true, value: raw as ResearchIn }), buildMessage: i => i.text,
  validate: raw => ({ ok: true, value: raw as ResearchOut }), simulate: i => ({ facts: [`simulated facts about ${i.text}`] }),
  checkResult: v => Array.isArray((v as { facts?: unknown } | null)?.facts),
};
export const researchBinding = (onFailure: 'simulate' | 'hold' = 'hold'): AiBinding => ({
  task: 'research', spec: researchSpec as AiTaskSpec, onFailure,
  input: ctx => { const brief = docDigest(ctx.docs as Pick<DocStore, 'latest'>, 'brief'); return ctx.idea && brief !== null ? { text: ctx.idea.text, brief } satisfies ResearchIn : null; },
});

/** A clock and timers moved by hand. `jump` moves time without firing timers, as if the page had been closed. */
export function clock(start = '2026-11-10T10:00:00.000Z') {
  let t = Date.parse(start), id = 0;
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
      if (nextTo && nextTo[1].at === at) { tos.delete(nextTo[0]); nextTo[1].fn(); } else if (nextIv) { nextIv[1].next += nextIv[1].every; nextIv[1].fn(); }
      await tick();
    }
    t = end;
    await tick();
  }
  return { now: () => t, timers, tick, advance, jump: (ms: number) => { t += ms; } };
}

/** A fake of /api/ai that answers only when told to. */
export type Call = { body: { task: string; input: ResearchIn }; signal?: AbortSignal; ok(provider?: 'claude-cli' | 'simulated', result?: unknown): void; fail(status: number, error?: string): void };
export function server() {
  const calls: Call[] = [];
  const fetchFn = ((_url: string, init: RequestInit) => new Promise<Response>((resolve, reject) => {
    const body = JSON.parse(String(init.body));
    init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    calls.push({
      body, signal: init.signal ?? undefined,
      ok: (provider = 'claude-cli', result = { facts: ['a real fact'] }) => resolve(new Response(JSON.stringify({ task: body.task, key: aiKey(researchSpec as AiTaskSpec, body.input), provider, result }), { status: 200 })),
      fail: (status, error = 'no') => resolve(new Response(JSON.stringify({ error }), { status })),
    });
  })) as unknown as typeof fetch;
  return { calls, fetchFn };
}

/** A Claude-written Idea Brief for the example idea, as the start popup would have saved it. */
export function claudeBrief(text = EXAMPLE_IDEA): IdeaBrief {
  const slot = (slot: string, value: string, provenance: string, confidence = 'medium', evidence = '', rationale = '') => ({ slot, value, provenance, confidence, evidence, rationale });
  const r = validateBrief({
    summary: 'A platform that helps students practise technical interviews.',
    slots: [slot('idea', text, 'explicit', 'high', text), slot('problem', 'Practice is scattered', 'inferred', 'low', '', 'Not stated'), slot('target_users', 'students', 'explicit', 'medium', 'students'), slot('expected_outcome', 'prepare for technical interviews', 'explicit', 'medium', 'prepare for technical interviews'), slot('constraints', '', 'empty', '')],
    opportunity: 'Many candidates want structured practice.', assumptions: ['Students pay'], missing_information: ['Budget'], clarifying_questions: ['Which roles?'],
  }, text);
  if (!r.ok) throw new Error(r.error);
  return r.brief;
}
