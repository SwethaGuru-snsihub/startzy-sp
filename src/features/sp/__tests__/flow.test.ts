import { describe, expect, it } from 'vitest';
import { steppedClock } from '@/engine/core/project';
import { TASK } from '@/engine/core/register';
import { createCoreRuntime } from '@/services/coreRuntime';
import { createCoreStorage, MemoryAdapter } from '@/services/coreStorage';
import { approve, approveRecheck, declineOptional, decideGate, gateChecksNow, reconfirm, restoreVersion, saveDocEdit, saveInterviews, sendBack, startProject, takeUp, type Env } from '../actions';
import { parseInterviews } from '../content';
import { createDocStore } from '../docStore';
import { EXAMPLE_IDEA, ideaContext, type IdeaInput } from '../idea';
import { createRunner, type Runner } from '../runner';
import { actionFor, agentSpots, discoverRows, needsYou, nextStep, recheckScope, taskStatus, type StatusCtx } from '../viewModel';

const makeIdea = (goal = 'Venture-scale startup'): IdeaInput => {
  const c = ideaContext(EXAMPLE_IDEA, 'idea');
  return { option: 'idea', text: EXAMPLE_IDEA, name: 'Interview Coach', q2: c.questions[1].q, answers: { a1: 'Students', a2: 'Manually or in spreadsheets', a3: goal } };
};
function office(goal?: string) {
  const rt = createCoreRuntime({ storage: createCoreStorage(new MemoryAdapter()), clock: steppedClock('2026-11-03T09:00:00.000Z') });
  rt.ensure({ id: 'sp-t', name: 'New project', pitch: '' });
  const docs = createDocStore(new MemoryAdapter(), 'sp-t', () => '2026-11-03T09:00:00.000Z');
  let idea: IdeaInput | null = null;
  const env: Env = { rt, id: 'sp-t', docs, idea: () => idea, setIdea: i => { idea = i; } };
  const runner = createRunner({ rt, id: 'sp-t', docs, idea: () => idea });
  expect(startProject(env, makeIdea(goal))).toBeNull();
  const ctx = (): StatusCtx => ({ takenUp: docs.takenUp(), rechecks: docs.rechecks() });
  const entry = () => { const e = rt.getEntry('sp-t'); if (!e || e.status !== 'ready') throw new Error('not ready'); return e.project; };
  const status = (t: string) => taskStatus(rt.core, entry(), t, ctx());
  const rows = () => discoverRows(rt.core, entry(), ctx());
  /** Runs office time (250 ms steps) until the condition holds. */
  const until = (cond: () => boolean, r: Runner = runner, max = 600) => { for (let i = 0; i < max && !cond(); i++) r.tick(250); if (!cond()) throw new Error('timed out; statuses: ' + rows().map(x => `${x.id}:${x.status}`).join(' ')); };
  return { rt, docs, env, runner, status, rows, until, entry, idea: () => idea };
}
const ok = (e: string | null) => expect(e).toBeNull();

describe('starting', () => {
  it('writes the founder\'s idea and answers as the first two documents', () => {
    const o = office();
    expect(o.docs.latest('goal')?.secs.find(s => s.h === 'Idea')?.b).toBe(EXAMPLE_IDEA);
    expect(o.docs.latest('clarify')?.secs.find(s => s.h === 'Who it is for')?.b).toBe('Students');
    expect(o.status('brief')).toBe('ready');
    expect(startProject(o.env, makeIdea())).toMatch(/already/);
    expect(o.docs.versions('goal')).toHaveLength(1);
  });
});

describe('the agents at work', () => {
  it('walks the Idea Brief through working, review and the founder\'s approval, with real core states', () => {
    const o = office(); const seen = new Set<string>();
    o.until(() => { seen.add(o.status('brief')); return o.status('brief') === 'needs'; });
    expect([...seen]).toEqual(expect.arrayContaining(['ready', 'working', 'review', 'needs']));
    expect(o.rt.core.state(o.entry(), 'brief')).toBe('awaiting-approval');
    expect(o.docs.latest('brief')).toMatchObject({ v: 1, by: 'Asha (simulated)', note: 'First draft' });
    expect(nextStep(o.rows())).toMatchObject({ tone: 'you', task: 'brief' });
    expect(actionFor(o.rows().find(r => r.id === 'brief')!)).toBe('review');
    o.runner.tick(5000);
    expect(o.status('brief')).toBe('needs');   // it waits: the runner never approves
    expect(o.entry().events.some(e => e.type === 'approved' && e.task === 'brief')).toBe(false);
  });
  it('shows the agent walking to its room, then working there, and going home after', () => {
    const o = office();
    o.runner.tick(250);
    expect(agentSpots(o.rows(), o.runner.phases()).find(s => s.id === 'CSO')).toMatchObject({ state: 'walking', room: 'discovery' });
    o.until(() => o.status('brief') === 'working');
    expect(agentSpots(o.rows(), o.runner.phases()).find(s => s.id === 'CSO')).toMatchObject({ state: 'working', bubble: 'working…' });
    o.until(() => o.status('brief') === 'review');
    expect(agentSpots(o.rows(), o.runner.phases()).find(s => s.id === 'CQRO')).toMatchObject({ state: 'review', room: 'quality' });
    o.until(() => o.status('brief') === 'needs');
    expect(agentSpots(o.rows(), o.runner.phases()).find(s => s.id === 'CSO')?.state).toBe('idle');
  });
  it('runs the whole of Discover, with every approval and the gate decided by the founder', () => {
    const o = office();
    o.until(() => o.status('brief') === 'needs'); ok(approve(o.env, 'brief'));
    expect(o.status('interviews')).toBe('needs');
    o.until(() => o.status('research') === 'needs'); ok(approve(o.env, 'research'));
    ok(saveInterviews(o.env, { n: 5, strong: 3, notes: '' }));
    o.until(() => o.status('problem') === 'needs'); ok(approve(o.env, 'problem'));
    o.runner.tick(250); o.runner.tick(250);
    expect(['market', 'personas', 'competitors'].map(t => o.status(t))).toEqual(['ready', 'ready', 'ready']);   // three agents start together
    o.until(() => ['market', 'personas', 'competitors'].every(t => o.status(t) === 'needs'));
    for (const t of ['market', 'personas', 'competitors']) ok(approve(o.env, t));
    expect(o.status('gate1')).toBe('needs');
    expect(gateChecksNow(o.env).every(c => c.ok)).toBe(true);
    ok(decideGate(o.env, 'pass'));
    expect(o.rows().every(r => r.status === 'done')).toBe(true);
    expect(nextStep(o.rows()).tone).toBe('done');
    const approvals = o.entry().events.filter(e => e.type === 'approved' || (e.type === 'decided' && e.detail === 'pass'));
    expect(approvals.every(e => e.by === 'FOUNDER')).toBe(true);
    expect(approvals.length).toBe(11);   // ten approvals (profile to competitors) and the Gate 1 decision
  });
});

describe('sending work back', () => {
  it('needs a note, sends it to the maker, and the revised draft is a new version that says why', () => {
    const o = office();
    o.until(() => o.status('brief') === 'needs');
    expect(sendBack(o.env, 'brief', '   ')).toMatch(/note/);
    expect(o.status('brief')).toBe('needs');
    ok(sendBack(o.env, 'brief', 'add the pilot university'));
    expect(o.status('brief')).toBe('working');
    o.until(() => o.status('brief') === 'needs');
    expect(o.docs.versions('brief').map(v => v.note)).toEqual(['First draft', 'Revised: add the pilot university']);
    expect(o.docs.latest('brief')?.secs[0]).toEqual({ h: 'Your note, applied', b: 'add the pilot university' });   // the note is visible in the revision
    expect(o.docs.versions('brief')[0].secs.some(s => s.h === 'Your note, applied')).toBe(false);
    expect(o.entry().events.some(e => e.type === 'returned' && e.task === 'brief')).toBe(true);
    expect(o.docs.takeNote('brief')).toBe('');
  });
});

describe('Gate 1 and the interview evidence', () => {
  it('locks Pass until every check is met, and says which are not', () => {
    const o = office();
    o.until(() => o.status('brief') === 'needs'); approve(o.env, 'brief');
    o.until(() => o.status('research') === 'needs'); approve(o.env, 'research');
    ok(saveInterviews(o.env, { n: 2, strong: 0, notes: '' }));
    o.until(() => o.status('problem') === 'needs'); approve(o.env, 'problem');
    o.until(() => ['market', 'personas', 'competitors'].every(t => o.status(t) === 'needs'));
    for (const t of ['market', 'personas', 'competitors']) approve(o.env, t);
    expect(gateChecksNow(o.env).filter(c => !c.ok)).toHaveLength(3);
    expect(decideGate(o.env, 'pass')).toMatch(/locked/);
    expect(o.status('gate1')).toBe('needs');
    ok(decideGate(o.env, 'not-yet'));
    expect(o.status('gate1')).toBe('needs');
  });
  it('rejects interview numbers that make no sense', () => {
    const o = office();
    o.until(() => o.status('brief') === 'needs'); approve(o.env, 'brief');
    expect(saveInterviews(o.env, { n: 3, strong: 5, notes: '' })).toMatch(/more than/);
    expect(saveInterviews(o.env, { n: -1, strong: 0, notes: '' })).toMatch(/whole numbers/);
    expect(saveInterviews(o.env, { n: 2.5, strong: 0, notes: '' })).toMatch(/whole numbers/);
    expect(o.status('interviews')).toBe('needs');
  });
});

describe('optional work', () => {
  it('lets the founder take up or decline what is optional for a learning project', () => {
    const o = office('A side project to learn');
    o.until(() => o.status('brief') === 'needs'); approve(o.env, 'brief');
    expect(o.status('interviews')).toBe('optional');
    expect(actionFor(o.rows().find(r => r.id === 'interviews')!)).toBe('choose');
    ok(takeUp(o.env, 'interviews'));
    expect(o.status('interviews')).toBe('needs');
  });
  it('declines for real in the core', () => {
    const o = office('A side project to learn');
    o.until(() => o.status('brief') === 'needs'); approve(o.env, 'brief');
    ok(declineOptional(o.env, 'interviews'));
    expect(o.status('interviews')).toBe('declined');
  });
});

describe('editing a document and re-checking', () => {
  /** Discover up to an approved Problem Statement, founder-decided throughout. */
  function throughProblem() {
    const o = office();
    o.until(() => o.status('brief') === 'needs'); approve(o.env, 'brief');
    o.until(() => o.status('research') === 'needs'); approve(o.env, 'research');
    saveInterviews(o.env, { n: 5, strong: 3, notes: '' });
    o.until(() => o.status('problem') === 'needs'); approve(o.env, 'problem');
    return o;
  }
  const edit = (o: ReturnType<typeof throughProblem>, task: string, h: string, b: string) => {
    const secs = o.docs.latest(task)!.secs.map(s => ({ ...s }));
    secs.find(s => s.h === h)!.b = b;
    return saveDocEdit(o.env, task, secs, 'changed it');
  };

  it('saves the edit as a new version the founder approved, and flags what was built on the old one', () => {
    const o = throughProblem();
    ok(edit(o, 'clarify', 'Who it is for', 'Working professionals'));
    expect(o.docs.versions('clarify').map(v => v.by)).toEqual(['You', 'You']);
    expect(o.docs.latest('clarify')?.secs.find(s => s.h === 'Who it is for')).toMatchObject({ b: 'Working professionals', edited: true });
    expect(o.idea()?.answers.a1).toBe('Working professionals');
    expect(o.status('brief')).toBe('recheck');
    const scope = recheckScope(o.rt.core, o.entry());
    expect(scope.flagged).toEqual(expect.arrayContaining(['brief']));
    expect(scope.later).toEqual(expect.arrayContaining(['research', 'problem']));
    expect(nextStep(o.rows())).toMatchObject({ tone: 'you' });
  });
  it('re-runs nothing until the founder approves the re-check', () => {
    const o = throughProblem();
    ok(edit(o, 'clarify', 'Who it is for', 'Working professionals'));
    o.runner.tick(20000); o.runner.tick(20000);
    expect(o.status('brief')).toBe('recheck');
    expect(o.runner.phases().brief).toBeUndefined();   // flagged work is not started on its own
  });
  it('after approval, the agents redo the flagged work and each result comes back for approval, down to the gate', () => {
    const o = throughProblem();
    ok(edit(o, 'clarify', 'Who it is for', 'Working professionals'));
    expect(approveRecheck(o.env)).toBeGreaterThan(0);
    expect(o.docs.rechecks()).toEqual(expect.arrayContaining(['brief', 'research', 'problem']));
    o.until(() => o.status('brief') === 'needs');
    expect(o.docs.latest('brief')).toMatchObject({ v: 2, note: 'Re-checked against updated inputs' });
    expect(o.docs.latest('brief')?.secs.find(s => s.h === 'Who it is for')?.b).toBe('Working professionals');
    ok(approve(o.env, 'brief'));
    expect(o.entry().workflows.SP.tasks.brief.versions.at(-1)?.pins.clarify).toBe(2);
    expect(o.status('research')).toMatch(/ready|working/);
    o.until(() => o.status('research') === 'needs'); ok(approve(o.env, 'research'));
    expect(o.status('interviews')).toBe('recheck');          // the founder's own work waits for the founder
    ok(reconfirm(o.env, 'interviews'));
    o.until(() => o.status('problem') === 'needs');
    expect(o.docs.latest('problem')?.secs[0].b).toMatch(/^Working professionals have no/);
    ok(approve(o.env, 'problem'));
    expect(o.rows().filter(r => ['recheck', 'paused'].includes(r.status))).toEqual([]);
  });
  it('keeps what the founder edited when the agent redrafts a document', () => {
    const o = throughProblem();
    ok(edit(o, 'problem', 'Riskiest assumption', 'My own riskiest assumption'));
    ok(edit(o, 'research', 'Gaps', 'My own gap'));
    expect(approveRecheck(o.env)).toBeGreaterThan(0);
    o.until(() => o.status('problem') === 'needs');
    expect(o.docs.latest('problem')?.secs.find(s => s.h === 'Riskiest assumption')).toMatchObject({ b: 'My own riskiest assumption', edited: true });
  });
  it('refuses edits that would break the workflow, and explains', () => {
    const o = throughProblem();
    expect(edit(o, 'clarify', 'Goal', 'Rich quick')).toMatch(/Goal must be one of/);
    expect(edit(o, 'goal', 'Idea', '  ')).toMatch(/cannot be empty/);
    expect(edit(o, 'interviews', 'Strong problem signals', '9')).toMatch(/more than/);
    expect(saveDocEdit(o.env, 'problem', o.docs.latest('problem')!.secs, 'x')).toMatch(/No changes/);
    expect(saveDocEdit(o.env, 'market', [{ h: 'Opportunity (simulated)', b: 'x' }], '')).toMatch(/cannot be edited yet/);
    expect(o.docs.versions('clarify')).toHaveLength(1);
    expect(o.status('brief')).toBe('done');   // nothing was flagged by the refused edits
  });
  it('changes what the core reads when the goal changes, and restores an older version as a new one', () => {
    const o = throughProblem();
    ok(edit(o, 'clarify', 'Goal', 'A side project to learn'));
    expect(o.entry().context.goal?.value).toBe('learning');
    ok(restoreVersion(o.env, 'clarify', 1));
    expect(o.entry().context.goal?.value).toBe('venture');
    expect(o.docs.versions('clarify').map(v => v.note)).toEqual(['Entered by you', 'changed it', 'Restored v1']);
    expect(restoreVersion(o.env, 'clarify', 99)).toMatch(/no longer exists/);
  });
  it('lets a changed interview count move the gate', () => {
    const o = throughProblem();
    ok(edit(o, 'interviews', 'Strong problem signals', '1'));
    expect(parseInterviews(o.docs.latest('interviews')?.secs).strong).toBe(1);
    expect(o.status('problem')).toBe('recheck');
    expect(gateChecksNow(o.env).find(c => c.label.startsWith('At least 2'))?.ok).toBe(false);
  });
  it('flags the gate for a new decision when what it rests on changes', () => {
    const o = throughProblem();
    o.until(() => ['market', 'personas', 'competitors'].every(t => o.status(t) === 'needs'));
    for (const t of ['market', 'personas', 'competitors']) approve(o.env, t);
    ok(decideGate(o.env, 'pass'));
    ok(edit(o, 'problem', 'Riskiest assumption', 'changed'));
    expect(o.status('gate1')).toBe('reconfirm');
    expect(actionFor(o.rows().find(r => r.id === 'gate1')!)).toBe('gate');
    expect(TASK.gate1.kind).toBe('gate');
    expect(needsYou(o.rows()).map(r => r.id)).toContain('gate1');
  });
});
