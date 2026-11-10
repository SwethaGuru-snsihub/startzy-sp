import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { steppedClock } from '@/engine/core/project';
import { createCoreRuntime } from '@/services/coreRuntime';
import { createCoreStorage, MemoryAdapter } from '@/services/coreStorage';
import { validateBrief } from '../ai/briefSchema';
import { simulatedProvider } from '../ai/provider';
import { approve, approveRecheck, reconfirm, restoreVersion, saveDocEdit, startProject, type Env } from '../actions';
import Provenance from '../components/Provenance';
import { createDocStore } from '../docStore';
import { EXAMPLE_IDEA, ideaContext, type IdeaInput } from '../idea';
import { AI_BADGE, makerTag, providerOf, usableBrief, versionProvider } from '../provenance';
import { createRunner } from '../runner';
import { slotsFor } from '../slots';
import { taskStatus } from '../viewModel';

const slot = (slot: string, value: string, provenance: string, confidence = 'medium', evidence = '', rationale = '') => ({ slot, value, provenance, confidence, evidence, rationale });
const claudeBrief = () => {
  const r = validateBrief({
    summary: 'A platform that helps students practise technical interviews.',
    slots: [slot('idea', EXAMPLE_IDEA, 'explicit', 'high', EXAMPLE_IDEA), slot('problem', 'Practice is scattered', 'inferred', 'low', '', 'Not stated'), slot('target_users', 'students', 'explicit', 'medium', 'students'), slot('expected_outcome', 'prepare for technical interviews', 'explicit', 'medium', 'prepare for technical interviews'), slot('constraints', '', 'empty', '')],
    opportunity: 'Many candidates want structured practice.', assumptions: ['Students pay'], missing_information: ['Budget'], clarifying_questions: ['Which roles?'],
  }, EXAMPLE_IDEA);
  if (!r.ok) throw new Error(r.error);
  return r.brief;
};
const makeIdea = (withBrief: 'claude' | 'simulated' | 'none'): IdeaInput => {
  const c = ideaContext(EXAMPLE_IDEA, 'idea');
  return {
    option: 'idea', text: EXAMPLE_IDEA, name: 'Interview Coach', q2: c.questions[1].q, answers: { a1: 'Students', a2: 'Manually or in spreadsheets', a3: 'Venture-scale startup' },
    ...(withBrief === 'claude' ? { brief: claudeBrief() } : {}),
  };
};
async function office(kind: 'claude' | 'simulated' | 'none') {
  const rt = createCoreRuntime({ storage: createCoreStorage(new MemoryAdapter()), clock: steppedClock('2026-11-03T09:00:00.000Z') });
  rt.ensure({ id: 'sp-p', name: 'New project', pitch: '' });
  const docs = createDocStore(new MemoryAdapter(), 'sp-p', () => '2026-11-03T09:00:00.000Z');
  let idea: IdeaInput | null = null;
  const env: Env = { rt, id: 'sp-p', docs, idea: () => idea, setIdea: i => { idea = i; } };
  const runner = createRunner({ rt, id: 'sp-p', docs, idea: () => idea });
  const start = makeIdea(kind);
  if (kind === 'simulated') start.brief = await simulatedProvider.analyze({ text: EXAMPLE_IDEA, option: 'idea' });
  expect(startProject(env, start)).toBeNull();
  const entry = () => { const e = rt.getEntry('sp-p'); if (!e || e.status !== 'ready') throw new Error('not ready'); return e.project; };
  const status = (t: string) => taskStatus(rt.core, entry(), t, { takenUp: docs.takenUp(), rechecks: docs.rechecks() });
  const until = (cond: () => boolean) => { for (let i = 0; i < 600 && !cond(); i++) runner.tick(250); if (!cond()) throw new Error('timed out'); };
  return { rt, docs, env, runner, entry, status, until, idea: () => idea! };
}
const ok = (e: string | null) => expect(e).toBeNull();
const startedMethod = (o: Awaited<ReturnType<typeof office>>, task: string) => o.entry().events.find(e => e.type === 'started' && e.task === task)?.method;

describe('who wrote a document', () => {
  it('records a Claude-written brief as AI work in the core and as Claude in the document', async () => {
    const o = await office('claude');
    o.until(() => o.status('brief') === 'needs');
    expect(startedMethod(o, 'brief')).toBe('ai');
    expect(o.docs.latest('brief')).toMatchObject({ provider: 'claude-cli', by: 'Asha (Claude CLI)' });
    expect(o.docs.latest('brief')?.secs.map(s => s.h)).toContain('Summary (Claude)');
  });
  it('keeps every other agent task simulated, even when the brief is Claude\'s', async () => {
    const o = await office('claude');
    o.until(() => o.status('brief') === 'needs'); ok(approve(o.env, 'brief'));
    o.until(() => o.status('research') === 'needs');
    expect(startedMethod(o, 'research')).toBe('simulated');
    expect(o.docs.latest('research')).toMatchObject({ provider: 'simulated', by: 'Asha (simulated)' });
  });
  it('leaves a simulated or missing brief exactly as it was', async () => {
    for (const kind of ['simulated', 'none'] as const) {
      const o = await office(kind);
      o.until(() => o.status('brief') === 'needs');
      expect(startedMethod(o, 'brief')).toBe('simulated');
      expect(o.docs.latest('brief')).toMatchObject({ provider: 'simulated', by: 'Asha (simulated)' });
      expect(o.docs.latest('brief')?.secs.map(s => s.h)).not.toContain('Summary (Claude)');
    }
  });
  it('keeps the provider through approval and the core still says the founder approved it', async () => {
    const o = await office('claude');
    o.until(() => o.status('brief') === 'needs'); ok(approve(o.env, 'brief'));
    const v = o.entry().workflows.SP.tasks.brief.versions.at(-1)!;
    expect(v.method).toBe('ai');
    expect(v.approval).toMatchObject({ by: 'FOUNDER', method: 'human' });
    expect(versionProvider(o.docs.latest('brief'))).toBe('claude-cli');
  });
  it('keeps the provider when the founder edits the approved brief, and uses the restored version\'s on restore', async () => {
    const o = await office('claude');
    o.until(() => o.status('brief') === 'needs'); ok(approve(o.env, 'brief'));
    const secs = o.docs.latest('brief')!.secs.map(s => ({ ...s })); secs.find(s => s.h === 'Working name')!.b = 'Coach X';
    ok(saveDocEdit(o.env, 'brief', secs, 'renamed'));
    expect(o.docs.latest('brief')).toMatchObject({ v: 2, by: 'You', provider: 'claude-cli' });
    ok(restoreVersion(o.env, 'brief', 1));
    expect(o.docs.latest('brief')).toMatchObject({ v: 3, provider: 'claude-cli' });
  });
  it('stops presenting the brief as current once the founder changes the idea text, and redrafts it as simulated', async () => {
    const o = await office('claude');
    o.until(() => o.status('brief') === 'needs'); ok(approve(o.env, 'brief'));
    const secs = o.docs.latest('goal')!.secs.map(s => ({ ...s })); secs.find(s => s.h === 'Idea')!.b = 'A marketplace for second-hand textbooks.';
    ok(saveDocEdit(o.env, 'goal', secs, 'new idea'));
    expect(o.idea().briefStale).toBe(true);
    expect(usableBrief(o.idea())).toBeNull();
    expect(providerOf('brief', o.idea())).toBe('simulated');
    expect(slotsFor({ ...o.idea(), answers: { a1: '', a2: '' } }, false).every(s => s.simulated)).toBe(true);
    expect(approveRecheck(o.env)).toBeGreaterThan(0);
    ok(reconfirm(o.env, 'clarify'));   // the goal changed, so the founder confirms their own answers again before the brief is redone
    o.until(() => o.status('brief') === 'needs');
    expect(o.docs.latest('brief')).toMatchObject({ v: 2, provider: 'simulated', by: 'Asha (simulated)' });
    expect(o.docs.latest('brief')?.note).toMatch(/Claude brief is out of date/);
    expect(o.docs.latest('brief')?.secs.map(s => s.h)).not.toContain('Summary (Claude)');
  });
  it('does not mark the brief stale when only the answers change, or the text is saved unchanged', async () => {
    const o = await office('claude');
    o.until(() => o.status('brief') === 'needs'); ok(approve(o.env, 'brief'));
    const secs = o.docs.latest('clarify')!.secs.map(s => ({ ...s })); secs.find(s => s.h === 'Who it is for')!.b = 'Working professionals';
    ok(saveDocEdit(o.env, 'clarify', secs, 'x'));
    expect(o.idea().briefStale).toBeUndefined();
    expect(providerOf('brief', o.idea())).toBe('claude-cli');
  });
  it('treats versions saved before providers were recorded as simulated', () => {
    expect(versionProvider({})).toBe('simulated');
    expect(versionProvider(null)).toBe('simulated');
    expect(makerTag('Asha', 'simulated')).toBe('Asha (simulated)');
  });
});

describe('the label', () => {
  it('says AI-generated for Claude and SIMULATED otherwise', () => {
    expect(renderToStaticMarkup(<Provenance provider="claude-cli" />)).toContain(AI_BADGE);
    expect(renderToStaticMarkup(<Provenance provider="claude-cli" />)).not.toContain('SIMULATED');
    expect(renderToStaticMarkup(<Provenance provider="simulated" />)).toContain('>SIMULATED<');
    expect(renderToStaticMarkup(<Provenance provider="simulated" simulatedText="SIMULATED OUTPUT" />)).toContain('SIMULATED OUTPUT');
  });
});
