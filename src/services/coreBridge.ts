// Records work done in the Founder HQ Office (the project's Office session) in the project's own core
// instance, where the 18-phase Startup Journey and the 16-step Solution Planning workflow live.
//
// 37 of the core's 52 tasks are the same artifacts as the Office's blocks, so when the Office approves
// one of those blocks the bridge walks the same task through the core: start, submit, review, approve.
// The core's own rules always decide. Nothing is forced and nothing is invented:
//   - a task the core is not ready for yet stays "waiting", with the reason (a missing input, a
//     decision only the founder can take, a question that is not answered)
//   - an approval the core reserves for the founder is not recorded as the founder's when Atlas gave
//     it in the Office: it waits for the founder
//   - the 15 core-only tasks (Go / Pivot / Stop, solution options, design review, legal, QA ...) are
//     worked in the project's journey panels, never inferred from the Office
//   - only tasks that have not started are recorded; work the core flagged for re-check is left alone
import { SPEND_TASKS } from '@/engine/core/approvals';
import type { Core } from '@/engine/core/project';
import { TASK, TASKS } from '@/engine/core/register';
import type { Project } from '@/engine/core/types';
import type { CoreRuntime } from './coreRuntime';

/** Office stage that passed -> the core gate it corresponds to. */
export const OFFICE_GATE_TO_CORE: Readonly<Record<number, string>> = { 1: 'gate1', 3: 'gate2', 8: 'sj16gate' };

export type OfficeView = {
  approved: { id: string; by: 'YOU' | 'CEO' | undefined; amount?: number }[];
  passedFloors: number[];
  delegation?: 0 | 1 | 2;    // the approval limit the founder set in the Office
};
export type Waiting = { id: string; name: string; state: string; reason: string };
export type SyncReport = { applied: string[]; waiting: Waiting[] };

type Apply = { status: 'applied' } | { status: 'blocked'; reason: string } | { status: 'founder-needed'; reason: string };

function blockReason(core: Core, p: Project, id: string): string {
  const v = core.taskView(p, id);
  if (v.applicability === 'awaiting') return `needs answers to project questions (${v.why ?? 'context'})`;
  if (v.blockedBy.length) return `waiting for ${v.blockedBy.map(x => TASK[x].artifact).join(', ')}`;
  if (v.applicability === 'na') return 'not applicable to this project';
  return 'not ready in the workflow yet';
}

function applyOne(core: Core, p: Project, id: string, o: OfficeView['approved'][number]): Apply {
  if (core.state(p, id) !== 'not-started') return { status: 'blocked', reason: `already ${core.state(p, id)}` };
  if (!core.taskView(p, id).ready) return { status: 'blocked', reason: blockReason(core, p, id) };
  const t = TASK[id];
  core.startTask(p, id, t.owner === 'FOUNDER' ? 'human' : 'simulated');
  if (SPEND_TASKS.includes(id)) {
    if (o.amount == null) throw new Error(`${id} commits spend but the Office stated no amount`);
    core.submitTask(p, id, { spendLakh: o.amount });
  } else core.submitTask(p, id);
  if (t.reviewer) core.reviewTask(p, id, { passed: true });
  const route = core.approverFor(p, id);
  const by = o.by === 'YOU' ? 'FOUNDER' : route.approver === 'CEO' ? 'CEO' : null;
  if (!by) return { status: 'founder-needed', reason: route.reason };
  core.approveTask(p, id, { by });
  return { status: 'applied' };
}

/** What the Office has approved that the core has not recorded yet, and why. */
export function waitingFor(core: Core, p: Project, office: OfficeView): Waiting[] {
  const out: Waiting[] = [];
  for (const o of office.approved) {
    if (!TASK[o.id]) continue;
    const s = core.state(p, o.id);
    if (s === 'approved') continue;
    out.push({
      id: o.id, name: TASK[o.id].artifact, state: s,
      reason: s === 'awaiting-approval' ? `approved in the Office, but ${core.approverFor(p, o.id).reason}: it waits for you` : blockReason(core, p, o.id),
    });
  }
  for (const f of office.passedFloors) {
    const g = OFFICE_GATE_TO_CORE[f];
    if (g && core.state(p, g) !== 'approved') out.push({ id: g, name: TASK[g].artifact, state: core.state(p, g), reason: blockReason(core, p, g) });
  }
  return out;
}

/** Records, in the core, what the Office has approved, in core order, as far as the core allows. */
export function syncOfficeToCore(rt: CoreRuntime, projectId: string, office: OfficeView): SyncReport {
  const report: SyncReport = { applied: [], waiting: [] };
  const entry = rt.getEntry(projectId);
  if (!entry || entry.status !== 'ready') return report;
  const order = new Map(TASKS.map((t, i) => [t.id, i]));
  const todo = office.approved.filter(o => TASK[o.id]).sort((a, b) => order.get(a.id)! - order.get(b.id)!);

  if (office.delegation != null) {
    rt.mutate(projectId, (c, p) => { if (p.delegation !== office.delegation) { c.setDelegation(p, office.delegation!); return true; } return false; }, { commitIf: x => x });
  }
  for (let progressed = true, guard = 0; progressed && guard < 60; guard++) {
    progressed = false;
    for (const f of office.passedFloors) {
      const gate = OFFICE_GATE_TO_CORE[f];
      if (!gate) continue;
      const r = rt.mutate(projectId, (c, p) => {
        if (c.state(p, gate) === 'approved' || !c.taskView(p, gate).ready) return false;
        c.decideGate(p, gate, 'pass'); return true;
      }, { commitIf: x => x });
      if (r.ok && r.value) { report.applied.push(gate); progressed = true; }
    }
    for (const o of todo) {
      const r = rt.mutate(projectId, (c, p) => applyOne(c, p, o.id, o), { commitIf: x => x.status !== 'blocked' });
      if (r.ok && r.value.status !== 'blocked') { report.applied.push(o.id); progressed = true; }
    }
  }
  const cur = rt.getEntry(projectId);
  if (cur?.status === 'ready') report.waiting = waitingFor(rt.core, cur.project, office);
  return report;
}
