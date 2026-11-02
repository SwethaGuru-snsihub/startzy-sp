// Sample (demo) projects start exactly where their journey starts: nothing done in either workflow.
// Their context holds the persona's stated facts plus the demo script's answers (labelled as such),
// so the applicability rules can decide. Progress is never written down: it comes from the work done
// in the Office, recorded in the project's own core instance.
import { createCore, steppedClock } from '@/engine/core/project';
import type { DemoPresetId } from '@/engine/core/presets';
import type { Project } from '@/engine/core/types';

export const SEED_START = '2026-10-15T09:00:00.000Z';

export function buildDemoProject(preset: DemoPresetId, id: string): Project {
  const core = createCore(steppedClock(SEED_START));
  const p = core.createDemoProject(preset, { id });
  core.applyDemoAnswers(p);
  return p;
}
