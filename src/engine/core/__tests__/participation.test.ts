import { describe, expect, it } from 'vitest';
import { evaluate } from '../applicability';
import { fact } from '../context';
import { activeOptionalAgents, canContribute, participation } from '../participation';
import { ACK_ALL, CONTEXTS, CONTEXT_NAMES } from './fixtures';

const act = (k: string, taken: string[] = []) => activeOptionalAgents(CONTEXTS[k], evaluate(CONTEXTS[k], ACK_ALL), taken);

describe('dynamic participation and per-artifact agent activation', () => {
  it.each(CONTEXT_NAMES)('%s: no participation rule adds an artifact\'s reviewer or owner as a contributor', k => {
    expect(() => participation(CONTEXTS[k])).not.toThrow();
  });
  it('negative test: "CFO contributes to market sizing" is rejected (CFO reviews it)', () => {
    expect(canContribute('CFO', 'market')).toBe(false);
  });
  it('CISO participation is removed only by confirmed facts; an AI-inferred "no personal data" keeps CISO', () => {
    expect(participation({ ...CONTEXTS.bootQuiet, personalData: fact('no', 'ai') }).some(p => p.agent === 'CISO')).toBe(true);
    expect(participation(CONTEXTS.bootQuiet).some(p => p.agent === 'CISO')).toBe(false);
  });
  it('learning A: CRO stays inactive (GTM, metrics and pre-sell are N/A; launch not taken up)', () => {
    expect(act('learnSolo').CRO).toBeUndefined();
  });
  it('learning A: if the founder takes up launch, CRO joins for that artifact only', () => {
    expect(act('learnSolo', ['launch']).CRO).toEqual(['launch:contributor']);
  });
  it('no optional agent is active without at least one applicable artifact', () => {
    expect(CONTEXT_NAMES.every(k => Object.values(act(k)).every(list => list.length > 0))).toBe(true);
  });
  it('learning A: CMO is not active for untaken optional work (market, validation) or N/A work (GTM)', () => {
    expect((act('learnSolo').CMO ?? []).some(r => /^(market|validation|gtm)/.test(r))).toBe(false);
  });
});
