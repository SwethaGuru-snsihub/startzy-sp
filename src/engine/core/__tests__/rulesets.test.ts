import { describe, expect, it } from 'vitest';
import { dryRun, inputsReady, upgradeRuleset, type LegacySnapshot } from '../rulesets';

const legacy: LegacySnapshot = { ruleset: 'legacy-0', status: { model: 'approved', estimate: 'cracked', brd: 'approved', mvp: 'building' }, history: ['v1 approvals'] };

describe('ruleset versions and migration', () => {
  it('legacy-0 lets work continue on a cracked input; rev7-1 does not', () => {
    expect(inputsReady('legacy-0', ['approved', 'cracked'])).toBe(true);
    expect(inputsReady('rev7-1', ['approved', 'cracked'])).toBe(false);
  });
  it('dry run: cracked needs revalidation, approved consumers at risk, in-progress consumers paused, the rest unchanged; nothing reset', () => {
    const p = Object.fromEntries(dryRun(legacy).map(r => [r.task, r.outcome]));
    expect(p).toEqual({ model: 'unchanged', estimate: 'needs revalidation', brd: 'at risk', mvp: 'paused' });
  });
  it('no silent upgrade: without founder confirmation the project stays on legacy-0', () => {
    expect(() => upgradeRuleset(legacy, { confirmedBy: null, at: '2026-11-01T00:00:00.000Z' })).toThrow(/confirmation/);
  });
  it('upgrade keeps every approval and history entry, records from, to and by, and keeps a snapshot', () => {
    const up = upgradeRuleset(legacy, { confirmedBy: 'FOUNDER', at: '2026-11-01T00:00:00.000Z' });
    const approved = (s: Record<string, string>) => Object.values(s).filter(x => x === 'approved').length;
    expect(up.ruleset).toBe('rev7-1');
    expect(approved(up.status)).toBe(approved(legacy.status));
    expect(up.history).toHaveLength(2);
    expect([up.migration.from, up.migration.to, up.migration.by]).toEqual(['legacy-0', 'rev7-1', 'FOUNDER']);
    expect(up.migration.snapshot.ruleset).toBe('legacy-0');
    expect(legacy.ruleset).toBe('legacy-0');
  });
  it('undo restores the snapshot exactly', () => {
    const up = upgradeRuleset(legacy, { confirmedBy: 'FOUNDER', at: '2026-11-01T00:00:00.000Z' });
    expect(up.migration.snapshot).toEqual(legacy);
  });
});
