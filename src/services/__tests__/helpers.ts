// Test helpers: sample projects played forward through real core actions, so tests can start from a
// project that is part-way through its journey. (The app itself starts every project at the beginning.)
import { createCore, steppedClock, type Core } from '@/engine/core/project';
import { play, type Policy } from '@/engine/core/demoScript';
import type { DemoPresetId } from '@/engine/core/presets';
import type { Project } from '@/engine/core/types';
import { createCoreStorage, type KeyValueAdapter } from '../coreStorage';

const STOPS: Record<DemoPresetId, { policy: Policy; stopAt: (c: Core, p: Project) => boolean }> = {
  veejay: { policy: { takeUp: ['preseed'], facts: { preseed: { raise: 'committed' } } }, stopAt: (_c, p) => p.phase14.unlockedAt != null },   // package accepted, Phase 14 unlocked
  meera: { policy: { takeUp: ['presell'], facts: { hiring: { collaborators: 'contributors' } } }, stopAt: (c, p) => c.readyTasks(p).includes('sj8') },   // Go / Pivot / Stop is next
  rahul: { policy: {}, stopAt: (c, p) => c.state(p, 'problem') === 'approved' },                                                                       // market research is next
};

export function advancedDemo(preset: DemoPresetId, id: string): Project {
  const core = createCore(steppedClock('2026-10-15T09:00:00.000Z'));
  const p = core.createDemoProject(preset, { id });
  core.applyDemoAnswers(p);
  const s = STOPS[preset];
  play(core, p, { ...s.policy, stopAt: x => s.stopAt(core, x) });
  if (!s.stopAt(core, p)) throw new Error(`${preset} did not reach its stop point`);
  return p;
}

/** Saves a part-way sample project, as if the founder had worked on it before. */
export function seedAdvanced(adapter: KeyValueAdapter, init: { id: string; presetId?: DemoPresetId }) {
  const r = createCoreStorage(adapter).save(advancedDemo(init.presetId!, init.id), null, '2026-10-15T09:00:00.000Z');
  if (!r.ok) throw new Error('seed failed');
}
