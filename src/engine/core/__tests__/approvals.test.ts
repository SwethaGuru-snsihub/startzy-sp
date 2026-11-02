import { describe, expect, it } from 'vitest';
import { DELEGATION_LEVELS, SPEND_TASKS, founderReserved, routeApproval } from '../approvals';
import { createCore, steppedClock, type Core } from '../project';
import { TASK, TASKS } from '../register';
import type { Project } from '../types';
import { play } from './script';

const newCore = () => createCore(steppedClock('2026-01-05T09:00:00.000Z'));
function demo(id: 'veejay' | 'meera' | 'rahul') {
  const core = newCore();
  const p = core.createDemoProject(id);
  core.applyDemoAnswers(p);
  return { core, p };
}
/** Plays up to `id` and leaves it waiting for approval, its spend stated. */
function awaiting(core: Core, p: Project, id: string, spendLakh?: number) {
  play(core, p, { takeUp: ['preseed', 'presell'], stopAt: x => core.readyTasks(x).includes(id) });
  core.startTask(p, id, TASK[id].owner === 'FOUNDER' ? 'human' : 'simulated');
  core.submitTask(p, id, SPEND_TASKS.includes(id) ? { spendLakh } : {});
  if (TASK[id].reviewer) core.reviewTask(p, id, { passed: true });
}

describe('Atlas approval limits: the routing rules', () => {
  it('reserves exactly these approvals for the founder, at every delegation level', () => {
    const reserved = Object.fromEntries(TASKS.filter(t => founderReserved(t)).map(t => [t.id, founderReserved(t)]));
    expect(reserved).toEqual({
      profile: 'Atlas\'s own work: no self-approval',
      goal: 'the founder\'s own task', clarify: 'the founder\'s own task', interviews: 'the founder\'s own task',
      gate1: 'gates and the direction decision are the founder\'s', sj8: 'gates and the direction decision are the founder\'s',
      model: 'the founder signs: no independent reviewer',
      gate2: 'gates and the direction decision are the founder\'s',
      mvp: 'the founder signs: no independent reviewer',
      gate3: 'gates and the direction decision are the founder\'s',
      handoff: 'the SP16 handoff is always founder-approved',
      company: 'the founder signs: no independent reviewer', legal: 'the founder signs: no independent reviewer',
      preseed: 'the founder signs: no independent reviewer', presell: 'the founder signs: no independent reviewer',
      budget: 'the founder signs: no independent reviewer',
      sbaccept: 'recorded by Solution Builder, not approved',
      sprints: 'the founder signs: no independent reviewer', beta: 'the founder signs: no independent reviewer',
      pricetest: 'the founder signs: no independent reviewer',
      sj16gate: 'gates and the direction decision are the founder\'s', golive: 'gates and the direction decision are the founder\'s',
      launch: 'the founder signs: no independent reviewer', scale: 'the founder signs: no independent reviewer',
      learneval: 'Atlas\'s own work: no self-approval',
    });
  });
  it('never routes a reserved approval to Atlas, whatever the level or the amount', () => {
    for (const t of TASKS.filter(x => founderReserved(x)))
      for (const level of DELEGATION_LEVELS)
        for (const amount of [undefined, 0, 1, 10, 50])
          expect(routeApproval(t.id, level, amount).approver).toBe('FOUNDER');
  });
  it('level 0 delegates nothing; levels 1 and 2 delegate every other document', () => {
    const docs = TASKS.filter(t => !founderReserved(t) && !SPEND_TASKS.includes(t.id)).map(t => t.id);
    expect(docs).toHaveLength(25);
    for (const id of docs) {
      expect(routeApproval(id, 0).approver).toBe('FOUNDER');
      expect(routeApproval(id, 1).approver).toBe('CEO');
      expect(routeApproval(id, 2).approver).toBe('CEO');
    }
  });
  it.each([
    [0, 0, 'FOUNDER'], [0, 5, 'FOUNDER'],
    [1, 0, 'CEO'], [1, 10, 'CEO'], [1, 10.01, 'FOUNDER'], [1, 20, 'FOUNDER'],
    [2, 10.01, 'CEO'], [2, 50, 'CEO'], [2, 50.01, 'FOUNDER'],
  ] as const)('spend at level %d: ₹%d lakh goes to %s (legacy ₹10 / ₹50 lakh limits)', (level, amount, who) => {
    for (const id of SPEND_TASKS) expect(routeApproval(id, level, amount).approver).toBe(who);
  });
  it('a spend approval with no stated amount goes to the founder', () => {
    expect(routeApproval('estimate', 2)).toEqual({ approver: 'FOUNDER', reason: 'spend amount not stated' });
  });
});

describe('Atlas approval limits in the runtime', () => {
  it('Atlas is refused every founder-routed approval across all three demos played to the end; the founder then approves', () => {
    const runs: { core: Core; p: Project; takeUp?: string[] }[] = [
      { ...demo('veejay'), takeUp: ['preseed'] }, { ...demo('meera'), takeUp: ['presell'] }, demo('rahul'),
    ];
    let refused = 0;
    for (const run of runs) {
      const { core, p } = run;
      const approve = core.approveTask;
      core.approveTask = (q, id, opts) => {
        if (core.approverFor(q, id).approver === 'FOUNDER') {
          const before = JSON.stringify(q);
          expect(() => approve(q, id, { ...opts, by: 'CEO' }), id).toThrow(/approved by the founder/);
          expect(JSON.stringify(q)).toBe(before);           // a refused approval changes nothing
          refused++;
        }
        approve(q, id, opts);
      };
      play(core, p, { takeUp: run.takeUp });
      expect(core.workflowProgress(p, 'SJ').complete && core.workflowProgress(p, 'SP').complete).toBe(true);
    }
    expect(refused).toBeGreaterThan(40);
  });
  it('Atlas approves documents within its level, and the founder may approve them too', () => {
    const { core, p } = demo('veejay');
    awaiting(core, p, 'brief');
    expect(core.approverFor(p, 'brief')).toEqual({ approver: 'CEO', reason: 'document, within delegation level 1' });
    core.approveTask(p, 'brief', { by: 'CEO' });
    expect(p.events.at(-1)).toMatchObject({ type: 'approved', task: 'brief', by: 'CEO', method: 'simulated', detail: 'on the founder\'s behalf: document, within delegation level 1' });
    const b = demo('veejay');
    awaiting(b.core, b.p, 'brief');
    b.core.approveTask(b.p, 'brief', { by: 'FOUNDER' });
    expect(b.p.events.at(-1)).toMatchObject({ by: 'FOUNDER', method: 'human' });
  });
  it('level 0: nothing is delegated, so Atlas cannot approve even a document', () => {
    const { core, p } = demo('meera');
    core.setDelegation(p, 0);
    expect(p.events.at(-1)).toMatchObject({ type: 'delegation', by: 'FOUNDER', method: 'human', detail: 'level 0: nothing delegated' });
    awaiting(core, p, 'brief');
    expect(() => core.approveTask(p, 'brief', { by: 'CEO' })).toThrow(/delegation level 0/);
    core.approveTask(p, 'brief', { by: 'FOUNDER' });
    expect(core.state(p, 'brief')).toBe('approved');
  });
  it('spend: Veejay\'s ₹20 lakh estimate is over the level-1 limit; at level 2 Atlas may approve it', () => {
    const a = demo('veejay');
    awaiting(a.core, a.p, 'estimate', 20);
    expect(() => a.core.approveTask(a.p, 'estimate', { by: 'CEO' })).toThrow(/₹20 lakh, over the ₹10 lakh limit/);
    a.core.approveTask(a.p, 'estimate', { by: 'FOUNDER' });

    const b = demo('veejay');
    b.core.setDelegation(b.p, 2);
    awaiting(b.core, b.p, 'estimate', 20);
    b.core.approveTask(b.p, 'estimate', { by: 'CEO' });
    expect(b.p.events.at(-1)!.detail).toBe('on the founder\'s behalf: ₹20 lakh, within the ₹50 lakh limit');
  });
  it('lowering the level routes work already waiting for approval back to the founder', () => {
    const { core, p } = demo('meera');
    awaiting(core, p, 'estimate', 6);
    expect(core.approverFor(p, 'estimate').approver).toBe('CEO');
    core.setDelegation(p, 0);
    expect(core.approverFor(p, 'estimate').approver).toBe('FOUNDER');
    expect(() => core.approveTask(p, 'estimate', { by: 'CEO' })).toThrow(/founder/);
  });
  it('spend tasks must state their amount; other tasks cannot', () => {
    const { core, p } = demo('meera');
    play(core, p, { stopAt: x => core.readyTasks(x).includes('estimate') });
    core.startTask(p, 'estimate', 'simulated');
    expect(() => core.submitTask(p, 'estimate')).toThrow(/state the amount/);
    expect(() => core.submitTask(p, 'estimate', { spendLakh: -1 })).toThrow(/state the amount/);
    core.submitTask(p, 'estimate', { spendLakh: 6 });
    expect(p.events.at(-1)!.detail).toBe('spend ₹6 lakh');
    const c = demo('meera');
    play(c.core, c.p, { stopAt: x => c.core.readyTasks(x).includes('brief') });
    c.core.startTask(c.p, 'brief', 'simulated');
    expect(() => c.core.submitTask(c.p, 'brief', { spendLakh: 1 })).toThrow(/does not commit spend/);
  });
  it('Atlas cannot approve its own learning evaluation, nor any founder-signed record such as the decision to raise', () => {
    const { core, p } = demo('veejay');
    awaiting(core, p, 'preseed');
    expect(() => core.approveTask(p, 'preseed', { by: 'CEO', facts: { raise: 'committed' } })).toThrow(/founder signs/);
    expect(p.context.raise).toBeUndefined();
    expect(founderReserved(TASK.learneval)).toMatch(/own work/);
  });
  it('gates and the direction decision have no Atlas path at all; Solution Builder cannot approve', () => {
    const { core, p } = demo('meera');
    awaiting(core, p, 'goal');
    expect(() => core.approveTask(p, 'goal', { by: 'SOLUTION_BUILDER' })).toThrow(/Solution Builder/);
    expect(() => core.approveTask(p, 'gate1', { by: 'FOUNDER' })).toThrow(/not waiting for approval/);
    // decideGate and decideDirection take no approver: they are recorded as the founder's, human
    core.approveTask(p, 'goal', { by: 'FOUNDER' });
    play(core, p, { stopAt: x => x.workflows.SP.tasks.gate1.state === 'approved' });
    expect(p.events.find(e => e.task === 'gate1')).toMatchObject({ type: 'decided', by: 'FOUNDER', method: 'human' });
  });
});
