import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { aiKey } from '../ai/hash';
import type { AiBinding } from '../ai/gate';
import { TIMING } from '../ai/service';
import type { AiTaskSpec } from '../ai/task';
import { approve } from '../actions';
import { AI_UNAVAILABLE_AT_DRAFT } from '../provenance';
import { WALK_MS } from '../runner';
import { agentSpots, discoverRows } from '../viewModel';
import { claudeBrief, makeIdea, office, researchBinding, researchSpec } from './aiHarness';

const ok = <T,>(v: T | null | undefined): T => { if (v == null) throw new Error('expected a value'); return v; };
const started = (e: ReturnType<typeof office>) => e.events('research').find(x => x.type === 'started');

describe('waiting for the AI before a task starts', () => {
  it('walks to the desk, then waits, with the task still "ready" in the core and nothing started', async () => {
    const o = office();
    o.approveBrief();
    expect(o.status('research')).toBe('ready');
    o.tickFor(250);
    expect(o.first.runner.phases().research).toBe('walk');
    expect(o.first.srv.calls).toHaveLength(1);                         // the request starts as soon as the task is ready: the walk overlaps the wait
    o.tickFor(WALK_MS + 500);
    expect(o.first.runner.phases().research).toBe('wait');
    o.tickFor(20_000);
    expect(o.first.runner.phases().research).toBe('wait');
    expect(o.status('research')).toBe('ready');
    expect(started(o)).toBeUndefined();
    expect(o.first.srv.calls).toHaveLength(1);                         // twenty seconds of ticks, still one request
    expect(o.first.runner.aiState('research')?.status).toBe('pending');
    expect(o.first.runner.aiState('problem')).toBeNull();              // not an AI task
  });
  it('starts the task as AI work once Claude has answered, then works, reviews and drafts', async () => {
    const o = office();
    o.approveBrief();
    o.tickFor(WALK_MS + 500);
    o.first.srv.calls[0].ok('claude-cli', { facts: ['f1'] });
    await o.clk.tick();
    o.tickFor(250);
    expect(started(o)).toMatchObject({ method: 'ai' });
    expect(o.status('research')).toBe('working');
    o.until(() => o.status('research') === 'needs');
    const v = ok(o.first.docs.latest('research'));
    expect(v).toMatchObject({ provider: 'claude-cli', by: 'Asha (Claude CLI)', note: 'First draft' });
    expect(v.aiKey).toBe(aiKey(researchSpec as AiTaskSpec, o.first.srv.calls[0].body.input));
    expect(v.fallback).toBeUndefined();
  });
  it('starts a task as simulated work when the server itself used the simulated provider', async () => {
    const o = office();
    o.approveBrief();
    o.tickFor(WALK_MS + 500);
    o.first.srv.calls[0].ok('simulated');
    await o.clk.tick();
    o.until(() => o.status('research') === 'needs');
    expect(started(o)).toMatchObject({ method: 'simulated' });
    expect(o.first.docs.latest('research')).toMatchObject({ provider: 'simulated', by: 'Asha (simulated)' });
    expect(o.first.docs.latest('research')?.fallback).toBeUndefined();
  });
  it('does not start before the answer even if the walk is long over, however many times it is ticked', async () => {
    const o = office();
    o.approveBrief();
    o.tickFor(60_000);
    expect(started(o)).toBeUndefined();
    expect(o.first.srv.calls).toHaveLength(1);
  });
});

describe('when Claude cannot answer', () => {
  it('uses the simulated answer and says so, when the task is bound to simulate', async () => {
    const o = office({ onFailure: 'simulate' });
    o.approveBrief();
    o.tickFor(WALK_MS + 500);
    o.first.srv.calls[0].fail(502, 'Claude took too long to answer');
    await o.clk.tick();
    o.until(() => o.status('research') === 'needs');
    expect(started(o)).toMatchObject({ method: 'simulated' });         // the core says what is true: this was not AI work
    const v = ok(o.first.docs.latest('research'));
    expect(v).toMatchObject({ provider: 'simulated', by: 'Asha (simulated)', fallback: { from: 'claude-cli', reason: 'Claude took too long to answer' } });
    expect(v.note).toContain('simulated: Claude was unavailable. Claude took too long to answer');
  });
  it('stands at its desk and shows the error when the task is bound to hold, until someone retries', async () => {
    const o = office({ onFailure: 'hold' });
    o.approveBrief();
    o.tickFor(WALK_MS + 500);
    o.first.srv.calls[0].fail(502, 'Claude took too long to answer');
    await o.clk.tick();
    o.tickFor(30_000);
    expect(o.first.runner.phases().research).toBe('wait');
    expect(o.first.runner.error()).toBe('Claude took too long to answer');
    expect(o.first.runner.aiState('research')).toMatchObject({ status: 'failed', retryable: false });
    expect(started(o)).toBeUndefined();
    expect(o.first.srv.calls).toHaveLength(1);                         // it never retries by itself
    ok(o.first.gate).retry('research');
    expect(o.first.srv.calls).toHaveLength(2);
    o.first.srv.calls[1].ok('claude-cli');
    await o.clk.tick();
    o.until(() => o.status('research') === 'needs');
    expect(started(o)).toMatchObject({ method: 'ai' });
    expect(o.first.docs.latest('research')).toMatchObject({ provider: 'claude-cli' });
  });
  it('writes a simulated draft that says why, if the answer has gone missing by the time the draft is written', async () => {
    const o = office();
    o.approveBrief();
    o.tickFor(WALK_MS + 500);
    o.first.srv.calls[0].ok('claude-cli');
    await o.clk.tick();
    o.tickFor(250);
    expect(started(o)).toMatchObject({ method: 'ai' });
    o.first.docs.removeAi(ok(o.first.runner.aiState('research')?.key));    // lost: pruned, or storage cleared
    o.until(() => o.status('research') === 'needs');
    const v = ok(o.first.docs.latest('research'));
    expect(v).toMatchObject({ provider: 'simulated', fallback: { from: 'claude-cli', reason: AI_UNAVAILABLE_AT_DRAFT } });
  });
});

describe('stale input and reloads', () => {
  it('drops the request and its late answer when the idea changes while waiting, and uses only the new answer', async () => {
    const o = office();
    o.approveBrief();
    o.tickFor(WALK_MS + 500);
    const NEW = 'Patients wait too long at our clinic and staff keep phone follow-ups in spreadsheets.';
    o.setIdea(makeIdea({ text: NEW }));
    o.tickFor(250);
    expect(o.first.srv.calls).toHaveLength(2);
    expect(o.first.srv.calls[0].signal?.aborted).toBe(true);
    o.first.srv.calls[0].ok('claude-cli', { facts: ['about the OLD idea'] });          // arrives anyway
    await o.clk.tick();
    o.tickFor(1000);
    expect(started(o)).toBeUndefined();                                                  // the old answer was not used
    o.first.srv.calls[1].ok('claude-cli', { facts: ['about the NEW idea'] });
    await o.clk.tick();
    o.until(() => o.status('research') === 'needs');
    const v = ok(o.first.docs.latest('research'));
    expect(v.aiKey).toBe(aiKey(researchSpec as AiTaskSpec, o.first.srv.calls[1].body.input));
    expect(o.first.srv.calls[1].body.input.text).toBe(NEW);
  });
  it('picks up a live request after a reload without asking twice, and takes over once its page is gone', async () => {
    const o = office();
    o.approveBrief();
    o.tickFor(WALK_MS + 500);
    const old = o.first.srv.calls[0];
    const reloaded = o.page('tab2');                              // the page is reloaded: new service and runner, same storage
    o.tickFor(WALK_MS + 500, reloaded);
    expect(reloaded.srv.calls).toHaveLength(0);                   // the first page's request still looks alive: wait for it
    expect(reloaded.runner.phases().research).toBe('wait');
    o.clk.jump(TIMING.deadAfterMs + 5_000);                       // the old page never showed another sign of life
    o.tickFor(250, reloaded);
    expect(reloaded.srv.calls).toHaveLength(1);                   // taken over
    expect(reloaded.docs.aiRecords('research')[0]).toMatchObject({ attempts: 2, session: 'tab2' });
    old.ok('claude-cli', { facts: ['a very late answer from the old page'] });
    await o.clk.tick();
    expect(reloaded.docs.aiRecords('research')[0].status).toBe('pending');   // the late answer could not replace the new request
    reloaded.srv.calls[0].ok('claude-cli', { facts: ['the answer'] });
    await o.clk.tick();
    o.until(() => o.status('research', reloaded.docs) === 'needs', reloaded);
    expect(reloaded.docs.latest('research')).toMatchObject({ provider: 'claude-cli' });
  });
  it('uses an answer that arrived before a reload without asking again', async () => {
    const o = office();
    o.approveBrief();
    o.tickFor(WALK_MS + 500);
    o.first.srv.calls[0].ok('claude-cli');
    await o.clk.tick();
    const reloaded = o.page('tab2');
    o.until(() => o.status('research', reloaded.docs) === 'needs', reloaded);
    expect(reloaded.srv.calls).toHaveLength(0);
    expect(started(o)).toMatchObject({ method: 'ai' });
  });
});

describe('the runner never approves what the AI wrote', () => {
  it('leaves the task waiting for the founder, with no approval by anyone, however long it runs', async () => {
    const o = office();
    o.approveBrief();
    const factsBefore = JSON.stringify(o.entry().context);
    const delegationBefore = o.entry().delegation;
    o.tickFor(WALK_MS + 500);
    o.first.srv.calls[0].ok('claude-cli');
    await o.clk.tick();
    o.until(() => o.status('research') === 'needs');
    o.tickFor(120_000);
    expect(o.rt.core.state(o.entry(), 'research')).toBe('awaiting-approval');
    expect(o.events('research').filter(e => e.type === 'approved')).toEqual([]);
    expect(o.entry().workflows.SP.tasks.research.versions).toHaveLength(0);       // no approved version exists
    expect(o.entry().delegation).toBe(delegationBefore);
    expect(delegationBefore).toBe(0);
    expect(JSON.stringify(o.entry().context)).toBe(factsBefore);                   // the AI answer changed no fact the core reads
    expect(o.first.docs.latest('research')).not.toBeNull();                        // it is a draft for the founder to review
  });
  it('lets only the founder approve it, and then the core says the founder did', async () => {
    const o = office();
    o.approveBrief();
    o.tickFor(WALK_MS + 500);
    o.first.srv.calls[0].ok('claude-cli');
    await o.clk.tick();
    o.until(() => o.status('research') === 'needs');
    expect(approve(o.env, 'research')).toBeNull();
    const v = o.entry().workflows.SP.tasks.research.versions.at(-1);
    expect(v).toMatchObject({ method: 'ai', approval: { by: 'FOUNDER', method: 'human' } });
  });
  it('is made of code that cannot approve, decide, confirm or change facts', () => {
    for (const file of ['../runner.ts', '../ai/gate.ts', '../ai/service.ts']) {
      const src = readFileSync(new URL(file, import.meta.url), 'utf8');
      for (const forbidden of ['approveTask', 'decideGate', 'reconfirm', 'reviseTask', 'returnTask', 'declineTask', 'setFact', 'setDelegation']) expect(src, `${file} mentions ${forbidden}`).not.toContain(forbidden);
    }
  });
});

describe('Epic 1 is unchanged', () => {
  const signature = (o: ReturnType<typeof office>) => ({
    events: o.entry().events.map(e => [e.seq, e.type, e.task ?? null, e.method ?? null, e.by ?? null, e.detail ?? null]),
    docs: ['goal', 'clarify', 'brief'].map(t => o.first.docs.versions(t).map(v => [v.v, v.by, v.provider ?? null, v.note, v.secs.map(s => s.h).join('|'), v.aiKey ?? null, v.fallback ?? null])),
  });
  it('runs the brief through the same events and documents with the gate absent, empty, or bound to another task', () => {
    const results = [undefined, [] as AiBinding[], [researchBinding()]].map(bindings => {
      const o = office({ bindings: bindings === undefined ? null : bindings });
      o.approveBrief();
      o.until(() => o.first.docs.latest('brief') !== null);
      o.tickFor(2000);
      const brief = o.entry().events.filter(e => e.task === 'brief' || e.task === 'goal' || e.task === 'clarify' || e.task === 'profile');
      return { brief: brief.map(e => [e.type, e.task, e.method ?? null, e.by ?? null]), docs: signature(o).docs };
    });
    expect(results[1]).toEqual(results[0]);
    expect(results[2]).toEqual(results[0]);
  });
  it('runs a whole ungated task identically with an empty gate and with no gate at all', () => {
    const run = (bindings: AiBinding[] | null) => {
      const o = office({ bindings });
      o.approveBrief();
      o.until(() => o.status('research') === 'needs');
      return signature(o);
    };
    const without = run(null), empty = run([]);
    expect(empty).toEqual(without);
    expect(empty.events.some(e => e[2] === 'research' && e[1] === 'started' && e[3] === 'simulated')).toBe(true);
    expect(JSON.stringify(empty)).not.toContain('"fallback"');
  });
  it('still starts a Claude-written brief as AI work, with the gate present', () => {
    const o = office({ idea: makeIdea({ brief: claudeBrief() }) });
    o.until(() => o.status('brief') === 'needs');
    expect(o.events('brief').find(e => e.type === 'started')).toMatchObject({ method: 'ai' });
    expect(o.first.docs.latest('brief')).toMatchObject({ provider: 'claude-cli', by: 'Asha (Claude CLI)' });
    expect(o.first.docs.latest('brief')?.aiKey).toBeUndefined();        // Epic 1's brief does not go through the AI store
    expect(o.first.srv.calls).toHaveLength(0);
  });
  it('marks only the draft of the AI task: every other version carries no AI request and no fallback', async () => {
    const o = office();
    o.approveBrief();
    o.tickFor(WALK_MS + 500);
    o.first.srv.calls[0].ok('claude-cli');
    await o.clk.tick();
    o.until(() => o.status('research') === 'needs');
    for (const t of ['goal', 'clarify', 'brief']) for (const v of o.first.docs.versions(t)) { expect(v).not.toHaveProperty('aiKey'); expect(v).not.toHaveProperty('fallback'); }
    expect(o.first.docs.latest('research')).toHaveProperty('aiKey');
  });
});

describe('what the screens are told while the AI is answering', () => {
  it('shows the agent at its desk "waiting for Claude…" instead of walking, only for the wait', () => {
    const o = office();
    o.approveBrief();
    const rows = discoverRows(o.rt.core, o.entry(), { takenUp: [], rechecks: [] });
    const spot = (phase: 'walk' | 'wait') => agentSpots(rows, { research: phase }).find(s => s.id === 'CSO')!;
    expect(spot('walk')).toMatchObject({ state: 'walking', bubble: 'on my way' });
    expect(spot('wait')).toMatchObject({ state: 'working', bubble: 'waiting for Claude…', room: 'research' });
    expect(agentSpots(rows, { research: 'wait' }).find(s => s.id === 'CDO')).toMatchObject({ state: 'working', bubble: 'standing by' });
    expect(agentSpots(rows, {}).find(s => s.id === 'CSO')?.state).toBe('idle');
  });
});

describe('guards against runaway requests', () => {
  it('asks at most once per input across many ticks and many reloads of the runner while the first is live', () => {
    const o = office();
    o.approveBrief();
    o.tickFor(WALK_MS + 500);
    for (let i = 0; i < 5; i++) { const p = o.page(`tab${i + 2}`); o.tickFor(WALK_MS + 500, p); expect(p.srv.calls).toHaveLength(0); }
    expect(o.first.srv.calls).toHaveLength(1);
  });
  it('is quick: a gated tick costs well under a millisecond', () => {
    const o = office();
    o.approveBrief();
    o.tickFor(WALK_MS + 500);
    const t0 = performance.now();
    for (let i = 0; i < 400; i++) o.first.runner.tick(250);
    expect((performance.now() - t0) / 400).toBeLessThan(20);
  });
});
