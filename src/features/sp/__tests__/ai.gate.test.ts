import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MemoryAdapter } from '@/services/coreStorage';
import { AI_BINDINGS } from '../ai/bindings';
import { createAiGate, docDigest, type AiBinding } from '../ai/gate';
import { aiKey } from '../ai/hash';
import { createAiService, TIMING, type AiServiceDeps } from '../ai/service';
import type { AiTaskSpec } from '../ai/task';
import { createDocStore } from '../docStore';
import { ideaContext, EXAMPLE_IDEA, type IdeaInput } from '../idea';

type In = { text: string; brief: string | null };
const research: AiTaskSpec<In, { facts: string[] }> = {
  id: 'research', title: 'Desk research', version: 1, systemPrompt: 'Find facts.', jsonSchema: { type: 'object' }, dependsOn: ['text', 'brief'],
  parseInput: raw => ({ ok: true, value: raw as In }), buildMessage: i => i.text,
  validate: raw => ({ ok: true, value: raw as { facts: string[] } }), simulate: i => ({ facts: [`about ${i.text}`] }),
  checkResult: v => Array.isArray((v as { facts?: unknown } | null)?.facts),
};

const makeIdea = (text = EXAMPLE_IDEA): IdeaInput => {
  const c = ideaContext(text, 'idea');
  return { option: 'idea', text, name: 'Interview Coach', q2: c.questions[1].q, answers: { a1: 'Students', a2: 'Manually', a3: 'Venture-scale startup' } };
};

function world(onFailure: 'simulate' | 'hold' = 'hold') {
  let t = Date.parse('2026-11-10T10:00:00.000Z');
  const calls: { body: { task: string; input: In }; signal?: AbortSignal; ok(provider?: 'claude-cli' | 'simulated'): void; fail(status: number, error?: string): void }[] = [];
  const fetchFn = ((_u: string, init: RequestInit) => new Promise<Response>((resolve, reject) => {
    const body = JSON.parse(String(init.body));
    init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    calls.push({ body, signal: init.signal ?? undefined,
      ok: (provider = 'claude-cli') => resolve(new Response(JSON.stringify({ task: 'research', key: aiKey(research as AiTaskSpec, body.input), provider, result: { facts: ['f'] } }), { status: 200 })),
      fail: (status, error = 'no') => resolve(new Response(JSON.stringify({ error }), { status })) });
  })) as unknown as typeof fetch;
  const docs = createDocStore(new MemoryAdapter(), 'p1');
  const service = createAiService({ store: docs, fetch: fetchFn, now: () => t, session: 's', newId: (() => { let n = 0; return () => `id${++n}`; })(), timers: { setTimeout: () => 0 as never, clearTimeout: () => {}, setInterval: () => 0 as never, clearInterval: () => {} } as unknown as AiServiceDeps['timers'] });
  let idea: IdeaInput | null = makeIdea();
  // research is built from the founder's words and the content of the approved brief
  const binding: AiBinding = { task: 'research', spec: research as AiTaskSpec, onFailure,
    input: ctx => { const brief = docDigest(ctx.docs, 'brief'); return ctx.idea && brief !== null ? { text: ctx.idea.text, brief } satisfies In : null; } };
  const gate = createAiGate({ service, docs, idea: () => idea, bindings: [binding] });
  const approveBrief = (body = 'v1') => docs.add('brief', { by: 'Asha (simulated)', note: 'First draft', secs: [{ h: 'Idea', b: body }] });
  return { calls, docs, service, gate, setIdea: (i: IdeaInput | null) => { idea = i; }, approveBrief, tick: () => new Promise<void>(r => setTimeout(r, 0)), advance: (ms: number) => { t += ms; } };
}

describe('which tasks the AI writes', () => {
  it('binds nothing today: no workflow task is AI-gated, so Epic 1 runs exactly as before', () => {
    expect(AI_BINDINGS).toEqual([]);
    const gate = createAiGate({ service: world().service, docs: createDocStore(new MemoryAdapter(), 'x'), idea: () => makeIdea(), bindings: AI_BINDINGS });
    for (const task of ['brief', 'research', 'problem', 'market', 'personas', 'competitors', 'gate1']) {
      expect(gate.gated(task)).toBe(false);
      expect(gate.ensure(task)).toEqual({ status: 'none' });
      expect(gate.state(task)).toEqual({ status: 'none' });
    }
  });
  it('gates only the tasks it is given bindings for', () => {
    const w = world();
    expect(w.gate.gated('research')).toBe(true);
    expect(w.gate.gated('problem')).toBe(false);
    expect(w.gate.ensure('problem')).toEqual({ status: 'none' });
    expect(w.calls).toHaveLength(0);
  });
});

describe('asking only when the input is ready', () => {
  it('says "none" and asks nothing while an input the task needs is missing', () => {
    const w = world();                               // no approved brief yet
    expect(w.gate.ensure('research')).toEqual({ status: 'none' });
    w.setIdea(null);
    w.approveBrief();
    expect(w.gate.ensure('research')).toEqual({ status: 'none' });
    expect(w.calls).toHaveLength(0);
  });
  it('asks once the input is complete, and not again for the same input', () => {
    const w = world();
    w.approveBrief();
    expect(w.gate.ensure('research').status).toBe('pending');
    for (let i = 0; i < 10; i++) w.gate.ensure('research');
    expect(w.calls).toHaveLength(1);
    expect(w.calls[0].body.input).toEqual({ text: EXAMPLE_IDEA, brief: docDigest(w.docs, 'brief') });
  });
  it('reads state without asking for anything', () => {
    const w = world();
    w.approveBrief();
    expect(w.gate.state('research').status).toBe('pending');
    expect(w.calls).toHaveLength(0);
  });
});

describe('everything the answer depends on is in the key', () => {
  it('asks again, and drops the old request, when the founder\'s words change', async () => {
    const w = world();
    w.approveBrief();
    const a = w.gate.ensure('research');
    w.setIdea(makeIdea('Patients wait too long at our clinic and staff keep phone follow-ups in spreadsheets.'));
    const b = w.gate.ensure('research');
    expect(a.key).not.toBe(b.key);
    expect(w.calls).toHaveLength(2);
    expect(w.calls[0].signal?.aborted).toBe(true);
    expect(w.calls[1].signal?.aborted).toBe(false);
    w.calls[0].ok(); await w.tick();                    // the old answer arrives late: nobody uses it
    expect(w.gate.state('research')).toMatchObject({ status: 'pending', key: b.key });
    w.calls[1].ok(); await w.tick();
    expect(w.gate.state('research')).toMatchObject({ status: 'ready', key: b.key });
  });
  it('asks again when an approved document it is built from changes, even by one character', () => {
    const w = world();
    w.approveBrief('Interview coach for students');
    const a = w.gate.ensure('research');
    w.approveBrief('Interview coach for students.');
    const b = w.gate.ensure('research');
    expect(a.key).not.toBe(b.key);
    expect(w.calls).toHaveLength(2);
  });
  it('does not ask again for something the task does not depend on', () => {
    const w = world();
    w.approveBrief();
    const a = w.gate.ensure('research');
    w.setIdea({ ...makeIdea(), name: 'A different working name', answers: { a1: 'Founders', a2: 'x', a3: 'Venture-scale startup' } });
    expect(w.gate.ensure('research').key).toBe(a.key);
    expect(w.calls).toHaveLength(1);
  });
  it('reuses a ready answer when the input returns to what it was', async () => {
    const w = world();
    w.approveBrief('same');
    const a = w.gate.ensure('research'); w.calls[0].ok(); await w.tick();
    w.approveBrief('different');
    w.gate.ensure('research');
    expect(w.calls).toHaveLength(2);
    w.approveBrief('same');                              // back to the first content
    expect(w.gate.ensure('research')).toMatchObject({ status: 'ready', key: a.key });
    expect(w.calls).toHaveLength(2);
  });
  it('fingerprints a document by its content only, not by who wrote it or when', () => {
    const w = world();
    expect(docDigest(w.docs, 'brief')).toBeNull();
    w.docs.add('brief', { by: 'Asha (simulated)', note: 'one', secs: [{ h: 'Idea', b: 'x' }], provider: 'simulated' });
    const d1 = docDigest(w.docs, 'brief');
    w.docs.add('brief', { by: 'Asha (Claude CLI)', note: 'two', secs: [{ h: 'Idea', b: 'x' }], provider: 'claude-cli' });
    expect(docDigest(w.docs, 'brief')).toBe(d1);
    w.docs.add('brief', { by: 'You', note: 'three', secs: [{ h: 'Idea', b: 'y' }] });
    expect(docDigest(w.docs, 'brief')).not.toBe(d1);
    expect(docDigest(w.docs, 'brief')).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe('what the founder sees when the AI cannot answer', () => {
  it('holds by default and can be retried', async () => {
    const w = world('hold');
    w.approveBrief();
    w.gate.ensure('research');
    w.calls[0].fail(502, 'Claude took too long to answer'); await w.tick();
    expect(w.gate.ensure('research')).toMatchObject({ status: 'failed', error: 'Claude took too long to answer', retryable: false });
    expect(w.calls).toHaveLength(1);                     // ensure does not ask again by itself
    expect(w.gate.retry('research').status).toBe('pending');
    expect(w.calls).toHaveLength(2);
    w.calls[1].ok(); await w.tick();
    expect(w.gate.state('research')).toMatchObject({ status: 'ready', provider: 'claude-cli', value: { facts: ['f'] } });
  });
  it('shows the simulated answer with the reason when the binding says so', async () => {
    const w = world('simulate');
    w.approveBrief();
    w.gate.ensure('research');
    w.calls[0].fail(502, 'Claude took too long to answer'); await w.tick();
    expect(w.gate.state('research')).toMatchObject({ status: 'ready', provider: 'simulated', value: { facts: [`about ${EXAMPLE_IDEA}`] }, fallback: { from: 'claude-cli', reason: 'Claude took too long to answer' } });
  });
  it('passes on which provider the server used', async () => {
    const w = world();
    w.approveBrief();
    w.gate.ensure('research');
    w.calls[0].ok('simulated'); await w.tick();
    expect(w.gate.state('research')).toMatchObject({ status: 'ready', provider: 'simulated' });
    expect(w.gate.state('research').fallback).toBeUndefined();
  });
});

describe('a broken binding cannot break the office', () => {
  it('reports a failure instead of throwing when its input carries a field the task did not declare', () => {
    const w = world();
    w.approveBrief();
    const bad: AiBinding = { task: 'research', spec: research as AiTaskSpec, onFailure: 'hold', input: ctx => ({ text: ctx.idea?.text ?? '', brief: 'x', sneaky: 'context nobody hashed' }) };
    const gate = createAiGate({ service: w.service, docs: w.docs, idea: () => makeIdea(), bindings: [bad] });
    const s = gate.ensure('research');
    expect(s).toMatchObject({ status: 'failed', retryable: false });
    expect(s.error).toMatch(/not declared in dependsOn: sneaky/);
    expect(w.calls).toHaveLength(0);
    expect(() => gate.state('research')).not.toThrow();
    expect(() => gate.retry('research')).not.toThrow();
  });
  it('reports a failure instead of throwing when building the input throws', () => {
    const w = world();
    const bad: AiBinding = { task: 'research', spec: research as AiTaskSpec, onFailure: 'hold', input: () => { throw new Error('boom'); } };
    const gate = createAiGate({ service: w.service, docs: w.docs, idea: () => makeIdea(), bindings: [bad] });
    expect(gate.ensure('research')).toEqual({ status: 'failed', error: 'boom', retryable: false });
  });
  it('drops an in-flight request when the input stops being available', () => {
    const w = world();
    w.approveBrief();
    w.gate.ensure('research');
    w.setIdea(null);
    expect(w.gate.ensure('research')).toEqual({ status: 'none' });
    expect(w.calls[0].signal?.aborted).toBe(true);
  });
});

describe('what the gate can touch', () => {
  it('only reads the project: it has no way to start, submit, approve or decide anything', () => {
    const src = readFileSync(new URL('../ai/gate.ts', import.meta.url), 'utf8');
    for (const forbidden of ['@/engine', '@/services/coreRuntime', "from '../actions'", 'approveTask', 'decideGate', 'reconfirm', 'setFact', 'setDelegation', 'startTask', 'submitTask', 'docs.add', 'putAi']) expect(src).not.toContain(forbidden);
  });
  it('shares nothing between two gates over different stores', async () => {
    const a = world(), b = world();
    a.approveBrief(); b.approveBrief();
    a.gate.ensure('research');
    expect(b.calls).toHaveLength(0);
    expect(b.gate.state('research').status).toBe('pending');
    expect(TIMING.deadlineMs).toBeGreaterThan(0);
  });
});
