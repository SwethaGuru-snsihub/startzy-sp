import { describe, expect, it } from 'vitest';
import { createCore, steppedClock } from '@/engine/core/project';
import { createCoreStorage, hydrateProject, MemoryAdapter, STORE_VERSION } from '../coreStorage';

const core = createCore(steppedClock('2026-11-01T09:00:00.000Z'));
const founder = (id = 'p1') => core.createFounderProject({ idea: 'An idea', id });
const setup = () => { const adapter = new MemoryAdapter(); return { adapter, storage: createCoreStorage(adapter) }; };

describe('core storage', () => {
  it('round-trips a project through the adapter without loss', () => {
    const { storage } = setup();
    const p = founder();
    expect(storage.save(p, null, 'now')).toEqual({ ok: true, rev: 1 });
    const r = storage.load('p1');
    expect(r.status).toBe('ok');
    if (r.status === 'ok') { expect(r.project).toEqual(p); expect(r.rev).toBe(1); }
  });

  it('re-freezes approved versions and direction decisions that JSON loses', () => {
    const { storage } = setup();
    const p = core.createDemoProject('rahul', { id: 'demo' });
    core.applyDemoAnswers(p);
    core.startTask(p, 'profile', 'simulated'); core.submitTask(p, 'profile'); core.approveTask(p, 'profile', { by: 'FOUNDER' });
    storage.save(p, null, 'now');
    const r = storage.load('demo');
    if (r.status !== 'ok') throw new Error('expected ok');
    const v = r.project.workflows.SJ.tasks.profile.versions[0];
    expect(Object.isFrozen(v)).toBe(true);
    expect(Object.isFrozen(v.pins)).toBe(true);
    expect(() => { (v as { v: number }).v = 9; }).toThrow();
  });

  it('refuses to overwrite a project that changed since it was loaded (compare and set)', () => {
    const { storage } = setup();
    const p = founder();
    storage.save(p, null, 't1');
    expect(storage.save(p, null, 't2')).toMatchObject({ ok: false, reason: 'conflict' });       // first write over an existing one
    expect(storage.save(p, 1, 't2')).toEqual({ ok: true, rev: 2 });
    expect(storage.save(p, 1, 't3')).toMatchObject({ ok: false, reason: 'conflict' });          // stale rev
  });

  it('reports unavailable storage instead of throwing', () => {
    const { adapter, storage } = setup();
    adapter.failWrites = true;
    expect(storage.save(founder(), null, 't')).toMatchObject({ ok: false, reason: 'unavailable' });
    expect(storage.load('p1').status).toBe('missing');
  });

  it('moves invalid JSON aside instead of overwriting it', () => {
    const { adapter, storage } = setup();
    adapter.set(storage.key('p1'), '{not json');
    expect(storage.load('p1')).toMatchObject({ status: 'corrupt' });
    expect(adapter.get(storage.key('p1'))).toBeNull();
    const kept = storage.quarantined('p1');
    expect(kept).toHaveLength(1);
    expect(adapter.get(kept[0])).toBe('{not json');
  });

  it('treats a project with a missing task as corrupt, and keeps the original', () => {
    const { adapter, storage } = setup();
    const p = founder();
    delete (p.workflows.SJ.tasks as Record<string, unknown>).profile;
    adapter.set(storage.key('p1'), JSON.stringify({ storeVersion: STORE_VERSION, rev: 1, savedAt: 't', project: p }));
    const raw = adapter.get(storage.key('p1'));
    expect(storage.load('p1')).toMatchObject({ status: 'corrupt' });
    expect(adapter.get(storage.quarantined('p1')[0])).toBe(raw);
  });

  it('leaves unknown store versions, schemas and rulesets untouched', () => {
    const { adapter, storage } = setup();
    const p = founder();
    adapter.set(storage.key('p1'), JSON.stringify({ storeVersion: 99, rev: 1, savedAt: 't', project: p }));
    expect(storage.load('p1')).toMatchObject({ status: 'unsupported' });
    expect(adapter.get(storage.key('p1'))).not.toBeNull();
    expect(hydrateProject({ ...p, ruleset: 'rev8' })).toMatchObject({ unsupported: true });
    expect(hydrateProject({ ...p, schema: 2 })).toMatchObject({ unsupported: true });
  });

  it('rejects a stored project whose id does not match its key', () => {
    const { adapter, storage } = setup();
    adapter.set(storage.key('other'), JSON.stringify({ storeVersion: STORE_VERSION, rev: 1, savedAt: 't', project: founder('p1') }));
    expect(storage.load('other')).toMatchObject({ status: 'corrupt' });
  });
});
