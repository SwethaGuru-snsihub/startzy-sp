// Evidence register: freshness, declared (not inspected) evidence, withdrawal and expiry.
// Expired and withdrawn evidence stays in the register; it just stops counting as current.

export type EvidenceType = 'research' | 'interviews' | 'market' | 'competitor' | 'prototype' | 'feedback' | 'sales';
export type Declared = { source: string; date: string; description: string; ackNotInspected: boolean; ackLimitation: boolean };
export type EvidenceItem = {
  id: string; type: EvidenceType; date?: string; version?: number; inspected: boolean;
  origin?: string;                                  // where it came from, e.g. 'beta', 'launch', 'qa'
  declared?: Declared;
  withdrawn?: { who: string; when: string; why: string };
};
export type Criterion = { name: string; inspection: boolean };

// months, or 'current' (only the current prototype version counts); configurable per domain and project
export const FRESHNESS_DEFAULTS: Readonly<Record<EvidenceType, number | 'current'>> = {
  research: 24, interviews: 12, market: 24, competitor: 12, prototype: 'current', feedback: 12, sales: 12,
};
export const DOMAIN_FRESHNESS: Readonly<Record<string, Partial<Record<EvidenceType, number>>>> = { healthcare: { research: 12 } };

export function freshnessMonths(type: EvidenceType, opts: { domain?: string; project?: Partial<Record<EvidenceType, number>> } = {}) {
  return opts.project?.[type] ?? (opts.domain ? DOMAIN_FRESHNESS[opts.domain]?.[type] : undefined) ?? FRESHNESS_DEFAULTS[type];
}

const months = (from: string, to: string) => (Date.parse(to) - Date.parse(from)) / (30.44 * 864e5);
export type QualifyOptions = { now: string; domain?: string; project?: Partial<Record<EvidenceType, number>>; currentPrototype?: number };

/** Whether an item counts as current evidence for a criterion. */
export function qualifies(e: EvidenceItem, criterion: Criterion, opts: QualifyOptions): boolean {
  if (e.withdrawn) return false;
  const f = freshnessMonths(e.type, opts);
  if (f === 'current' ? e.version !== opts.currentPrototype : !e.date || months(e.date, opts.now) > f) return false;
  if (e.inspected) return true;
  const d = e.declared;
  if (!d || criterion.inspection) return false;
  return !!(d.source && d.date && d.description && d.ackNotInspected && d.ackLimitation);
}

/** Withdrawal keeps the item, recording who, when and why. */
export const withdrawEvidence = (e: EvidenceItem, w: { who: string; when: string; why: string }): EvidenceItem => ({ ...e, withdrawn: { ...w } });

/** Artifacts and decisions that pinned an evidence item: they go through impact analysis when it is withdrawn. */
export const pinnedBy = (evidenceId: string, pins: Record<string, readonly string[]>) => Object.keys(pins).filter(a => pins[a].includes(evidenceId));

/** Expiry after approval is a notice only: approvals and versions stay; the next use re-checks. */
export function expiryNotices(artifacts: Record<string, { pins: readonly string[] }>, evidence: Record<string, EvidenceItem>, criterion: Criterion, opts: QualifyOptions) {
  return Object.keys(artifacts).filter(a => artifacts[a].pins.some(id => evidence[id] && !qualifies(evidence[id], criterion, opts)));
}
