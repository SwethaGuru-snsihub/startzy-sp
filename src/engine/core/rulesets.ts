// Ruleset versions. legacy-0 is today's engine (src/engine/engine.ts): work may continue on a
// cracked input. rev7-1 is the new core: an input that needs revalidation pauses its consumers.
// A project moves from legacy-0 to rev7-1 only by a founder-confirmed migration with a dry run
// and a snapshot.
import { requiredInputs } from './register';

export type Ruleset = 'legacy-0' | 'rev7-1';
export type LegacyStatus = 'approved' | 'cracked' | 'building' | 'skipped' | 'idle' | string;
export type LegacySnapshot = { ruleset: Ruleset; status: Record<string, LegacyStatus>; history: string[] };
export type DryRunOutcome = 'unchanged' | 'needs revalidation' | 'at risk' | 'paused';

export function inputsReady(ruleset: Ruleset, inputs: readonly LegacyStatus[]) {
  const ok = ruleset === 'legacy-0' ? ['approved', 'skipped', 'cracked'] : ['approved', 'skipped'];
  return inputs.every(s => ok.includes(s));
}

/** What an upgrade would change, without changing anything: nothing is reset. */
export function dryRun(p: LegacySnapshot): { task: string; outcome: DryRunOutcome }[] {
  const crackedInput = (id: string) => requiredInputs(id).some(r => p.status[r] === 'cracked');
  return Object.entries(p.status).map(([task, s]) => ({
    task,
    outcome: s === 'cracked' ? 'needs revalidation' : s === 'building' && crackedInput(task) ? 'paused' : s === 'approved' && crackedInput(task) ? 'at risk' : 'unchanged',
  }));
}

export type Migrated = LegacySnapshot & {
  migration: { from: Ruleset; to: Ruleset; by: string; at: string; snapshot: LegacySnapshot; preview: ReturnType<typeof dryRun> };
};

/** Upgrade only with the founder's confirmation; keeps every approval and history entry and a snapshot for undo. */
export function upgradeRuleset(p: LegacySnapshot, opts: { confirmedBy: string | null; at: string }): Migrated {
  if (!opts.confirmedBy) throw new Error('ruleset upgrade needs the founder\'s confirmation');
  const snapshot: LegacySnapshot = JSON.parse(JSON.stringify(p));
  return {
    ...JSON.parse(JSON.stringify(p)), ruleset: 'rev7-1',
    history: [...p.history, `migrated legacy-0 to rev7-1 by ${opts.confirmedBy} at ${opts.at}`],
    migration: { from: p.ruleset, to: 'rev7-1', by: opts.confirmedBy, at: opts.at, snapshot, preview: dryRun(p) },
  };
}
