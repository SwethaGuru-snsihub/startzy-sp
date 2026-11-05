// Epic 1 (Idea Understanding & Brief): the 11 sheet tasks laid over the three engine tasks behind them.
// The engine keeps its own task graph; this file only maps. Every status is derived from the engine's
// task statuses and never stored, so the screens cannot disagree with the core. Steps the engine does not
// have (classify, allocate, extract, questions, CEO sign-off) are marked 'ui': they are simulated and
// shown as done once the work they belong to has moved on.
import type { TaskStatus } from '../viewModel';
import type { FeatureId } from '../workflow';

export type EngineTaskId = 'goal' | 'clarify' | 'brief';
export type StepBacking = 'core' | 'ui';
export type Epic1Step = { id: string; feature: FeatureId; engineTask: EngineTaskId; backing: StepBacking };

export const EPIC1_STEPS: readonly Epic1Step[] = [
  { id: '1.T1', feature: 'capture', engineTask: 'goal', backing: 'core' },       // the founder submits the idea
  { id: '1.T2', feature: 'extract', engineTask: 'goal', backing: 'ui' },         // domain classifier
  { id: '1.T3', feature: 'extract', engineTask: 'goal', backing: 'ui' },         // CEO allocates the team
  { id: '1.T4', feature: 'extract', engineTask: 'goal', backing: 'ui' },         // CSO and BA extract the five slots
  { id: '1.T5', feature: 'clarify', engineTask: 'clarify', backing: 'ui' },      // slot owners write questions, CSO ranks
  { id: '1.T6', feature: 'clarify', engineTask: 'clarify', backing: 'core' },    // the founder answers
  { id: '1.T7', feature: 'brief', engineTask: 'brief', backing: 'core' },        // CSO drafts the brief
  { id: '1.T8', feature: 'brief', engineTask: 'brief', backing: 'core' },        // domain agents and CQRO review
  { id: '1.T9', feature: 'brief', engineTask: 'brief', backing: 'ui' },          // CEO signs off
  { id: '1.T10', feature: 'brief', engineTask: 'brief', backing: 'core' },       // the founder confirms
  { id: '1.T11', feature: 'brief', engineTask: 'brief', backing: 'core' },       // CSO locks Idea Brief v1
];
export const stepsOfFeature = (f: FeatureId) => EPIC1_STEPS.filter(s => s.feature === f);

export type EngineStatuses = Record<EngineTaskId, TaskStatus>;
const STALE: readonly TaskStatus[] = ['recheck', 'reconfirm'];
const PASS: readonly TaskStatus[] = ['paused', 'awaiting', 'declined', 'na'];

/** The status of each of the 11 steps, from the statuses of goal, clarify and brief. */
export function epic1Statuses({ goal, clarify, brief }: EngineStatuses): Record<string, TaskStatus> {
  // Steps that belong to the idea itself: done once it is approved, stale if it is being re-checked.
  const g: TaskStatus = goal === 'done' ? 'done' : STALE.includes(goal) ? 'recheck' : PASS.includes(goal) ? goal : 'blocked';
  // The brief steps in order: the first not-yet-done step shows the brief's own status.
  const seq = ['1.T7', '1.T8', '1.T9', '1.T10', '1.T11'] as const;
  const b = Object.fromEntries(seq.map(i => [i, 'blocked' as TaskStatus])) as Record<(typeof seq)[number], TaskStatus>;
  const fill = (upTo: number, status: TaskStatus, rest?: TaskStatus) => seq.forEach((i, k) => { if (k < upTo) b[i] = status; else if (k === upTo && rest) b[i] = rest; });
  switch (brief) {
    case 'done': fill(5, 'done'); break;
    case 'needs': fill(3, 'done', 'needs'); break;                                        // draft, review and CEO sign-off are behind it
    case 'review': fill(1, 'done', 'review'); break;
    case 'working': case 'ready': fill(0, 'blocked', brief); break;
    case 'recheck': case 'reconfirm': fill(4, 'recheck'); break;                          // stale: nothing is locked
    case 'blocked': break;
    default: if (PASS.includes(brief)) seq.forEach(i => { b[i] = brief; }); break;
  }
  return {
    '1.T1': goal, '1.T2': g, '1.T3': g, '1.T4': g, '1.T5': g,
    '1.T6': g === 'done' ? clarify : 'blocked',
    ...b,
  };
}

/** A feature is done when all its steps are done; otherwise it shows its first step that is not. */
export function featureStatus(f: FeatureId, statuses: Record<string, TaskStatus>): TaskStatus {
  const seq = stepsOfFeature(f).map(s => statuses[s.id]);
  return seq.find(s => s !== 'done') ?? 'done';
}
