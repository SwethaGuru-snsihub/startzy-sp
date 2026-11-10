// The content of a project's documents, with their versions, plus the founder's small workflow choices
// the core does not record (optional work taken up, re-checks approved, a pending send-back note).
// The core holds what is approved and when; this holds what the documents say. Prototype persistence:
// this browser only, behind the same replaceable adapter, with listeners so screens update.
import { localStorageAdapter, MemoryAdapter, type KeyValueAdapter } from '@/services/coreStorage';
import { cleanRecords, pruneRecords, type AiFallback, type AiRecord } from './ai/records';
import type { Section } from './content';
import type { Provider } from './provenance';

/**
 * `provider` is who wrote the content. Absent on versions saved before it was recorded: those were simulated.
 * `aiKey` links a version to the AI request it was drafted from, and `fallback` says the simulated provider
 * was used because the first-choice one could not answer.
 */
export type DocVersion = { v: number; by: string; note: string; at: string; secs: Section[]; provider?: Provider; aiKey?: string; fallback?: AiFallback };
type Data = { docs: Record<string, DocVersion[]>; notes: Record<string, string>; takenUp: string[]; rechecks: string[]; ai: Record<string, AiRecord> };
export const DOC_KEY_PREFIX = 'startzy_sp_docs_v1:';
const empty = (): Data => ({ docs: {}, notes: {}, takenUp: [], rechecks: [], ai: {} });

function parse(raw: string | null): Data | null {
  if (raw == null) return null;
  try {
    const d = JSON.parse(raw) as Partial<Data>;
    if (!d || typeof d.docs !== 'object' || d.docs === null || !Array.isArray(d.takenUp) || !Array.isArray(d.rechecks) || typeof d.notes !== 'object' || d.notes === null) throw new Error('bad shape');
    for (const list of Object.values(d.docs)) if (!Array.isArray(list)) throw new Error('bad versions');
    d.ai = cleanRecords(d.ai);   // absent in data saved before AI records existed: simply empty
    return d as Data;
  } catch { return null; }
}

/**
 * Versions drafted before providers were recorded: they carry Claude's "(Claude)" sections but no `provider`
 * and are tagged "(simulated)". Only the Claude path writes those headings, so they are corrected in place.
 * Returns whether anything changed. Core events cannot be rewritten: the old `started` event keeps its method.
 */
export function migrateLegacy(d: { docs: Record<string, DocVersion[]> }): boolean {
  let changed = false;
  for (const list of Object.values(d.docs)) {
    for (const v of list) {
      if (v.provider === undefined && v.secs.some(s => /\(Claude\)$/.test(s.h))) {
        v.provider = 'claude-cli';
        v.by = v.by.replace(/\(simulated\)$/, '(Claude CLI)');
        changed = true;
      }
    }
  }
  return changed;
}

export function createDocStore(adapter: KeyValueAdapter, projectId: string, now: () => string = () => new Date().toISOString()) {
  const key = `${DOC_KEY_PREFIX}${projectId}`;
  const listeners = new Set<() => void>();
  let version = 0;
  let cache: Data | null = null;

  function read(): Data {
    if (cache) return cache;
    const raw = adapter.get(key);
    let d = parse(raw);
    if (!d && raw != null) { try { adapter.set(`${key}:corrupt:${Date.now()}`, raw); } catch { /* storage blocked */ } }   // keep an unreadable copy aside
    d = d ?? empty();
    if (migrateLegacy(d)) { try { adapter.set(key, JSON.stringify(d)); } catch { /* storage blocked: corrected in memory only */ } }
    cache = d;
    return d;
  }
  function write(d: Data) {
    cache = d; version++;
    try { adapter.set(key, JSON.stringify(d)); } catch { /* storage full or blocked: kept in memory until the page closes */ }
    listeners.forEach(l => l());
  }
  /**
   * Every change starts from what storage holds now, not from this page's cache. Two tabs (or an AI request
   * finishing while the founder edits) would otherwise overwrite each other's changes with a stale copy.
   */
  function fresh(): Data { cache = null; return read(); }

  return {
    versions: (task: string): DocVersion[] => read().docs[task] ?? [],
    latest: (task: string): DocVersion | null => (read().docs[task] ?? []).at(-1) ?? null,
    add(task: string, v: { by: string; note: string; secs: Section[]; provider?: Provider; aiKey?: string; fallback?: AiFallback }): DocVersion {
      const d = fresh(); const list = d.docs[task] ?? [];
      const next: DocVersion = { v: list.length + 1, by: v.by, note: v.note, at: now(), secs: v.secs, ...(v.provider ? { provider: v.provider } : {}), ...(v.aiKey ? { aiKey: v.aiKey } : {}), ...(v.fallback ? { fallback: v.fallback } : {}) };
      write({ ...d, docs: { ...d.docs, [task]: [...list, next] } });
      return next;
    },
    setNote(task: string, note: string) { const d = fresh(); write({ ...d, notes: { ...d.notes, [task]: note } }); },
    /** The founder's note from the last send-back, once: the agent's revision reads and clears it. */
    takeNote(task: string): string { const d = fresh(); const n = d.notes[task] ?? ''; if (n) { const notes = { ...d.notes }; delete notes[task]; write({ ...d, notes }); } return n; },
    takenUp: (): string[] => read().takenUp,
    takeUp(task: string) { const d = fresh(); if (!d.takenUp.includes(task)) write({ ...d, takenUp: [...d.takenUp, task] }); },
    rechecks: (): string[] => read().rechecks,
    setRechecks(ids: string[]) { const d = fresh(); write({ ...d, rechecks: [...new Set([...d.rechecks, ...ids])] }); },
    clearRechecks() { const d = fresh(); if (d.rechecks.length) write({ ...d, rechecks: [] }); },
    clearRecheck(id: string) { const d = fresh(); if (d.rechecks.includes(id)) write({ ...d, rechecks: d.rechecks.filter(x => x !== id) }); },

    /** One AI record, or null. Reads this page's copy; `refresh()` brings in another tab's changes. */
    aiRecord: (aiKey: string): AiRecord | null => read().ai[aiKey] ?? null,
    aiRecords: (task?: string): AiRecord[] => Object.values(read().ai).filter(r => task === undefined || r.task === task),
    /**
     * Saves a record (older ones of the same task are pruned). With `onlyIf`, it is saved only if the check on
     * the record storage holds right now passes, so a late answer cannot replace a newer request. Returns
     * whether it was saved.
     */
    putAi(record: AiRecord, onlyIf?: (current: AiRecord | null) => boolean): boolean {
      const d = fresh();
      if (onlyIf && !onlyIf(d.ai[record.key] ?? null)) return false;
      write({ ...d, ai: pruneRecords({ ...d.ai, [record.key]: record }, undefined, undefined, record.key) });
      return true;
    },
    removeAi(aiKey: string) { const d = fresh(); if (d.ai[aiKey]) { const ai = { ...d.ai }; delete ai[aiKey]; write({ ...d, ai }); } },

    /** Another tab changed storage: forget this page's copy and tell the screens. */
    refresh() { cache = null; version++; listeners.forEach(l => l()); },
    clear() { cache = empty(); version++; try { adapter.remove(key); } catch { /* ignore */ } listeners.forEach(l => l()); },
    subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
    getVersion: () => version,
    /** The storage key, so the browser can recognise this store's changes made by another tab. */
    storageKey: key,
  };
}
export type DocStore = ReturnType<typeof createDocStore>;

const shared = new Map<string, DocStore>();
/** The browser store for one project's documents. */
export function getDocStore(projectId: string): DocStore {
  let s = shared.get(projectId);
  if (!s) {
    s = createDocStore(localStorageAdapter() ?? new MemoryAdapter(), projectId);
    shared.set(projectId, s);
    // A change made by another tab arrives as a storage event: pick it up so this tab sees it too.
    if (typeof window !== 'undefined') {
      const store = s;
      window.addEventListener('storage', e => { if (e.key === store.storageKey) store.refresh(); });
    }
  }
  return s;
}
export function dropDocStore(projectId: string) { getDocStore(projectId).clear(); shared.delete(projectId); }
