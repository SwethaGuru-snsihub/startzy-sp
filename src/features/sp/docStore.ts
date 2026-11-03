// The content of a project's documents, with their versions, plus the founder's small workflow choices
// the core does not record (optional work taken up, re-checks approved, a pending send-back note).
// The core holds what is approved and when; this holds what the documents say. Prototype persistence:
// this browser only, behind the same replaceable adapter, with listeners so screens update.
import { localStorageAdapter, MemoryAdapter, type KeyValueAdapter } from '@/services/coreStorage';
import type { Section } from './content';

export type DocVersion = { v: number; by: string; note: string; at: string; secs: Section[] };
type Data = { docs: Record<string, DocVersion[]>; notes: Record<string, string>; takenUp: string[]; rechecks: string[] };
export const DOC_KEY_PREFIX = 'startzy_sp_docs_v1:';
const empty = (): Data => ({ docs: {}, notes: {}, takenUp: [], rechecks: [] });

function parse(raw: string | null): Data | null {
  if (raw == null) return null;
  try {
    const d = JSON.parse(raw) as Partial<Data>;
    if (!d || typeof d.docs !== 'object' || d.docs === null || !Array.isArray(d.takenUp) || !Array.isArray(d.rechecks) || typeof d.notes !== 'object' || d.notes === null) throw new Error('bad shape');
    for (const list of Object.values(d.docs)) if (!Array.isArray(list)) throw new Error('bad versions');
    return d as Data;
  } catch { return null; }
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
    cache = d;
    return d;
  }
  function write(d: Data) {
    cache = d; version++;
    try { adapter.set(key, JSON.stringify(d)); } catch { /* storage full or blocked: kept in memory until the page closes */ }
    listeners.forEach(l => l());
  }

  return {
    versions: (task: string): DocVersion[] => read().docs[task] ?? [],
    latest: (task: string): DocVersion | null => (read().docs[task] ?? []).at(-1) ?? null,
    add(task: string, v: { by: string; note: string; secs: Section[] }): DocVersion {
      const d = read(); const list = d.docs[task] ?? [];
      const next: DocVersion = { v: list.length + 1, by: v.by, note: v.note, at: now(), secs: v.secs };
      write({ ...d, docs: { ...d.docs, [task]: [...list, next] } });
      return next;
    },
    setNote(task: string, note: string) { const d = read(); write({ ...d, notes: { ...d.notes, [task]: note } }); },
    /** The founder's note from the last send-back, once: the agent's revision reads and clears it. */
    takeNote(task: string): string { const d = read(); const n = d.notes[task] ?? ''; if (n) { const notes = { ...d.notes }; delete notes[task]; write({ ...d, notes }); } return n; },
    takenUp: (): string[] => read().takenUp,
    takeUp(task: string) { const d = read(); if (!d.takenUp.includes(task)) write({ ...d, takenUp: [...d.takenUp, task] }); },
    rechecks: (): string[] => read().rechecks,
    setRechecks(ids: string[]) { const d = read(); write({ ...d, rechecks: [...new Set([...d.rechecks, ...ids])] }); },
    clearRechecks() { const d = read(); if (d.rechecks.length) write({ ...d, rechecks: [] }); },
    clearRecheck(id: string) { const d = read(); if (d.rechecks.includes(id)) write({ ...d, rechecks: d.rechecks.filter(x => x !== id) }); },
    clear() { cache = empty(); version++; try { adapter.remove(key); } catch { /* ignore */ } listeners.forEach(l => l()); },
    subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
    getVersion: () => version,
  };
}
export type DocStore = ReturnType<typeof createDocStore>;

const shared = new Map<string, DocStore>();
/** The browser store for one project's documents. */
export function getDocStore(projectId: string): DocStore {
  let s = shared.get(projectId);
  if (!s) { s = createDocStore(localStorageAdapter() ?? new MemoryAdapter(), projectId); shared.set(projectId, s); }
  return s;
}
export function dropDocStore(projectId: string) { getDocStore(projectId).clear(); shared.delete(projectId); }
