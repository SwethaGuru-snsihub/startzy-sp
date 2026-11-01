import { describe, expect, it } from 'vitest';
import type { EvidenceItem } from '../evidence';
import { learningBlockers, type LearningObjective } from '../learning';
import { requiredInputs } from '../register';
import { evaluate } from '../applicability';
import { ACK_ALL, CONTEXTS } from './fixtures';

const EVID: Record<string, EvidenceItem> = {
  ev1: { id: 'ev1', type: 'prototype', version: 3, inspected: true },
  ev2: { id: 'ev2', type: 'feedback', date: '2026-10-01', inspected: true, origin: 'beta' },
  ev3: { id: 'ev3', type: 'feedback', date: '2026-10-15', inspected: true, origin: 'launch' },
  ev4: { id: 'ev4', type: 'feedback', date: '2025-01-01', inspected: true, origin: 'beta' },
};
const opts = { now: '2026-11-01T00:00:00.000Z', currentPrototype: 3 };
const good: LearningObjective = { id: 'O1', statement: 'Learn to ship a working booking flow', outcome: 'end-to-end booking passes QA on the current prototype', evidence: ['ev1'], result: { observed: 'passed 12/12 scenarios', verdict: 'achieved' }, conclusion: 'Achieved: shipped and tested' };
const betaObj: LearningObjective = { id: 'O2', statement: 'Learn how users react to onboarding', outcome: '>= 5 testers complete onboarding unaided', dependsOn: ['beta'], evidence: ['ev2'], result: { observed: '6 of 8 completed', verdict: 'achieved' }, conclusion: 'Achieved' };
const D = { qa: true, golive: true, beta: true, launch: false };
const blockers = (objectives: LearningObjective[], ctx = CONTEXTS.learnSolo) => learningBlockers({ objectives }, ctx, D, EVID, opts);

describe('learning evaluation completion criteria', () => {
  it('QA and go-live complete is not enough: an objective without evidence blocks approval', () => {
    expect(blockers([{ ...good, evidence: [] }]).length).toBeGreaterThan(0);
  });
  it('an objective without a measurable or observable outcome blocks approval', () => {
    expect(blockers([{ ...good, outcome: '' }]).some(w => /outcome/.test(w))).toBe(true);
  });
  it('a missing evaluation result or conclusion blocks approval', () => {
    expect(blockers([{ ...good, result: { verdict: 'achieved' } }]).some(w => /result/.test(w))).toBe(true);
    expect(blockers([{ ...good, conclusion: '' }]).some(w => /conclusion/.test(w))).toBe(true);
  });
  it('an objective that depends on beta needs beta evidence', () => {
    expect(blockers([{ ...betaObj, evidence: ['ev1'] }]).some(w => /needs beta/.test(w))).toBe(true);
  });
  it('expired beta feedback (older than 12 months) does not count', () => {
    expect(blockers([{ ...betaObj, evidence: ['ev4'] }]).length).toBeGreaterThan(0);
  });
  it('learning B: an objective depending on launch makes launch a requirement (conditional link active)', () => {
    expect(blockers([good, betaObj], CONTEXTS.learnPublic).some(w => /launch must be approved/.test(w))).toBe(true);
  });
  it('learning A: every objective complete, so the record is approvable', () => {
    expect(blockers([good, betaObj])).toEqual([]);
  });
  it('no objectives at all blocks approval', () => {
    expect(blockers([])).toContain('no objectives');
  });
  it('conditional links: launch and beta become required inputs only when an objective depends on them', () => {
    expect(requiredInputs('learneval', CONTEXTS.learnPublic)).toContain('launch');
    expect(requiredInputs('learneval', CONTEXTS.learnSolo)).not.toContain('launch');
    expect(evaluate(CONTEXTS.learnPublic, ACK_ALL).launch.status).toBe('required');
    expect(evaluate(CONTEXTS.learnSolo, ACK_ALL).launch.status).toBe('optional');
  });
});
