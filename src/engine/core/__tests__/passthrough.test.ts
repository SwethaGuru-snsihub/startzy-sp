import { describe, expect, it } from 'vitest';
import { evaluate } from '../applicability';
import { effectiveClosure, effectiveInputs } from '../passthrough';
import { TASKS, requiredInputs } from '../register';
import { ACK_ALL, CONTEXTS, CONTEXT_NAMES } from './fixtures';

// learning project A, with every optional task declined
const solo: Record<string, string> = Object.fromEntries(Object.entries(evaluate(CONTEXTS.learnSolo, ACK_ALL)).map(([id, r]) => [id, r.status]));
['interviews', 'market', 'competitors', 'validation', 'beta', 'launch'].forEach(i => { solo[i] = 'declined'; });
const skipped = (A: Record<string, string>) => (id: string) => A[id] === 'na' || A[id] === 'declined';

describe('N/A and declined pass-through', () => {
  it('learning go-live still waits for the ready-for-launch gate and QA although GTM and support are N/A', () => {
    const c = effectiveClosure('golive', skipped(solo));
    expect(c.has('sj16gate') && c.has('qa')).toBe(true);
  });
  it('learning evaluation waits for go-live and the ready-for-launch gate', () => {
    const c = effectiveClosure('learneval', skipped(solo));
    expect(c.has('golive') && c.has('sj16gate')).toBe(true);
  });
  it('Gate 1 skips declined interviews but still needs the problem statement', () => {
    expect(effectiveClosure('gate1', skipped(solo)).has('problem')).toBe(true);
    expect(effectiveInputs('gate1', skipped(solo))).not.toContain('interviews');
  });
  it('without pass-through, learning go-live would have no inputs at all', () => {
    expect(requiredInputs('golive').filter(p => !skipped(solo)(p))).toEqual([]);
  });

  it('property test: N/A and declined tasks never let work start past an unsatisfied requirement', () => {
    let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    let trials = 0, viaSkip = 0, bypassPass = 0, bypassNaive = 0;
    for (const k of CONTEXT_NAMES) {
      const base = evaluate(CONTEXTS[k], ACK_ALL);
      for (let n = 0; n < 400; n++) {
        const A: Record<string, string> = {}; TASKS.forEach(t => { const s = base[t.id].status; A[t.id] = s === 'optional' && rnd() < 0.5 ? 'declined' : s; });
        const isSkipped = skipped(A);
        const approved = new Set(TASKS.filter(t => !isSkipped(t.id) && rnd() < 0.7).map(t => t.id));
        const sat = (id: string, naive: boolean): boolean => isSkipped(id) ? (naive || requiredInputs(id).every(p => sat(p, naive))) : approved.has(id);
        // what a consumer may start on, according to the pass-through rule under test
        const ready = (id: string) => effectiveInputs(id, isSkipped).every(p => approved.has(p));
        const hidden = (id: string): string[] => requiredInputs(id).flatMap(p => (isSkipped(p) ? hidden(p) : [p]));
        for (const t of TASKS) {
          if (isSkipped(t.id)) continue; trials++;
          const unsat = hidden(t.id).some(p => !approved.has(p));
          if (requiredInputs(t.id).some(isSkipped)) viaSkip++;
          if (unsat && ready(t.id)) bypassPass++;
          if (unsat && requiredInputs(t.id).every(p => sat(p, true))) bypassNaive++;
        }
      }
    }
    expect(trials).toBeGreaterThan(10000);
    expect(viaSkip).toBeGreaterThan(0);
    expect(bypassPass).toBe(0);
    // negative control: treating N/A or declined as simply satisfied would allow bypasses
    expect(bypassNaive).toBeGreaterThan(0);
  });
});
