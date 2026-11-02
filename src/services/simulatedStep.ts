// "Run next simulated step": the one way the prototype moves a project's workflow. It runs a single
// task that a simulated agent owns, and nothing else. Never run by it:
//   - the founder's own tasks, gates, the Go / Pivot / Stop decision, optional tasks (take up or decline)
//   - Solution Builder acceptance
//   - spend tasks (the founder states the amount) and the learning evaluation
//   - any approval the core routes to the founder; those stay waiting for the founder
// Atlas approves only where the core's delegation rules route the approval to Atlas, and the
// event log records it as simulated, on the founder's behalf.
import { SPEND_TASKS } from '@/engine/core/approvals';
import type { Core } from '@/engine/core/project';
import { TASK, TASKS } from '@/engine/core/register';
import type { Project, ProjectEvent } from '@/engine/core/types';

export type SimulatedStepResult =
  | { ok: true; taskId: string; artifact: string; workflow: 'SJ' | 'SP'; actions: string[]; events: ProjectEvent[]; waitingFor?: string }
  | { ok: false; reason: string };

const NOT_SIMULATED = new Set(['learneval']);

export function canSimulate(core: Core, p: Project, id: string): boolean {
  const t = TASK[id];
  if (!['task', 'review', 'package'].includes(t.kind)) return false;       // not gates, direction or Solution Builder
  if (t.owner === 'FOUNDER' || t.owner === 'SOLUTION_BUILDER') return false;
  if (SPEND_TASKS.includes(id) || NOT_SIMULATED.has(id)) return false;
  return core.taskView(p, id).applicability === 'required';               // optional tasks wait for the founder
}

export function runNextSimulatedStep(core: Core, p: Project): SimulatedStepResult {
  if (p.archived) return { ok: false, reason: 'This project is stopped (archived). Resume it from the Go / Pivot / Stop decision first.' };
  const before = p.events.length;
  const actions: string[] = [];

  // 1. Something waiting that the delegation rules let Atlas approve (for example after the level was raised)
  const atlas = TASKS.find(t => core.state(p, t.id) === 'awaiting-approval' && core.approverFor(p, t.id).approver === 'CEO');
  if (atlas) {
    const r = core.approverFor(p, atlas.id);
    core.approveTask(p, atlas.id, { by: 'CEO' });
    actions.push(`Atlas approved ${atlas.artifact} (simulated, ${r.reason})`);
    return done(p, atlas.id, before, actions);
  }

  // 2. The next ready task a simulated agent may run
  const id = core.readyTasks(p).find(x => canSimulate(core, p, x));
  if (!id) return { ok: false, reason: nothingToRun(core, p) };
  const t = TASK[id];
  core.startTask(p, id, 'simulated'); actions.push(`${t.owner} started ${t.artifact} (simulated)`);
  core.submitTask(p, id); actions.push(`${t.owner} submitted ${t.artifact}`);
  if (t.reviewer) { core.reviewTask(p, id, { passed: true }); actions.push(`${t.reviewer} reviewed it (simulated review: passed)`); }
  const route = core.approverFor(p, id);
  if (route.approver === 'CEO') { core.approveTask(p, id, { by: 'CEO' }); actions.push(`Atlas approved on the founder's behalf (simulated, ${route.reason})`); return done(p, id, before, actions); }
  actions.push(`Waiting for your approval: ${route.reason}`);
  return done(p, id, before, actions, route.reason);
}

function done(p: Project, id: string, before: number, actions: string[], waitingFor?: string): SimulatedStepResult {
  return { ok: true, taskId: id, artifact: TASK[id].artifact, workflow: TASK[id].workflow, actions, events: p.events.slice(before), ...(waitingFor ? { waitingFor } : {}) };
}

function nothingToRun(core: Core, p: Project): string {
  const waiting = TASKS.filter(t => core.state(p, t.id) === 'awaiting-approval').map(t => t.artifact);
  const mine = core.readyTasks(p).map(x => TASK[x].artifact);
  const parts = [
    waiting.length && `waiting for your approval: ${waiting.join(', ')}`,
    mine.length && `ready but needing you: ${mine.join(', ')}`,
  ].filter(Boolean);
  return parts.length
    ? `No simulated agent can run anything now; ${parts.join('; ')}.`
    : 'Nothing is ready to run. Work is blocked on earlier steps, or the project is complete.';
}
