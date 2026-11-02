// Everything the Dashboard and Workspace show about a project is derived here from its core state.
// No progress, gate, task or handoff value is stored or hardcoded; if the core Project changes, these
// change with it. The two workflows are read separately and never combined into one number.
import { directionState } from '@/engine/core/direction';
import { qualifies } from '@/engine/core/evidence';
import type { Core, StepProgress, TaskView } from '@/engine/core/project';
import { SJ_PHASES, SP_STEPS, type Workflow } from '@/engine/core/definitions';
import { TASK, TASKS } from '@/engine/core/register';
import type { ExecutionMethod, Project, ProjectEvent } from '@/engine/core/types';

export type StepView = StepProgress & { n: number; group?: string };
export type WorkflowView = {
  workflow: Workflow;
  total: number;
  completeCount: number;
  inProgressCount: number;
  current: StepView | null;           // the first step that is not complete
  steps: StepView[];
  gates: { id: string; name: string; state: string }[];
  complete: boolean;
};
export type TaskRow = TaskView & { name: string; owner: string; home: string; versions: number; latestMethod: ExecutionMethod | null };
export type ArtifactRow = { taskId: string; name: string; workflow: Workflow; version: number; method: ExecutionMethod; approvedBy: string; pinnedInputs: number };
export type PendingAction = {
  kind: 'approval' | 'task' | 'decision' | 'optional' | 'external' | 'acknowledge' | 'revalidate';
  taskId: string; workflow: Workflow; label: string; detail: string;
};
export type HandoffView = {
  packageCount: number;
  current: { v: number } | null;       // newest accepted, not stale
  latest: { v: number; state: string; stale: boolean } | null;
  phase14UnlockedAt: number | null;
  handoffTask: string;
  acceptanceTask: string;
  label: string;
};
export type ProjectView = {
  id: string;
  origin: Project['origin'];
  sj: WorkflowView;
  sp: WorkflowView;
  tasks: TaskRow[];
  artifacts: ArtifactRow[];
  pending: PendingAction[];
  handoff: HandoffView;
  evidence: { total: number; current: number; withdrawn: number };
  plannedSpendLakh: number;
  delegation: Project['delegation'];
  direction: ReturnType<typeof directionState>;
  pivotOpen: boolean;
  archived: boolean;
  lastActivityAt: string | null;
  recentEvents: ProjectEvent[];
};

function workflowView(core: Core, p: Project, wf: Workflow): WorkflowView {
  const w = core.workflowProgress(p, wf);
  const defs = wf === 'SP' ? SP_STEPS : SJ_PHASES;
  const steps: StepView[] = w.steps.map((s, i) => ({ ...s, n: defs[i].n, ...('group' in defs[i] ? { group: (defs[i] as { group: string }).group } : {}) }));
  return {
    workflow: wf, total: steps.length,
    completeCount: steps.filter(s => s.status === 'complete').length,
    inProgressCount: steps.filter(s => s.status === 'in-progress').length,
    current: steps.find(s => s.status !== 'complete') ?? null,
    steps,
    gates: w.gates.map(g => ({ id: g.id, name: TASK[g.id].artifact, state: g.state })),
    complete: w.complete,
  };
}

function handoffView(p: Project, core: Core): HandoffView {
  const latest = p.packages.at(-1) ?? null;
  const current = core.currentPackage(p);
  const sbaccept = core.state(p, 'sbaccept'), handoff = core.state(p, 'handoff');
  const label =
    current ? `Package v${current.v} accepted by Solution Builder` :
    latest?.state === 'returned' ? `Package v${latest.v} returned by Solution Builder` :
    latest?.stale ? `Package v${latest.v} is stale; a new package is needed` :
    latest?.state === 'founder-approved' ? `Package v${latest.v} approved by you; waiting for Solution Builder` :
    handoff === 'awaiting-approval' ? 'Handoff package waiting for your approval' :
    handoff === 'in-progress' || handoff === 'in-review' ? 'Handoff package being prepared' :
    'No handoff package yet';
  return { packageCount: p.packages.length, current: current ? { v: current.v } : null, latest: latest ? { v: latest.v, state: latest.state, stale: latest.stale } : null, phase14UnlockedAt: p.phase14.unlockedAt, handoffTask: handoff, acceptanceTask: sbaccept, label };
}

function pendingActions(core: Core, p: Project): PendingAction[] {
  const out: PendingAction[] = [];
  const add = (kind: PendingAction['kind'], id: string, detail: string, label: string) => out.push({ kind, taskId: id, workflow: TASK[id].workflow, label, detail });
  const ready = new Set(core.readyTasks(p));
  for (const t of TASKS) {
    const s = core.state(p, t.id);
    if (s === 'awaiting-approval') {
      const r = core.approverFor(p, t.id);
      if (r.approver === 'FOUNDER') add('approval', t.id, r.reason, `Approve ${t.artifact}`);
    } else if (s === 'needs-reconfirmation' || s === 'needs-revalidation') {
      add('revalidate', t.id, s === 'needs-reconfirmation' ? 'a decision to confirm again' : 'inputs changed; to be re-checked', `Re-check ${t.artifact}`);
    }
    if (!ready.has(t.id)) continue;
    const app = core.applicability(p)[t.id];
    if (t.kind === 'gate' || t.kind === 'direction') add('decision', t.id, 'your decision', t.kind === 'direction' ? 'Decide: Go / Pivot / Stop' : `Decide: ${t.artifact}`);
    else if (t.kind === 'external') add('external', t.id, 'recorded by Solution Builder, not by an agent', `Solution Builder to accept ${t.artifact}`);
    else if (t.owner === 'FOUNDER') add('task', t.id, 'your own task', t.artifact);
    else if (app.status === 'optional') add('optional', t.id, 'optional: take it up or decline', t.artifact);
  }
  for (const id of core.awaitingAcknowledgement(p)) add('acknowledge', id, 'confirm this is not applicable to you', `Acknowledge N/A: ${TASK[id].artifact}`);
  return out;
}

export function selectProjectView(core: Core, p: Project): ProjectView {
  const apps = core.applicability(p);
  const tasks: TaskRow[] = TASKS.map(t => {
    const rt = p.workflows[t.workflow].tasks[t.id];
    return { ...core.taskView(p, t.id), name: t.artifact, owner: t.owner, home: t.home, versions: rt.versions.length, latestMethod: rt.versions.at(-1)?.method ?? null };
  });
  const artifacts: ArtifactRow[] = [];
  for (const t of TASKS) {
    if (t.id === 'sj8') continue;
    const v = p.workflows[t.workflow].tasks[t.id].versions.at(-1);
    if (v) artifacts.push({ taskId: t.id, name: t.artifact, workflow: t.workflow, version: v.v, method: v.method, approvedBy: v.approval.by, pinnedInputs: Object.keys(v.pins).length });
  }
  const now = p.events.at(-1)?.at ?? p.createdAt;
  const protoVersion = Math.max(0, ...p.evidence.filter(e => e.type === 'prototype').map(e => e.version ?? 0));
  const currentEvidence = p.evidence.filter(e => qualifies(e, { name: 'any', inspection: false }, { now, currentPrototype: protoVersion || undefined }));
  const planned = ['estimate', 'hiring']
    .filter(id => core.state(p, id) === 'approved' && apps[id].status !== 'na')
    .reduce((sum, id) => sum + (p.workflows.SP.tasks[id]?.spendLakh ?? p.workflows.SJ.tasks[id]?.spendLakh ?? 0), 0);
  return {
    id: p.id, origin: p.origin,
    sj: workflowView(core, p, 'SJ'), sp: workflowView(core, p, 'SP'),
    tasks, artifacts, pending: pendingActions(core, p), handoff: handoffView(p, core),
    evidence: { total: p.evidence.length, current: currentEvidence.length, withdrawn: p.evidence.filter(e => e.withdrawn).length },
    plannedSpendLakh: planned,
    delegation: p.delegation, direction: directionState(p.direction), pivotOpen: p.pivotSnapshot != null, archived: p.archived,
    lastActivityAt: p.events.at(-1)?.at ?? null,
    recentEvents: p.events.slice(-8).reverse(),
  };
}

const cache = new WeakMap<Project, ProjectView>();
/** Memoized per Project object: the runtime replaces the object on every change, so this never goes stale. */
export function viewOf(core: Core, p: Project): ProjectView {
  let v = cache.get(p);
  if (!v) { v = selectProjectView(core, p); cache.set(p, v); }
  return v;
}

export function selectPortfolioMetrics(views: ProjectView[]) {
  return {
    plannedSpendLakh: views.reduce((a, v) => a + v.plannedSpendLakh, 0),
    pending: views.reduce((a, v) => a + v.pending.length, 0),
    acceptedPackages: views.filter(v => v.handoff.current != null).length,
  };
}

/** "15 Oct 2026" from an ISO timestamp. */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}
