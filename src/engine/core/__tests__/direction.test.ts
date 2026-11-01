import { describe, expect, it } from 'vitest';
import { DIRECTION_FLOW, currentGo, emptyDirectionLog, recordDirection } from '../direction';
import { pivotImpact } from '../impact';
import { TASKS, isDecision } from '../register';
import type { ExecState } from '../types';

describe('direction decisions', () => {
  const reach = new Set(['open']);
  for (let grew = true; grew;) { grew = false; for (const s of [...reach]) for (const n of DIRECTION_FLOW[s] ?? []) if (!reach.has(n)) { reach.add(n); grew = true; } }

  it('every direction state is reachable from SJ8', () => { expect(Object.keys(DIRECTION_FLOW).every(s => reach.has(s))).toBe(true); });
  it('no dead-end direction state', () => { expect(Object.values(DIRECTION_FLOW).every(n => n.length > 0)).toBe(true); });
  it('Stop is available at every decision point', () => {
    expect(['open', 'go', 'pivot', 'direction-review'].every(s => DIRECTION_FLOW[s].includes('stop'))).toBe(true);
  });

  it('Go, Pivot, Withdraw, Stop and Resume each append an immutable version; history is never edited', () => {
    const at = '2026-11-01T00:00:00.000Z', by = 'FOUNDER' as const;
    let log = emptyDirectionLog();
    log = recordDirection(log, { kind: 'go', at, by });
    log = recordDirection(log, { kind: 'pivot', target: 'SP3', at, by });
    log = recordDirection(log, { kind: 'pivot-withdrawn', restores: 1, at, by });
    log = recordDirection(log, { kind: 'pivot', target: 'SP4', at, by });
    log = recordDirection(log, { kind: 'go', revises: 4, at, by });
    log = recordDirection(log, { kind: 'stop', at, by });
    log = recordDirection(log, { kind: 'go', resume: true, at, by });
    expect(log.versions).toHaveLength(7);
    expect(() => { (log.versions[0] as { kind: string }).kind = 'stop'; }).toThrow();
    expect(log.versions[0].kind).toBe('go');
    expect(currentGo(log)).toBe(7);
  });
  it('a withdrawn pivot makes the previous Go current again; Stop leaves no current Go', () => {
    const at = '2026-11-01T00:00:00.000Z', by = 'FOUNDER' as const;
    let log = recordDirection(emptyDirectionLog(), { kind: 'go', at, by });
    log = recordDirection(log, { kind: 'pivot', target: 'SP2', at, by });
    expect(currentGo(log)).toBe(1);
    log = recordDirection(log, { kind: 'pivot-withdrawn', restores: 1, at, by });
    expect(currentGo(log)).toBe(1);
    expect(currentGo(recordDirection(log, { kind: 'stop', at, by }))).toBeNull();
  });
  it('rejects a transition the decision flow does not allow', () => {
    const at = '2026-11-01T00:00:00.000Z', by = 'FOUNDER' as const;
    const stopped = recordDirection(recordDirection(emptyDirectionLog(), { kind: 'go', at, by }), { kind: 'stop', at, by });
    expect(() => recordDirection(stopped, { kind: 'go', at, by })).toThrow(/resume/);
    expect(() => recordDirection(emptyDirectionLog(), { kind: 'pivot-withdrawn', restores: 1, at, by })).toThrow();
  });
});

describe('pivot impact at a post-Go point (during SJ13)', () => {
  // every SP task except the handoff, and SJ tasks up to SJ12, are approved; team, hiring and handoff are in progress
  const status: Record<string, ExecState> = Object.fromEntries(TASKS.map(t => {
    if (['team', 'hiring', 'handoff'].includes(t.id)) return [t.id, 'in-progress'];
    if (t.workflow === 'SP' || Number(t.home.slice(2)) <= 12) return [t.id, 'approved'];
    return [t.id, 'not-started'];
  }));
  for (const target of ['SP1', 'SP2', 'SP3', 'SP4'] as const) {
    const r = pivotImpact(target, status);
    it(`${target} pivot leaves onboarding, company and legal untouched`, () => {
      expect([...r.reopen, ...r.revalidate, ...r.atRisk, ...r.paused].filter(i => ['profile', 'company', 'legal'].includes(i))).toEqual([]);
    });
    it(`${target} pivot only notifies hiring (informed-by link)`, () => {
      expect(r.paused).not.toContain('hiring');
      expect(r.notice).toContain('hiring');
    });
    it(`${target} pivot pauses in-progress team setup and handoff`, () => {
      expect(r.paused).toEqual(expect.arrayContaining(['team', 'handoff']));
    });
    it(`${target} pivot asks for gate re-confirmation only, and never reopens decisions directly`, () => {
      expect(r.reconfirm.every(isDecision)).toBe(true);
      expect(r.reopen.some(isDecision)).toBe(false);
    });
  }
  it('pivots never touch anything upstream of their target', () => {
    expect(pivotImpact('SP4', status).unaffected).toContain('gate1');
    expect(pivotImpact('SP2', status).unaffected).toContain('brief');
  });
});
