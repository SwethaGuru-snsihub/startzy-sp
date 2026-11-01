// Artifact and dependency register: the 52 tasks of both workflows, each producing one artifact
// with one owner, and the 132 links between them.
// Link types: requires (pins an input version) · decision (requires a gate or the direction
// decision) · informed-by (notice only) · conditional (requires while a context fact is 'yes').
import type { Context, FactKey } from './context';
import type { CoreAgentId, Workflow } from './definitions';

export type TaskKind = 'task' | 'gate' | 'direction' | 'review' | 'package' | 'external';
export type LinkType = 'requires' | 'decision' | 'informed-by' | 'conditional';
export type Link = { from: string; to: string; type: LinkType; when?: FactKey; cross: boolean };
export type TaskDef = {
  id: string; workflow: Workflow; home: string; artifact: string; kind: TaskKind;
  owner: CoreAgentId; contributors: CoreAgentId[]; reviewer: CoreAgentId | null; links: Link[];
};

type RawLink = string | { informedBy: string } | { conditional: string; when: FactKey };
const RAW: [string, Workflow, string, string, CoreAgentId, CoreAgentId[], CoreAgentId | null, RawLink[], TaskKind?][] = [
  ['profile', 'SJ', 'SJ1', 'Founder profile', 'CEO', [], null, []],
  ['goal', 'SP', 'SP1', 'Idea goal', 'FOUNDER', ['CEO'], null, ['profile']],
  ['clarify', 'SP', 'SP1', 'Clarification answers', 'FOUNDER', ['CPO'], null, ['goal']],
  ['brief', 'SP', 'SP1', 'Idea brief', 'CSO', ['BA'], 'CQRO', ['goal', 'clarify']],
  ['research', 'SP', 'SP2', 'Desk research', 'CSO', ['CDO'], 'BA', ['brief']],
  ['interviews', 'SP', 'SP2', 'Interview notes', 'FOUNDER', ['CCO'], null, ['brief']],
  ['problem', 'SP', 'SP2', 'Problem statement', 'CSO', ['BA', 'CDO'], 'CQRO', ['research', 'interviews']],
  ['market', 'SP', 'SP3', 'Market sizing', 'CMO', ['CDO'], 'CFO', ['problem']],
  ['personas', 'SP', 'SP3', 'User personas', 'CPO', ['BA', 'CDO'], 'CMO', ['problem']],
  ['competitors', 'SP', 'SP3', 'Competitor map', 'CSO', ['CDO'], 'CTO', ['problem']],
  ['gate1', 'SP', 'SP3', 'Gate 1 decision', 'FOUNDER', ['CEO', 'CSO', 'CQRO'], null, ['research', 'interviews', 'problem', 'market', 'personas', 'competitors'], 'gate'],
  ['solution', 'SP', 'SP4', 'Solution options and direction', 'CPO', ['CTO', 'CSO'], 'CQRO', ['gate1', 'market', 'personas', 'competitors']],
  ['validation', 'SJ', 'SJ7', 'Concept validation report', 'CMO', ['CCO', 'CXO', 'CPO'], 'CQRO', ['solution']],
  ['sj8', 'SJ', 'SJ8', 'Go/Pivot/Stop decision', 'FOUNDER', ['CEO', 'CSO', 'CFO'], null, ['validation'], 'direction'],
  ['model', 'SP', 'SP5', 'Business model', 'CFO', ['CSO'], null, ['sj8', 'solution', 'market', 'personas']],
  ['estimate', 'SP', 'SP5', 'Cost estimate', 'CFO', ['PM'], 'CTO', ['model', 'competitors']],
  ['gate2', 'SP', 'SP5', 'Gate 2 decision', 'FOUNDER', ['CEO', 'CFO', 'CSO'], null, ['model', 'estimate'], 'gate'],
  ['mvp', 'SP', 'SP6', 'MVP scope', 'CPO', ['CTO', 'CXO'], null, ['gate2', 'estimate', 'personas']],
  ['reqs', 'SP', 'SP7', 'Requirements register', 'CPO', ['BA', 'CTO', 'CISO'], 'CQRO', ['mvp']],
  ['brd', 'SP', 'SP8', 'BRD', 'CSO', ['BA', 'PM', 'CFO'], 'CQRO', ['gate2', 'model', 'estimate', 'problem']],
  ['prd', 'SP', 'SP8', 'PRD', 'CPO', ['BA', 'PM', 'TPM', 'CXO'], 'CQRO', ['mvp', 'reqs']],
  ['srs', 'SP', 'SP8', 'SRS', 'CTO', ['BA', 'CISO'], 'CQRO', ['reqs', 'prd']],
  ['sad', 'SP', 'SP9', 'Solution blueprint', 'CTO', ['CISO'], 'CQRO', ['prd', 'srs']],
  ['wires', 'SP', 'SP10', 'Experience design', 'CXO', ['UX'], 'CQRO', ['sad', 'prd']],
  ['tech', 'SP', 'SP11', 'Technical design', 'CTO', ['TPM', 'CISO'], 'CQRO', ['sad', 'srs']],
  ['designreview', 'SP', 'SP12', 'Design review record', 'CQRO', ['CTO', 'CXO', 'CISO'], 'CPO', ['wires', 'sad', 'tech', 'srs'], 'review'],
  ['gate3', 'SP', 'SP12', 'Gate 3 decision', 'FOUNDER', ['CEO', 'CTO', 'CQRO'], null, ['designreview'], 'gate'],
  ['stories', 'SP', 'SP13', 'Backlog', 'CPO', ['BA', 'PM', 'CTO'], 'CQRO', ['gate3', 'prd', 'reqs']],
  ['roadmap', 'SP', 'SP14', 'Estimates and release plan', 'CTO', ['TPM', 'COO'], 'CFO', ['stories', 'designreview']],
  ['testplan', 'SP', 'SP15', 'Quality, release and operations plan', 'CTO', ['QA', 'COO', 'CISO'], 'CQRO', ['srs', 'stories']],
  ['handoff', 'SP', 'SP16', 'Handoff package', 'CTO', ['CPO', 'TPM'], 'CQRO',
    ['goal', 'clarify', 'brief', 'research', 'interviews', 'problem', 'market', 'personas', 'competitors', 'gate1', 'solution', 'sj8', 'model', 'estimate', 'gate2', 'mvp', 'reqs', 'brd', 'prd', 'srs', 'sad', 'wires', 'tech', 'designreview', 'gate3', 'stories', 'roadmap', 'testplan'], 'package'],
  ['company', 'SJ', 'SJ12', 'Company registration', 'COO', ['CFO'], null, ['sj8']],
  ['legal', 'SJ', 'SJ12', 'Legal and compliance agreements', 'COO', ['CISO'], null, ['company']],
  ['preseed', 'SJ', 'SJ12', 'Pre-seed decision', 'CFO', ['CEO'], null, ['gate2', 'brd', 'prd']],
  ['presell', 'SJ', 'SJ12', 'Pre-sell offer', 'CRO', ['CMO'], null, ['gate2', 'brd', 'prd']],
  ['budget', 'SJ', 'SJ12', 'Budget approval', 'CFO', ['CEO'], null, ['gate2', 'brd', 'prd']],
  ['hiring', 'SJ', 'SJ13', 'Hiring plan', 'CHRO', ['COO', 'CTO'], 'CFO', ['sj8', { informedBy: 'roadmap' }]],
  ['team', 'SJ', 'SJ13', 'Project and team setup', 'COO', ['TPM', 'PM'], 'CTO', ['stories', 'roadmap', 'hiring']],
  ['sbaccept', 'SJ', 'SJ14', 'Handoff acceptance record', 'SOLUTION_BUILDER', ['CTO'], null, ['handoff'], 'external'],
  ['sprints', 'SJ', 'SJ14', 'MVP build tracking', 'CTO', ['CPO', 'TPM', 'QA'], null, ['sbaccept', 'team', 'sj8']],
  ['qa', 'SJ', 'SJ15', 'Test execution report', 'CTO', ['QA', 'COO', 'CPO'], 'CQRO', ['sprints', 'testplan']],
  ['beta', 'SJ', 'SJ16', 'Beta results', 'CPO', ['CMO', 'CCO', 'CXO'], null, ['qa', 'company']],
  ['pmf', 'SJ', 'SJ16', 'PMF survey', 'CPO', [], 'CQRO', ['beta']],
  ['pricetest', 'SJ', 'SJ16', 'Pricing test', 'CFO', [], null, ['beta']],
  ['sj16gate', 'SJ', 'SJ16', 'Ready-for-launch decision', 'FOUNDER', ['CEO', 'CPO', 'CQRO'], null, ['beta', 'pmf', 'pricetest'], 'gate'],
  ['gtm', 'SJ', 'SJ17', 'GTM plan', 'CMO', ['CDO'], 'CRO', ['pmf', 'sj16gate']],
  ['support', 'SJ', 'SJ17', 'Launch readiness and support plan', 'CCO', ['COO'], 'CMO', ['gtm', 'testplan']],
  ['golive', 'SJ', 'SJ17', 'Go-live decision', 'FOUNDER', ['CEO'], null, ['gtm', 'support'], 'gate'],
  ['launch', 'SJ', 'SJ17', 'Launch execution record', 'CCO', ['CMO', 'CXO', 'CRO'], null, ['golive']],
  ['metrics', 'SJ', 'SJ18', 'Metrics review', 'CFO', ['CDO'], 'CRO', ['launch']],
  ['scale', 'SJ', 'SJ18', 'Scale plan', 'CFO', ['CEO'], null, ['metrics']],
  ['learneval', 'SJ', 'SJ18', 'Learning evaluation record', 'CEO', ['CTO', 'CDO'], 'CQRO', ['brief', 'qa', 'golive', { conditional: 'beta', when: 'objBeta' }, { conditional: 'launch', when: 'objLaunch' }]],
];

export const DECISION_KINDS: readonly TaskKind[] = ['gate', 'direction'];
const KIND: Record<string, TaskKind> = Object.fromEntries(RAW.map(r => [r[0], r[8] ?? 'task']));
const WF: Record<string, Workflow> = Object.fromEntries(RAW.map(r => [r[0], r[1]]));

function link(from: string, raw: RawLink): Link {
  if (typeof raw === 'string') {
    const type: LinkType = DECISION_KINDS.includes(KIND[raw]) ? 'decision' : 'requires';
    return { from, to: raw, type, cross: WF[from] !== WF[raw] };
  }
  if ('informedBy' in raw) return { from, to: raw.informedBy, type: 'informed-by', cross: WF[from] !== WF[raw.informedBy] };
  return { from, to: raw.conditional, type: 'conditional', when: raw.when, cross: WF[from] !== WF[raw.conditional] };
}

export const TASKS: readonly TaskDef[] = RAW.map(([id, workflow, home, artifact, owner, contributors, reviewer, links, kind]) => ({
  id, workflow, home, artifact, owner, contributors, reviewer, kind: kind ?? 'task', links: links.map(l => link(id, l)),
}));
export const TASK: Readonly<Record<string, TaskDef>> = Object.fromEntries(TASKS.map(t => [t.id, t]));
export const LINKS: readonly Link[] = TASKS.flatMap(t => t.links);

export const isDecision = (id: string) => DECISION_KINDS.includes(TASK[id].kind);

/** Inputs a task must have before it can start: requires and decision links, plus conditional links whose fact is 'yes'. */
export function requiredInputs(id: string, ctx?: Context): string[] {
  return TASK[id].links
    .filter(l => l.type === 'requires' || l.type === 'decision' || (l.type === 'conditional' && ctx?.[l.when!]?.value === 'yes'))
    .map(l => l.to);
}

/** Tasks that require (or take a decision on) the given task. */
export const consumers = (id: string): string[] =>
  TASKS.filter(t => t.links.some(l => l.to === id && (l.type === 'requires' || l.type === 'decision'))).map(t => t.id);

/** Tasks that are only informed by the given task (informed-by or a conditional link). */
export const informedConsumers = (id: string): string[] =>
  TASKS.filter(t => t.links.some(l => l.to === id && (l.type === 'informed-by' || l.type === 'conditional'))).map(t => t.id);

export const tasksOf = (workflow: Workflow) => TASKS.filter(t => t.workflow === workflow);
