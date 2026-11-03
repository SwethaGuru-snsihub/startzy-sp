// What the Solution Planning screens show, in one place: the rooms of the office, the agents' seats,
// which room each Discover task is worked in, and the tab and phase structure. Static data only; the
// state of the work always comes from the project's core instance (see viewModel.ts).
import { AGENTS } from '@/engine/model';
import type { CoreAgentId } from '@/engine/core/definitions';

export type SpRoomId = 'discovery' | 'research' | 'product' | 'tech' | 'quality' | 'delivery' | 'hub' | 'repo' | 'founder';
export type SpRoom = { id: SpRoomId; name: string; x: number; y: number; w: number; h: number; tint: string; desks: number };

/** Rooms on the 100 × 100 map (percent of its width and height). Departments are skills; phases only filter. */
export const ROOMS: SpRoom[] = [
  { id: 'discovery', name: 'Discovery', x: 2, y: 3, w: 31, h: 29, tint: '--room-briefing', desks: 4 },
  { id: 'research', name: 'Research', x: 35, y: 3, w: 30, h: 29, tint: '--room-research', desks: 4 },
  { id: 'product', name: 'Product & Business', x: 67, y: 3, w: 31, h: 29, tint: '--room-work', desks: 4 },
  { id: 'tech', name: 'Tech & Design', x: 2, y: 35, w: 31, h: 29, tint: '--room-meeting', desks: 4 },
  { id: 'quality', name: 'Review & Quality', x: 67, y: 35, w: 31, h: 29, tint: '--room-approval', desks: 4 },
  { id: 'delivery', name: 'Delivery', x: 2, y: 67, w: 31, h: 30, tint: '--room-customer', desks: 4 },
  { id: 'hub', name: 'Agent Hub', x: 35, y: 67, w: 14.5, h: 30, tint: '--room-lounge', desks: 2 },
  { id: 'repo', name: 'Repository', x: 50.5, y: 67, w: 14.5, h: 30, tint: '--room-vault', desks: 0 },
  { id: 'founder', name: 'Founder Office', x: 67, y: 67, w: 31, h: 30, tint: '--room-office', desks: 2 },
];
export const ROOM = Object.fromEntries(ROOMS.map(r => [r.id, r])) as Record<SpRoomId, SpRoom>;
export const DESK_SLOTS: [number, number][] = [[.2, .62], [.5, .62], [.8, .62], [.35, .88], [.65, .88]];

/** Where each agent sits when idle: [room, desk]. Atlas stays in the command centre, in the middle. */
export const HOME_SEAT: Partial<Record<CoreAgentId, [SpRoomId, number]>> = {
  CSO: ['discovery', 0], BA: ['discovery', 1], CDO: ['research', 0], CPO: ['product', 0], CFO: ['product', 1],
  CQRO: ['quality', 0], CTO: ['tech', 0], CMO: ['hub', 0], FOUNDER: ['founder', 1],
};
export const COMMAND_CENTRE = { x: 50, y: 50 };
export const seatXY = (room: SpRoomId, desk: number): [number, number] => { const r = ROOM[room], s = DESK_SLOTS[desk]; return [r.x + r.w * s[0], r.y + r.h * s[1]]; };

export type AgentLook = { id: CoreAgentId; name: string; role: string; color: string; crew: boolean; optional: boolean; seated: boolean };
const OFFICE = AGENTS as Record<string, { name: string; role: string; kind: string; color: string; optional?: boolean }>;
// Agents the core uses that the Office registry does not have yet (see the epic mapping findings).
const EXTRA: Partial<Record<CoreAgentId, { name: string; role: string; color: string }>> = {
  CDO: { name: 'Data', role: 'Data', color: 'var(--sb)' }, CCO: { name: 'Customer', role: 'Customer', color: 'var(--ag-crew)' },
  CXO: { name: 'Experience', role: 'Experience', color: 'var(--ag-crew)' }, CISO: { name: 'Security', role: 'Security', color: 'var(--ag-crew)' }, CHRO: { name: 'People', role: 'People', color: 'var(--ag-crew)' },
};
export function agentLook(id: CoreAgentId): AgentLook {
  const key = id === 'FOUNDER' ? 'YOU' : id;
  const o = OFFICE[key];
  if (o) return { id, name: o.name, role: o.role, color: o.color, crew: o.kind === 'crew', optional: !!o.optional, seated: true };
  const x = EXTRA[id];
  return { id, name: x?.name ?? id, role: x?.role ?? id, color: x?.color ?? 'var(--ag-crew)', crew: false, optional: false, seated: !!HOME_SEAT[id] };
}
/** The agents that appear on the Discover map: everyone who owns, supports or reviews one of its tasks, plus Atlas. */
export const MAP_AGENTS: CoreAgentId[] = ['CEO', 'CSO', 'BA', 'CDO', 'CPO', 'CFO', 'CQRO', 'CTO', 'CMO', 'FOUNDER'];

/** The tasks of the Discover phase that the founder sees, in the order the workflow reaches them. */
export const DISCOVER_TASKS = ['goal', 'clarify', 'brief', 'research', 'interviews', 'problem', 'market', 'personas', 'competitors', 'gate1'] as const;
export type DiscoverTask = (typeof DISCOVER_TASKS)[number];
/** The room each task is worked in. */
export const TASK_ROOM: Record<DiscoverTask, SpRoomId> = {
  goal: 'founder', clarify: 'founder', brief: 'discovery', research: 'research', interviews: 'founder', problem: 'discovery',
  market: 'research', personas: 'product', competitors: 'research', gate1: 'founder',
};
/** The steps of the Discover phase as the founder reads them (SP1 to SP3 and Gate 1). */
export const DISCOVER_STEPS = [
  { id: 'SP1', label: 'SP1 Idea' }, { id: 'SP2', label: 'SP2 Problem' }, { id: 'SP3', label: 'SP3 Market' }, { id: 'gate1', label: 'Gate 1' },
] as const;
export const PHASES = [{ name: 'Discover', open: true }, { name: 'Define', open: false }, { name: 'Design', open: false }, { name: 'Delivery', open: false }] as const;
