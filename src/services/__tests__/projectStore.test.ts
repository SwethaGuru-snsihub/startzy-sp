import { describe, expect, it, vi } from 'vitest';
import { MemoryAdapter } from '../coreStorage';
import { createProjectStore, LEGACY_RECORDS_KEY, RECORDS_KEY } from '../projectStore';

// What the Stage A store wrote: identity plus stored (hardcoded) progress and metrics.
const OLD = [
  { id: 'proj-medpulse', name: 'MedPulse Health', pitch: 'p1', category: 'venture', categoryLabel: 'Venture-Funded SaaS', createdAt: '2026-10-15', lastActiveAt: '10 mins ago', sjPhaseNumber: 14, spStepNumber: 16, handoffStatus: 'accepted', evidenceScore: 78, runwayMonths: 16.5, spendCommittedLakh: 20, pendingActionsCount: 1, presetId: 'veejay' },
  { id: 'proj-mine', name: 'My Own Co', pitch: 'p2', category: 'custom', categoryLabel: 'Custom Startup', createdAt: '2026-11-01', sjPhaseNumber: 1, evidenceScore: 10, runwayMonths: 18 },
];

describe('project store', () => {
  it('migrates the old store: keeps identities, drops stored metrics, leaves the old key as a backup', () => {
    const a = new MemoryAdapter();
    const raw = JSON.stringify(OLD);
    a.set(LEGACY_RECORDS_KEY, raw);
    const records = createProjectStore(a).all();
    expect(records.map(r => r.id)).toEqual(['proj-medpulse', 'proj-mine']);
    expect(records[0]).toMatchObject({ name: 'MedPulse Health', presetId: 'veejay', category: 'venture' });
    for (const r of records) for (const k of ['sjPhaseNumber', 'spStepNumber', 'evidenceScore', 'runwayMonths', 'spendCommittedLakh', 'handoffStatus', 'pendingActionsCount', 'lastActiveAt']) expect(r).not.toHaveProperty(k);
    expect(a.get(LEGACY_RECORDS_KEY)).toBe(raw);
    expect(JSON.parse(a.get(RECORDS_KEY)!).version).toBe(2);
  });

  it('does not migrate twice: later changes live in the new key only', () => {
    const a = new MemoryAdapter(); a.set(LEGACY_RECORDS_KEY, JSON.stringify(OLD));
    const s = createProjectStore(a);
    s.all(); s.remove('proj-mine');
    expect(s.all().map(r => r.id)).toEqual(['proj-medpulse']);
    expect(JSON.parse(a.get(LEGACY_RECORDS_KEY)!)).toHaveLength(2);
  });

  it('starts with the three sample projects when nothing is stored', () => {
    expect(createProjectStore(new MemoryAdapter()).all().map(r => r.id)).toEqual(['proj-medpulse', 'proj-kitsune', 'proj-shieldgate']);
  });

  it('keeps an unreadable store aside and rebuilds from the backup', () => {
    const a = new MemoryAdapter(); a.set(RECORDS_KEY, '{nope'); a.set(LEGACY_RECORDS_KEY, JSON.stringify(OLD));
    expect(createProjectStore(a).all()).toHaveLength(2);
    expect(a.keys(`${RECORDS_KEY}_corrupt_`)).toHaveLength(1);
    expect(a.get(a.keys(`${RECORDS_KEY}_corrupt_`)[0])).toBe('{nope');
  });

  it('creates a project record with identity only, and removing it also asks for its workflow data to be removed', () => {
    const onRemove = vi.fn();
    const s = createProjectStore(new MemoryAdapter(), onRemove);
    const r = s.create({ name: ' Acme ', pitch: '', category: 'enterprise' });
    expect(r).toMatchObject({ name: 'Acme', category: 'enterprise', categoryLabel: 'Enterprise Software' });
    expect(Object.keys(r).sort()).toEqual(['category', 'categoryLabel', 'createdAt', 'id', 'name', 'pitch']);
    expect(s.byId(r.id)).toEqual(r);
    s.remove(r.id);
    expect(onRemove).toHaveBeenCalledWith(r.id);
    expect(s.byId(r.id)).toBeNull();
  });
});
