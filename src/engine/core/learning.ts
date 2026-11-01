// Learning evaluation (SJ18, learning projects only). Each objective needs a measurable or
// observable outcome, current supporting evidence, an evaluation result and a conclusion; an
// objective that depends on beta or launch needs evidence from it, and that task approved.
import type { Context } from './context';
import { qualifies, type EvidenceItem, type QualifyOptions } from './evidence';

export type LearningObjective = {
  id: string; statement: string; outcome: string; evidence: string[]; dependsOn?: ('beta' | 'launch')[];
  result?: { observed?: string; verdict: 'achieved' | 'partly achieved' | 'not achieved' };
  conclusion: string;
};
export type LearningRecord = { objectives: LearningObjective[] };

const ANY = { name: 'learning objective evidence', inspection: false };

/** Everything that still blocks approval; empty when the record is approvable. */
export function learningBlockers(rec: LearningRecord, ctx: Context, done: { qa: boolean; golive: boolean; beta: boolean; launch: boolean }, evidence: Record<string, EvidenceItem>, opts: QualifyOptions): string[] {
  const why: string[] = [];
  if (!done.qa || !done.golive) why.push('QA and go-live first');
  if (!rec.objectives.length) why.push('no objectives');
  for (const o of rec.objectives) {
    if (!o.outcome) why.push(`${o.id}: no measurable or observable outcome`);
    const ev = o.evidence.map(e => evidence[e]).filter(e => e && qualifies(e, ANY, opts));
    if (!ev.length) why.push(`${o.id}: no current supporting evidence`);
    for (const d of o.dependsOn ?? []) if (!ev.some(e => e.origin === d)) why.push(`${o.id}: needs ${d} evidence`);
    if (!o.result || !['achieved', 'partly achieved', 'not achieved'].includes(o.result.verdict) || o.result.observed == null) why.push(`${o.id}: no evaluation result`);
    if (!o.conclusion) why.push(`${o.id}: no conclusion`);
  }
  const conditional = [...(ctx.objBeta?.value === 'yes' ? ['beta' as const] : []), ...(ctx.objLaunch?.value === 'yes' ? ['launch' as const] : [])];
  for (const d of conditional) if (!done[d]) why.push(`${d} must be approved (conditional requires)`);
  return why;
}
