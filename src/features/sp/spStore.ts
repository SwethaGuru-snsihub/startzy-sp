// The Solution Planning projects of one signed-in (mock) user: identity and the founder's own idea
// only. Workflow progress lives in the core instance with the same id (coreRuntime); nothing about it
// is stored here. Prototype persistence: this browser only, behind the same replaceable adapter.
import { localStorageAdapter, MemoryAdapter, type KeyValueAdapter } from '@/services/coreStorage';
import { getCoreRuntime } from '@/services/coreRuntime';
import { dropDocStore } from './docStore';
import type { IdeaInput } from './idea';

export type SpProject = { id: string; name: string; createdAt: string; idea?: IdeaInput };
export const SP_KEY_PREFIX = 'startzy_sp_projects_v1:';
export const NEW_PROJECT_NAME = 'New project';

const isIdea = (x: unknown): x is IdeaInput => {
  const i = x as IdeaInput | null;
  return !!i && typeof i.text === 'string' && typeof i.name === 'string' && typeof i.q2 === 'string' && !!i.answers && typeof i.answers.a1 === 'string' && typeof i.answers.a2 === 'string' && typeof i.answers.a3 === 'string';
};
function toProject(x: unknown): SpProject | null {
  const r = x as Record<string, unknown> | null;
  if (!r || typeof r.id !== 'string' || !r.id || typeof r.name !== 'string') return null;
  return { id: r.id, name: r.name, createdAt: typeof r.createdAt === 'string' ? r.createdAt : '', ...(isIdea(r.idea) ? { idea: r.idea } : {}) };
}

export function createSpStore(adapter: KeyValueAdapter, userId: string, opts: { now?: () => string; newId?: () => string } = {}) {
  const key = `${SP_KEY_PREFIX}${userId}`;
  const now = opts.now ?? (() => new Date().toISOString());
  const newId = opts.newId ?? (() => `sp-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`);

  function all(): SpProject[] {
    const raw = adapter.get(key);
    if (raw == null) return [];
    try {
      const list = (JSON.parse(raw) as { projects?: unknown }).projects;
      if (!Array.isArray(list)) throw new Error('not a list');
      return list.map(toProject).filter((p): p is SpProject => p != null);
    } catch {
      try { adapter.set(`${key}:corrupt:${Date.now()}`, raw); adapter.remove(key); } catch { /* storage blocked */ }   // keep the unreadable copy aside
      return [];
    }
  }
  const write = (projects: SpProject[]) => { try { adapter.set(key, JSON.stringify({ version: 1, projects })); } catch { /* storage full or blocked */ } };

  return {
    all,
    byId: (id: string): SpProject | null => all().find(p => p.id === id) ?? null,
    /** The most recently created project, or null when there is none yet. */
    latest: (): SpProject | null => all()[0] ?? null,
    create(name = NEW_PROJECT_NAME): SpProject {
      const project: SpProject = { id: newId(), name, createdAt: now() };
      write([project, ...all()]);
      return project;
    },
    saveIdea(id: string, idea: IdeaInput): SpProject | null {
      const list = all(); const at = list.findIndex(p => p.id === id);
      if (at < 0) return null;
      list[at] = { ...list[at], name: idea.name.trim() || list[at].name, idea };
      write(list);
      return list[at];
    },
    remove(id: string) { write(all().filter(p => p.id !== id)); },
  };
}
export type SpStore = ReturnType<typeof createSpStore>;

const shared = new Map<string, SpStore>();
/** The browser store for one user. Removing a project also removes its core instance and its documents. */
export function getSpStore(userId: string): SpStore {
  let s = shared.get(userId);
  if (!s) {
    const base = createSpStore(localStorageAdapter() ?? new MemoryAdapter(), userId);
    s = { ...base, remove: (id: string) => { base.remove(id); getCoreRuntime().remove(id); dropDocStore(id); } };
    shared.set(userId, s);
  }
  return s;
}
