// Regression tests for the v3 engine rules (docs/screen-plans/00 §6, 03). They must keep passing
// through every later phase (Decision Centre, persistence, backend), so the workflow rules stay intact.
import { afterEach, describe, expect, it } from 'vitest';
import { B, P, active, approverFor, def, gateChecks, inboxItems, isOk, mutate, setDelegation, st, crackFrom, reinspectAll, startBlock, completeTask } from '../engine';
import { begin, playJourney, settle, summary } from './driver';

afterEach(async () => { await settle(); });

describe('approval routing (03 S15, S30)', () => {
  const amount = (id: string) => def(id).amount!();
  it.each([
    ['veejay', 20, 1, 'YOU'], ['rahul', 40, 1, 'YOU'], ['meera', 6, 1, 'CEO'],
    ['veejay', 20, 2, 'CEO'], ['rahul', 40, 2, 'CEO'], ['meera', 6, 2, 'CEO'],
  ] as const)('%s cost estimate ₹%dL at delegation %d goes to %s', (persona, lakhs, level, who) => {
    begin(persona); mutate(s => { s.deleg = level; });
    expect(amount('estimate')).toBe(lakhs);
    expect(approverFor(def('estimate'))).toBe(who);
  });

  it('documents go to the founder at level 0 and to Atlas at levels 1 and 2', () => {
    begin('veejay');
    for (const [level, who] of [[0, 'YOU'], [1, 'CEO'], [2, 'CEO']] as const) { mutate(s => { s.deleg = level; }); expect(approverFor(def('brd'))).toBe(who); }
  });

  it('hiring spend: Veejay ₹26.4L goes to the founder, Meera ₹9.6L to Atlas, at level 1', () => {
    begin('veejay'); mutate(s => { s.hires = [{ fit: 1 }, { fit: 1 }]; }); expect(amount('hiring')).toBeCloseTo(26.4); expect(approverFor(def('hiring'))).toBe('YOU');
    begin('meera'); mutate(s => { s.hires = [{ fit: 1 }, { fit: 1 }]; }); expect(amount('hiring')).toBeCloseTo(9.6); expect(approverFor(def('hiring'))).toBe('CEO');
  });

  it('a poor-fit hire adds ₹4L', () => {
    begin('veejay'); mutate(s => { s.hires = [{ fit: 1 }, { fit: 0 }]; });
    expect(amount('hiring')).toBeCloseTo(2 * 1.1 * 12 + 4);
  });
});

describe('unlocking and stages', () => {
  it('a block is locked until every input is approved', () => {
    begin('veejay');
    expect(st('profile')).toBe('ready');
    expect(st('goal')).toBe('locked');
    expect(st('brief')).toBe('locked');
    expect(st('research')).toBe('locked'); // later stage
  });

  it('only the current path\'s optional blocks exist', () => {
    const ids = (p: string) => { begin(p); return active().map(b => b.id); };
    expect(ids('veejay')).toContain('preseed'); expect(ids('veejay')).not.toContain('budget');
    expect(ids('meera')).toContain('presell'); expect(ids('meera')).not.toContain('preseed');
    expect(ids('rahul')).toContain('budget'); expect(ids('rahul')).not.toContain('presell');
  });

  it('the problem statement is sent back once only when a friendly-bias call was made', () => {
    begin('veejay');
    const bias = P.contacts.findIndex(c => c.sig === 'none');
    expect(def('problem').issue!.when()).toBe(false);
    mutate(s => { s.calls = [bias]; });
    expect(def('problem').issue!.when()).toBe(true);
  });

  it('gate 1 fails on a fresh workspace', () => {
    begin('veejay');
    const { checks } = gateChecks(1);
    expect(checks.every(c => c.ok)).toBe(false);
    expect(checks.map(c => c.t)).toContain('Talked to at least 4 people');
  });
});

describe('delegation re-routes waiting items', () => {
  it('raising the level approves what Atlas may now sign', async () => {
    begin('veejay'); mutate(s => { s.deleg = 0; });
    // walk to the first document that waits for the founder
    completeTask('profile'); await settle();
    completeTask('goal'); await settle();
    mutate(s => { s.answers = ['a', 'b', 'c']; }); completeTask('clarify'); await settle();
    startBlock('brief'); await settle();
    expect(B.brief.st).toBe('inbox');
    expect(inboxItems().some(i => i.ty === 'doc' && i.href.endsWith('/brief'))).toBe(true);
    setDelegation(1); await settle();
    expect(isOk('brief')).toBe(true);
    expect(B.brief.by).toBe('CEO');
  });
});

describe('ripple re-check', () => {
  it('a price change re-checks everything built on it; price-sensitive blocks are reworked', async () => {
    begin('veejay'); await playJourney();
    const before = { brd: B.brd.ver, prd: B.prd.ver, gtm: B.gtm.ver, estimate: B.estimate.ver };
    crackFrom('model');
    const cracked = active().filter(b => B[b.id].st === 'cracked').map(b => b.id);
    expect(cracked).toEqual(expect.arrayContaining(['estimate', 'brd', 'prd', 'gtm']));
    expect(cracked).not.toContain('model'); // founder decisions are not cracked
    await reinspectAll(); await settle();
    expect(active().some(b => B[b.id].st === 'cracked')).toBe(false);
    expect(B.brd.ver).toBe(before.brd + 1); expect(B.prd.ver).toBe(before.prd + 1); expect(B.gtm.ver).toBe(before.gtm + 1);
    expect(B.estimate.ver).toBe(before.estimate); // not price-sensitive: re-approved as "not affected"
    expect(isOk('estimate')).toBe(true);
  });
});

describe('full journeys (golden traces)', () => {
  it('Veejay · venture-funded', async () => {
    begin('veejay'); await playJourney();
    expect(summary()).toMatchInlineSnapshot(`
      {
        "approved": 34,
        "approvedBy": {
          "CEO": 20,
          "YOU": 14,
        },
        "bounces": 3,
        "customers": 55,
        "ended": true,
        "evidence": 85,
        "pmf": 67,
        "retention": 88,
        "skipped": [
          "preseed",
        ],
        "stagesPassed": [
          0,
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
        ],
        "versions": {
          "estimate": 2,
          "market": 2,
          "sad": 2,
        },
      }
    `);
  });
  it('Meera · bootstrapped', async () => {
    begin('meera'); await playJourney();
    expect(summary()).toMatchInlineSnapshot(`
      {
        "approved": 34,
        "approvedBy": {
          "CEO": 22,
          "YOU": 12,
        },
        "bounces": 3,
        "customers": 55,
        "ended": true,
        "evidence": 85,
        "pmf": 67,
        "retention": 88,
        "skipped": [
          "presell",
        ],
        "stagesPassed": [
          0,
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
        ],
        "versions": {
          "estimate": 2,
          "market": 2,
          "sad": 2,
        },
      }
    `);
  });
  it('Rahul · enterprise', async () => {
    begin('rahul'); await playJourney();
    expect(summary()).toMatchInlineSnapshot(`
      {
        "approved": 35,
        "approvedBy": {
          "CEO": 20,
          "YOU": 15,
        },
        "bounces": 3,
        "customers": 55,
        "ended": true,
        "evidence": 85,
        "pmf": 67,
        "retention": 88,
        "skipped": [],
        "stagesPassed": [
          0,
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
        ],
        "versions": {
          "estimate": 2,
          "market": 2,
          "sad": 2,
        },
      }
    `);
  });
  it('journey completes at delegation level 2 and Atlas approves more than at level 1', async () => {
    begin('veejay'); await playJourney({ delegation: 2 });
    const l2 = summary();
    begin('veejay'); await playJourney();
    const l1 = summary();
    expect(l2.ended && l1.ended).toBe(true);
    expect(l2.approvedBy.CEO).toBeGreaterThan(l1.approvedBy.CEO);
  });
});
