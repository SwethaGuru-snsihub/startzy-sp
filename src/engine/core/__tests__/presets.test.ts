import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { evaluate } from '../applicability';
import { DEMO_PRESETS, presetContext, statedFacts } from '../presets';
import { ACK_ALL } from './fixtures';

const PERSONA_LINES = readFileSync(path.resolve(__dirname, '../../personas.ts'), 'utf8').split(/\r?\n/);
const IDS = ['veejay', 'meera', 'rahul'] as const;

describe('demo presets are validated against personas.ts', () => {
  it.each(IDS)('%s: every preset fact cites personas.ts lines, and each cited quote is on that line', id => {
    const stated = statedFacts(id);
    for (const [key, f] of Object.entries(stated)) {
      expect(f!.source, key).toBe('preset');
      expect(f!.cite?.length, key).toBeGreaterThan(0);
      for (const c of f!.cite!) expect(PERSONA_LINES[c.line - 1], `${id}.${key} → personas.ts:${c.line}`).toContain(c.quote);
    }
  });
  it.each(IDS)('%s: with stated facts only, legal waits for clarification; no item is inferred', id => {
    expect(evaluate(statedFacts(id)).legal.status).toBe('awaiting');
  });
  it.each(IDS)('%s: unstated facts are answered by the demo script as demo answers, never as persona facts', id => {
    const answers = DEMO_PRESETS[id].demoAnswers;
    expect(Object.values(answers).every(f => f!.source === 'demo-answer')).toBe(true);
    expect(Object.keys(answers).some(k => k in statedFacts(id))).toBe(false);
  });
  it.each(IDS)('%s: every fact behind a legal item is stated in the persona or answered by the founder (demo answer)', id => {
    const ctx = presetContext(id), legal = evaluate(ctx, ACK_ALL).legal;
    expect((legal.uses ?? []).filter(f => ctx[f]).every(f => ['preset', 'demo-answer'].includes(ctx[f]!.source))).toBe(true);
  });
  it('the demo answers are exactly the agreed ones', () => {
    const v = (id: typeof IDS[number]) => Object.fromEntries(Object.entries(DEMO_PRESETS[id].demoAnswers).map(([k, f]) => [k, f!.value]));
    expect(v('veejay')).toEqual({ founders: '1', ipOwner: 'founders', collaborators: 'none', regulatedActivity: 'no' });
    expect(v('meera')).toEqual({ registration: 'sole', ipOwner: 'founders', collaborators: 'none', regulatedActivity: 'no' });
    expect(v('rahul')).toEqual({ healthData: 'none', regulatedActivity: 'no' });
  });
});
