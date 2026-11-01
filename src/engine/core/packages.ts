// Handoff packages and Phase 14. Three separate things: whether Phase 14 has been unlocked
// (latched once), which package is current, and whether a task may run now.
import { TASKS } from './register';
import { effectiveClosure } from './passthrough';

export type PackageState = 'founder-approved' | 'accepted' | 'returned';
export type PackageVersion = { v: number; state: PackageState; stale: boolean; pins?: Record<string, number> };
export type Phase14 = { unlockedAt: number | null };

/** The newest accepted package that is not stale. A stale package is history, never the current direction. */
export function currentPackage(pkgs: readonly PackageVersion[]): PackageVersion | null {
  return pkgs.filter(p => p.state === 'accepted' && !p.stale).sort((a, b) => b.v - a.v)[0] ?? null;
}

/** Phase 14 unlocks once (latched) when a current package exists, the direction is Go and the team is approved. */
export function unlockPhase14(p14: Phase14, pkgs: readonly PackageVersion[], env: { go: boolean; teamApproved: boolean }): Phase14 {
  if (p14.unlockedAt != null) return p14;
  const cur = currentPackage(pkgs);
  return cur && env.go && env.teamApproved ? { unlockedAt: cur.v } : p14;
}

const NEEDS_PACKAGE = new Set(TASKS.filter(t => effectiveClosure(t.id, () => false).has('sbaccept')).map(t => t.id));
/** Tasks downstream of the Solution Builder acceptance: they can run only with a current package. */
export const needsPackage = (id: string) => NEEDS_PACKAGE.has(id);

export function isEligible(id: string, p14: Phase14, pkgs: readonly PackageVersion[], opts: { paused?: boolean } = {}) {
  if (!needsPackage(id)) return !opts.paused;
  return p14.unlockedAt != null && currentPackage(pkgs) != null && !opts.paused;
}
