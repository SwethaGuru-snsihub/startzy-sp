import { describe, expect, it } from 'vitest';
import { MemoryAdapter } from '@/services/coreStorage';
import { evidenceScore, gateChecks, genSections, interviewSections, mergeEdited, parseInterviews, resultOf, type ContentCtx } from '../content';
import { createDocStore, DOC_KEY_PREFIX } from '../docStore';
import { EXAMPLE_IDEA, ideaContext, type IdeaInput } from '../idea';

const idea = (over: Partial<IdeaInput['answers']> = {}): IdeaInput => {
  const c = ideaContext(EXAMPLE_IDEA, 'idea');
  return { option: 'idea', text: EXAMPLE_IDEA, name: 'Interview Coach', q2: c.questions[1].q, answers: { a1: 'Students', a2: 'Manually or in spreadsheets', a3: 'Venture-scale startup', ...over } };
};
const ctx = (n = 5, strong = 3): ContentCtx => ({ idea: idea(), interviews: { n, strong, notes: '' } });
const TASKS = ['goal', 'clarify', 'brief', 'research', 'interviews', 'problem', 'market', 'personas', 'competitors'];

describe('simulated content', () => {
  it('writes every Discover document from the founder\'s own words', () => {
    for (const t of TASKS) {
      const secs = genSections(t, ctx());
      expect(secs.length, t).toBeGreaterThan(0);
      expect(secs.every(s => s.h && s.b), t).toBe(true);
    }
    expect(genSections('brief', ctx()).find(s => s.h === 'Idea')?.b).toBe(EXAMPLE_IDEA);
    expect(genSections('problem', ctx())[0].b).toBe('Students have no reliable, affordable way to prepare for technical interviews.');
    expect(genSections('goal', ctx()).find(s => s.h === 'Working name')?.b).toBe('Interview Coach');
  });
  it('follows the founder\'s answers: a different audience changes what is written', () => {
    const c = { ...ctx(), idea: idea({ a1: 'Working professionals' }) };
    expect(genSections('problem', c)[0].b).toMatch(/^Working professionals have no/);
  });
  it('shows the interview evidence in the problem statement and in the gate checks', () => {
    expect(genSections('problem', ctx(2, 0)).find(s => s.h === 'Evidence so far')?.b).toBe('2 interviews, 0 strong problem signals. Evidence score 27 of 100.');
    expect(evidenceScore({ n: 5, strong: 3, notes: '' })).toBe(75);
    expect(evidenceScore({ n: 99, strong: 99, notes: '' })).toBe(100);
    const bad = gateChecks({ n: 2, strong: 0, notes: '' }, { research: true, problem: true });
    expect(bad.filter(c => !c.ok).map(c => c.label)).toEqual(['Talked to at least 4 people', 'At least 2 strong problem signals', 'Evidence score 45 or more']);
    expect(gateChecks({ n: 5, strong: 3, notes: '' }, { research: true, problem: true }).every(c => c.ok)).toBe(true);
    expect(gateChecks({ n: 5, strong: 3, notes: '' }, { research: false, problem: true })[0]).toMatchObject({ ok: false, detail: 'Not yet' });
  });
  it('reads interview numbers back from the document, and never trusts bad numbers', () => {
    expect(parseInterviews(interviewSections({ n: 6, strong: 4, notes: 'Two said price.' }))).toEqual({ n: 6, strong: 4, notes: 'Two said price.' });
    expect(parseInterviews(undefined)).toEqual({ n: 0, strong: 0, notes: '' });
    expect(parseInterviews([{ h: 'People spoken to', b: 'lots' }, { h: 'Strong problem signals', b: '9' }])).toMatchObject({ n: 0, strong: 0 });
    expect(parseInterviews([{ h: 'People spoken to', b: '3' }, { h: 'Strong problem signals', b: '9' }]).strong).toBe(3);
  });
  it('keeps what the founder edited by hand when an agent redrafts', () => {
    const prev = [{ h: 'Root causes', b: 'My own causes', edited: true }, { h: 'Evidence so far', b: 'old' }];
    const merged = mergeEdited(genSections('problem', ctx()), prev);
    expect(merged.find(s => s.h === 'Root causes')).toMatchObject({ b: 'My own causes', edited: true });
    expect(merged.find(s => s.h === 'Evidence so far')?.b).toMatch(/interviews/);
    expect(mergeEdited(genSections('problem', ctx()), null)).toHaveLength(4);
  });
  it('has a one-line result for each document', () => { for (const t of [...TASKS, 'gate1']) expect(resultOf(t, ctx()), t).toBeTruthy(); });
});

describe('document store', () => {
  const store = (a = new MemoryAdapter()) => createDocStore(a, 'p1', () => '2026-11-03T09:00:00.000Z');
  it('keeps versions in order with who made each and why', () => {
    const s = store();
    expect(s.latest('brief')).toBeNull();
    s.add('brief', { by: 'Asha (simulated)', note: 'First draft', secs: [{ h: 'Idea', b: 'x' }] });
    const v2 = s.add('brief', { by: 'You', note: 'Edited by you', secs: [{ h: 'Idea', b: 'y' }] });
    expect(v2.v).toBe(2);
    expect(s.versions('brief').map(v => v.by)).toEqual(['Asha (simulated)', 'You']);
    expect(s.latest('brief')?.secs[0].b).toBe('y');
  });
  it('survives a reload, and tells screens when it changes', () => {
    const a = new MemoryAdapter(); const s = store(a); let seen = 0;
    s.subscribe(() => seen++);
    s.add('brief', { by: 'You', note: 'n', secs: [] }); s.takeUp('market'); s.setRechecks(['problem', 'problem', 'gate1']);
    expect(seen).toBe(3);
    const again = store(a);
    expect([again.versions('brief').length, again.takenUp(), again.rechecks()]).toEqual([1, ['market'], ['problem', 'gate1']]);
  });
  it('hands a send-back note to the agent once', () => {
    const s = store(); s.setNote('problem', 'cover pilots');
    expect(s.takeNote('problem')).toBe('cover pilots');
    expect(s.takeNote('problem')).toBe('');
  });
  it('clears one re-check at a time, and everything on clear', () => {
    const s = store(); s.setRechecks(['a', 'b']); s.clearRecheck('a');
    expect(s.rechecks()).toEqual(['b']);
    s.clear();
    expect([s.rechecks(), s.versions('x')]).toEqual([[], []]);
  });
  it('keeps unreadable data aside instead of overwriting it, and tolerates blocked storage', () => {
    const a = new MemoryAdapter(); a.set(`${DOC_KEY_PREFIX}p1`, '{nope');
    const s = store(a);
    expect(s.versions('brief')).toEqual([]);
    expect(a.keys(`${DOC_KEY_PREFIX}p1:corrupt:`)).toHaveLength(1);
    const blocked = new MemoryAdapter(); blocked.failWrites = true;
    const b = store(blocked);
    expect(() => b.add('brief', { by: 'You', note: 'n', secs: [] })).not.toThrow();
    expect(b.versions('brief')).toHaveLength(1);
  });
});
