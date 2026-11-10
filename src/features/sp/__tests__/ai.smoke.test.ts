// Opt-in: calls the real, signed-in Claude CLI once. Skipped in normal runs and in CI.
//   RUN_CLAUDE_SMOKE=1 npx vitest run src/features/sp/__tests__/ai.smoke.test.ts
import { describe, expect, it } from 'vitest';
import { createCliProvider } from '../ai/cliProvider';
import { SLOT_IDS } from '../slots';

const TEXT = 'I want to build an online clothing marketplace like Meesho and Myntra, selling imported and thrifted clothes.';

describe.skipIf(!process.env.RUN_CLAUDE_SMOKE)('real Claude CLI', () => {
  it('turns an idea into a valid Idea Brief', async () => {
    const b = await createCliProvider().analyze({ text: TEXT, option: 'idea' });
    console.log(JSON.stringify(b, null, 2));
    expect(b.source).toBe('claude-cli');
    expect(b.slots.map(s => s.slot)).toEqual([...SLOT_IDS]);
    expect(b.summary.length).toBeGreaterThan(10);
    for (const s of b.slots) if (s.provenance === 'explicit') expect(TEXT.toLowerCase()).toContain((s.evidence ?? '').toLowerCase());
  }, 150_000);
});
