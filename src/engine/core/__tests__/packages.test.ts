import { describe, expect, it } from 'vitest';
import { currentPackage, isEligible, needsPackage, unlockPhase14, type PackageVersion, type Phase14 } from '../packages';

describe('handoff package and stale behaviour', () => {
  const pk: PackageVersion[] = [{ v: 1, state: 'accepted', stale: false }];
  it('v1 accepted and not stale is the current package', () => { expect(currentPackage(pk)?.v).toBe(1); });
  it('after a pivot, stale v1 is historical; there is no current package', () => {
    pk[0] = { ...pk[0], stale: true };
    expect(currentPackage(pk)).toBeNull();
  });
  it('v2 founder-approved but not yet accepted is still not current', () => {
    pk.push({ v: 2, state: 'founder-approved', stale: false });
    expect(currentPackage(pk)).toBeNull();
  });
  it('v2 returned by Solution Builder: still no current package', () => {
    pk[1] = { ...pk[1], state: 'returned' };
    expect(currentPackage(pk)).toBeNull();
  });
  it('v3 accepted is current; v1 keeps its acceptance as history, labelled stale', () => {
    pk.push({ v: 3, state: 'accepted', stale: false });
    expect(currentPackage(pk)?.v).toBe(3);
    expect([pk[0].state, pk[0].stale]).toEqual(['accepted', true]);
  });
  it('the SJ14+ tasks that need a current package are exactly those downstream of the acceptance', () => {
    expect(['sprints', 'qa', 'beta', 'golive', 'launch', 'metrics', 'learneval'].every(needsPackage)).toBe(true);
    expect(['company', 'hiring', 'team', 'handoff'].some(needsPackage)).toBe(false);
  });
});

describe('Phase 14: unlocked status, package validity and execution eligibility are separate', () => {
  const pk: PackageVersion[] = [{ v: 1, state: 'founder-approved', stale: false }];
  let p14: Phase14 = { unlockedAt: null };
  const env = { go: true, teamApproved: true };
  it('founder-approved but not accepted: Phase 14 locked, no current package', () => {
    p14 = unlockPhase14(p14, pk, env);
    expect(p14.unlockedAt).toBeNull();
    expect(currentPackage(pk)).toBeNull();
  });
  it('v1 accepted, Go and team approved: Phase 14 unlocks, v1 current, build eligible', () => {
    pk[0] = { ...pk[0], state: 'accepted' }; p14 = unlockPhase14(p14, pk, env);
    expect(p14.unlockedAt).toBe(1);
    expect(isEligible('sprints', p14, pk)).toBe(true);
  });
  it('v1 stale: Phase 14 stays unlocked (latched), no current package, package-dependent tasks not eligible', () => {
    pk[0] = { ...pk[0], stale: true }; p14 = unlockPhase14(p14, pk, env);
    expect(p14.unlockedAt).toBe(1);
    expect(currentPackage(pk)).toBeNull();
    expect(isEligible('sprints', p14, pk) || isEligible('qa', p14, pk)).toBe(false);
  });
  it('stale v1 keeps its acceptance as history and is never returned as current', () => {
    expect([pk[0].state, pk[0].stale, currentPackage(pk)]).toEqual(['accepted', true, null]);
  });
  it('v2 accepted: current again; a paused task is still not eligible until its own inputs are valid', () => {
    pk.push({ v: 2, state: 'accepted', stale: false });
    expect(currentPackage(pk)?.v).toBe(2);
    expect(isEligible('sprints', p14, pk)).toBe(true);
    expect(isEligible('sprints', p14, pk, { paused: true })).toBe(false);
  });
  it('no stale package can ever be current', () => {
    expect(pk.some(p => p.stale && p === currentPackage(pk))).toBe(false);
  });
  it('without Go or an approved team, acceptance alone does not unlock Phase 14', () => {
    const accepted: PackageVersion[] = [{ v: 1, state: 'accepted', stale: false }];
    expect(unlockPhase14({ unlockedAt: null }, accepted, { go: false, teamApproved: true }).unlockedAt).toBeNull();
    expect(unlockPhase14({ unlockedAt: null }, accepted, { go: true, teamApproved: false }).unlockedAt).toBeNull();
  });
});
