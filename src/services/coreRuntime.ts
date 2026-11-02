// One persistent core Project per startup project. The runtime caches them by project id (no global
// singleton state: opening B never touches A), loads or initializes each exactly once, and is the only
// writer. Every change runs on a copy; the copy replaces the live project only if the core action
// succeeded, so an error can never leave a half-applied project behind.
//
// It never starts or reads the legacy engine. Persistence goes through CoreStorage, which sits on a
// replaceable KeyValueAdapter.
import { createCore, type Clock, type Core } from '@/engine/core/project';
import type { DemoPresetId } from '@/engine/core/presets';
import type { Project } from '@/engine/core/types';
import { buildDemoProject } from './demoSeeds';
import { createCoreStorage, hydrateProject, localStorageAdapter, MemoryAdapter, type CoreStorage } from './coreStorage';
import { runNextSimulatedStep, type SimulatedStepResult } from './simulatedStep';

/** What the runtime needs to know to create a project's core instance the first time. */
export type ProjectInit = { id: string; name: string; pitch: string; presetId?: DemoPresetId };

export type CoreEntry =
  | { status: 'ready'; project: Project; rev: number | null; persisted: boolean; notice?: string }
  | { status: 'error'; kind: 'corrupt' | 'unsupported' | 'seed-failed'; message: string };

export type MutationResult<T> = { ok: true; value: T; persisted: boolean } | { ok: false; error: string };

export const realClock: Clock = { now: () => new Date().toISOString() };

export function createCoreRuntime(opts: { storage: CoreStorage; clock?: Clock; durable?: boolean }) {
  const { storage } = opts;
  const clock = opts.clock ?? realClock;
  const durable = opts.durable ?? true;
  const core = createCore(clock);
  const entries = new Map<string, CoreEntry>();
  const listeners = new Set<() => void>();
  let version = 0;
  const emit = () => { version++; listeners.forEach(l => l()); };

  function readyFrom(project: Project, rev: number | null, persisted: boolean, notice?: string): CoreEntry {
    return { status: 'ready', project, rev, persisted, ...(notice ? { notice } : {}) };
  }

  /** Load from storage, or create and save. Idempotent and synchronous: a second call returns the same entry. */
  function load(init: ProjectInit): CoreEntry {
    const hit = entries.get(init.id);
    if (hit) return hit;
    const entry = fromStored(storage.load(init.id)) ?? create(init);
    entries.set(init.id, entry);
    return entry;
  }

  /** The entry for something found in storage, or null when nothing is stored. */
  function fromStored(stored: ReturnType<CoreStorage['load']>): CoreEntry | null {
    if (stored.status === 'ok') return readyFrom(stored.project, stored.rev, durable, durable ? undefined : 'Storage is unavailable: changes are kept only until this page closes.');
    if (stored.status === 'corrupt') return { status: 'error', kind: 'corrupt', message: `Saved workflow data could not be read (${stored.reason}). The unreadable copy was kept aside; nothing was overwritten.` };
    if (stored.status === 'unsupported') return { status: 'error', kind: 'unsupported', message: `Saved workflow data uses a newer or unknown format (${stored.reason}). It was left untouched.` };
    return null;
  }

  function create(init: ProjectInit): CoreEntry {
    let project: Project;
    try {
      project = init.presetId
        ? buildDemoProject(init.presetId, init.id)
        : core.createFounderProject({ idea: init.pitch.trim() || init.name, id: init.id });
    } catch (err) {
      return { status: 'error', kind: 'seed-failed', message: `Could not initialize this project: ${err instanceof Error ? err.message : String(err)}` };
    }
    if (!durable) return readyFrom(project, null, false, 'Storage is unavailable: changes are kept only until this page closes.');
    const saved = storage.save(project, null, clock.now());
    if (saved.ok) return readyFrom(project, saved.rev, true);
    if (saved.reason === 'conflict') {   // another tab created it first: adopt theirs
      const again = storage.load(init.id);
      if (again.status === 'ok') return readyFrom(again.project, again.rev, true);
    }
    return readyFrom(project, null, false, `Not saved: ${saved.reason === 'unavailable' ? 'browser storage is unavailable or full' : saved.message}. Changes are kept only until this page closes.`);
  }

  const runtime = {
    core,
    durable,

    ensure(init: ProjectInit): CoreEntry { const before = entries.size; const e = load(init); if (entries.size !== before) emit(); return e; },
    ensureMany(inits: ProjectInit[]) { const before = entries.size; inits.forEach(load); if (entries.size !== before) emit(); },
    getEntry: (id: string): CoreEntry | null => entries.get(id) ?? null,

    /** Applies a core action to a copy and keeps the copy only if the action succeeds. */
    mutate<T>(id: string, fn: (core: Core, p: Project) => T, o: { commitIf?: (value: T) => boolean } = {}): MutationResult<T> {
      const cur = entries.get(id);
      if (!cur || cur.status !== 'ready') return { ok: false, error: 'This project has no usable workflow data.' };
      const h = hydrateProject(JSON.parse(JSON.stringify(cur.project)));
      if ('reason' in h) return { ok: false, error: `Workflow data failed validation: ${h.reason}` };
      let value: T;
      try { value = fn(core, h.project); } catch (err) { return { ok: false, error: err instanceof Error ? err.message : String(err) }; }
      if (o.commitIf && !o.commitIf(value)) return { ok: true, value, persisted: cur.persisted };

      let rev = cur.rev, persisted = false, notice: string | undefined;
      if (!durable) notice = 'Storage is unavailable: changes are kept only until this page closes.';
      else {
        const saved = storage.save(h.project, cur.rev, clock.now());
        if (saved.ok) { rev = saved.rev; persisted = true; }
        else if (saved.reason === 'conflict') { runtime.reload(id); return { ok: false, error: 'This project was changed in another tab. It was reloaded; try again.' }; }
        else notice = `Not saved: ${saved.message}. Changes are kept only until this page closes.`;
      }
      entries.set(id, readyFrom(h.project, rev, persisted, notice));
      emit();
      return { ok: true, value, persisted };
    },

    runSimulatedStep(id: string): MutationResult<SimulatedStepResult> {
      return runtime.mutate(id, (c, p) => runNextSimulatedStep(c, p), { commitIf: r => r.ok });
    },

    /** Re-reads one project from storage (another tab changed it). */
    reload(id: string) {
      entries.delete(id);
      const entry = fromStored(storage.load(id));
      if (entry) entries.set(id, entry);   // missing: removed elsewhere, ensure() recreates it on next use
      emit();
    },

    /** Explicit recovery: keeps the stored copy aside, then creates the project again from scratch. */
    reset(init: ProjectInit): CoreEntry {
      storage.moveAside(init.id, 'reset by the user');
      entries.delete(init.id);
      const e = load(init);
      emit();
      return e;
    },

    remove(id: string) { storage.remove(id); entries.delete(id); emit(); },

    subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
    getVersion: () => version,
  };
  return runtime;
}
export type CoreRuntime = ReturnType<typeof createCoreRuntime>;

let shared: CoreRuntime | null = null;
/** The browser runtime: localStorage if it works, otherwise memory only (flagged as not durable). */
export function getCoreRuntime(): CoreRuntime {
  if (!shared) {
    const ls = localStorageAdapter();
    shared = createCoreRuntime({ storage: createCoreStorage(ls ?? new MemoryAdapter()), durable: ls != null });
  }
  return shared;
}
