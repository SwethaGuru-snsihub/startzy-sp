import { describe, expect, it } from 'vitest';
import { MemoryAdapter } from '@/services/coreStorage';
import { sentenceList } from '../ai/text';
import { createDocStore, DOC_KEY_PREFIX, migrateLegacy, type DocVersion } from '../docStore';

const v = (n: number, by: string, heads: string[], provider?: 'claude-cli' | 'simulated'): DocVersion =>
  ({ v: n, by, note: 'First draft', at: '2026-11-03T09:00:00.000Z', secs: heads.map(h => ({ h, b: 'x' })), ...(provider ? { provider } : {}) });
const seed = (docs: Record<string, DocVersion[]>) => {
  const a = new MemoryAdapter();
  a.set(`${DOC_KEY_PREFIX}p1`, JSON.stringify({ docs, notes: {}, takenUp: [], rechecks: [] }));
  return a;
};

describe('documents drafted before providers were recorded', () => {
  it('are corrected when the store loads: Claude sections get the Claude provider and tag', () => {
    const a = seed({ brief: [v(1, 'Asha (simulated)', ['Summary (Claude)', 'Working name'])] });
    const s = createDocStore(a, 'p1');
    expect(s.latest('brief')).toMatchObject({ provider: 'claude-cli', by: 'Asha (Claude CLI)' });
    expect(JSON.parse(a.get(`${DOC_KEY_PREFIX}p1`)!).docs.brief[0]).toMatchObject({ provider: 'claude-cli', by: 'Asha (Claude CLI)' });   // saved back
  });
  it('leave simulated documents, and versions that already have a provider, exactly as they were', () => {
    const s = createDocStore(seed({
      research: [v(1, 'Asha (simulated)', ['What we found (simulated)', 'Gaps'])],
      brief: [v(1, 'Asha (Claude CLI)', ['Summary (Claude)'], 'claude-cli'), v(2, 'Asha (simulated)', ['Idea', 'Working name'], 'simulated')],
    }), 'p1');
    expect(s.latest('research')).toEqual(v(1, 'Asha (simulated)', ['What we found (simulated)', 'Gaps']));
    expect(s.versions('brief')[1]).toMatchObject({ provider: 'simulated', by: 'Asha (simulated)' });
  });
  it('keep the founder\'s name on a version they edited, and still record who wrote the content', () => {
    const s = createDocStore(seed({ brief: [v(1, 'You', ['Summary (Claude)'])] }), 'p1');
    expect(s.latest('brief')).toMatchObject({ by: 'You', provider: 'claude-cli' });
  });
  it('report whether anything changed, so clean data is not rewritten', () => {
    expect(migrateLegacy({ docs: { a: [v(1, 'You', ['Idea'])] } })).toBe(false);
    expect(migrateLegacy({ docs: { a: [v(1, 'Asha (simulated)', ['Summary (Claude)'])] } })).toBe(true);
    const a = seed({ goal: [v(1, 'You', ['Idea'])] });
    createDocStore(a, 'p1');
    expect(JSON.parse(a.get(`${DOC_KEY_PREFIX}p1`)!).docs.goal[0].provider).toBeUndefined();
  });
});

describe('listing what is still unclear', () => {
  it('never doubles punctuation when an item already ends with a full stop', () => {
    expect(sentenceList(['Who supplies the clothes: own stock or sellers.', 'Where it launches.', 'Budget, timeline, and team available.']))
      .toBe('Who supplies the clothes: own stock or sellers; Where it launches; Budget, timeline, and team available.');
  });
  it('handles items with and without final punctuation, and an empty list', () => {
    expect(sentenceList(['One', 'Two.', ' Three; '])).toBe('One; Two; Three.');
    expect(sentenceList([])).toBe('');
    expect(sentenceList(['', '  .'])).toBe('');
  });
  it('does not put a full stop after a question mark', () => {
    expect(sentenceList(['Who pays?'])).toBe('Who pays?');
    expect(sentenceList(['Who pays?', 'Budget'])).toBe('Who pays?; Budget.');
  });
});
