// Who approves what. Atlas (CEO) approves on the founder's behalf only within the delegation
// level the founder set, and never anything reserved for the founder.
//
// Ported from the legacy engine (approverFor and the Header levels) and Rev 9 (G5):
//   level 0  nothing is delegated: every approval goes to the founder
//   level 1  Atlas approves documents, and spend up to ₹10 lakh
//   level 2  Atlas approves documents, and spend up to ₹50 lakh
// Reserved for the founder at every level:
//   - the founder's own tasks
//   - gates and the SJ8 direction decision
//   - the SP16 handoff package (always founder-approved, Rev 4)
//   - tasks the founder signs: no independent reviewer, so no checker stands between the maker and
//     Atlas (the legacy hands-on founder tasks: profile, model, MVP scope, company, legal, pre-seed,
//     pre-sell, budget, build tracking, beta, pricing test, launch, scale)
//   - Atlas's own work: nobody approves their own artifact
// The founder may approve anything that waits for approval.
import { TASK, type TaskDef } from './register';

export type DelegationLevel = 0 | 1 | 2;
export const DELEGATION_LEVELS: readonly DelegationLevel[] = [0, 1, 2];
export const DEFAULT_DELEGATION: DelegationLevel = 1;            // the legacy engine's default
export const SPEND_LIMIT_LAKH: Readonly<Record<DelegationLevel, number | null>> = { 0: null, 1: 10, 2: 50 };
/** Approvals that commit money; each states its amount (₹ lakh) when submitted. */
export const SPEND_TASKS: readonly string[] = ['estimate', 'hiring'];

export type Route = { approver: 'FOUNDER' | 'CEO'; reason: string };

/** Why the founder alone approves this task, or null when Atlas may approve it within its limit. */
export function founderReserved(t: TaskDef): string | null {
  if (t.kind === 'gate' || t.kind === 'direction') return 'gates and the direction decision are the founder\'s';
  if (t.kind === 'package') return 'the SP16 handoff is always founder-approved';
  if (t.kind === 'external') return 'recorded by Solution Builder, not approved';
  if (t.owner === 'FOUNDER') return 'the founder\'s own task';
  if (t.owner === 'CEO') return 'Atlas\'s own work: no self-approval';
  if (!t.reviewer) return 'the founder signs: no independent reviewer';
  return null;
}

export function routeApproval(id: string, level: DelegationLevel, spendLakh?: number): Route {
  const reserved = founderReserved(TASK[id]);
  if (reserved) return { approver: 'FOUNDER', reason: reserved };
  if (level === 0) return { approver: 'FOUNDER', reason: 'delegation level 0: nothing is delegated' };
  if (!SPEND_TASKS.includes(id)) return { approver: 'CEO', reason: `document, within delegation level ${level}` };
  const limit = SPEND_LIMIT_LAKH[level]!;
  if (spendLakh == null) return { approver: 'FOUNDER', reason: 'spend amount not stated' };
  return spendLakh <= limit
    ? { approver: 'CEO', reason: `₹${spendLakh} lakh, within the ₹${limit} lakh limit` }
    : { approver: 'FOUNDER', reason: `₹${spendLakh} lakh, over the ₹${limit} lakh limit` };
}
