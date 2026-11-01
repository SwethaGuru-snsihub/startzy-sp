// Dynamic participation: contributors that join an artifact because of confirmed context.
// Owners and reviewers stay fixed; a rule may never add an artifact's owner or reviewer as a
// contributor. Unknown or AI-inferred facts keep (never remove) compliance participation.
import type { ApplicabilityMap } from './applicability';
import type { Context, FactKey } from './context';
import type { CoreAgentId } from './definitions';
import { TASK, TASKS } from './register';

const yesOrUnsure = (c: Context, f: FactKey, yes: string[]) => !c[f] || c[f]!.source === 'ai' || yes.includes(c[f]!.value);

const RULES: { when: (c: Context) => boolean; agent: CoreAgentId; to: string[] }[] = [
  {
    when: c => yesOrUnsure(c, 'personalData', ['yes']) || yesOrUnsure(c, 'healthData', ['contact', 'sensitive']) || yesOrUnsure(c, 'regulatedActivity', ['yes']),
    agent: 'CISO', to: ['reqs', 'srs', 'sad', 'tech', 'designreview', 'testplan', 'legal', 'wires'],
  },
  { when: c => c.funding?.value === 'investor', agent: 'CFO', to: ['brd', 'gtm', 'preseed'] },
  { when: c => c.funding?.value === 'revenue', agent: 'CRO', to: ['model', 'pricetest', 'presell'] },
  { when: c => c.org?.value === 'company', agent: 'CEO', to: ['budget'] },
  { when: c => c.audience?.value === 'public', agent: 'CCO', to: ['support', 'launch'] },
  { when: c => c.hires?.value === 'yes', agent: 'CHRO', to: ['hiring'] },
];

export const canContribute = (agent: CoreAgentId, id: string) => TASK[id].reviewer !== agent && TASK[id].owner !== agent;

/** Contributors added by context. Throws if a rule would add an artifact's owner or reviewer. */
export function participation(c: Context): { agent: CoreAgentId; task: string }[] {
  const added: { agent: CoreAgentId; task: string }[] = [];
  for (const r of RULES) {
    if (!r.when(c)) continue;
    for (const id of r.to) {
      if (TASK[id].owner === r.agent) continue;
      if (!canContribute(r.agent, id)) throw new Error(`${r.agent} cannot contribute to ${id}`);
      added.push({ agent: r.agent, task: id });
    }
  }
  return added;
}

export const OPTIONAL_AGENTS: readonly CoreAgentId[] = ['CMO', 'COO', 'CRO'];

/** Optional agents join per artifact: only for artifacts that apply (required, or optional and taken up). */
export function activeOptionalAgents(c: Context, app: ApplicabilityMap, takenUp: readonly string[] = []): Partial<Record<CoreAgentId, string[]>> {
  const live = (id: string) => app[id].status === 'required' || (app[id].status === 'optional' && takenUp.includes(id));
  const roles: Partial<Record<CoreAgentId, string[]>> = {};
  const note = (a: CoreAgentId, id: string, role: string) => { (roles[a] ??= []).push(`${id}:${role}`); };
  for (const t of TASKS) {
    if (!live(t.id)) continue;
    if (OPTIONAL_AGENTS.includes(t.owner)) note(t.owner, t.id, 'owner');
    if (t.reviewer && OPTIONAL_AGENTS.includes(t.reviewer)) note(t.reviewer, t.id, 'reviewer');
    t.contributors.filter(a => OPTIONAL_AGENTS.includes(a)).forEach(a => note(a, t.id, 'contributor'));
  }
  participation(c).forEach(({ agent, task }) => { if (OPTIONAL_AGENTS.includes(agent) && live(task)) note(agent, task, 'rule'); });
  return roles;
}
