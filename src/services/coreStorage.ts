// Persistence for core projects. localStorage is only one implementation of KeyValueAdapter, so the
// storage can be replaced (IndexedDB, a server) without touching the runtime. Prototype persistence
// only: it is per browser, unencrypted and not shared between people.
//
// Each project is one envelope under `<prefix><id>`. `rev` is a compare-and-set counter: a save is
// refused when the stored rev is not the one the caller loaded, so two tabs cannot silently overwrite
// each other. Anything that cannot be read back as a valid project is quarantined, never overwritten.
import { TASKS } from '@/engine/core/register';
import type { Project, ArtifactVersion } from '@/engine/core/types';

export interface KeyValueAdapter {
  get(key: string): string | null;
  set(key: string, value: string): void;      // may throw (quota, blocked storage)
  remove(key: string): void;
  keys(prefix: string): string[];
}

export class MemoryAdapter implements KeyValueAdapter {
  private m = new Map<string, string>();
  /** Test hook: make every write throw, like a full or blocked browser storage. */
  failWrites = false;
  get = (k: string) => this.m.get(k) ?? null;
  set = (k: string, v: string) => { if (this.failWrites) throw new Error('storage unavailable'); this.m.set(k, v); };
  remove = (k: string) => { this.m.delete(k); };
  keys = (prefix: string) => [...this.m.keys()].filter(k => k.startsWith(prefix));
}

/** The browser's localStorage, or null where it is missing or blocked. */
export function localStorageAdapter(): KeyValueAdapter | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const probe = '__startzy_probe__';
    window.localStorage.setItem(probe, '1'); window.localStorage.removeItem(probe);
    const ls = window.localStorage;
    return {
      get: k => ls.getItem(k),
      set: (k, v) => ls.setItem(k, v),
      remove: k => ls.removeItem(k),
      keys: prefix => Object.keys(ls).filter(k => k.startsWith(prefix)),
    };
  } catch { return null; }
}

export const STORE_VERSION = 1;
export type Envelope = { storeVersion: number; rev: number; savedAt: string; project: Project };

export type LoadResult =
  | { status: 'missing' }
  | { status: 'ok'; project: Project; rev: number }
  | { status: 'corrupt'; reason: string }          // unreadable or invalid: the raw value was moved aside
  | { status: 'unsupported'; reason: string };     // a newer or unknown schema/ruleset: left untouched
export type SaveResult = { ok: true; rev: number } | { ok: false; reason: 'conflict' | 'unavailable'; message: string };

const freezeVersion = (v: ArtifactVersion): ArtifactVersion =>
  Object.freeze({ ...v, pins: Object.freeze({ ...v.pins }), approval: Object.freeze({ ...v.approval }) });

/**
 * Validates a parsed project and restores what JSON loses: approved versions are frozen when the
 * core creates them, so hydration freezes them again. Returns a reason string when it is not usable.
 */
export function hydrateProject(raw: unknown): { project: Project } | { reason: string; unsupported?: boolean } {
  const p = raw as Project | null;
  if (!p || typeof p !== 'object') return { reason: 'not an object' };
  if (p.schema !== 1) return { reason: `unknown project schema ${String(p.schema)}`, unsupported: true };
  if (p.ruleset !== 'rev7-1') return { reason: `unknown ruleset ${String(p.ruleset)}`, unsupported: true };
  if (typeof p.id !== 'string' || !p.id) return { reason: 'missing project id' };
  if (!p.workflows?.SJ || !p.workflows?.SP) return { reason: 'a workflow instance is missing' };
  for (const t of TASKS) {
    const r = p.workflows[t.workflow].tasks?.[t.id];
    if (!r || typeof r.state !== 'string' || !Array.isArray(r.versions)) return { reason: `task ${t.id} is missing or malformed in ${t.workflow}` };
    r.versions = r.versions.map(freezeVersion);
  }
  for (const k of ['events', 'packages', 'evidence', 'acknowledged'] as const) if (!Array.isArray(p[k])) return { reason: `${k} is not a list` };
  if (!p.direction || !Array.isArray(p.direction.versions) || !p.phase14 || !p.context) return { reason: 'direction, phase14 or context is missing' };
  p.direction.versions = p.direction.versions.map(v => Object.freeze({ ...v }));
  return { project: p };
}

// v2: sample projects now start where their journey starts (v1 held pre-advanced samples; those saves are left untouched)
export const CORE_KEY_PREFIX = 'startzy_core_v2:';

export function createCoreStorage(adapter: KeyValueAdapter, prefix = CORE_KEY_PREFIX) {
  const key = (id: string) => `${prefix}${id}`;
  const quarantineKey = (id: string, now: number) => `${prefix}corrupt:${id}:${now}`;

  function readEnvelope(id: string): { raw: string } | null {
    const raw = adapter.get(key(id));
    return raw == null ? null : { raw };
  }

  function currentRev(id: string): number | null {
    const e = readEnvelope(id);
    if (!e) return null;
    try { const r = (JSON.parse(e.raw) as Envelope).rev; return typeof r === 'number' ? r : -1; } catch { return -1; }
  }

  return {
    key,

    load(id: string): LoadResult {
      const e = readEnvelope(id);
      if (!e) return { status: 'missing' };
      let env: Envelope;
      try { env = JSON.parse(e.raw) as Envelope; } catch {
        return this.quarantine(id, e.raw, 'stored value is not valid JSON');
      }
      if (!env || typeof env !== 'object' || typeof env.rev !== 'number') return this.quarantine(id, e.raw, 'stored envelope is malformed');
      if (env.storeVersion !== STORE_VERSION) return { status: 'unsupported', reason: `unknown store version ${String(env.storeVersion)}` };
      const h = hydrateProject(env.project);
      if ('reason' in h) return h.unsupported ? { status: 'unsupported', reason: h.reason } : this.quarantine(id, e.raw, h.reason);
      if (h.project.id !== id) return this.quarantine(id, e.raw, `stored project id ${h.project.id} does not match ${id}`);
      return { status: 'ok', project: h.project, rev: env.rev };
    },

    /** Compare-and-set save. `expectedRev` is the rev the caller loaded, or null for a first write. */
    save(project: Project, expectedRev: number | null, savedAt: string): SaveResult {
      const cur = currentRev(project.id);
      if (cur !== expectedRev) return { ok: false, reason: 'conflict', message: 'the project changed in another tab or window' };
      const rev = (expectedRev ?? 0) + 1;
      try {
        adapter.set(key(project.id), JSON.stringify({ storeVersion: STORE_VERSION, rev, savedAt, project } satisfies Envelope));
        return { ok: true, rev };
      } catch (err) {
        return { ok: false, reason: 'unavailable', message: err instanceof Error ? err.message : 'storage unavailable' };
      }
    },

    /** Moves an unreadable value aside (kept for recovery) and frees the key. */
    quarantine(id: string, raw: string, reason: string): LoadResult {
      try { adapter.set(quarantineKey(id, Date.now()), raw); adapter.remove(key(id)); } catch { /* keep the original in place if we cannot move it */ }
      return { status: 'corrupt', reason };
    },

    /** Keeps a copy of whatever is stored (for recovery) and frees the key. Used before an explicit reset. */
    moveAside(id: string, reason: string): void {
      const e = readEnvelope(id);
      if (e) this.quarantine(id, e.raw, reason);
    },

    remove(id: string) { adapter.remove(key(id)); },
    quarantined: (id?: string) => adapter.keys(`${prefix}corrupt:${id ?? ''}`),
  };
}
export type CoreStorage = ReturnType<typeof createCoreStorage>;
