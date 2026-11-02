// Project identity records for the prototype: who the startups are (name, pitch, type). Nothing about
// workflow progress or metrics lives here; that is derived from each project's core instance
// (coreRuntime + projectSelectors). Prototype persistence only (browser storage, no accounts).
//
// Storage layout: records are kept under `startzy_projects_v2`. The earlier `startzy_projects_store`
// key (which also held stored progress numbers) is never modified or deleted: it is read once to
// carry identities over, and stays behind as a backup.
import type { DemoPresetId } from '@/engine/core/presets';
import { localStorageAdapter, MemoryAdapter, type KeyValueAdapter } from './coreStorage';
import { getCoreRuntime, type ProjectInit } from './coreRuntime';
import { getLegacyStore, type Template } from './legacySession';

export type ProjectCategory = 'venture' | 'bootstrapped' | 'enterprise' | 'custom';
export type ProjectRecord = {
  id: string;
  name: string;
  pitch: string;
  category: ProjectCategory;
  categoryLabel: string;
  createdAt: string;
  presetId?: DemoPresetId;
};

export const RECORDS_KEY = 'startzy_projects_v2';
export const LEGACY_RECORDS_KEY = 'startzy_projects_store';   // v1: identities plus stored metrics; kept as backup

const CATEGORY_LABEL: Record<ProjectCategory, string> = {
  venture: 'Venture-Funded SaaS', bootstrapped: 'Bootstrapped B2B', enterprise: 'Enterprise Software', custom: 'Custom Startup',
};

// Sample startups (prototype data, not customer data). Only identity is listed: their progress comes
// from the core instance seeded for each preset.
const SEED_RECORDS: ProjectRecord[] = [
  { id: 'proj-medpulse', name: 'MedPulse Health', pitch: 'AI-assisted triage and clinical scheduling for hospital networks', category: 'venture', categoryLabel: CATEGORY_LABEL.venture, createdAt: '2026-10-15', presetId: 'veejay' },
  { id: 'proj-kitsune', name: 'Kitsune Workflow', pitch: 'Collaborative knowledge base and SOP compliance for boutique agencies', category: 'bootstrapped', categoryLabel: CATEGORY_LABEL.bootstrapped, createdAt: '2026-10-22', presetId: 'meera' },
  { id: 'proj-shieldgate', name: 'ShieldGate Enterprise', pitch: 'Zero-trust automated compliance auditor for financial services', category: 'enterprise', categoryLabel: CATEGORY_LABEL.enterprise, createdAt: '2026-10-28', presetId: 'rahul' },
];

const isCategory = (x: unknown): x is ProjectCategory => x === 'venture' || x === 'bootstrapped' || x === 'enterprise' || x === 'custom';
const isPreset = (x: unknown): x is DemoPresetId => x === 'veejay' || x === 'meera' || x === 'rahul';

/** Keeps only identity fields from a stored record of any version; null when it is not usable. */
function toRecord(x: unknown): ProjectRecord | null {
  const r = x as Record<string, unknown> | null;
  if (!r || typeof r.id !== 'string' || !r.id || typeof r.name !== 'string') return null;
  const category = isCategory(r.category) ? r.category : 'custom';
  return {
    id: r.id, name: r.name,
    pitch: typeof r.pitch === 'string' ? r.pitch : '',
    category,
    categoryLabel: typeof r.categoryLabel === 'string' ? r.categoryLabel : CATEGORY_LABEL[category],
    createdAt: typeof r.createdAt === 'string' ? r.createdAt : '',
    ...(isPreset(r.presetId) ? { presetId: r.presetId } : {}),
  };
}

export function createProjectStore(adapter: KeyValueAdapter, onRemove: (id: string) => void = () => {}) {
  function read(key: string): ProjectRecord[] | null {
    const raw = adapter.get(key);
    if (raw == null) return null;
    try {
      const parsed = JSON.parse(raw) as unknown;
      const list = Array.isArray(parsed) ? parsed : (parsed as { projects?: unknown })?.projects;
      if (!Array.isArray(list)) throw new Error('not a list');
      const out = list.map(toRecord).filter((r): r is ProjectRecord => r != null);
      if (list.length && !out.length) throw new Error('no usable records');
      return out;
    } catch {
      return null;
    }
  }
  const write = (records: ProjectRecord[]) => {
    try { adapter.set(RECORDS_KEY, JSON.stringify({ version: 2, projects: records })); } catch { /* storage full or blocked */ }
  };

  function all(): ProjectRecord[] {
    if (adapter.get(RECORDS_KEY) != null) {
      const cur = read(RECORDS_KEY);
      if (cur) return cur;
      // unreadable: keep the bad value aside, then rebuild from the backup or the samples
      try { adapter.set(`${RECORDS_KEY}_corrupt_${Date.now()}`, adapter.get(RECORDS_KEY)!); adapter.remove(RECORDS_KEY); } catch { /* ignore */ }
    }
    const migrated = read(LEGACY_RECORDS_KEY);   // the old key is only read, never changed
    const records = migrated && migrated.length ? migrated : SEED_RECORDS;
    write(records);
    return records;
  }

  return {
    all,
    byId: (id: string): ProjectRecord | null => all().find(p => p.id === id) ?? null,
    create(input: { name: string; pitch: string; category?: ProjectCategory; presetId?: DemoPresetId }): ProjectRecord {
      const category = input.category ?? (input.presetId === 'veejay' ? 'venture' : input.presetId === 'meera' ? 'bootstrapped' : input.presetId === 'rahul' ? 'enterprise' : 'custom');
      const record: ProjectRecord = {
        id: `proj-${Date.now().toString(36)}`,
        name: input.name.trim() || 'Untitled Startup',
        pitch: input.pitch.trim() || 'A new company built with Startzy.',
        category, categoryLabel: CATEGORY_LABEL[category],
        createdAt: new Date().toISOString().slice(0, 10),
        ...(input.presetId ? { presetId: input.presetId } : {}),
      };
      write([record, ...all()]);
      return record;
    },
    remove(id: string) { write(all().filter(p => p.id !== id)); onRemove(id); },   // also removes its workflow data
  };
}

/** The Founder HQ journey a project starts from: its sample persona, or one chosen from its type. */
export const templateOf = (r: ProjectRecord): Template => r.presetId ?? (r.category === 'bootstrapped' ? 'meera' : r.category === 'enterprise' ? 'rahul' : 'veejay');

export const toProjectInit = (r: ProjectRecord): ProjectInit => ({ id: r.id, name: r.name, pitch: r.pitch, presetId: r.presetId });

let shared: ReturnType<typeof createProjectStore> | null = null;
function store() {
  if (!shared) shared = createProjectStore(localStorageAdapter() ?? new MemoryAdapter(), id => { getCoreRuntime().remove(id); getLegacyStore().remove(id); });
  return shared;
}

export const getStoredProjects = (): ProjectRecord[] => (typeof window === 'undefined' ? SEED_RECORDS : store().all());
export const getProjectById = (id: string): ProjectRecord | null => (typeof window === 'undefined' ? null : store().byId(id));
export const createProjectRecord = (input: Parameters<ReturnType<typeof createProjectStore>['create']>[0]): ProjectRecord => store().create(input);
export const deleteProjectRecord = (id: string): void => store().remove(id);
