// The live office. For every task an agent owns, the runner walks the core through its real states over
// time: start, submit, review. Each step is a real core action, so the project's state is always
// the truth and survives a reload (a task found in progress simply carries on). The runner keeps only
// timers, used for the walking and the progress bars. It never approves anything: that is the founder's.
//
// For a task the AI gate drives, the runner waits for the AI's answer BEFORE it starts the task in the core.
// While it waits the task stays "ready" and the agent stands at its desk ("waiting for Claude"); once the
// answer is there the task starts with the method that is true of it ('ai', or 'simulated' for a simulated
// answer or a fallback), then works, submits and is reviewed like any other. The runner only reads the gate:
// the gate and the AI service it sits on have no handle on the core.
import type { Core } from '@/engine/core/project';
import { TASK } from '@/engine/core/register';
import type { Project } from '@/engine/core/types';
import type { CoreRuntime } from '@/services/coreRuntime';
import type { AiGate, GateState } from './ai/gate';
import { genSections, mergeEdited, parseInterviews } from './content';
import type { DocStore } from './docStore';
import type { IdeaInput } from './idea';
import { agentLook } from './model';
import { AI_WRITTEN_TASKS, draftSource, makerTag, providerOf } from './provenance';
import { taskStatus, type RunPhase } from './viewModel';

export const AGENT_TASKS = ['brief', 'research', 'problem', 'market', 'personas', 'competitors'] as const;
export const WORK_MS: Record<string, number> = { brief: 4200, research: 3800, problem: 3500, market: 3800, personas: 3500, competitors: 3500 };
export const WALK_MS = 1300, REVIEW_MS = 1700, REDO_FACTOR = 0.6, RETRY_MS = 5000;

type Timer = { phase: RunPhase; left: number; total: number };
export type RunnerDeps = { rt: CoreRuntime; id: string; docs: DocStore; idea: () => IdeaInput | null; /** Present when the AI writes some tasks' drafts. */ ai?: AiGate };

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
  const gated = (tid: string) => !!deps.ai?.gated(tid);

  /** The agent's draft is ready for the founder: save it as the document's next version. Never approves it. */
  function drafted(tid: string) {
    const idea = deps.idea(), e = ready();
    if (!idea || !e) return;
    const redo = e.project.workflows.SP.tasks[tid].versions.length > 0;
    const note = docs.takeNote(tid);
    const isGated = gated(tid);
    const ai: GateState | null = isGated ? deps.ai!.state(tid) : null;   // a look only: nothing is asked for here
    const src = draftSource(tid, idea, isGated, ai);
    const fresh = genSections(tid, {
      idea, interviews: parseInterviews(docs.latest('interviews')?.secs),
      ...(ai?.status === 'ready' && ai.provider ? { ai: { value: ai.value, provider: ai.provider, ...(ai.fallback ? { fallback: ai.fallback } : {}) } } : {}),
    });
    const outdated = AI_WRITTEN_TASKS.includes(tid) && idea.brief && idea.briefStale ? ' (Claude brief is out of date, so this draft is simulated)' : '';
    const fellBack = src.fallback ? ` (simulated: Claude was unavailable. ${src.fallback.reason})` : '';
    docs.add(tid, {
      by: makerTag(agentLook(TASK[tid].owner).name, src.provider), provider: src.provider,
      ...(src.aiKey ? { aiKey: src.aiKey } : {}), ...(src.fallback ? { fallback: src.fallback } : {}),
      note: (note ? `Revised: ${note}` : redo ? 'Re-checked against updated inputs' : 'First draft') + outdated + fellBack,
      secs: [...(note ? [{ h: 'Your note, applied', b: note }] : []), ...mergeEdited(fresh, docs.latest(tid)?.secs)],
    });
  }

  const set = (tid: string, phase: RunPhase, ms: number) => { const t = { phase, left: ms, total: ms }; timers.set(tid, t); return t; };

  /** Starts the task in the core. The method is the true one: what produced the answer the draft will be built from. */
  function begin(tid: string, g: GateState | null) {
    const method = g ? (g.provider === 'claude-cli' ? 'ai' : 'simulated') : (providerOf(tid, deps.idea()) === 'claude-cli' ? 'ai' : 'simulated');
    if (run((c, p) => c.startTask(p, tid, method))) set(tid, 'work', workMs(tid)); else set(tid, 'walk', RETRY_MS);
  }

  return {
    /** Advances the agents' work by `dt` milliseconds of office time. */
    tick(dt: number) {
      for (const tid of AGENT_TASKS) {
        const st = statusOf(tid);
        if (!st) return;
        const t = timers.get(tid);
        if (st === 'ready') {
          // For an AI task the request starts as soon as the task is ready, so the walk overlaps the wait.
          const g = gated(tid) ? deps.ai!.ensure(tid) : null;
          if (t?.phase === 'wait') {
            if (g?.status === 'ready') begin(tid, g);
            else if (g?.status === 'failed') lastError = g.error ?? 'The AI could not answer.';
            continue;
          }
          const w = t?.phase === 'walk' ? t : set(tid, 'walk', WALK_MS);
          w.left -= dt;
          if (w.left <= 0) {
            if (g && g.status !== 'ready') set(tid, 'wait', 0);   // stand at the desk until the answer (or a retry) comes
            else begin(tid, g);
          }
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
    /** Which task is walking, waiting for the AI, working or in review right now. */
    phases(): Record<string, RunPhase> { return Object.fromEntries([...timers].map(([k, v]) => [k, v.phase])); },
    /** How far the agent is through its work, 0 to 100. */
    progress(tid: string): number { const t = timers.get(tid); return t && t.phase === 'work' ? Math.round((1 - t.left / t.total) * 100) : t?.phase === 'review' ? 100 : 0; },
    /** What the AI gate says for a task the runner is waiting on, or null if the AI does not write it. */
    aiState(tid: string): GateState | null { return gated(tid) ? deps.ai!.state(tid) : null; },
    busy: () => timers.size > 0,
    error: () => lastError,
  };
}
export type Runner = ReturnType<typeof createRunner>;
