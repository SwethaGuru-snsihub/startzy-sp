/* eslint-disable @typescript-eslint/no-explicit-any */
// Founder HQ for one startup project at a time. The Office Map, work queue, stage, block, gate and
// inbox screens run on the Founder HQ engine, which is a single shared object (engine.ts is frozen and
// has no notion of "which project"). This host gives each project its own copy of that engine state:
//
//   open a project   save the project that was open, load this project's saved state (or start it
//                    fresh), then show the screens
//   while open       every engine change is saved to this project's own key (debounced)
//   switch / leave   let any agent that is mid-run finish (fast), save, only then load the next
//
// Two projects therefore never share engine state, and a run started for one can never land in
// another: the host refuses to switch while work is still running. The saved state is per browser
// (prototype persistence), kept behind a replaceable KeyValueAdapter.
import { BLOCKS, B, LOC, S, getSpeed, kick, mutate, passFloor, run, setSpeed, start, subscribe } from '@/engine/engine';
import { localStorageAdapter, MemoryAdapter, type KeyValueAdapter } from './coreStorage';

export const LEGACY_KEY_PREFIX = 'startzy_legacy_v1:';
export type Template = 'veejay' | 'meera' | 'rahul';
const TEMPLATES: readonly string[] = ['veejay', 'meera', 'rahul'];

export type LegacySnapshot = { v: 1; template: Template; savedAt: string; S: Record<string, any>; B: Record<string, any>; LOC: Record<string, string> };
export type SessionProject = { id: string; name: string; pitch: string; template: Template };
export type ActivateResult = { ok: true; recovered?: boolean; fresh: boolean } | { ok: false; message: string };

const TRANSIENT = ['building', 'review', 'approving'];

export function createLegacyStore(adapter: KeyValueAdapter) {
  const key = (id: string) => `${LEGACY_KEY_PREFIX}${id}`;
  return {
    key,
    load(id: string): { snapshot: LegacySnapshot | null; corrupt: boolean } {
      const raw = adapter.get(key(id));
      if (raw == null) return { snapshot: null, corrupt: false };
      try {
        const s = JSON.parse(raw) as LegacySnapshot;
        if (s?.v !== 1 || !TEMPLATES.includes(s.template) || typeof s.S !== 'object' || typeof s.B !== 'object' || !Array.isArray(s.S.auto) || !Array.isArray(s.S.log)) throw new Error('invalid snapshot');
        return { snapshot: s, corrupt: false };
      } catch {
        try { adapter.set(`${LEGACY_KEY_PREFIX}corrupt:${id}:${Date.now()}`, raw); adapter.remove(key(id)); } catch { /* keep the original if it cannot be moved */ }
        return { snapshot: null, corrupt: true };
      }
    },
    save(id: string, snap: LegacySnapshot): boolean {
      try { adapter.set(key(id), JSON.stringify(snap)); return true; } catch { return false; }
    },
    remove(id: string) { adapter.remove(key(id)); },
  };
}
export type LegacyStore = ReturnType<typeof createLegacyStore>;

let sharedStore: LegacyStore | null = null;
export function getLegacyStore(): LegacyStore {
  if (!sharedStore) sharedStore = createLegacyStore(localStorageAdapter() ?? new MemoryAdapter());
  return sharedStore;
}

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Everything the engine holds for the open project, as plain data. */
export function capture(template: Template, now = new Date().toISOString()): LegacySnapshot {
  return clone({ v: 1 as const, template, savedAt: now, S: { ...S, auto: [...S.auto], toast: null }, B: { ...B }, LOC: { ...LOC } });
}

/** Puts a saved project back into the engine. Work that was mid-run resumes from its last whole step. */
export function restore(snap: LegacySnapshot): void {
  start(snap.template);
  for (const k of Object.keys(S)) delete S[k];
  Object.assign(S, clone(snap.S), { auto: new Set<number>(snap.S.auto) });
  for (const id of Object.keys(B)) if (snap.B[id]) Object.assign(B[id], clone(snap.B[id]));
  for (const k of Object.keys(LOC)) delete (LOC as any)[k];
  Object.assign(LOC, clone(snap.LOC));

  // an agent that was mid-run when the page closed starts that step again
  const resume: { id: string; fromReview: boolean }[] = [];
  for (const b of BLOCKS) {
    const st = B[b.id]?.st;
    if (!TRANSIENT.includes(st)) continue;
    resume.push({ id: b.id, fromReview: st !== 'building' });
    B[b.id].st = 'idle'; B[b.id].p = 0;
  }
  mutate(() => {});
  for (const f of Object.keys(S.pending)) if (S.pending[f] === 'ceo') passFloor(Number(f), 'Atlas');   // a stage check that was in flight
  resume.forEach(r => { void run(r.id, r.fromReview ? { fromReview: true } : {}); });
  if (S.auto.size) kick();
}

const busy = () => S.started && (BLOCKS.some(b => TRANSIENT.includes(B[b.id]?.st)) || Object.values(S.pending ?? {}).includes('ceo'));

/**
 * Lets running agents finish, quickly, and reports whether the engine went quiet. Nothing is saved or
 * switched until it has: a timer left behind would write into the next project.
 */
export async function quiesce(maxMs = 8000): Promise<boolean> {
  if (!S.started) return true;
  const prev = getSpeed();
  setSpeed(100);
  try {
    const t0 = Date.now(); let calm = 0;
    while (Date.now() - t0 < maxMs) {
      if (busy()) calm = 0; else if (++calm >= 4) return true;   // quiet for ~160 ms: queued starts have fired too
      await sleep(40);
    }
    return false;
  } finally { setSpeed(prev); }
}

export function createLegacySessionHost(opts: { store: LegacyStore; onSync?: (projectId: string) => void; now?: () => string }) {
  const { store } = opts;
  const now = opts.now ?? (() => new Date().toISOString());
  let owner: SessionProject | null = null;
  let unsub: (() => void) | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let chain: Promise<unknown> = Promise.resolve();
  const enqueue = <T,>(fn: () => Promise<T>): Promise<T> => { const r = chain.then(fn, fn); chain = r.catch(() => {}); return r; };

  const save = () => { if (owner && S.started) store.save(owner.id, capture(owner.template, now())); };
  const flush = () => { if (timer) { clearTimeout(timer); timer = null; } save(); if (owner) opts.onSync?.(owner.id); };
  const schedule = () => { if (timer) return; timer = setTimeout(() => { timer = null; save(); if (owner) opts.onSync?.(owner.id); }, 250); };

  return {
    owner: () => owner?.id ?? null,

    activate(project: SessionProject): Promise<ActivateResult> {
      return enqueue(async () => {
        if (owner?.id === project.id && S.started) return { ok: true as const, fresh: false };
        if (owner) {
          if (!(await quiesce())) return { ok: false as const, message: 'The agents of the open startup are still working. Try again in a moment.' };
          unsub?.(); unsub = null; flush(); owner = null;
        }
        const { snapshot, corrupt } = store.load(project.id);
        if (snapshot) restore(snapshot);
        else { start(project.template); mutate(s => { s.idea = project.name; s.pitch = project.pitch || s.pitch; }); }
        owner = project; unsub = subscribe(schedule);
        flush();
        return { ok: true as const, fresh: !snapshot, ...(corrupt ? { recovered: true } : {}) };
      });
    },

    /** Leaves the project: finishes running work, saves, and clears the engine so nothing is shown elsewhere. */
    release(): Promise<boolean> {
      return enqueue(async () => {
        if (!owner) return true;
        if (!(await quiesce())) return false;
        unsub?.(); unsub = null; flush(); owner = null;
        mutate(s => { s.started = false; });
        return true;
      });
    },

    /** Saves right now (for example before a hard navigation). */
    flush,
  };
}
export type LegacySessionHost = ReturnType<typeof createLegacySessionHost>;
