// Static model: agents, rooms, engines, stages. Source: docs/screen-plans/04 (room-engine-agent map)
// and 06 (approved design v1.0, room positions on the 1000 x 730 map).

export type AgentId =
  | 'YOU' | 'CEO' | 'CSO' | 'CPO' | 'CFO' | 'CTO' | 'CMO' | 'COO' | 'CRO' | 'CQRO'
  | 'BA' | 'PM' | 'TPM' | 'UX' | 'QA';

export type AgentKind = 'founder' | 'atlas' | 'exec' | 'crew';

export const AGENTS: Record<AgentId, { name: string; role: string; kind: AgentKind; color: string; home: string; optional?: boolean }> = {
  YOU: { name: 'You', role: 'Founder · owner', kind: 'founder', color: 'var(--persona)', home: 'office' },
  CEO: { name: 'Atlas', role: 'CEO · command centre', kind: 'atlas', color: 'var(--ag-ceo)', home: 'E01' },
  CSO: { name: 'Asha', role: 'Strategy', kind: 'exec', color: 'var(--ag-cso)', home: 'E06' },
  CPO: { name: 'Neel', role: 'Product', kind: 'exec', color: 'var(--ag-cpo)', home: 'E16' },
  CFO: { name: 'Farah', role: 'Finance', kind: 'exec', color: 'var(--ag-cfo)', home: 'E25' },
  CTO: { name: 'Tej', role: 'Technology', kind: 'exec', color: 'var(--ag-cto)', home: 'E18' },
  CMO: { name: 'Maya', role: 'Marketing', kind: 'exec', color: 'var(--ag-cmo)', home: 'E08', optional: true },
  COO: { name: 'Omar', role: 'Operations', kind: 'exec', color: 'var(--ag-coo)', home: 'E24', optional: true },
  CRO: { name: 'Ravi', role: 'Revenue', kind: 'exec', color: 'var(--ag-cro)', home: 'E12', optional: true },
  CQRO: { name: 'Quinn', role: 'Quality & risk', kind: 'exec', color: 'var(--ag-cqro)', home: 'E20' },
  BA: { name: 'BA', role: 'Business analyst', kind: 'crew', color: 'var(--ag-crew)', home: 'E15' },
  PM: { name: 'PM', role: 'Product manager', kind: 'crew', color: 'var(--ag-crew)', home: 'E16' },
  TPM: { name: 'TPM', role: 'Technical PM', kind: 'crew', color: 'var(--ag-crew)', home: 'E19' },
  UX: { name: 'UX', role: 'Designer', kind: 'crew', color: 'var(--ag-crew)', home: 'E17' },
  QA: { name: 'QA', role: 'QA reviewer', kind: 'crew', color: 'var(--ag-crew)', home: 'E19' },
};

export type RoomId = 'briefing' | 'meeting' | 'approval' | 'board' | 'research' | 'brain' | 'office' | 'work' | 'lounge' | 'customer' | 'vault';

export const ROOMS: Record<RoomId, { name: string; full: string; x: number; y: number; w: number; h: number; tint: string }> = {
  briefing: { name: 'Discovery', full: 'Business Discovery Centre', x: 24, y: 24, w: 200, h: 190, tint: 'var(--room-briefing)' },
  meeting: { name: 'Review & Quality', full: 'Review & Quality Centre', x: 248, y: 24, w: 236, h: 190, tint: 'var(--room-meeting)' },
  approval: { name: 'Governance', full: 'Governance & Compliance Centre', x: 508, y: 24, w: 236, h: 190, tint: 'var(--room-approval)' },
  board: { name: 'Strategy & Finance', full: 'Strategy & Finance Centre', x: 768, y: 24, w: 208, h: 190, tint: 'var(--room-board)' },
  research: { name: 'Research', full: 'Research & Intelligence Centre', x: 24, y: 246, w: 300, h: 196, tint: 'var(--room-research)' },
  brain: { name: 'Command Centre', full: 'Executive Command Centre', x: 348, y: 246, w: 342, h: 196, tint: 'transparent' },
  office: { name: 'Founder Office', full: 'Founder Command Office', x: 714, y: 246, w: 262, h: 196, tint: 'var(--room-office)' },
  work: { name: 'Product & Tech', full: 'Product & Technology Centre', x: 24, y: 474, w: 322, h: 192, tint: 'var(--room-work)' },
  lounge: { name: 'Agent Hub', full: 'Agent Operations Hub', x: 370, y: 474, w: 128, h: 192, tint: 'var(--room-lounge)' },
  customer: { name: 'Customer & Growth', full: 'Customer & Growth Centre', x: 522, y: 474, w: 214, h: 192, tint: 'var(--room-customer)' },
  vault: { name: 'Repository', full: 'Knowledge & Document Repository', x: 760, y: 474, w: 216, h: 192, tint: 'var(--room-vault)' },
};

export type EngineDef = { id: string; name: string; full: string; room: RoomId; seats: number; skill: string };

export const ENGINES: EngineDef[] = [
  { id: 'E01', name: 'Orchestrator', full: 'Orchestrator', room: 'brain', seats: 1, skill: 'Orchestration' },
  { id: 'E02', name: 'Memory', full: 'Context & Memory Engine', room: 'brain', seats: 0, skill: 'System' },
  { id: 'E03', name: 'Analytics', full: 'Analytics Engine', room: 'brain', seats: 1, skill: 'Analytics' },
  { id: 'E04', name: 'Intake', full: 'Intake Engine', room: 'briefing', seats: 2, skill: 'Intake' },
  { id: 'E05', name: 'Question', full: 'Question Engine', room: 'briefing', seats: 2, skill: 'Questioning' },
  { id: 'E06', name: 'Research', full: 'Research Engine', room: 'research', seats: 1, skill: 'Research' },
  { id: 'E07', name: 'Simulation', full: 'Simulation Engine (MiroFish)', room: 'research', seats: 0, skill: 'Simulation' },
  { id: 'E08', name: 'Market', full: 'Market Research Engine', room: 'research', seats: 1, skill: 'Market research' },
  { id: 'E09', name: 'Competitor', full: 'Competitor Analysis Engine', room: 'research', seats: 1, skill: 'Competitor analysis' },
  { id: 'E10', name: 'Evidence', full: 'Evidence Engine', room: 'research', seats: 0, skill: 'Evidence' },
  { id: 'E11', name: 'Interview', full: 'Interview Engine', room: 'customer', seats: 2, skill: 'Interviewing' },
  { id: 'E12', name: 'GTM', full: 'GTM & Outreach Engine', room: 'customer', seats: 3, skill: 'Outreach' },
  { id: 'E13', name: 'Validation', full: 'Validation Engine', room: 'customer', seats: 2, skill: 'Validation' },
  { id: 'E14', name: 'Docs', full: 'Documentation Engine', room: 'work', seats: 4, skill: 'Documentation' },
  { id: 'E15', name: 'Biz analysis', full: 'Business Analysis Engine', room: 'work', seats: 3, skill: 'Business analysis' },
  { id: 'E16', name: 'Product', full: 'Product Planning Engine', room: 'work', seats: 3, skill: 'Product planning' },
  { id: 'E17', name: 'Design', full: 'Design Engine', room: 'work', seats: 2, skill: 'UX design' },
  { id: 'E18', name: 'Architecture', full: 'Architecture Engine', room: 'work', seats: 2, skill: 'Architecture' },
  { id: 'E19', name: 'Delivery', full: 'Delivery Engine', room: 'work', seats: 4, skill: 'Delivery / Testing' },
  { id: 'E20', name: 'Review', full: 'Review Engine', room: 'meeting', seats: 6, skill: 'Review' },
  { id: 'E21', name: 'Traceability', full: 'Traceability Engine', room: 'meeting', seats: 1, skill: 'Traceability' },
  { id: 'E22', name: 'Approval', full: 'Approval Engine', room: 'approval', seats: 4, skill: 'Approval' },
  { id: 'E23', name: 'Compliance', full: 'Compliance Engine', room: 'approval', seats: 2, skill: 'Compliance' },
  { id: 'E24', name: 'People', full: 'People & Project Engine', room: 'approval', seats: 3, skill: 'People operations' },
  { id: 'E25', name: 'Finance', full: 'Finance Engine', room: 'board', seats: 3, skill: 'Finance' },
  { id: 'E26', name: 'Deck', full: 'Deck Engine', room: 'board', seats: 2, skill: 'Deck building' },
  { id: 'E27', name: 'Gate', full: 'Gate Engine', room: 'board', seats: 4, skill: 'Gate review' },
  { id: 'E28', name: 'Vault', full: 'Vault Engine', room: 'vault', seats: 0, skill: 'System' },
];
export const engineById = (id: string) => ENGINES.find(e => e.id === id)!;

// Desk geometry inside rooms: room padding 12, room card 44, desk 84 x 58, gap 8.
export const DESK_W = 84, DESK_H = 58;
const BRAIN_SLOTS: Record<string, [number, number]> = { E01: [6, 10], E03: [6, 130], E02: [250, 70] };
export function deskPos(id: string): { x: number; y: number } {
  const e = engineById(id); const r = ROOMS[e.room];
  if (e.room === 'brain') { const [dx, dy] = BRAIN_SLOTS[id]; return { x: r.x + dx, y: r.y + dy }; }
  const list = ENGINES.filter(x => x.room === e.room); const i = list.indexOf(e);
  const cols = Math.max(1, Math.floor((r.w - 24 + 8) / (DESK_W + 8)));
  return { x: r.x + 12 + (i % cols) * (DESK_W + 8), y: r.y + 52 + Math.floor(i / cols) * (DESK_H + 8) };
}

export type Stage = { name: string; gate: 'ceo' | 'you' | 'none'; gateName?: string; board?: AgentId[] };
export const STAGES: Stage[] = [
  { name: 'Brief', gate: 'ceo' },
  { name: 'Problem', gate: 'you', gateName: 'Gate 1 · Is the problem worth solving?', board: ['CEO', 'CSO', 'CQRO'] },
  { name: 'Market & personas', gate: 'ceo' },
  { name: 'Business case', gate: 'you', gateName: 'Gate 2 · Business case inspection', board: ['CEO', 'CFO', 'CSO'] },
  { name: 'Product definition', gate: 'ceo' },
  { name: 'Design pack', gate: 'ceo' },
  { name: 'Company & team', gate: 'ceo' },
  { name: 'Build', gate: 'ceo' },
  { name: 'Validate', gate: 'you', gateName: 'Gate 3 · Ready to launch?', board: ['CEO', 'CPO', 'CQRO'] },
  { name: 'Launch', gate: 'ceo' },
  { name: 'Grow & scale', gate: 'none' },
];
export const GATE_STAGE: Record<number, number> = { 1: 1, 2: 3, 3: 8 };
