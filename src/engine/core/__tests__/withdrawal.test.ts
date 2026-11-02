import { describe, expect, it } from 'vitest';
import { currentGo } from '../direction';
import { currentPackage } from '../packages';
import { createCore, steppedClock } from '../project';
import { TASK, TASKS } from '../register';
import type { Project } from '../types';
import { play } from './script';

const newCore = () => createCore(steppedClock('2026-01-05T09:00:00.000Z'));
function veejayAt(stop: (p: Project) => boolean) {
  const core = newCore();
  const p = core.createDemoProject('veejay');
  core.applyDemoAnswers(p);
  play(core, p, { takeUp: ['preseed'], stopAt: stop });
  return { core, p };
}
const states = (p: Project) => Object.fromEntries(TASKS.map(t => [t.id, p.workflows[t.workflow].tasks[t.id].state]));
const versions = (p: Project) => Object.fromEntries(TASKS.map(t => [t.id, p.workflows[t.workflow].tasks[t.id].versions]));
const sprintsDone = (p: Project) => p.workflows.SJ.tasks.sprints.state === 'approved';
const done = (core: ReturnType<typeof newCore>, p: Project) => core.workflowProgress(p, 'SJ').complete && core.workflowProgress(p, 'SP').complete;

describe('withdrawing a pivot', () => {
  it('right after the pivot: every task returns to its state under the Go; stale packages stay history', () => {
    const { core, p } = veejayAt(sprintsDone);
    const before = states(p), history = JSON.stringify(versions(p));
    core.decideDirection(p, { kind: 'pivot', target: 'SP4' });
    core.decideDirection(p, { kind: 'pivot-withdrawn' });
    expect(p.direction.versions.map(v => v.kind)).toEqual(['go', 'pivot', 'pivot-withdrawn']);
    expect(currentGo(p.direction)).toBe(1);
    expect(JSON.stringify(versions(p))).toBe(history);                      // no version added or lost
    expect({ ...states(p), handoff: 'approved' }).toEqual(before);           // all restored ...
    expect(core.state(p, 'handoff')).toBe('needs-revalidation');             // ... except: a new package is needed
    expect(p.packages.map(k => [k.v, k.state, k.stale])).toEqual([[1, 'accepted', true]]);
    expect(p.events.filter(e => e.type === 'restored').map(e => e.task)).toEqual(expect.arrayContaining(['solution', 'validation']));
    expect(p.pivotSnapshot).toBeNull();
    // the project continues to the end under the restored Go, with a new founder-approved package
    play(core, p, { takeUp: ['preseed'] });
    expect(done(core, p)).toBe(true);
    expect(p.packages.map(k => [k.v, k.state, k.stale])).toEqual([[1, 'accepted', true], [2, 'accepted', false]]);
    expect(p.events.filter(e => e.type === 'package' && /founder-approved/.test(e.detail ?? '')).every(e => e.by === 'FOUNDER')).toBe(true);
  });

  it('after downstream approvals: keeps every version, flags what was approved under the pivot, pauses work in progress', () => {
    const { core, p } = veejayAt(sprintsDone);
    core.decideDirection(p, { kind: 'pivot', target: 'SP4' });
    // under the pivot: the solution is redone and validation revalidated, then work starts on the next task
    play(core, p, { takeUp: ['preseed'], stopAt: x => x.workflows.SJ.tasks.validation.versions.length === 2 });
    const wip = core.readyTasks(p).find(id => TASK[id].kind === 'task')!;
    expect(wip).toBeDefined();
    core.startTask(p, wip, TASK[wip].owner === 'FOUNDER' ? 'human' : 'simulated');
    const underPivot = TASKS.filter(t => versions(p)[t.id].length > 0 && versions(p)[t.id].at(-1)!.at > p.direction.versions[1].at).map(t => t.id);
    expect(underPivot).toEqual(expect.arrayContaining(['solution', 'validation']));
    const history = versions(p), directionBefore = p.direction.versions.slice();

    core.decideDirection(p, { kind: 'pivot-withdrawn' });

    // history: every artifact and decision version is still there, unchanged and frozen
    for (const t of TASKS) expect(versions(p)[t.id]).toEqual(history[t.id]);
    expect(p.direction.versions.slice(0, 2)).toEqual(directionBefore);
    expect(Object.isFrozen(p.direction.versions[1])).toBe(true);
    expect(p.workflows.SP.tasks.solution.versions.map(v => v.v)).toEqual([1, 2]);
    // nothing approved under the pivot counts as approved under the restored Go
    for (const id of underPivot) {
      expect(core.state(p, id), id).toBe(TASK[id].kind === 'gate' ? 'needs-reconfirmation' : 'needs-revalidation');
      expect(p.events.findLast(e => e.task === id)!.detail).toMatch(/approved under the withdrawn pivot; check it against Go v1/);
    }
    expect(core.state(p, wip)).toBe('paused');
    expect(p.events.findLast(e => e.task === wip)!.detail).toBe('started under the withdrawn pivot');
    // work the pivot never touched stays approved
    expect(['profile', 'goal', 'brief', 'gate1', 'company', 'legal'].map(id => core.state(p, id))).toEqual(Array(6).fill('approved'));
    expect(currentGo(p.direction)).toBe(1);
    expect(core.state(p, 'sj8')).toBe('approved');
    // and the project still finishes: the flagged work is revalidated as new versions
    play(core, p, { takeUp: ['preseed'] });
    expect(done(core, p)).toBe(true);
    expect(p.workflows.SP.tasks.solution.versions.length).toBe(3);
    expect(currentPackage(p.packages)!.stale).toBe(false);
  });

  it('a gate decided under the pivot needs reconfirmation; both decisions stay on record', () => {
    const { core, p } = veejayAt(x => x.workflows.SP.tasks.model.state === 'approved');
    core.decideDirection(p, { kind: 'pivot', target: 'SP3' });
    play(core, p, { takeUp: ['preseed'], stopAt: x => x.workflows.SP.tasks.gate1.versions.length === 2 });
    core.decideDirection(p, { kind: 'pivot-withdrawn' });
    expect(core.state(p, 'gate1')).toBe('needs-reconfirmation');
    expect(p.workflows.SP.tasks.gate1.versions.map(v => [v.v, v.outcome, v.approval.by])).toEqual([[1, 'pass', 'FOUNDER'], [2, 'pass', 'FOUNDER']]);
  });

  it('a context change made under the pivot is not undone by the withdrawal', () => {
    const { core, p } = veejayAt(sprintsDone);
    core.decideDirection(p, { kind: 'pivot', target: 'SP4' });
    core.setFact(p, 'raise', 'committed');
    expect(core.state(p, 'legal')).toBe('needs-revalidation');
    core.decideDirection(p, { kind: 'pivot-withdrawn' });
    expect(core.state(p, 'legal')).toBe('needs-revalidation');
    expect(p.context.raise?.value).toBe('committed');
  });

  it('a pivot that follows a pivot: withdrawal returns to the state under the Go', () => {
    const { core, p } = veejayAt(sprintsDone);
    const before = states(p);
    core.decideDirection(p, { kind: 'pivot', target: 'SP4' });
    core.decideDirection(p, { kind: 'pivot', target: 'SP2' });
    core.decideDirection(p, { kind: 'pivot-withdrawn' });
    expect(p.direction.versions.map(v => v.kind)).toEqual(['go', 'pivot', 'pivot', 'pivot-withdrawn']);
    expect({ ...states(p), handoff: 'approved' }).toEqual(before);
    expect(TASKS.every(t => !p.workflows[t.workflow].tasks[t.id].atRisk)).toBe(true);
  });

  it('only an open pivot can be withdrawn, by the founder, and the result is plain data', () => {
    const { core, p } = veejayAt(sprintsDone);
    expect(() => core.decideDirection(p, { kind: 'pivot-withdrawn' })).toThrow(/no open pivot/);
    core.decideDirection(p, { kind: 'pivot', target: 'SP4' });
    core.decideDirection(p, { kind: 'pivot-withdrawn' });
    expect(p.events.filter(e => e.task === 'sj8' && e.type === 'decided').at(-1)).toMatchObject({ by: 'FOUNDER', method: 'human', detail: 'pivot-withdrawn' });
    expect(() => core.decideDirection(p, { kind: 'pivot-withdrawn' })).toThrow(/no open pivot/);
    expect(JSON.parse(JSON.stringify(p))).toEqual(p);
    // after a revised Go the pivot is closed: there is nothing to withdraw
    const b = veejayAt(sprintsDone);
    b.core.decideDirection(b.p, { kind: 'pivot', target: 'SP4' });
    play(b.core, b.p, { takeUp: ['preseed'], stopAt: x => x.direction.versions.length === 3 });
    expect(b.p.direction.versions.at(-1)!.kind).toBe('go');
    expect(() => b.core.decideDirection(b.p, { kind: 'pivot-withdrawn' })).toThrow();
  });
});
