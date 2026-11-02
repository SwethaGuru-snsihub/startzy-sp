import { describe, expect, it } from 'vitest';
import { S } from '@/engine/engine';
import { directionState } from '@/engine/core/direction';
import { steppedClock } from '@/engine/core/project';
import { TASK, TASKS } from '@/engine/core/register';
import { SPEND_TASKS } from '@/engine/core/approvals';
import { buildDemoProject } from '../demoSeeds';
import { advancedDemo, seedAdvanced } from './helpers';
import { createCoreRuntime, type ProjectInit } from '../coreRuntime';
import { CORE_KEY_PREFIX, createCoreStorage, MemoryAdapter } from '../coreStorage';
import { viewOf } from '../projectSelectors';

const MED: ProjectInit = { id: 'proj-medpulse', name: 'MedPulse', pitch: 'x', presetId: 'veejay' };
const KIT: ProjectInit = { id: 'proj-kitsune', name: 'Kitsune', pitch: 'x', presetId: 'meera' };
const SHD: ProjectInit = { id: 'proj-shieldgate', name: 'ShieldGate', pitch: 'x', presetId: 'rahul' };
const NEW: ProjectInit = { id: 'proj-new', name: 'New Co', pitch: 'A tool for plumbers' };

const mk = (adapter = new MemoryAdapter()) => ({
  adapter,
  storage: createCoreStorage(adapter),
  rt: createCoreRuntime({ storage: createCoreStorage(adapter), clock: steppedClock('2026-11-02T09:00:00.000Z') }),
});
/** A fresh runtime over the same storage, like a page refresh or another tab. */
const reopen = (adapter: MemoryAdapter) => createCoreRuntime({ storage: createCoreStorage(adapter), clock: steppedClock('2026-11-03T09:00:00.000Z') });
const proj = (rt: ReturnType<typeof createCoreRuntime>, id: string) => {
  const e = rt.getEntry(id);
  if (e?.status !== 'ready') throw new Error(`${id} is not ready: ${JSON.stringify(e)}`);
  return e.project;
};
const json = (x: unknown) => JSON.stringify(x);

describe('initialization', () => {
  it('a founder project starts genuinely empty: nothing done in either workflow', () => {
    const { rt } = mk();
    rt.ensure(NEW);
    const v = viewOf(rt.core, proj(rt, NEW.id));
    expect(v.sj.total).toBe(18); expect(v.sp.total).toBe(16);
    expect(v.sj.completeCount).toBe(0); expect(v.sp.completeCount).toBe(0);
    expect(v.artifacts).toEqual([]);
    expect(v.evidence).toEqual({ total: 0, current: 0, withdrawn: 0 });
    expect(proj(rt, NEW.id).origin).toBe('founder');
    expect(Object.keys(proj(rt, NEW.id).context)).toEqual([]);   // no facts invented for the founder
  });

  it('ensure is idempotent: one project, one set of events, one stored copy', () => {
    const { rt, adapter, storage } = mk();
    const a = rt.ensure(NEW), b = rt.ensure(NEW);
    expect(b).toBe(a);
    expect(proj(rt, NEW.id).events.filter(e => e.type === 'created')).toHaveLength(1);
    expect(adapter.keys(storage.key(''))).toHaveLength(1);
  });

  it('two tabs creating the same project end up with one copy (the second adopts the first)', () => {
    const adapter = new MemoryAdapter();
    const tabA = reopen(adapter), tabB = reopen(adapter);
    tabA.ensure(NEW); tabB.ensure(NEW);
    expect(json(proj(tabB, NEW.id))).toBe(json(proj(tabA, NEW.id)));
    expect(adapter.keys(CORE_KEY_PREFIX)).toHaveLength(1);
  });

  it('a stored project is loaded, not recreated, after a refresh', () => {
    const { rt, adapter } = mk();
    rt.ensure(NEW);
    rt.runSimulatedStep(NEW.id);
    const before = json(proj(rt, NEW.id));
    const after = reopen(adapter);
    after.ensure(NEW);
    expect(json(proj(after, NEW.id))).toBe(before);
  });

  it('never starts or reads the legacy engine', () => {
    const { rt } = mk();
    rt.ensureMany([MED, KIT, SHD, NEW]);
    rt.runSimulatedStep(NEW.id);
    expect(S.started).toBeUndefined();
  });
});

describe('sample projects', () => {
  it('start where their journey starts: nothing done, only the stated facts of its persona and the demo answers', () => {
    const { rt } = mk();
    rt.ensureMany([MED, KIT, SHD]);
    for (const init of [MED, KIT, SHD]) {
      const p = proj(rt, init.id), v = viewOf(rt.core, p);
      expect(v.sj.completeCount).toBe(0); expect(v.sp.completeCount).toBe(0);
      expect(v.artifacts).toEqual([]); expect(v.handoff.current).toBeNull();
      expect(p.origin).toBe('demo');
      expect(p.events[0].detail).toMatch(/sample data/);
      expect(rt.core.openQuestions(p)).toEqual([]);
    }
  });

  it('are deterministic', () => {
    expect(json(buildDemoProject('veejay', 'a'))).toBe(json(buildDemoProject('veejay', 'a')));
    expect(json(advancedDemo('meera', 'a'))).toBe(json(advancedDemo('meera', 'a')));
  });

  it('a part-way project (played through real core actions) reports progress derived from its state', () => {
    const { rt, adapter } = mk();
    for (const init of [MED, KIT, SHD]) seedAdvanced(adapter, init);
    rt.ensureMany([MED, KIT, SHD]);
    const med = viewOf(rt.core, proj(rt, MED.id)), kit = viewOf(rt.core, proj(rt, KIT.id)), shd = viewOf(rt.core, proj(rt, SHD.id));
    expect(med.handoff.current).not.toBeNull(); expect(med.handoff.phase14UnlockedAt).not.toBeNull();
    expect(med.sp.completeCount).toBe(16); expect(med.sj.completeCount).toBeLessThan(18);
    expect(kit.pending.some(a => a.taskId === 'sj8' && a.kind === 'decision')).toBe(true);
    expect(shd.sp.completeCount).toBeLessThan(kit.sp.completeCount);
  });
});

describe('mutation safety', () => {
  it('a failing action leaves the project exactly as it was, in memory and in storage', () => {
    const { rt, adapter, storage } = mk();
    rt.ensure(NEW);
    const mem = json(proj(rt, NEW.id)), stored = adapter.get(storage.key(NEW.id));
    const r = rt.mutate(NEW.id, (c, p) => { c.startTask(p, 'profile', 'simulated'); c.approveTask(p, 'profile', { by: 'FOUNDER' }); }); // approve before submit: CoreError
    expect(r.ok).toBe(false);
    expect(json(proj(rt, NEW.id))).toBe(mem);
    expect(adapter.get(storage.key(NEW.id))).toBe(stored);
  });

  it('a thrown error after a partial change is discarded', () => {
    const { rt } = mk();
    rt.ensure(NEW);
    const before = json(proj(rt, NEW.id));
    const r = rt.mutate(NEW.id, (c, p) => { c.startTask(p, 'profile', 'simulated'); throw new Error('boom'); });
    expect(r).toEqual({ ok: false, error: 'boom' });
    expect(json(proj(rt, NEW.id))).toBe(before);
  });

  it('a change in another tab is detected: no silent overwrite, the project is reloaded', () => {
    const { rt: a, adapter } = mk();
    a.ensure(NEW);
    const b = reopen(adapter); b.ensure(NEW);
    expect(a.runSimulatedStep(NEW.id).ok).toBe(true);
    const lost = b.runSimulatedStep(NEW.id);
    expect(lost.ok).toBe(false);
    expect(json(proj(b, NEW.id))).toBe(json(proj(a, NEW.id)));   // b now shows a's work
  });

  it('keeps working in memory, flagged, when storage is unavailable, and saves once it returns', () => {
    const adapter = new MemoryAdapter(); adapter.failWrites = true;
    const { rt } = mk(adapter);
    const e = rt.ensure(NEW);
    expect(e).toMatchObject({ status: 'ready', persisted: false });
    expect(rt.runSimulatedStep(NEW.id)).toMatchObject({ ok: true, persisted: false });
    expect(proj(rt, NEW.id).events.length).toBeGreaterThan(1);
    adapter.failWrites = false;
    expect(rt.runSimulatedStep(NEW.id)).toMatchObject({ ok: true });
    expect(reopen(adapter).ensure(NEW)).toMatchObject({ status: 'ready' });
  });
});

describe('project isolation', () => {
  it('work on one project never changes another, including after switching back and forth', () => {
    const { rt, adapter } = mk();
    seedAdvanced(adapter, MED); seedAdvanced(adapter, SHD);
    rt.ensureMany([MED, SHD, NEW]);
    const med = json(proj(rt, MED.id)), shd = json(proj(rt, SHD.id));
    rt.runSimulatedStep(NEW.id);
    expect(rt.runSimulatedStep(SHD.id)).toMatchObject({ ok: true, value: { ok: true, taskId: 'market' } });
    expect(json(proj(rt, MED.id))).toBe(med);
    const shd2 = json(proj(rt, SHD.id));
    expect(shd2).not.toBe(shd);
    const fresh = reopen(adapter); fresh.ensureMany([NEW, SHD, MED]);
    expect(json(proj(fresh, SHD.id))).toBe(shd2);
    expect(json(proj(fresh, MED.id))).toBe(med);
  });

  it('removing a project removes only its workflow data', () => {
    const { rt, adapter, storage } = mk();
    rt.ensureMany([MED, NEW]);
    rt.remove(NEW.id);
    expect(adapter.get(storage.key(NEW.id))).toBeNull();
    expect(adapter.get(storage.key(MED.id))).not.toBeNull();
    expect(rt.getEntry(NEW.id)).toBeNull();
  });
});

describe('damaged saved data', () => {
  it('a corrupt copy is kept aside and the project is not silently recreated', () => {
    const { rt, adapter, storage } = mk();
    adapter.set(storage.key(NEW.id), '{broken');
    const e = rt.ensure(NEW);
    expect(e).toMatchObject({ status: 'error', kind: 'corrupt' });
    expect(adapter.get(storage.key(NEW.id))).toBeNull();
    expect(adapter.get(storage.quarantined(NEW.id)[0])).toBe('{broken');
    expect(rt.runSimulatedStep(NEW.id).ok).toBe(false);
  });

  it('an explicit reset recreates the project and still keeps the unreadable copy', () => {
    const { rt, adapter, storage } = mk();
    adapter.set(storage.key(NEW.id), '{broken');
    rt.ensure(NEW);
    expect(rt.reset(NEW)).toMatchObject({ status: 'ready' });
    expect(storage.quarantined(NEW.id).length).toBeGreaterThanOrEqual(1);
  });

  it('data in an unknown format is refused and left untouched', () => {
    const { rt, adapter, storage } = mk();
    const raw = JSON.stringify({ storeVersion: 99, rev: 1, savedAt: 't', project: {} });
    adapter.set(storage.key(NEW.id), raw);
    expect(rt.ensure(NEW)).toMatchObject({ status: 'error', kind: 'unsupported' });
    expect(adapter.get(storage.key(NEW.id))).toBe(raw);
  });
});

describe('approval, delegation and pivot-withdrawal rules survive saving and reloading', () => {
  /** Founder project with SP1 done by the founder, so the next agent task (the idea brief) can run. */
  function upToBrief(rt: ReturnType<typeof createCoreRuntime>) {
    rt.ensure(NEW);
    rt.runSimulatedStep(NEW.id);                                    // profile: Atlas's own work, waits for the founder
    for (const id of ['profile', 'goal', 'clarify']) {
      const r = rt.mutate(NEW.id, (c, p) => {
        if (c.state(p, id) !== 'awaiting-approval') { c.startTask(p, id, id === 'profile' ? 'simulated' : 'human'); c.submitTask(p, id); }
        c.approveTask(p, id, { by: 'FOUNDER' });
      });
      if (!r.ok) throw new Error(`${id}: ${r.error}`);
    }
  }

  it('Atlas never approves what is reserved for the founder, before or after a reload', () => {
    const { rt, adapter } = mk();
    rt.ensure(NEW);
    const step = rt.runSimulatedStep(NEW.id);
    expect(step).toMatchObject({ ok: true, value: { ok: true, taskId: 'profile', waitingFor: expect.any(String) } });
    expect(proj(rt, NEW.id).workflows.SJ.tasks.profile.state).toBe('awaiting-approval');
    const after = reopen(adapter); after.ensure(NEW);
    const r = after.mutate(NEW.id, (c, p) => c.approveTask(p, 'profile', { by: 'CEO' }));
    expect(r.ok).toBe(false);
    expect(proj(after, NEW.id).workflows.SJ.tasks.profile.state).toBe('awaiting-approval');
    expect(after.mutate(NEW.id, (c, p) => c.approveTask(p, 'profile', { by: 'FOUNDER' })).ok).toBe(true);
  });

  it('the delegation level persists with its audit event and decides what the simulated step may approve', () => {
    const a = mk(); upToBrief(a.rt);
    expect(a.rt.mutate(NEW.id, (c, p) => c.setDelegation(p, 0)).ok).toBe(true);
    const lvl0 = reopen(a.adapter); lvl0.ensure(NEW);
    expect(proj(lvl0, NEW.id).delegation).toBe(0);
    expect(proj(lvl0, NEW.id).events.some(e => e.type === 'delegation' && e.by === 'FOUNDER')).toBe(true);
    const r0 = lvl0.runSimulatedStep(NEW.id);
    expect(r0).toMatchObject({ ok: true, value: { ok: true, taskId: 'brief', waitingFor: expect.stringMatching(/level 0/) } });
    expect(proj(lvl0, NEW.id).workflows.SP.tasks.brief.state).toBe('awaiting-approval');

    const b = mk(); upToBrief(b.rt);                                // default level 1: Atlas may approve a reviewed document
    const r1 = b.rt.runSimulatedStep(NEW.id);
    expect(r1).toMatchObject({ ok: true, value: { ok: true, taskId: 'brief' } });
    expect(proj(b.rt, NEW.id).workflows.SP.tasks.brief.state).toBe('approved');
    const ev = proj(b.rt, NEW.id).events.find(e => e.type === 'approved' && e.task === 'brief')!;
    expect(ev).toMatchObject({ by: 'CEO', method: 'simulated' });
    expect(ev.detail).toMatch(/on the founder's behalf/);
  });

  it('raising the delegation lets the next simulated step approve what was waiting', () => {
    const { rt } = mk(); upToBrief(rt);
    rt.mutate(NEW.id, (c, p) => c.setDelegation(p, 0));
    rt.runSimulatedStep(NEW.id);                                    // brief now waits for the founder
    rt.mutate(NEW.id, (c, p) => c.setDelegation(p, 1));
    const r = rt.runSimulatedStep(NEW.id);
    expect(r).toMatchObject({ ok: true, value: { ok: true, taskId: 'brief' } });
    expect(proj(rt, NEW.id).workflows.SP.tasks.brief.state).toBe('approved');
  });

  it('a pivot opened before a refresh can be withdrawn after it, with every version kept', () => {
    const { rt, adapter } = mk(); seedAdvanced(adapter, MED); rt.ensure(MED);
    const versions = (p: ReturnType<typeof proj>) => json(TASKS.map(t => p.workflows[t.workflow].tasks[t.id].versions));
    const history = versions(proj(rt, MED.id));
    expect(rt.mutate(MED.id, (c, p) => c.decideDirection(p, { kind: 'pivot', target: 'SP4' })).ok).toBe(true);
    const later = reopen(adapter); later.ensure(MED);
    expect(directionState(proj(later, MED.id).direction)).toBe('pivot');
    expect(proj(later, MED.id).pivotSnapshot).not.toBeNull();
    expect(viewOf(later.core, proj(later, MED.id)).pivotOpen).toBe(true);
    expect(later.mutate(MED.id, (c, p) => c.decideDirection(p, { kind: 'pivot-withdrawn' })).ok).toBe(true);
    const p = proj(later, MED.id);
    expect(directionState(p.direction)).toBe('go');
    expect(p.pivotSnapshot).toBeNull();
    expect(p.direction.versions.map(v => v.kind)).toEqual(['go', 'pivot', 'pivot-withdrawn']);
    expect(versions(p)).toBe(history);                              // nothing deleted
    expect(p.packages.every(k => k.stale)).toBe(true);              // old packages stay as history, not current
    const persisted = reopen(adapter); persisted.ensure(MED);
    expect(json(proj(persisted, MED.id))).toBe(json(p));
  });
});

describe('the simulated step stays inside its limits', () => {
  it('never runs founder tasks, gates, the direction decision, Solution Builder acceptance, spend or optional tasks', () => {
    const { rt, adapter } = mk(); seedAdvanced(adapter, KIT); seedAdvanced(adapter, SHD); rt.ensureMany([KIT, SHD, NEW]);
    let total = 0;
    for (const id of [KIT.id, SHD.id, NEW.id]) {
      const ran: string[] = [];
      const gated = () => json(TASKS.filter(t => ['gate', 'external', 'direction'].includes(t.kind)).map(t => proj(rt, id).workflows[t.workflow].tasks[t.id].versions));
      const gatesBefore = gated(), directionBefore = json(proj(rt, id).direction);
      for (let i = 0; i < 80; i++) {
        const r = rt.runSimulatedStep(id);
        if (!r.ok || !r.value.ok) break;
        ran.push(r.value.taskId);
      }
      total += ran.length;
      for (const t of ran) {
        const def = TASK[t];
        expect(['task', 'review', 'package']).toContain(def.kind);
        expect(['FOUNDER', 'SOLUTION_BUILDER']).not.toContain(def.owner);
        expect(SPEND_TASKS).not.toContain(t);
      }
      const p = proj(rt, id);
      expect(json(p.direction)).toBe(directionBefore);
      expect(gated()).toBe(gatesBefore);                               // no gate, decision or acceptance was taken
      for (const t of TASKS.filter(t => t.owner === 'FOUNDER')) expect(p.workflows[t.workflow].tasks[t.id].method === 'simulated').toBe(false);
    }
    expect(total).toBeGreaterThan(3);                                // it did real work, only within its limits
  });

  it('labels what it did as simulated and says what it is waiting on when nothing can run', () => {
    const { rt } = mk(); rt.ensure(NEW);
    rt.runSimulatedStep(NEW.id);                                    // profile
    const blocked = rt.runSimulatedStep(NEW.id);                    // waits for the founder's approval
    expect(blocked).toMatchObject({ ok: true, value: { ok: false, reason: expect.stringMatching(/waiting for your approval/) } });
    const started = proj(rt, NEW.id).events.find(e => e.type === 'started')!;
    expect(started.method).toBe('simulated');
  });

  it('does not run on a stopped project', () => {
    const { rt } = mk(); rt.ensure(MED);
    rt.mutate(MED.id, (c, p) => c.decideDirection(p, { kind: 'stop' }));
    expect(rt.runSimulatedStep(MED.id)).toMatchObject({ ok: true, value: { ok: false, reason: expect.stringMatching(/stopped/) } });
  });
});
