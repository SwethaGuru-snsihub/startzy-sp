// The two workflows: the 18-phase Startup Journey and the 16-step Solution Planning workflow,
// as defined in the product brief. Rooms use the Agent Office room ids from model.ts.
import type { RoomId } from '../model';

export type Workflow = 'SJ' | 'SP';
export type SpGroup = 'discover' | 'define' | 'design' | 'delivery';
export type CoreAgentId =
  | 'FOUNDER' | 'CEO' | 'CSO' | 'CPO' | 'CFO' | 'CTO' | 'CMO' | 'COO' | 'CRO' | 'CQRO'
  | 'CDO' | 'CCO' | 'CXO' | 'CHRO' | 'CISO'
  | 'BA' | 'PM' | 'TPM' | 'UX' | 'QA' | 'SOLUTION_BUILDER';

export type Phase = { id: string; n: number; name: string; room: RoomId; agents: CoreAgentId[] };
export type Step = { id: string; n: number; name: string; group: SpGroup };

const phase = (n: number, name: string, room: RoomId, agents: CoreAgentId[]): Phase => ({ id: `SJ${n}`, n, name, room, agents });
export const SJ_PHASES: readonly Phase[] = [
  phase(1, 'Founder Onboarding', 'briefing', ['CEO']),
  phase(2, 'Idea & Goal Discovery', 'briefing', ['CEO', 'CSO']),
  phase(3, 'Problem Discovery', 'research', ['CDO', 'CSO', 'CMO', 'CCO']),
  phase(4, 'Market Research', 'research', ['CDO', 'CSO', 'CMO']),
  phase(5, 'Problem Validation', 'research', ['CSO', 'CDO', 'CMO', 'CCO']),
  phase(6, 'Solution Ideation', 'work', ['CPO', 'CTO', 'CSO']),
  phase(7, 'Solution Validation', 'customer', ['CMO', 'CCO', 'CXO', 'CPO']),
  phase(8, 'Go / Pivot / Stop', 'board', ['CEO', 'CSO', 'CFO', 'FOUNDER']),
  phase(9, 'Business Planning', 'board', ['CEO', 'CSO', 'CFO']),
  phase(10, 'Product Definition', 'work', ['CPO', 'CTO', 'CXO']),
  phase(11, 'Design & Technical Planning', 'work', ['CPO', 'CTO', 'CXO']),
  phase(12, 'Company Setup, Legal & Funding', 'approval', ['COO', 'CISO', 'CFO', 'CEO']),
  phase(13, 'Hiring & Project Setup', 'approval', ['CHRO', 'COO', 'CTO']),
  phase(14, 'MVP Development', 'work', ['CTO', 'CPO']),
  phase(15, 'Testing & Quality Validation', 'meeting', ['CTO', 'COO', 'CPO']),
  phase(16, 'Beta Testing with Early Users', 'customer', ['CMO', 'CCO', 'CXO', 'CPO']),
  phase(17, 'Launch & Go-to-Market', 'customer', ['CMO', 'CCO', 'CXO', 'CEO']),
  phase(18, 'Business Operations, Growth & Scaling', 'brain', ['CEO', 'COO', 'CFO', 'CSO', 'CDO', 'CMO']),
];

const step = (n: number, name: string, group: SpGroup): Step => ({ id: `SP${n}`, n, name, group });
export const SP_STEPS: readonly Step[] = [
  step(1, 'Idea Definition', 'discover'), step(2, 'Problem Discovery', 'discover'), step(3, 'Opportunity & Market', 'discover'),
  step(4, 'Solution Discovery', 'discover'), step(5, 'Business Model & Case', 'discover'),
  step(6, 'Product Definition', 'define'), step(7, 'Requirements Register', 'define'), step(8, 'BRD / PRD / SRS', 'define'),
  step(9, 'Solution Blueprint', 'design'), step(10, 'Experience Design', 'design'), step(11, 'Technical Design', 'design'), step(12, 'Design Review', 'design'),
  step(13, 'Task Breakdown', 'delivery'), step(14, 'Estimates & Release Plan', 'delivery'), step(15, 'Quality, Release & Operations', 'delivery'),
  step(16, 'Handoff to Solution Builder', 'delivery'),
];

// Startup Journey phases that contain Solution Planning steps (or Gate 1). The steps stay owned by
// Solution Planning; the phase only shows their progress. SP16 sits outside every phase.
export const CONTAINS: Readonly<Record<string, readonly string[]>> = {
  SJ2: ['SP1'], SJ3: ['SP2'], SJ4: ['SP3'], SJ5: ['gate1'], SJ6: ['SP4'], SJ9: ['SP5'],
  SJ10: ['SP6', 'SP7', 'SP8'], SJ11: ['SP9', 'SP10', 'SP11', 'SP12', 'SP13', 'SP14', 'SP15'],
};
