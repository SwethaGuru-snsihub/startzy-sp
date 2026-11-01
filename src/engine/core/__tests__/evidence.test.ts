import { describe, expect, it } from 'vitest';
import { expiryNotices, freshnessMonths, pinnedBy, qualifies, withdrawEvidence, type EvidenceItem } from '../evidence';

const NOW = '2026-11-01T00:00:00.000Z';
const COUNT = { name: 'interview count', inspection: false }, INSPECT = { name: 'privacy review', inspection: true };
const E: EvidenceItem[] = [
  { id: 'e1', type: 'interviews', date: '2026-03-01', inspected: true },
  { id: 'e2', type: 'interviews', date: '2025-06-01', inspected: true },
  { id: 'e3', type: 'market', date: '2026-01-01', inspected: false, declared: { source: 'Industry report', date: '2026-01-01', description: 'Segment size', ackNotInspected: true, ackLimitation: true } },
  { id: 'e4', type: 'market', date: '2026-01-01', inspected: false, declared: { source: 'Analyst', date: '2026-01-01', description: 'x', ackNotInspected: true, ackLimitation: false } },
  { id: 'e5', type: 'prototype', version: 3, inspected: true },
];
const opts = { now: NOW, domain: 'retail', currentPrototype: 3 };

describe('evidence intake, freshness, declared evidence, withdrawal', () => {
  it('freshness precedence: project, then domain, then type default', () => {
    expect(freshnessMonths('research', { domain: 'healthcare' })).toBe(12);
    expect(freshnessMonths('research', { domain: 'retail' })).toBe(24);
    expect(freshnessMonths('research', { domain: 'healthcare', project: { research: 6 } })).toBe(6);
  });
  it('interview evidence older than 12 months does not qualify as current', () => {
    expect([qualifies(E[0], COUNT, opts), qualifies(E[1], COUNT, opts)]).toEqual([true, false]);
  });
  it('expired evidence stays in the register', () => { expect(E).toHaveLength(5); });
  it('declared evidence with both acknowledgements counts only where inspection is not required', () => {
    expect([qualifies(E[2], COUNT, opts), qualifies(E[2], INSPECT, opts)]).toEqual([true, false]);
  });
  it('declared evidence without the limitation acknowledgement does not count', () => {
    expect(qualifies(E[3], COUNT, opts)).toBe(false);
  });
  it('prototype evidence qualifies only for the current prototype version', () => {
    expect([qualifies(E[4], COUNT, opts), qualifies(E[4], COUNT, { ...opts, currentPrototype: 4 })]).toEqual([true, false]);
  });
  it('withdrawal keeps the item with who, when and why', () => {
    const w = withdrawEvidence(E[0], { who: 'FOUNDER', when: NOW, why: 'Participants did not consent to reuse' });
    expect(w.withdrawn).toEqual({ who: 'FOUNDER', when: NOW, why: 'Participants did not consent to reuse' });
    expect(w.id).toBe('e1');
    expect(E[0].withdrawn).toBeUndefined();
  });
  it('withdrawal triggers impact analysis on the artifacts and decisions that pinned it', () => {
    const pins = { problem: ['e1'], gate1: ['e1', 'e3'], market: ['e3'] };
    const w = withdrawEvidence(E[0], { who: 'FOUNDER', when: NOW, why: 'x' });
    expect(pinnedBy('e1', pins)).toEqual(['problem', 'gate1']);
    expect(qualifies(w, COUNT, opts)).toBe(false);
  });
  it('expiry after approval: a notice on the problem statement; approval and version unchanged, nothing reopened', () => {
    const e9: EvidenceItem = { id: 'e9', type: 'interviews', date: '2025-08-01', inspected: true };
    const art = { problem: { v: 2, approved: true, pins: ['e9'] } };
    expect(expiryNotices(art, { e9 }, COUNT, opts)).toEqual(['problem']);
    expect(art.problem).toEqual({ v: 2, approved: true, pins: ['e9'] });
  });
  it('when a gate, decision or package uses it, expired evidence fails the re-check', () => {
    const e9: EvidenceItem = { id: 'e9', type: 'interviews', date: '2025-08-01', inspected: true };
    expect(qualifies(e9, COUNT, opts)).toBe(false);
  });
});
