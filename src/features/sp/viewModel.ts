// Turns a project's core state into what the screens show. Nothing here keeps its own progress: every
// status is read from the core instance, so the office always reflects the real workflow state.
// (The runner adds only timing for the walking and the progress bars, never state.)
import type { Core, TaskView } from '@/engine/core/project';
import type { CoreAgentId } from '@/engine/core/definitions';
import { TASK, consumers } from '@/engine/core/register';
import type { Project, ProjectEvent } from '@/engine/core/types';
import { agentLook, COMMAND_CENTRE, DESK_SLOTS, DISCOVER_TASKS, HOME_SEAT, MAP_AGENTS, ROOMS, seatXY, TASK_ROOM, type DiscoverTask, type SpRoomId } from './model';

/** What a task looks like to the founder. */
export type TaskStatus =
  | 'blocked'    // waiting for earlier work
  | 'ready'      // an agent can start it
  | 'working'    // an agent is on it
  | 'review'     // a reviewer agent is checking it
  | 'needs'      // only the founder can move it: approve, decide, or provide it
  | 'optional'   // the founder chooses whether to take it up
  | 'recheck'    // approved earlier; an input changed; waits for the founder to approve the re-check
  | 'reconfirm'  // a decision to confirm again
  | 'paused'     // stopped because an input changed
  | 'awaiting'   // the core needs an answer first
  | 'done' | 'declined' | 'na';

export const STATUS_LABEL: Record<TaskStatus, string> = {
  blocked: 'Waiting', ready: 'Ready', working: 'Working', review: 'In review', needs: 'Needs you', optional: 'Optional', recheck: 'Needs re-check',
  reconfirm: 'Confirm again', paused: 'Paused', awaiting: 'Needs an answer', done: 'Done', declined: 'Declined', na: 'Not applicable',
};
export const statusTone = (s: TaskStatus) => (s === 'done' ? 'go' : s === 'working' || s === 'review' ? 'run' : s === 'needs' || s === 'optional' ? 'you' : s === 'recheck' || s === 'reconfirm' || s === 'paused' ? 'bad' : '');

/** Choices the founder made that the core does not record: optional work taken up, and re-checks approved. */
export type StatusCtx = { takenUp?: readonly string[]; rechecks?: readonly string[] };

export function taskStatus(core: Core, p: Project, id: string, ctx: StatusCtx = {}): TaskStatus {
  const v = core.taskView(p, id), t = TASK[id];
  if (v.applicability === 'awaiting') return 'awaiting';
  if (v.applicability === 'na') return 'na';
  const agentOwned = t.owner !== 'FOUNDER' && t.kind !== 'gate';
  switch (v.state) {
    case 'approved': return 'done';
    case 'declined': return 'declined';
    case 'in-progress': return 'working';
    case 'in-review': return 'review';
    case 'awaiting-approval': return 'needs';
    case 'needs-reconfirmation': return 'reconfirm';
    case 'paused':
      // Work that was in progress when an input changed never reached an approved version, so there is
      // nothing for the founder to re-approve: the agent simply picks it up again on the new inputs.
      return agentOwned ? (v.ready ? 'ready' : 'blocked') : 'paused';
    case 'needs-revalidation':
      if (agentOwned && ctx.rechecks?.includes(id)) return v.ready ? 'ready' : 'blocked';   // the founder approved the re-check
      return 'recheck';
    default:
      if (!v.ready) return 'blocked';
      if (v.applicability === 'optional' && !ctx.takenUp?.includes(id)) return 'optional';   // the founder chooses first, even for their own tasks
      return agentOwned ? 'ready' : 'needs';
  }
}

export type TaskRow = { id: DiscoverTask; artifact: string; step: string; status: TaskStatus; owner: CoreAgentId; support: CoreAgentId[]; reviewer: CoreAgentId | null; room: SpRoomId; view: TaskView };

export function discoverRows(core: Core, p: Project, ctx: StatusCtx = {}): TaskRow[] {
  return DISCOVER_TASKS.map(id => {
    const t = TASK[id];
    return { id, artifact: t.artifact, step: t.home, status: taskStatus(core, p, id, ctx), owner: t.owner, support: t.contributors, reviewer: t.reviewer, room: TASK_ROOM[id], view: core.taskView(p, id) };
  });
}

/** Tasks that wait for the founder: approvals, decisions, inputs, choices and re-checks. */
export const needsYou = (rows: TaskRow[]) => rows.filter(r => r.status === 'needs' || r.status === 'optional' || r.status === 'recheck' || r.status === 'reconfirm');

/** What the founder does with a task that waits for them. */
export type Action = 'review' | 'input' | 'gate' | 'choose' | 'reconfirm' | 'impact';
export function actionFor(r: TaskRow): Action | null {
  switch (r.status) {
    case 'needs': return r.id === 'gate1' ? 'gate' : r.owner === 'FOUNDER' ? 'input' : 'review';
    case 'optional': return 'choose';
    case 'reconfirm': return 'gate';
    case 'recheck': return r.owner === 'FOUNDER' ? 'reconfirm' : 'impact';
    default: return null;
  }
}
const VERB: Record<Action, string> = { review: 'Review', input: 'Provide', gate: 'Decide', choose: 'Choose on', reconfirm: 'Confirm', impact: 'Re-check' };

export type NextStep = { tone: 'you' | 'run' | 'done' | 'wait'; text: string; task?: DiscoverTask };
/** The one sentence that says what happens next: the founder's turn first, then who is working, then what is waiting. */
export function nextStep(rows: TaskRow[]): NextStep {
  const mine = needsYou(rows)[0];
  if (mine) { const a = actionFor(mine)!; return { tone: 'you', text: `Your turn: ${VERB[a]} ${mine.artifact}.`, task: mine.id }; }
  const going = rows.filter(r => r.status === 'working' || r.status === 'review' || r.status === 'ready');
  if (going.length) return { tone: 'run', text: going.map(r => `${agentLook(r.status === 'review' && r.reviewer ? r.reviewer : r.owner).name} ${r.status === 'review' ? 'is reviewing' : r.status === 'ready' ? 'is about to start' : 'is working on'} ${r.artifact}`).join(' · ') + '.' };
  if (rows.every(r => r.status === 'done' || r.status === 'declined' || r.status === 'na')) return { tone: 'done', text: 'Discover is complete: Gate 1 is passed. SP4 Solution Discovery comes next, outside this prototype.' };
  const stuck = rows.find(r => r.status === 'awaiting');
  return { tone: 'wait', text: stuck ? `${stuck.artifact} needs an answer from you first.` : 'Waiting for earlier work to finish.' };
}

export type StepState = { id: string; label: string; status: 'not-started' | 'in-progress' | 'complete' };
export function discoverSteps(core: Core, p: Project): StepState[] {
  const sp = core.workflowProgress(p, 'SP');
  const labelOf = (id: string) => (id === 'gate1' ? 'Gate 1' : `${id} ${id === 'SP1' ? 'Idea' : id === 'SP2' ? 'Problem' : 'Market'}`);
  const state = (id: string): StepState['status'] => {
    if (id === 'gate1') { const s = core.state(p, 'gate1'); return s === 'approved' ? 'complete' : s === 'not-started' ? 'not-started' : 'in-progress'; }
    return sp.steps.find(s => s.id === id)?.status ?? 'not-started';
  };
  return ['SP1', 'SP2', 'SP3', 'gate1'].map(id => ({ id, label: labelOf(id), status: state(id) }));
}

export type RoomCard = { id: SpRoomId; name: string; doing: number; waiting: number; done: number; active: boolean };
export function roomCards(rows: TaskRow[]): RoomCard[] {
  return ROOMS.map(r => {
    const mine = rows.filter(x => x.room === r.id || (r.id === 'quality' && x.status === 'review'));
    const doing = mine.filter(x => x.status === 'working' || x.status === 'review').length;
    const waiting = mine.filter(x => ['needs', 'blocked', 'ready', 'optional', 'recheck', 'reconfirm', 'paused'].includes(x.status) && x.room === r.id).length;
    return { id: r.id, name: r.name, doing, waiting, done: mine.filter(x => x.status === 'done' && x.room === r.id).length, active: doing > 0 || mine.some(x => x.status === 'needs' && x.room === r.id) };
  });
}

/** The runner's timing for one task: walking to the desk, working, or being reviewed. Presentation only. */
export type RunPhase = 'walk' | 'work' | 'review';
export type AgentSpot = { id: CoreAgentId; x: number; y: number; state: 'idle' | 'walking' | 'working' | 'review' | 'you'; bubble: string; room: SpRoomId | 'centre' };

/** Where each agent is and what it is doing. Agents sit at their home seat; those at work walk to their task's room. */
export function agentSpots(rows: TaskRow[], phases: Record<string, RunPhase> = {}): AgentSpot[] {
  const want = new Map<CoreAgentId, { room: SpRoomId; state: AgentSpot['state']; bubble: string }>();
  for (const r of rows) {
    const ph = phases[r.id];
    if (r.status === 'ready' && ph === 'walk') [r.owner, ...r.support].forEach(a => want.set(a, { room: r.room, state: 'walking', bubble: 'on my way' }));
    else if (r.status === 'working') [r.owner, ...r.support].forEach((a, i) => want.set(a, { room: r.room, state: 'working', bubble: i === 0 ? 'working…' : 'helping' }));
    else if (r.status === 'review' && r.reviewer) want.set(r.reviewer, { room: 'quality', state: 'review', bubble: 'reviewing' });
  }
  const taken = new Map<SpRoomId, Set<number>>();
  const claim = (room: SpRoomId, d: number) => { const s = taken.get(room) ?? new Set<number>(); s.add(d); taken.set(room, s); };
  const spots: AgentSpot[] = [];
  const at = (id: CoreAgentId) => HOME_SEAT[id];
  // agents who stay home keep their own desk
  for (const id of MAP_AGENTS) { const w = want.get(id), h = at(id); if (id !== 'CEO' && h && (!w || w.room === h[0])) claim(h[0], h[1]); }
  for (const id of MAP_AGENTS) {
    if (id === 'CEO') { spots.push({ id, ...COMMAND_CENTRE, state: 'idle', bubble: '', room: 'centre' }); continue; }
    const w = want.get(id), home = at(id) ?? (['hub', 0] as [SpRoomId, number]);
    if (id === 'FOUNDER') { const you = rows.some(r => r.status === 'needs'); const [x, y] = seatXY(home[0], home[1]); spots.push({ id, x, y, state: you ? 'you' : 'idle', bubble: you ? 'Your turn' : '', room: home[0] }); continue; }
    if (!w) { const [x, y] = seatXY(home[0], home[1]); spots.push({ id, x, y, state: 'idle', bubble: '', room: home[0] }); continue; }
    let desk = home[0] === w.room ? home[1] : -1;
    if (desk < 0) { desk = DESK_SLOTS.findIndex((_, d) => !(taken.get(w.room)?.has(d))); if (desk < 0) desk = 0; claim(w.room, desk); }
    const [x, y] = seatXY(w.room, desk);
    spots.push({ id, x, y, state: w.state, bubble: w.bubble, room: w.room });
  }
  return spots;
}

/** Tasks the core has flagged because something they were built on changed. */
export const FLAGGED = ['needs-revalidation', 'needs-reconfirmation', 'paused'] as const;
export function recheckScope(core: Core, p: Project): { flagged: DiscoverTask[]; later: DiscoverTask[] } {
  const discover = new Set<string>(DISCOVER_TASKS);
  const flagged = DISCOVER_TASKS.filter(id => (FLAGGED as readonly string[]).includes(core.state(p, id)));
  const seen = new Set<string>(flagged), later: DiscoverTask[] = [], queue: string[] = [...flagged];
  while (queue.length) for (const c of consumers(queue.pop()!)) {
    if (seen.has(c) || !discover.has(c) || TASK[c].kind === 'direction') continue;
    seen.add(c);
    if (core.state(p, c) === 'approved') { later.push(c as DiscoverTask); queue.push(c); }
  }
  return { flagged, later };
}

const BY: Record<string, string> = { FOUNDER: 'You', CEO: 'Atlas', SOLUTION_BUILDER: 'Solution Builder' };
const who = (by?: string) => (by ? BY[by] ?? agentLook(by as CoreAgentId).name : 'Atlas');
/** One line of the activity feed, from a real core event. */
export function describeEvent(e: ProjectEvent): string {
  const art = e.task ? TASK[e.task]?.artifact ?? e.task : '';
  const how = e.method === 'simulated' ? ' (simulated)' : '';
  switch (e.type) {
    case 'created': return 'Project created';
    case 'fact': return `Recorded: ${e.detail ?? 'an answer'}`;
    case 'delegation': return `Approvals: ${e.detail ?? 'set'}`;
    case 'started': return `${who(e.by)} started ${art}${how}`;
    case 'submitted': return `${who(e.by)} submitted ${art}`;
    case 'reviewed': return `${who(e.by)} reviewed ${art}: ${e.detail ?? 'done'} (simulated)`;
    case 'approved': return e.detail === 'revised by the founder' ? `You revised ${art} (v${e.version})` : `${who(e.by)} approved ${art}${e.version && e.version > 1 ? ` v${e.version}` : ''}`;
    case 'returned': return `You sent ${art} back${e.detail ? ` (${e.detail.replace(/^sent back: /, '')})` : ''}`;
    case 'decided': return `${who(e.by)} decided ${art}: ${e.detail ?? ''}`.trim();
    case 'needs-revalidation': return `${art} needs a re-check${e.detail ? ` (${e.detail})` : ''}`;
    case 'needs-reconfirmation': return `${art} needs to be confirmed again${e.detail ? ` (${e.detail})` : ''}`;
    case 'paused': return `${art} was paused${e.detail ? ` (${e.detail})` : ''}`;
    case 'declined': return `You declined ${art}`;
    default: return `${e.type}${art ? ' · ' + art : ''}${e.detail ? ': ' + e.detail : ''}`;
  }
}
/** The activity feed: newest first, about the Discover work only. */
export function activity(p: Project, limit = 40): { seq: number; at: string; text: string }[] {
  return [...p.events].reverse().filter(e => !e.task || e.task === 'profile' || (DISCOVER_TASKS as readonly string[]).includes(e.task)).slice(0, limit).map(e => ({ seq: e.seq, at: e.at, text: describeEvent(e) }));
}
