import { describe, expect, it } from 'vitest';
import { createCore, steppedClock } from '../project';
import { TASK, TASKS } from '../register';
import { currentPackage } from '../packages';
import type { Project } from '../types';
import { play, step } from './script';

const newCore = () => createCore(steppedClock('2026-01-05T09:00:00.000Z'));
function demo(id: 'veejay' | 'meera' | 'rahul') {
  const core = newCore();
  const p = core.createDemoProject(id);
  core.applyDemoAnswers(p);
  return { core, p };
}
const states = (p: Project, wf: 'SJ' | 'SP') => Object.fromEntries(Object.entries(p.workflows[wf].tasks).map(([k, v]) => [k, v.state]));

describe('one project, two independent workflow instances', () => {
  it('each instance owns only its own tasks and artifacts', () => {
    const { p } = demo('veejay');
    expect(Object.keys(p.workflows.SP.tasks).every(id => TASK[id].workflow === 'SP')).toBe(true);
    expect(Object.keys(p.workflows.SJ.tasks).every(id => TASK[id].workflow === 'SJ')).toBe(true);
    expect(Object.keys(p.workflows.SP.tasks).length + Object.keys(p.workflows.SJ.tasks).length).toBe(TASKS.length);
  });
  it('work in Solution Planning changes only the Solution Planning instance', () => {
    const { core, p } = demo('veejay');
    play(core, p, { stopAt: x => x.workflows.SJ.tasks.profile.state === 'approved' });
    const sjBefore = JSON.stringify(p.workflows.SJ);
    for (const id of ['goal', 'clarify']) { core.startTask(p, id, 'human'); core.submitTask(p, id); core.approveTask(p, id, { by: 'FOUNDER' }); }
    expect(JSON.stringify(p.workflows.SJ)).toBe(sjBefore);
    expect(states(p, 'SP').goal).toBe('approved');
  });
  it('each workflow has its own progress and its own gates', () => {
    const { core, p } = demo('veejay');
    play(core, p, { stopAt: x => x.workflows.SP.tasks.gate1.state === 'approved' });
    const sp = core.workflowProgress(p, 'SP'), sj = core.workflowProgress(p, 'SJ');
    expect(sp.steps.slice(0, 3).map(s => s.status)).toEqual(['complete', 'complete', 'complete']);
    expect(sp.steps).toHaveLength(16);
    expect(sj.steps).toHaveLength(18);
    expect(sj.steps.find(s => s.id === 'SJ5')!.status).toBe('complete');   // contains Gate 1
    expect(sj.steps.find(s => s.id === 'SJ7')!.status).not.toBe('complete');
    expect(sp.gates.map(g => g.id)).toEqual(['gate1', 'gate2', 'gate3']);
    expect(sj.gates.map(g => g.id)).toEqual(['sj8', 'sj16gate', 'golive']);
  });
  it('both workflows progress at the same time: Startup Journey setup runs while Solution Planning is still designing', () => {
    const { core, p } = demo('veejay');
    play(core, p, { takeUp: ['preseed'], stopAt: x => x.workflows.SJ.tasks.company.state === 'approved' });
    expect(core.workflowProgress(p, 'SP').complete).toBe(false);
    expect(p.workflows.SP.tasks.handoff.state).not.toBe('approved');
  });
  it('Solution Planning can finish and hand off while the Startup Journey continues', () => {
    const { core, p } = demo('veejay');
    play(core, p, { takeUp: ['preseed'], stopAt: x => x.workflows.SJ.tasks.sbaccept.state === 'approved' });
    expect(core.workflowProgress(p, 'SP').complete).toBe(true);
    expect(core.workflowProgress(p, 'SJ').complete).toBe(false);
    expect(currentPackage(p.packages)?.state).toBe('accepted');
    expect(p.phase14.unlockedAt).toBe(1);
  });
});

describe('readiness and the maker, checker, approver chain', () => {
  it('a task cannot start before its inputs are approved', () => {
    const { core, p } = demo('veejay');
    expect(() => core.startTask(p, 'brief', 'simulated')).toThrow(/not ready/);
    expect(core.taskView(p, 'brief').blockedBy).toEqual(expect.arrayContaining(['goal', 'clarify']));
  });
  it('a reviewed task needs a passed review before approval; a failed review sends it back with a new version', () => {
    const { core, p } = demo('veejay');
    play(core, p, { stopAt: x => core.readyTasks(x)[0] === 'brief' });
    core.startTask(p, 'brief', 'simulated'); core.submitTask(p, 'brief');
    expect(() => core.approveTask(p, 'brief', { by: 'CEO' })).toThrow(/review/);
    core.reviewTask(p, 'brief', { passed: false, note: 'Missing evidence' });
    expect(p.workflows.SP.tasks.brief.state).toBe('in-progress');
    core.submitTask(p, 'brief'); core.reviewTask(p, 'brief', { passed: true }); core.approveTask(p, 'brief', { by: 'CEO' });
    expect(p.workflows.SP.tasks.brief.versions.at(-1)!.v).toBe(1);
    expect(p.workflows.SP.tasks.brief.reworks).toBe(1);
  });
  it('founder tasks, gates, the direction decision and the handoff are the founder\'s alone', () => {
    const { core, p } = demo('veejay');
    play(core, p, { stopAt: x => core.readyTasks(x)[0] === 'goal' });
    core.startTask(p, 'goal', 'human'); core.submitTask(p, 'goal');
    expect(() => core.approveTask(p, 'goal', { by: 'CEO' })).toThrow(/founder/);
    expect(() => core.startTask(p, 'clarify', 'simulated')).toThrow();
  });
  it('approved artifact versions pin the versions of their inputs and cannot be edited', () => {
    const { core, p } = demo('veejay');
    play(core, p, { stopAt: x => x.workflows.SP.tasks.brief.state === 'approved' });
    const v = p.workflows.SP.tasks.brief.versions[0];
    expect(v.pins).toEqual({ goal: 1, clarify: 1 });
    expect(() => { (v as { v: number }).v = 9; }).toThrow();
  });
});

describe('execution method is recorded and labelled everywhere', () => {
  it('every event and every artifact version says whether it was simulated, AI or human work', () => {
    const { core, p } = demo('meera');
    play(core, p, { takeUp: ['presell'] });
    const work = p.events.filter(e => ['started', 'submitted', 'reviewed', 'approved', 'decided', 'accepted'].includes(e.type));
    expect(work.length).toBeGreaterThan(100);
    expect(work.every(e => ['simulated', 'ai', 'human'].includes(e.method!))).toBe(true);
    const versions = [...Object.values(p.workflows.SP.tasks), ...Object.values(p.workflows.SJ.tasks)].flatMap(t => t.versions);
    expect(versions.every(v => v.method && v.approval.method)).toBe(true);
  });
  it('Atlas approvals and Solution Builder acceptance are labelled simulated', () => {
    const { core, p } = demo('meera');
    play(core, p, { takeUp: ['presell'] });
    expect(p.events.filter(e => e.by === 'CEO').every(e => e.method === 'simulated')).toBe(true);
    expect(p.events.find(e => e.type === 'accepted')!.method).toBe('simulated');
  });
});

describe('real founders start from their own idea', () => {
  it('a founder project starts with the idea only: no preset facts, no demo answers', () => {
    const core = newCore();
    const p = core.createFounderProject({ idea: 'A booking app for physiotherapy clinics' });
    expect(p.origin).toBe('founder');
    expect(p.idea).toBe('A booking app for physiotherapy clinics');
    expect(p.context).toEqual({});
    expect(() => core.applyDemoAnswers(p)).toThrow(/demo/);
  });
  it('missing facts are clarification questions, not assumptions', () => {
    const core = newCore();
    const p = core.createFounderProject({ idea: 'A booking app for physiotherapy clinics' });
    expect(core.taskView(p, 'legal').applicability).toBe('awaiting');
    expect(core.openQuestions(p)).toEqual(expect.arrayContaining(['goal', 'org', 'personalData', 'jurisdiction']));
  });
  it('a demo project carries only stated facts until the demo script answers', () => {
    const core = newCore();
    const p = core.createDemoProject('veejay');
    expect(Object.values(p.context).every(f => f!.source === 'preset')).toBe(true);
    core.applyDemoAnswers(p);
    expect(p.context.founders).toMatchObject({ value: '1', source: 'demo-answer' });
  });
});

describe('context changes re-evaluate only what reads the changed facts', () => {
  it('Veejay decides to raise: legal needs revalidation and gains investment agreements; nothing else reopens', () => {
    const { core, p } = demo('veejay');
    play(core, p, { takeUp: ['preseed'], stopAt: x => x.workflows.SJ.tasks.legal.state === 'approved' && core.readyTasks(x).includes('preseed') });
    const approvedBefore = TASKS.filter(t => core.state(p, t.id) === 'approved').map(t => t.id);
    core.startTask(p, 'preseed', 'simulated'); core.submitTask(p, 'preseed');
    core.approveTask(p, 'preseed', { by: 'FOUNDER', facts: { raise: 'committed' } });
    expect(p.context.raise).toMatchObject({ value: 'committed', source: 'artifact' });
    expect(core.state(p, 'legal')).toBe('needs-revalidation');
    expect(approvedBefore.filter(id => id !== 'legal' && core.state(p, id) !== 'approved')).toEqual([]);
    expect(core.applicability(p).legal.items!.some(i => /investment/.test(i.item))).toBe(true);
  });
});

describe('a post-Go pivot through the runtime', () => {
  it('reopens the target, revalidates downstream, pauses in-progress work, stales the package and keeps everything else', () => {
    const { core, p } = demo('veejay');
    play(core, p, { takeUp: ['preseed'], stopAt: x => x.workflows.SJ.tasks.sprints.state === 'approved' });
    const before = Object.fromEntries(TASKS.map(t => [t.id, core.state(p, t.id)]));
    core.decideDirection(p, { kind: 'pivot', target: 'SP4' });
    expect(core.state(p, 'solution')).toBe('not-started');
    expect(core.state(p, 'validation')).toBe('needs-revalidation');
    expect(['profile', 'goal', 'brief', 'gate1', 'company', 'legal'].map(id => core.state(p, id))).toEqual(['approved', 'approved', 'approved', 'approved', 'approved', 'approved']);
    expect(currentPackage(p.packages)).toBeNull();
    expect(p.phase14.unlockedAt).toBe(1);
    expect(core.taskView(p, 'qa').ready).toBe(false);
    expect(TASKS.filter(t => before[t.id] === 'approved' && core.state(p, t.id) === 'not-started').map(t => t.id)).toEqual(['solution']);
    // the founder redoes the work and approves the revised direction; a new package becomes current
    play(core, p, { takeUp: ['preseed'], stopAt: x => currentPackage(x.packages)?.v === 2 });
    expect(p.direction.versions.map(v => v.kind)).toEqual(['go', 'pivot', 'go']);
    expect(p.packages.map(k => [k.v, k.state, k.stale])).toEqual([[1, 'accepted', true], [2, 'accepted', false]]);
  });
  it('Stop archives both workflows read-only until the founder resumes', () => {
    const { core, p } = demo('meera');
    play(core, p, { takeUp: ['presell'], stopAt: x => x.workflows.SJ.tasks.sj8.state === 'approved' });
    core.decideDirection(p, { kind: 'stop' });
    expect(p.archived).toBe(true);
    expect(core.readyTasks(p)).toEqual([]);
    expect(() => step(core, p)).not.toThrow();
    expect(() => core.startTask(p, 'model', 'simulated')).toThrow(/archived/);
    core.decideDirection(p, { kind: 'go', resume: true });
    expect(p.archived).toBe(false);
    expect(core.readyTasks(p).length).toBeGreaterThan(0);
  });
});

describe('the project is plain data', () => {
  it('round-trips through JSON without loss and the same script gives the same project', () => {
    const a = demo('rahul'), b = demo('rahul');
    play(a.core, a.p); play(b.core, b.p);
    expect(JSON.parse(JSON.stringify(a.p))).toEqual(a.p);
    expect(JSON.stringify(a.p)).toBe(JSON.stringify(b.p));
  });
});
