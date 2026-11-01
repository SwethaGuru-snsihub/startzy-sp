import { describe, expect, it } from 'vitest';
import { evaluate } from '../applicability';
import { handoffBlockers, type InputValidity } from '../handoff';
import { TASKS, requiredInputs } from '../register';
import { ACK_ALL, CONTEXTS, F } from './fixtures';

const allValid = (): Record<string, InputValidity> => Object.fromEntries(TASKS.map(t => [t.id, 'valid']));

describe('the SP16 handoff cannot be approved or submitted with any invalid input', () => {
  for (const k of ['veejay', 'learnSolo']) {
    const ctx = CONTEXTS[k], app = evaluate(ctx, ACK_ALL);
    it(`${k}: approvable when every SP1-SP15 artifact, Gates 1-3 and the current SJ8 decision are valid`, () => {
      expect(handoffBlockers(ctx, app, allValid())).toEqual([]);
    });
    it(`${k}: invalidating any one applicable handoff input (goal and clarify included) blocks it`, () => {
      const singles = requiredInputs('handoff', ctx).filter(id => app[id].status !== 'na');
      expect(singles).toEqual(expect.arrayContaining(['goal', 'clarify']));
      const missed = singles.filter(id => !handoffBlockers(ctx, app, { ...allValid(), [id]: 'invalid' }).includes(id));
      expect(missed).toEqual([]);
    });
  }
  it('an N/A input (no UI, so experience design is N/A) cannot hide an invalid upstream input', () => {
    const ctx = { ...CONTEXTS.learnSolo, ui: F('no') }, app = evaluate(ctx, ACK_ALL);
    expect(app.wires.status).toBe('na');
    const b = handoffBlockers(ctx, app, { ...allValid(), sad: 'invalid' });
    expect(b).toEqual(expect.arrayContaining(['wires', 'sad']));
  });
  it('a declined optional input passes through to its own inputs', () => {
    const ctx = CONTEXTS.learnSolo, app = evaluate(ctx, ACK_ALL);
    expect(handoffBlockers(ctx, app, { ...allValid(), market: 'declined' })).toEqual([]);
    expect(handoffBlockers(ctx, app, { ...allValid(), market: 'declined', problem: 'invalid' })).toEqual(expect.arrayContaining(['market', 'problem']));
  });
});
