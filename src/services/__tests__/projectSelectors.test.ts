import { describe, expect, it } from 'vitest';
import { createCore, steppedClock } from '@/engine/core/project';
import { SJ_PHASES, SP_STEPS } from '@/engine/core/definitions';
import { TASKS } from '@/engine/core/register';
import { advancedDemo as buildDemoProject } from './helpers';
import { selectPortfolioMetrics, selectProjectView } from '../projectSelectors';

const core = createCore(steppedClock('2026-11-02T09:00:00.000Z'));

describe('project selectors derive everything from core state', () => {
  it('progress equals the core workflow progress, per workflow, with all 18 phases and 16 steps present', () => {
    const p = buildDemoProject('veejay', 'v');
    const v = selectProjectView(core, p);
    const sj = core.workflowProgress(p, 'SJ'), sp = core.workflowProgress(p, 'SP');
    expect(v.sj.steps.map(s => s.name)).toEqual(SJ_PHASES.map(x => x.name));
    expect(v.sp.steps.map(s => s.name)).toEqual(SP_STEPS.map(x => x.name));
    expect(v.sj.completeCount).toBe(sj.steps.filter(s => s.status === 'complete').length);
    expect(v.sp.completeCount).toBe(sp.steps.filter(s => s.status === 'complete').length);
    expect(v.tasks).toHaveLength(TASKS.length);
  });

  it('the two workflows are independent: progress in one does not move the other', () => {
    const p = core.createFounderProject({ idea: 'x', id: 'f' });
    const before = selectProjectView(core, p);
    core.startTask(p, 'profile', 'simulated'); core.submitTask(p, 'profile'); core.approveTask(p, 'profile', { by: 'FOUNDER' });
    const after = selectProjectView(core, p);
    expect(after.sj.completeCount).toBe(before.sj.completeCount + 1);   // SJ1 owns the profile
    expect(after.sp.completeCount).toBe(before.sp.completeCount);
    expect(JSON.stringify(after.sp.steps)).toBe(JSON.stringify(before.sp.steps));
  });

  it('there is no stored progress: changing core state changes the view', () => {
    const p = buildDemoProject('rahul', 'r');
    const a = selectProjectView(core, p);
    core.startTask(p, 'market', 'simulated'); core.submitTask(p, 'market');
    expect(selectProjectView(core, p).sp.steps.find(s => s.id === 'SP3')!.status).toBe('in-progress');
    expect(a.sp.steps.find(s => s.id === 'SP3')!.status).not.toBe('complete');
  });

  it('lists what needs the founder: tasks, approvals, decisions and Solution Builder acceptance separately', () => {
    const kit = selectProjectView(core, buildDemoProject('meera', 'k'));
    expect(kit.pending.find(a => a.taskId === 'sj8')).toMatchObject({ kind: 'decision', workflow: 'SJ' });
    const f = core.createFounderProject({ idea: 'x', id: 'f2' });
    core.startTask(f, 'profile', 'simulated'); core.submitTask(f, 'profile');
    expect(selectProjectView(core, f).pending.find(a => a.taskId === 'profile')).toMatchObject({ kind: 'approval' });
  });

  it('derives the handoff from packages and Phase 14, not from a label', () => {
    const med = selectProjectView(core, buildDemoProject('veejay', 'm'));
    expect(med.handoff).toMatchObject({ packageCount: 1, current: { v: 1 }, phase14UnlockedAt: 1, label: 'Package v1 accepted by Solution Builder' });
    const none = selectProjectView(core, core.createFounderProject({ idea: 'x', id: 'f3' }));
    expect(none.handoff).toMatchObject({ packageCount: 0, current: null, label: 'No handoff package yet' });
  });

  it('planned spend is the sum of approved spend tasks, and nothing else', () => {
    const med = buildDemoProject('veejay', 'm2');
    const sum = (['estimate', 'hiring'] as const)
      .filter(id => (med.workflows.SP.tasks[id] ?? med.workflows.SJ.tasks[id])?.state === 'approved')
      .reduce((a, id) => a + ((med.workflows.SP.tasks[id] ?? med.workflows.SJ.tasks[id]).spendLakh ?? 0), 0);
    expect(selectProjectView(core, med).plannedSpendLakh).toBe(sum);
    expect(sum).toBeGreaterThan(0);
    expect(selectProjectView(core, core.createFounderProject({ idea: 'x', id: 'f4' })).plannedSpendLakh).toBe(0);
  });

  it('counts evidence from the register and reports freshness', () => {
    const p = core.createFounderProject({ idea: 'x', id: 'f5' });
    const created = p.createdAt.slice(0, 10);
    core.addEvidence(p, { type: 'interviews', date: created, inspected: true });
    core.addEvidence(p, { type: 'research', date: '2019-01-01', inspected: true });   // stale
    expect(selectProjectView(core, p).evidence).toEqual({ total: 2, current: 1, withdrawn: 0 });
  });

  it('portfolio totals add up the per-project views', () => {
    const views = ['veejay', 'meera', 'rahul'].map((x, i) => selectProjectView(core, buildDemoProject(x as 'veejay', `p${i}`)));
    const m = selectPortfolioMetrics(views);
    expect(m.pending).toBe(views.reduce((a, v) => a + v.pending.length, 0));
    expect(m.acceptedPackages).toBe(1);
  });
});
