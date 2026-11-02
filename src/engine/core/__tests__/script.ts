// Scripted founder for core tests and golden traces. Plays ready tasks in register order,
// alternating between the two workflows:
// agents work with the simulated method, the founder does founder tasks and takes decisions; each
// approval goes to whoever the core routes it to (the founder, or Atlas within the delegation
// limit, labelled simulated).
import type { Core } from '../project';
import type { FactKey } from '../context';
import type { Project } from '../types';
import type { LearningObjective } from '../learning';
import { TASK } from '../register';
import { SPEND_TASKS } from '../approvals';

export type Policy = {
  takeUp?: string[];                                        // optional tasks the founder takes up; others are declined
  facts?: Record<string, Partial<Record<FactKey, string>>>; // facts an approved artifact establishes
  learning?: LearningObjective[];
  stopAt?: (p: Project) => boolean;
  spend?: Partial<Record<'estimate' | 'hiring', number>>;   // ₹ lakh stated on submission
};

// Sample spend per demo, from the legacy formulas in engine.ts: the cost estimate is
// personas.ts `estimate` + 2; the hiring plan is one hire at `hireCost` × 12 months.
const DEMO_SPEND = { veejay: { estimate: 20, hiring: 13.2 }, meera: { estimate: 6, hiring: 4.8 }, rahul: { estimate: 40, hiring: 18 } };
const spendFor = (p: Project, id: string, policy: Policy) =>
  policy.spend?.[id as 'estimate'] ?? (p.demoPreset ? DEMO_SPEND[p.demoPreset][id as 'estimate'] : 5);

// The workflow that acted last, per project: the script alternates between the two instances
// whenever both have ready work, the way two teams work at the same time.
const lastActed = new WeakMap<Project, string>();

export function step(core: Core, p: Project, policy: Policy = {}): string | null {
  const ready = core.readyTasks(p);
  const id = ready.find(x => TASK[x].workflow !== lastActed.get(p)) ?? ready[0];
  if (!id) return null;
  lastActed.set(p, TASK[id].workflow);
  const t = TASK[id];
  const view = core.taskView(p, id);
  if (view.applicability === 'optional' && !(policy.takeUp ?? []).includes(id)) { core.declineTask(p, id); return id; }
  if (t.kind === 'gate') { core.decideGate(p, id, 'pass'); return id; }
  if (t.kind === 'direction') { core.decideDirection(p, { kind: 'go' }); return id; }
  if (t.kind === 'external') { core.solutionBuilderAccept(p); return id; }
  const founder = t.owner === 'FOUNDER';
  core.startTask(p, id, founder ? 'human' : 'simulated');
  core.submitTask(p, id, SPEND_TASKS.includes(id) ? { spendLakh: spendFor(p, id, policy) } : {});
  if (t.reviewer) core.reviewTask(p, id, { passed: true });
  core.approveTask(p, id, {
    by: core.approverFor(p, id).approver,
    facts: policy.facts?.[id],
    learning: id === 'learneval' ? { objectives: policy.learning ?? [] } : undefined,
  });
  return id;
}

export function play(core: Core, p: Project, policy: Policy = {}, max = 500) {
  for (let n = 0; n < max; n++) {
    if (policy.stopAt?.(p)) return;
    if (!step(core, p, policy)) return;
  }
  throw new Error('script did not finish');
}
