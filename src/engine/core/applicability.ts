// Applicability: whether each task is required, optional, not applicable (N/A) or awaiting
// clarification, decided from founder context. Every task always gets a status; nothing is removed
// or hidden. AI-inferred facts can never make a task N/A, and an important N/A needs the founder's
// acknowledgement.
import type { Context, FactKey } from './context';
import { TASKS, isDecision, requiredInputs } from './register';

export type ApplicabilityStatus = 'required' | 'optional' | 'na' | 'awaiting';
export type LegalItem = { item: string; why: string; jurisdiction: string | undefined };
export type Applicability = { status: ApplicabilityStatus; uses?: FactKey[]; why?: string; items?: LegalItem[]; conditional?: string[] };
export type ApplicabilityMap = Record<string, Applicability>;
type Decided = Exclude<ApplicabilityStatus, 'awaiting'>;
type Rule = (c: Context) => { status: Decided; uses: FactKey[]; items?: LegalItem[]; conditional?: string[]; conflict?: string };

const v = (c: Context, f: FactKey) => c[f]?.value;
const learning = (c: Context) => v(c, 'goal') === 'learning';

/** One legal rule for every goal. Each item records its rationale and jurisdiction. */
export function legalRule(c: Context): { status: Decided; uses: FactKey[]; items: LegalItem[]; conditional: string[]; conflict?: string } {
  const indep = v(c, 'org') !== 'company';
  const uses: FactKey[] = ['org', 'personalData', 'healthData', 'regulatedActivity', 'audience', ...(indep ? ['registration', 'founders', 'collaborators', 'ipOwner'] as FactKey[] : [])];
  const health = v(c, 'healthData');
  if ((health === 'contact' || health === 'sensitive') && v(c, 'personalData') === 'no') {
    return { status: 'required', uses, items: [], conditional: [], conflict: 'healthData/personalData' };
  }
  const items: LegalItem[] = [], conditional: string[] = [];
  const add = (item: string, why: string) => items.push({ item, why, jurisdiction: v(c, 'jurisdiction') });
  if (!indep) add('internal compliance, security and data approval', 'organisation type = inside a company');
  if (indep && v(c, 'founders') === '2+') add('co-founder agreement: roles, ownership split, vesting, exit', 'founders = 2+ (registration not required)');
  if (indep && v(c, 'collaborators') === 'contributors') add('IP assignment or licence from contributors', 'people other than the founders create IP');
  if (indep && v(c, 'registration') === 'company' && v(c, 'ipOwner') === 'founders') add('assign founder-held IP to the company', 'separate legal entity + IP held by founders');
  if (indep && v(c, 'ipOwner') === 'employer') add('review employer IP and outside-work terms', 'an employer may claim the IP');
  if (v(c, 'raise') === 'committed') add('investment and shareholder agreements', 'decision to raise confirmed');
  else if (v(c, 'funding') === 'investor') conditional.push('investment and shareholder agreements: only if the founder decides to raise');
  if (v(c, 'personalData') === 'yes') add('privacy notice, consent and data handling', 'personal data handled');
  if (health === 'sensitive') add('sensitive health data protections', 'sensitive health information handled');
  if (v(c, 'regulatedActivity') === 'yes') add('sector compliance for the confirmed regulated activity', 'regulated activity confirmed');
  if (v(c, 'audience') === 'public') add('terms of use for public users', 'public users');
  return { status: items.length ? 'required' : 'na', uses: items.length ? [...uses, 'jurisdiction'] : uses, items, conditional };
}

// An industry that looks like healthcare is only a flag: it asks for the health facts and the
// regulated-activity answer, and never decides anything itself.
const unsure = (c: Context, f: FactKey) => !c[f] || c[f]!.source === 'ai';
export const healthFlag = (c: Context) =>
  /health|medical|clinic|pharma|dental/i.test(v(c, 'industry') ?? '') && (unsure(c, 'healthData') || unsure(c, 'regulatedActivity'));

const R = 'required', O = 'optional', NA = 'na';
const commercialLater = (c: Context): Decided => (!learning(c) ? R : v(c, 'commercial') === 'later' ? O : NA);
const RULES: Record<string, Rule> = {
  interviews: c => ({ status: learning(c) ? O : R, uses: ['goal'] }),
  market: c => ({ status: learning(c) ? O : R, uses: ['goal'] }),
  competitors: c => ({ status: learning(c) ? O : R, uses: ['goal'] }),
  validation: c => ({ status: learning(c) ? O : R, uses: ['goal'] }),
  model: c => ({ status: commercialLater(c), uses: ['goal', 'commercial'] }),
  brd: c => ({ status: commercialLater(c), uses: ['goal', 'commercial'] }),
  wires: c => ({ status: v(c, 'ui') === 'yes' ? R : NA, uses: ['ui'] }),
  preseed: c => ({ status: v(c, 'funding') === 'investor' ? O : NA, uses: ['funding'] }),
  presell: c => ({ status: v(c, 'funding') === 'revenue' ? O : NA, uses: ['funding'] }),
  budget: c => ({ status: v(c, 'org') === 'company' ? R : NA, uses: ['org'] }),
  // a learning project needs company setup only when the founder registers it (sole proprietor or company)
  company: c => ({ status: !learning(c) ? R : ['sole', 'company'].includes(v(c, 'registration') ?? '') ? R : NA, uses: learning(c) ? ['goal', 'registration'] : ['goal'] }),
  legal: legalRule,
  hiring: c => ({ status: !learning(c) ? R : v(c, 'hires') === 'yes' ? O : NA, uses: learning(c) ? ['goal', 'hires'] : ['goal'] }),
  beta: c => ({ status: !learning(c) ? R : v(c, 'objBeta') === 'yes' ? R : O, uses: learning(c) ? ['goal', 'objBeta'] : ['goal'] }),
  pmf: c => ({ status: commercialLater(c), uses: ['goal', 'commercial'] }),
  pricetest: c => ({ status: commercialLater(c), uses: ['goal', 'commercial'] }),
  gtm: c => ({ status: commercialLater(c), uses: ['goal', 'commercial'] }),
  support: c => ({ status: !learning(c) ? R : v(c, 'audience') === 'public' ? R : NA, uses: learning(c) ? ['goal', 'audience'] : ['goal'] }),
  launch: c => ({ status: !learning(c) ? R : v(c, 'objLaunch') === 'yes' ? R : O, uses: learning(c) ? ['goal', 'objLaunch'] : ['goal'] }),
  metrics: c => ({ status: commercialLater(c), uses: ['goal', 'commercial'] }),
  scale: c => ({ status: learning(c) ? NA : R, uses: ['goal'] }),
  learneval: c => ({ status: learning(c) ? R : NA, uses: ['goal'] }),
};
const always: Rule = () => ({ status: R, uses: [] });

/** The facts each task's rule reads, for a given context (some rules read more facts on some paths). */
export const factsUsedBy = (id: string, c: Context): FactKey[] => (RULES[id] ?? always)(c).uses;

// Important: decisions, the package, legal and compliance, company, funding and spend, and every input
// a decision or the package requires. Their N/A needs the founder's acknowledgement.
export const IMPORTANT_TASKS: ReadonlySet<string> = (() => {
  const s = new Set(['company', 'legal', 'preseed', 'presell', 'budget', 'hiring', 'testplan', 'qa', 'sbaccept']);
  TASKS.filter(t => isDecision(t.id) || t.kind === 'package').forEach(t => { s.add(t.id); requiredInputs(t.id).forEach(r => s.add(r)); });
  return s;
})();

export function evaluate(c: Context, acknowledged: readonly string[] = []): ApplicabilityMap {
  const res: ApplicabilityMap = {};
  for (const t of TASKS) {
    const r = (RULES[t.id] ?? always)(c);
    if (r.conflict) { res[t.id] = { status: 'awaiting', why: 'conflicting facts ' + r.conflict }; continue; }
    if (t.id === 'legal' && healthFlag(c)) {
      res[t.id] = { status: 'awaiting', why: 'potential health regulation: confirm the health information handled and whether a regulated healthcare activity is carried out' };
      continue;
    }
    const missing = r.uses.filter(f => !c[f]);
    if (missing.length) { res[t.id] = { status: 'awaiting', why: 'missing ' + missing.join(',') }; continue; }
    const ai = r.uses.filter(f => c[f]!.source === 'ai');
    if (r.status === NA && ai.length) { res[t.id] = { status: 'awaiting', why: 'confirm AI-inferred ' + ai.join(',') }; continue; }
    if (r.status === NA && IMPORTANT_TASKS.has(t.id) && !acknowledged.includes(t.id) && !r.uses.every(f => c[f]!.source === 'preset')) {
      res[t.id] = { status: 'awaiting', why: 'founder acknowledgement of N/A' };
      continue;
    }
    res[t.id] = { status: r.status, uses: r.uses, ...(r.items ? { items: r.items } : {}), ...(r.conditional ? { conditional: r.conditional } : {}) };
  }
  return res;
}
