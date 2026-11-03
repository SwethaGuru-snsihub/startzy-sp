// The live office. For every task an agent owns, the runner walks the core through its real states over
// time: start, submit, review. Each step is a real core action, so the project's state is always
// the truth and survives a reload (a task found in progress simply carries on). The runner keeps only
// timers, used for the walking and the progress bars. It never approves anything: that is the founder's.
import type { Core } from '@/engine/core/project';
import { TASK } from '@/engine/core/register';
import type { Project } from '@/engine/core/types';
import type { CoreRuntime } from '@/services/coreRuntime';
import { genSections, mergeEdited, parseInterviews } from './content';
import type { DocStore } from './docStore';
import type { IdeaInput } from './idea';
import { agentLook } from './model';
import { taskStatus, type RunPhase } from './viewModel';

export const AGENT_TASKS = ['brief', 'research', 'problem', 'market', 'personas', 'competitors'] as const;
export const WORK_MS: Record<string, number> = { brief: 4200, research: 3800, problem: 3500, market: 3800, personas: 3500, competitors: 3500 };
export const WALK_MS = 1300, REVIEW_MS = 1700, REDO_FACTOR = 0.6, RETRY_MS = 5000;

type Timer = { phase: RunPhase; left: number; total: number };
export type RunnerDeps = { rt: CoreRuntime; id: string; docs: DocStore; idea: () => IdeaInput | null };

export function createRunner(deps: RunnerDeps) {
  const { rt, id, docs } = deps;
  const timers = new Map<string, Timer>();
  let lastError: string | null = null;

  const ready = () => { const e = rt.getEntry(id); return e && e.status === 'ready' ? e : null; };
  const statusOf = (tid: string) => { const e = ready(); return e ? taskStatus(rt.core, e.project, tid, { takenUp: docs.takenUp(), rechecks: docs.rechecks() }) : null; };
  const run = (fn: (c: Core, p: Project) => void) => { const r = rt.mutate(id, fn); if (!r.ok) lastError = r.error; return r.ok; };
  const workMs = (tid: string) => {
    const t = ready()?.project.workflows.SP.tasks[tid];
    return Math.round(WORK_MS[tid] * (t && (t.reworks > 0 || t.versions.length > 0) ? REDO_FACTOR : 1));   // a revision or a re-check is quicker
  };

  /** The agent's draft is ready for the founder: save it as the document's next version. */
  function drafted(tid: string) {
    const idea = deps.idea(), e = ready();
    if (!idea || !e) return;
    const redo = e.project.workflows.SP.tasks[tid].versions.length > 0;
    const note = docs.takeNote(tid);
    const fresh = genSections(tid, { idea, interviews: parseInterviews(docs.latest('interviews')?.secs) });
    docs.add(tid, { by: `${agentLook(TASK[tid].owner).name} (simulated)`, note: note ? `Revised: ${note}` : redo ? 'Re-checked against updated inputs' : 'First draft', secs: [...(note ? [{ h: 'Your note, applied', b: note }] : []), ...mergeEdited(fresh, docs.latest(tid)?.secs)] });
  }

  const set = (tid: string, phase: RunPhase, ms: number) => { const t = { phase, left: ms, total: ms }; timers.set(tid, t); return t; };

  return {
    /** Advances the agents' work by `dt` milliseconds of office time. */
    tick(dt: number) {
      for (const tid of AGENT_TASKS) {
        const st = statusOf(tid);
        if (!st) return;
        const t = timers.get(tid);
        if (st === 'ready') {
          const w = t?.phase === 'walk' ? t : set(tid, 'walk', WALK_MS);
          w.left -= dt;
          if (w.left <= 0) { if (run((c, p) => c.startTask(p, tid, 'simulated'))) set(tid, 'work', workMs(tid)); else set(tid, 'walk', RETRY_MS); }
        } else if (st === 'working') {
          const w = t?.phase === 'work' ? t : set(tid, 'work', workMs(tid));
          w.left -= dt;
          if (w.left <= 0) {
            if (!run((c, p) => c.submitTask(p, tid))) { set(tid, 'work', RETRY_MS); continue; }
            const after = statusOf(tid);
            if (after === 'review') set(tid, 'review', REVIEW_MS); else { timers.delete(tid); if (after === 'needs') drafted(tid); }
          }
        } else if (st === 'review') {
          const w = t?.phase === 'review' ? t : set(tid, 'review', REVIEW_MS);
          w.left -= dt;
          if (w.left <= 0) { if (run((c, p) => c.reviewTask(p, tid, { passed: true }))) { timers.delete(tid); drafted(tid); } else set(tid, 'review', RETRY_MS); }
        } else {
          timers.delete(tid);
          if (st === 'needs' && !docs.latest(tid)) drafted(tid);   // closed between submit and save: write the missing draft
        }
      }
    },
    /** Which task is walking, working or in review right now. */
    phases(): Record<string, RunPhase> { return Object.fromEntries([...timers].map(([k, v]) => [k, v.phase])); },
    /** How far the agent is through its work, 0 to 100. */
    progress(tid: string): number { const t = timers.get(tid); return t && t.phase === 'work' ? Math.round((1 - t.left / t.total) * 100) : t?.phase === 'review' ? 100 : 0; },
    busy: () => timers.size > 0,
    error: () => lastError,
  };
}
export type Runner = ReturnType<typeof createRunner>;

