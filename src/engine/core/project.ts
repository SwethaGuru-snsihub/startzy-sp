// The project container: one project holds two independent workflow instances, the 18-phase
// Startup Journey (SJ) and the 16-step Solution Planning workflow (SP). Each instance owns its own
// tasks, state, progress and gates; they meet only through the cross-workflow links in the
// register. Solution Builder sits downstream: it accepts or returns the SP16 handoff package.
//
// Deterministic by construction: no timers, and time comes only from the injected clock.
// Every action records an event that says who acted and how (simulated, AI or human).
import { evaluate, factsUsedBy, type ApplicabilityMap } from './applicability';
import type { Context, Fact, FactKey, FactSource } from './context';
import { CONTAINS, SJ_PHASES, SP_STEPS, type Workflow } from './definitions';
import { currentGo, directionState, emptyDirectionLog, recordDirection, type PivotTarget } from './direction';
import type { EvidenceItem } from './evidence';
import { handoffBlockers, type InputValidity } from './handoff';
import { pivotImpact } from './impact';
import { learningBlockers, type LearningRecord } from './learning';
import { currentPackage, isEligible, unlockPhase14 } from './packages';
import { effectiveInputs } from './passthrough';
import { DEMO_PRESETS, type DemoPresetId } from './presets';
import { TASK, TASKS, consumers, isDecision, requiredInputs, tasksOf } from './register';
import type { Approver, ArtifactVersion, ExecState, ExecutionMethod, Project, ProjectEvent, TaskRuntime, WorkflowInstance } from './types';

export type Clock = { now(): string };

/** A clock that moves forward by a fixed step on every reading: same inputs, same timestamps. */
export function steppedClock(startIso: string, stepMs = 60_000): Clock {
  let t = Date.parse(startIso);
  return { now: () => { const iso = new Date(t).toISOString(); t += stepMs; return iso; } };
}

export class CoreError extends Error {}
const fail = (msg: string): never => { throw new CoreError(msg); };

const START_FROM: ExecState[] = ['not-started', 'paused', 'needs-revalidation', 'needs-reconfirmation'];
const IN_PROGRESS: ExecState[] = ['in-progress', 'in-review', 'awaiting-approval'];
const AGENT_WORK: ExecutionMethod[] = ['simulated', 'ai'];
const methodOf = (by: Approver): ExecutionMethod => (by === 'FOUNDER' ? 'human' : 'simulated');

function newInstance(id: Workflow): WorkflowInstance {
  return { id, tasks: Object.fromEntries(tasksOf(id).map(t => [t.id, { state: 'not-started', method: null, versions: [], reworks: 0, atRisk: false } as TaskRuntime])) };
}

export type TaskView = {
  id: string; workflow: Workflow; applicability: ApplicabilityMap[string]['status']; why?: string;
  state: ExecState; method: ExecutionMethod | null; ready: boolean; blockedBy: string[]; atRisk: boolean;
};
export type StepProgress = { id: string; name: string; status: 'not-started' | 'in-progress' | 'complete'; contains?: readonly string[] };
export type WorkflowProgress = { workflow: Workflow; steps: StepProgress[]; gates: { id: string; state: ExecState }[]; complete: boolean };

export function createCore(clock: Clock) {
  let projects = 0;

  // ---------------------------------------------------------------- reading state
  const rt = (p: Project, id: string) => p.workflows[TASK[id].workflow].tasks[id];
  const state = (p: Project, id: string) => rt(p, id).state;
  const latest = (p: Project, id: string) => (id === 'sj8' ? currentGo(p.direction) ?? 0 : rt(p, id).versions.at(-1)?.v ?? 0);
  const applicability = (p: Project) => evaluate(p.context, p.acknowledged);
  const skippedIn = (p: Project, app: ApplicabilityMap) => (id: string) => app[id].status === 'na' || state(p, id) === 'declined';

  function satisfied(p: Project, app: ApplicabilityMap, id: string) {
    if (app[id].status === 'awaiting') return false;
    // the direction decision in force; a pending pivot keeps the earlier Go in force for unaffected work
    if (TASK[id].kind === 'direction') return currentGo(p.direction) != null;
    const r = rt(p, id);
    return r.state === 'approved' && !r.atRisk;
  }
  const blockedBy = (p: Project, app: ApplicabilityMap, id: string) =>
    effectiveInputs(id, skippedIn(p, app), p.context).filter(x => !satisfied(p, app, x));

  function isReady(p: Project, app: ApplicabilityMap, id: string) {
    if (p.archived) return false;
    const t = TASK[id], r = rt(p, id), a = app[id].status;
    if (a !== 'required' && a !== 'optional') return false;
    if (!START_FROM.includes(r.state)) return false;
    if (blockedBy(p, app, id).length) return false;
    if (!isEligible(id, p.phase14, p.packages, { paused: false })) return false;
    if (t.kind === 'external') return p.packages.at(-1)?.state === 'founder-approved';
    if (t.kind === 'direction') return ['open', 'pivot'].includes(directionState(p.direction));
    return true;
  }

  // ---------------------------------------------------------------- recording
  function emit(p: Project, e: Omit<ProjectEvent, 'seq' | 'at'>) {
    const ev: ProjectEvent = { seq: p.events.length + 1, at: clock.now(), ...e };
    p.events.push(ev);
    return ev;
  }
  const wfOf = (id: string) => TASK[id].workflow;
  const assertOpen = (p: Project) => { if (p.archived) fail('project is archived (stopped); only an explicit resume continues it'); };
  const assertReady = (p: Project, id: string) => { if (!isReady(p, applicability(p), id)) fail(`${id} is not ready: waiting for ${blockedBy(p, applicability(p), id).join(', ') || 'its applicability or state'}`); };

  function pinsFor(p: Project, id: string) {
    const app = applicability(p);
    return Object.freeze(Object.fromEntries(effectiveInputs(id, skippedIn(p, app), p.context).map(x => [x, latest(p, x)])));
  }

  function newVersion(p: Project, id: string, method: ExecutionMethod, by: Approver, outcome?: 'pass'): ArtifactVersion {
    const r = rt(p, id);
    const v: ArtifactVersion = Object.freeze({
      v: r.versions.length + 1, at: clock.now(), method, pins: pinsFor(p, id),
      approval: Object.freeze({ by, method: methodOf(by) }), ...(outcome ? { outcome } : {}),
    });
    r.versions.push(v); r.state = 'approved'; r.atRisk = false;
    return v;
  }

  /** A new version of an input flags whatever was approved on the old one, and pauses work in progress. */
  function cascade(p: Project, id: string) {
    for (const c of consumers(id)) {
      if (TASK[c].kind === 'direction') continue; // the direction changes only by the founder's decision
      const r = rt(p, c);
      if (r.state === 'approved' && (r.versions.at(-1)?.pins[id] ?? 0) < latest(p, id)) {
        r.state = isDecision(c) ? 'needs-reconfirmation' : 'needs-revalidation';
        emit(p, { type: r.state, workflow: wfOf(c), task: c, detail: `${id} changed` });
      } else if (IN_PROGRESS.includes(r.state)) {
        r.state = 'paused';
        emit(p, { type: 'paused', workflow: wfOf(c), task: c, detail: `${id} changed` });
      }
    }
  }

  function tryUnlock(p: Project) {
    const next = unlockPhase14(p.phase14, p.packages, { go: currentGo(p.direction) != null, teamApproved: state(p, 'team') === 'approved' });
    if (next !== p.phase14) { p.phase14 = next; emit(p, { type: 'phase14-unlocked', workflow: 'SJ', task: 'sprints', detail: `package v${next.unlockedAt}` }); }
  }

  // ---------------------------------------------------------------- context
  function setFactInternal(p: Project, key: FactKey, f: Fact) {
    const before = applicability(p);
    p.context[key] = f;
    emit(p, { type: 'fact', detail: `${key}=${f.value} (${f.source}${f.from ? ` ${f.from.task} v${f.from.version}` : ''})` });
    const after = applicability(p);
    // only tasks whose rules read this fact are re-evaluated
    for (const t of TASKS) {
      if (!factsUsedBy(t.id, p.context).includes(key) && t.id !== 'legal') continue;
      const was = JSON.stringify(before[t.id]), now = JSON.stringify(after[t.id]);
      if (was === now || state(p, t.id) !== 'approved') continue;
      if (after[t.id].status === 'na') { emit(p, { type: 'no-longer-applicable', workflow: t.workflow, task: t.id }); continue; }
      rt(p, t.id).state = 'needs-revalidation';
      emit(p, { type: 'needs-revalidation', workflow: t.workflow, task: t.id, detail: `${key} changed` });
    }
  }

  // ---------------------------------------------------------------- creating projects
  function blank(origin: Project['origin'], idea: string, id?: string): Project {
    const p: Project = {
      schema: 1, id: id ?? `project-${++projects}`, origin, ruleset: 'rev7-1', idea, createdAt: clock.now(),
      context: {}, acknowledged: [], archived: false,
      workflows: { SJ: newInstance('SJ'), SP: newInstance('SP') },
      direction: emptyDirectionLog(), pivotSnapshot: null, packages: [], phase14: { unlockedAt: null }, evidence: [], events: [],
    };
    return p;
  }

  const core = {
    applicability,
    state,

    /** A real founder's project: only their idea; every fact comes from their own answers. */
    createFounderProject(opts: { idea: string; id?: string }): Project {
      const p = blank('founder', opts.idea, opts.id);
      emit(p, { type: 'created', detail: 'founder project' });
      return p;
    },

    /** A demo project: the persona's stated facts only. Unstated facts wait for the demo script's answers. */
    createDemoProject(preset: DemoPresetId, opts: { id?: string } = {}): Project {
      const p = blank('demo', DEMO_PRESETS[preset].idea, opts.id ?? `demo-${preset}`);
      p.demoPreset = preset;
      p.context = JSON.parse(JSON.stringify(DEMO_PRESETS[preset].stated));
      emit(p, { type: 'created', detail: `demo preset ${preset} (sample data)` });
      return p;
    },

    /** The demo script answers the clarification questions; stored as demo answers, never as persona facts. */
    applyDemoAnswers(p: Project) {
      if (p.origin !== 'demo' || !p.demoPreset) fail('demo answers apply only to demo projects');
      for (const [k, f] of Object.entries(DEMO_PRESETS[p.demoPreset!].demoAnswers)) setFactInternal(p, k as FactKey, { ...f! });
    },

    setFact(p: Project, key: FactKey, value: string, source: Exclude<FactSource, 'preset' | 'demo-answer'> = 'founder') {
      assertOpen(p);
      setFactInternal(p, key, { value, source });
    },

    acknowledgeNA(p: Project, id: string) {
      if (!p.acknowledged.includes(id)) p.acknowledged.push(id);
      emit(p, { type: 'acknowledged', workflow: wfOf(id), task: id, by: 'FOUNDER', method: 'human', detail: 'N/A acknowledged' });
    },

    awaitingAcknowledgement: (p: Project) => TASKS.filter(t => applicability(p)[t.id].why === 'founder acknowledgement of N/A').map(t => t.id),

    /** Facts the founder still needs to answer (missing, or only AI-inferred). */
    openQuestions(p: Project): FactKey[] {
      const c = p.context;
      const keys: FactKey[] = ['goal', 'org', 'funding', 'commercial', 'audience', 'personalData', 'healthData', 'regulatedActivity', 'jurisdiction', 'ui', 'hires'];
      if (c.org?.value !== 'company') keys.push('registration', 'founders', 'collaborators', 'ipOwner');
      if (c.goal?.value === 'learning') keys.push('objBeta', 'objLaunch');
      return keys.filter(k => !c[k] || c[k]!.source === 'ai');
    },

    addEvidence(p: Project, item: Omit<EvidenceItem, 'id'>): string {
      const id = `ev${p.evidence.length + 1}`;
      p.evidence.push({ ...item, id });
      emit(p, { type: 'evidence', detail: `${id} ${item.type}${item.origin ? ` from ${item.origin}` : ''}` });
      return id;
    },

    // ---------------------------------------------------------------- reading
    taskView(p: Project, id: string): TaskView {
      const app = applicability(p), r = rt(p, id);
      return {
        id, workflow: wfOf(id), applicability: app[id].status, why: app[id].why, state: r.state, method: r.method,
        ready: isReady(p, app, id), blockedBy: blockedBy(p, app, id), atRisk: r.atRisk,
      };
    },

    readyTasks(p: Project): string[] {
      const app = applicability(p);
      return TASKS.filter(t => isReady(p, app, t.id)).map(t => t.id);
    },

    workflowProgress(p: Project, wf: Workflow): WorkflowProgress {
      const app = applicability(p);
      const done = (id: string) => app[id].status === 'na' || ['approved', 'declined'].includes(state(p, id));
      const touched = (id: string) => state(p, id) !== 'not-started';
      const homeDone = (home: string) => (home.startsWith('gate') ? done(home) : TASKS.filter(t => t.home === home).every(t => done(t.id)));
      const homeTouched = (home: string) => (home.startsWith('gate') ? touched(home) : TASKS.some(t => t.home === home && touched(t.id)));
      const defs = wf === 'SP' ? SP_STEPS : SJ_PHASES;
      const steps = defs.map(s => {
        const own = TASKS.filter(t => t.home === s.id).map(t => t.id), inner = CONTAINS[s.id] ?? [];
        const complete = own.every(done) && inner.every(homeDone);
        const started = own.some(touched) || inner.some(homeTouched);
        return { id: s.id, name: s.name, status: complete ? 'complete' : started ? 'in-progress' : 'not-started', ...(inner.length ? { contains: inner } : {}) } as StepProgress;
      });
      return {
        workflow: wf, steps,
        gates: tasksOf(wf).filter(t => isDecision(t.id)).map(t => ({ id: t.id, state: state(p, t.id) })),
        complete: steps.every(s => s.status === 'complete'),
      };
    },

    // ---------------------------------------------------------------- work on artifacts
    startTask(p: Project, id: string, method: ExecutionMethod) {
      assertOpen(p);
      const t = TASK[id];
      if (isDecision(id) || t.kind === 'external') fail(`${id} is a decision or an external record, not work to start`);
      if (t.owner === 'FOUNDER' && method !== 'human') fail(`${id} is the founder's own task`);
      if (t.owner !== 'FOUNDER' && !AGENT_WORK.includes(method)) fail(`${id} is done by ${t.owner}: simulated or AI work`);
      assertReady(p, id);
      const r = rt(p, id);
      r.state = 'in-progress'; r.method = method;
      emit(p, { type: 'started', workflow: t.workflow, task: id, by: t.owner, method });
    },

    submitTask(p: Project, id: string) {
      assertOpen(p);
      const r = rt(p, id), t = TASK[id];
      if (r.state !== 'in-progress') fail(`${id} is not in progress`);
      r.state = t.reviewer ? 'in-review' : 'awaiting-approval';
      emit(p, { type: 'submitted', workflow: t.workflow, task: id, by: t.owner, method: r.method! });
    },

    reviewTask(p: Project, id: string, opts: { passed: boolean; note?: string }) {
      assertOpen(p);
      const r = rt(p, id), t = TASK[id];
      if (r.state !== 'in-review') fail(`${id} is not waiting for review`);
      if (opts.passed) r.state = 'awaiting-approval';
      else { r.state = 'in-progress'; r.reworks++; }
      emit(p, { type: 'reviewed', workflow: t.workflow, task: id, by: t.reviewer!, method: 'simulated', detail: opts.passed ? 'passed' : `sent back: ${opts.note ?? ''}`.trim() });
    },

    approveTask(p: Project, id: string, opts: { by: Approver; facts?: Partial<Record<FactKey, string>>; learning?: LearningRecord }) {
      assertOpen(p);
      const r = rt(p, id), t = TASK[id];
      if (r.state === 'in-review') fail(`${id} needs a passed review before approval`);
      if (r.state !== 'awaiting-approval') fail(`${id} is not waiting for approval`);
      if ((t.owner === 'FOUNDER' || t.kind === 'package') && opts.by !== 'FOUNDER') fail(`${id} is approved by the founder only`);
      if (opts.by === 'SOLUTION_BUILDER') fail('Solution Builder only accepts or returns the handoff package');
      const app = applicability(p);
      if (t.kind === 'package') {
        const validity = Object.fromEntries(TASKS.map(x => [x.id, (state(p, x.id) === 'declined' ? 'declined' : satisfied(p, app, x.id) ? 'valid' : 'invalid') as InputValidity]));
        const blockers = handoffBlockers(p.context, app, validity);
        if (blockers.length) fail(`handoff has invalid inputs: ${blockers.join(', ')}`);
      }
      if (id === 'learneval') {
        const ok = (x: string) => state(p, x) === 'approved';
        const now = clock.now();
        const why = learningBlockers(opts.learning ?? { objectives: [] }, p.context, { qa: ok('qa'), golive: ok('golive'), beta: ok('beta'), launch: ok('launch') }, Object.fromEntries(p.evidence.map(e => [e.id, e])), { now });
        if (why.length) fail(`learning evaluation is not complete: ${why.join('; ')}`);
      }
      const v = newVersion(p, id, r.method!, opts.by);
      emit(p, { type: 'approved', workflow: t.workflow, task: id, version: v.v, by: opts.by, method: methodOf(opts.by) });
      for (const [k, value] of Object.entries(opts.facts ?? {})) setFactInternal(p, k as FactKey, { value: value!, source: 'artifact', from: { task: id, version: v.v } });
      if (t.kind === 'package') {
        p.packages.push({ v: p.packages.length + 1, state: 'founder-approved', stale: false, pins: { ...v.pins } });
        emit(p, { type: 'package', workflow: 'SP', task: id, version: p.packages.length, by: 'FOUNDER', method: 'human', detail: 'founder-approved, sent to Solution Builder' });
      }
      if (v.v > 1) cascade(p, id);
      tryUnlock(p);
    },

    declineTask(p: Project, id: string) {
      assertOpen(p);
      if (applicability(p)[id].status !== 'optional') fail(`${id} is not optional`);
      const r = rt(p, id);
      if (!START_FROM.includes(r.state)) fail(`${id} cannot be declined now`);
      r.state = 'declined';
      emit(p, { type: 'declined', workflow: wfOf(id), task: id, by: 'FOUNDER', method: 'human' });
    },

    // ---------------------------------------------------------------- decisions
    decideGate(p: Project, id: string, outcome: 'pass' | 'not-yet') {
      assertOpen(p);
      if (TASK[id].kind !== 'gate') fail(`${id} is not a gate`);
      assertReady(p, id);
      if (outcome === 'not-yet') { emit(p, { type: 'decided', workflow: wfOf(id), task: id, by: 'FOUNDER', method: 'human', detail: 'not yet' }); return; }
      const v = newVersion(p, id, 'human', 'FOUNDER', 'pass');
      emit(p, { type: 'decided', workflow: wfOf(id), task: id, version: v.v, by: 'FOUNDER', method: 'human', detail: 'pass' });
      if (v.v > 1) cascade(p, id);
      tryUnlock(p);
    },

    decideDirection(p: Project, d: { kind: 'go' | 'pivot' | 'pivot-withdrawn' | 'stop'; target?: PivotTarget; resume?: boolean }) {
      const at = clock.now(), dstate = directionState(p.direction);
      if (p.archived && !d.resume) fail('project is archived (stopped); only an explicit resume continues it');
      const sj8 = rt(p, 'sj8');
      if (d.kind === 'go' && !d.resume) assertReady(p, 'sj8');
      const revises = d.kind === 'go' && dstate === 'pivot' ? p.direction.versions.at(-1)!.v : undefined;
      const restores = d.kind === 'pivot-withdrawn' ? currentGo(p.direction) ?? undefined : undefined;
      if (d.kind === 'pivot-withdrawn') {
        const snap = p.pivotSnapshot;
        if (!snap || p.events.filter(e => e.type === 'approved' || e.type === 'decided').length !== snap.approvalsAt) fail('work has been redone since the pivot; record a revised Go instead');
      }
      p.direction = recordDirection(p.direction, { kind: d.kind, at, by: 'FOUNDER', ...(d.target ? { target: d.target } : {}), ...(revises ? { revises } : {}), ...(restores ? { restores } : {}), ...(d.resume ? { resume: true } : {}) });
      const ver = p.direction.versions.at(-1)!.v;
      emit(p, { type: 'decided', workflow: 'SJ', task: 'sj8', version: ver, by: 'FOUNDER', method: 'human', detail: [d.kind, d.target, revises && `revises v${revises}`, d.resume && 'resume'].filter(Boolean).join(' ') });

      if (d.kind === 'stop') { p.archived = true; emit(p, { type: 'archived', detail: 'both workflows read-only' }); return; }
      if (d.resume) { p.archived = false; emit(p, { type: 'resumed', by: 'FOUNDER', method: 'human' }); }
      if (d.kind === 'go') {
        sj8.versions.push(Object.freeze({ v: sj8.versions.length + 1, at, method: 'human', pins: pinsFor(p, 'sj8'), approval: Object.freeze({ by: 'FOUNDER', method: 'human' }), outcome: 'pass' }) as ArtifactVersion);
        sj8.state = 'approved'; sj8.method = 'human'; p.pivotSnapshot = null;
        tryUnlock(p);
        return;
      }
      if (d.kind === 'pivot-withdrawn') {
        const snap = p.pivotSnapshot!;
        p.workflows = snap.workflows; p.packages = snap.packages; p.pivotSnapshot = null;
        emit(p, { type: 'notice', detail: `pivot withdrawn; Go v${restores} is current again` });
        return;
      }
      // pivot: reopen only the target, flag what depends on it, keep everything else
      p.pivotSnapshot = { workflows: JSON.parse(JSON.stringify(p.workflows)), packages: JSON.parse(JSON.stringify(p.packages)), approvalsAt: p.events.filter(e => e.type === 'approved' || e.type === 'decided').length - 1 };
      const status = Object.fromEntries(TASKS.map(t => [t.id, state(p, t.id)]));
      const impact = pivotImpact(d.target!, status);
      const flag = (ids: string[], s: ExecState, type: ProjectEvent['type']) => ids.forEach(id => { rt(p, id).state = s; emit(p, { type, workflow: wfOf(id), task: id, detail: `pivot to ${d.target}` }); });
      flag(impact.reopen.filter(id => state(p, id) !== 'not-started'), 'not-started', 'reopened');
      flag(impact.revalidate, 'needs-revalidation', 'needs-revalidation');
      flag(impact.paused, 'paused', 'paused');
      flag(impact.reconfirm.filter(id => state(p, id) === 'approved'), 'needs-reconfirmation', 'needs-reconfirmation');
      impact.atRisk.forEach(id => { rt(p, id).atRisk = true; emit(p, { type: 'at-risk', workflow: wfOf(id), task: id, detail: `pivot to ${d.target}` }); });
      impact.notice.forEach(id => emit(p, { type: 'notice', workflow: wfOf(id), task: id, detail: `pivot to ${d.target}` }));
      sj8.state = 'needs-reconfirmation';
      p.packages = p.packages.map(k => (k.stale ? k : { ...k, stale: true }));
      if (p.packages.length) emit(p, { type: 'package', workflow: 'SP', task: 'handoff', detail: 'every package is now stale history' });
    },

    // ---------------------------------------------------------------- Solution Builder (simulated adapter)
    solutionBuilderAccept(p: Project) {
      assertOpen(p);
      assertReady(p, 'sbaccept');
      const pkg = p.packages.at(-1)!;
      p.packages[p.packages.length - 1] = { ...pkg, state: 'accepted' };
      const r = rt(p, 'sbaccept'); r.method = 'simulated';
      const v = newVersion(p, 'sbaccept', 'simulated', 'SOLUTION_BUILDER');
      emit(p, { type: 'accepted', workflow: 'SJ', task: 'sbaccept', version: v.v, by: 'SOLUTION_BUILDER', method: 'simulated', detail: `package v${pkg.v}` });
      if (v.v > 1) cascade(p, 'sbaccept');
      tryUnlock(p);
    },

    solutionBuilderReturn(p: Project, reason: string) {
      assertOpen(p);
      assertReady(p, 'sbaccept');
      const pkg = p.packages.at(-1)!;
      p.packages[p.packages.length - 1] = { ...pkg, state: 'returned' };
      emit(p, { type: 'returned', workflow: 'SJ', task: 'sbaccept', by: 'SOLUTION_BUILDER', method: 'simulated', detail: `package v${pkg.v}: ${reason}` });
      rt(p, 'handoff').state = 'needs-revalidation';
      emit(p, { type: 'needs-revalidation', workflow: 'SP', task: 'handoff', detail: 'returned by Solution Builder' });
    },

    currentPackage: (p: Project) => currentPackage(p.packages),
    requiredInputs: (id: string, ctx?: Context) => requiredInputs(id, ctx),
  };
  return core;
}

export type Core = ReturnType<typeof createCore>;
