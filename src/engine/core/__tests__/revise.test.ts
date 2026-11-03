import { describe, expect, it } from 'vitest';
import { play } from '../demoScript';
import { editImpact } from '../editImpact';
import { createCore, steppedClock } from '../project';
import { TASKS } from '../register';
import type { ExecState, Project } from '../types';

type C = ReturnType<typeof createCore>;
const clock = () => steppedClock('2026-11-03T09:00:00.000Z');
// A sample project played forward until the given task is approved.
function upTo(task: string): { core: C; p: Project } {
  const core = createCore(clock());
  const p = core.createDemoProject('rahul', { id: `rev-${task}` });
  core.applyDemoAnswers(p);
  play(core, p, { stopAt: x => core.state(x, task) === 'approved' });
  return { core, p };
}
const statusOf = (core: C, p: Project) => Object.fromEntries(TASKS.map(t => [t.id, core.state(p, t.id)])) as Record<string, ExecState>;

describe('sending an artifact back', () => {
  it('returns work that waits for approval to its maker, and approves nothing', () => {
    const { core, p } = upTo('brief');
    core.startTask(p, 'research', 'simulated'); core.submitTask(p, 'research'); core.reviewTask(p, 'research', { passed: true });
    expect(core.state(p, 'research')).toBe('awaiting-approval');
    core.returnTask(p, 'research', 'cover the pilot university');
    expect(core.state(p, 'research')).toBe('in-progress');
    expect(p.workflows.SP.tasks.research.reworks).toBe(1);
    expect(p.workflows.SP.tasks.research.versions).toHaveLength(0);
    expect(p.events.at(-1)).toMatchObject({ type: 'returned', task: 'research', by: 'FOUNDER', method: 'human', detail: 'sent back: cover the pilot university' });
  });
  it('refuses to send back what is not waiting for approval', () => {
    const { core, p } = upTo('problem');
    expect(() => core.returnTask(p, 'problem', 'no')).toThrow(/not waiting for approval/);
    expect(() => core.returnTask(p, 'gate1', 'no')).toThrow(/not waiting for approval/);
  });
});

describe('editing an approved artifact', () => {
  it('records the edit as a new version the founder approved, pinned to the current inputs', () => {
    const { core, p } = upTo('problem');
    core.reviseTask(p, 'brief', { by: 'FOUNDER' });
    const v = p.workflows.SP.tasks.brief.versions;
    expect(v).toHaveLength(2);
    expect(v[1]).toMatchObject({ v: 2, approval: { by: 'FOUNDER', method: 'human' } });
    expect(core.state(p, 'brief')).toBe('approved');
    expect(p.events.filter(e => e.type === 'approved' && e.task === 'brief').at(-1)).toMatchObject({ version: 2, by: 'FOUNDER', method: 'human', detail: 'revised by the founder' });
  });
  it('flags what was approved on the old version, one step at a time', () => {
    const { core, p } = upTo('problem');
    const preview = editImpact('brief', statusOf(core, p));
    core.reviseTask(p, 'brief', { by: 'FOUNDER' });
    const after = statusOf(core, p);
    expect(preview.direct).toEqual(expect.arrayContaining(['research', 'interviews']));
    for (const id of preview.direct) expect(after[id], id).toMatch(/needs-re/);
    expect(preview.later).toContain('problem');
    expect(after.problem).toBe('approved');   // flagged only when research or interviews are approved again
  });
  it('lets the re-check run: an agent redoes the flagged work, the founder approves, and the next one is flagged', () => {
    const { core, p } = upTo('problem');
    core.reviseTask(p, 'brief', { by: 'FOUNDER' });
    expect(core.taskView(p, 'research').ready).toBe(true);
    core.startTask(p, 'research', 'simulated'); core.submitTask(p, 'research'); core.reviewTask(p, 'research', { passed: true });
    core.approveTask(p, 'research', { by: 'FOUNDER' });
    expect(p.workflows.SP.tasks.research.versions.at(-1)!.pins.brief).toBe(2);
    expect(core.state(p, 'problem')).toBe('needs-revalidation');
  });
  it('refuses to edit decisions, work that is not approved, or an archived project', () => {
    const { core, p } = upTo('problem');
    expect(() => core.reviseTask(p, 'gate1', { by: 'FOUNDER' })).toThrow(/deciding again/);
    expect(() => core.reviseTask(p, 'market', { by: 'FOUNDER' })).toThrow(/no approved version/);
    p.archived = true;
    expect(() => core.reviseTask(p, 'brief', { by: 'FOUNDER' })).toThrow(/archived/);
  });
});

describe('edit impact preview', () => {
  const blank = () => Object.fromEntries(TASKS.map(t => [t.id, 'not-started'])) as Record<string, ExecState>;
  it('lists direct, paused and later work, and ignores the direction decision', () => {
    const s = blank();
    Object.assign(s, { brief: 'approved', research: 'approved', interviews: 'approved', problem: 'approved', market: 'in-progress', gate1: 'approved', sj8: 'approved' });
    const i = editImpact('problem', s);
    expect(i.direct).toContain('gate1');
    expect(i.paused).toContain('market');
    expect([...i.direct, ...i.later, ...i.paused]).not.toContain('sj8');
  });
  it('is empty for something nothing depends on yet', () => {
    const s = blank(); s.problem = 'approved';
    expect(editImpact('problem', s)).toEqual({ direct: [], paused: [], later: [] });
  });
});
