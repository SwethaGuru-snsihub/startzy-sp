import { describe, expect, it } from 'vitest';
import { EXAMPLE_IDEA } from '../idea';
import { applyAnswers, extractSlots, MAX_ROUNDS, PROVENANCE_LABEL, QUESTIONS_PER_ROUND, rankQuestions, resolveAssumptions, SLOT_IDS, SLOT_LABEL, slotOwners, slotsFor, type SlotValue } from '../slots';

const by = (s: SlotValue[], id: string) => s.find(x => x.slot === id)!;

describe('extracting the five slots from the founder\'s own words (T4)', () => {
  const slots = extractSlots(EXAMPLE_IDEA, 'idea');
  it('returns all five slots in the sheet order, each marked simulated', () => {
    expect(slots.map(s => s.slot)).toEqual([...SLOT_IDS]);
    expect(slots.every(s => s.simulated)).toBe(true);
  });
  it('quotes what the founder wrote for the values it found', () => {
    expect(by(slots, 'idea')).toMatchObject({ provenance: 'explicit', confidence: 'high', evidence: EXAMPLE_IDEA });
    expect(by(slots, 'target_users')).toMatchObject({ value: 'students', provenance: 'explicit', evidence: 'students' });
    expect(by(slots, 'expected_outcome')).toMatchObject({ value: 'prepare for technical interviews', provenance: 'explicit', evidence: 'prepare for technical interviews' });
  });
  it('labels a guess as inferred, with a rationale and low confidence, and leaves unknowns empty', () => {
    expect(by(slots, 'problem')).toMatchObject({ provenance: 'inferred', confidence: 'low', evidence: null });
    expect(by(slots, 'problem').rationale).toContain('Interview Prep');
    expect(by(slots, 'constraints')).toMatchObject({ value: '', provenance: 'empty', confidence: null });
  });
  it('treats a stated problem as explicit when the founder started from the problem', () => {
    const p = extractSlots('Students waste hours finding good interview practice.', 'problem');
    expect(by(p, 'problem')).toMatchObject({ provenance: 'explicit', evidence: 'Students waste hours finding good interview practice.' });
  });
  it('infers nothing when the founder only asked for help defining the idea', () => {
    expect(by(extractSlots('Something about learning, not sure yet.', 'define'), 'problem').provenance).toBe('empty');
  });
  it('never invents a quote that is not in the text', () => {
    for (const text of [EXAMPLE_IDEA, 'A tool for plumbers to quote jobs faster.', 'x']) {
      for (const s of extractSlots(text, 'idea')) if (s.evidence) expect(text.includes(s.evidence), `${s.slot}: ${s.evidence}`).toBe(true);
    }
  });
});

describe('ranking the questions (T5)', () => {
  it('asks about empty slots before inferred ones, and never more than three', () => {
    expect(rankQuestions(extractSlots(EXAMPLE_IDEA, 'idea'))).toEqual(['constraints', 'problem']);
    expect(QUESTIONS_PER_ROUND).toBe(3);
    const bare = extractSlots('x', 'define');
    expect(rankQuestions(bare).length).toBeLessThanOrEqual(QUESTIONS_PER_ROUND);
  });
  it('asks nothing when every slot is explicit or confirmed', () => {
    const full = extractSlots(EXAMPLE_IDEA, 'idea').map(s => ({ ...s, provenance: 'confirmed' as const, value: s.value || 'x' }));
    expect(rankQuestions(full)).toEqual([]);
  });
});

describe('the founder\'s answers and the assumptions that follow (T6)', () => {
  const start = extractSlots(EXAMPLE_IDEA, 'idea');
  it('confirms target users from the answer, unless the founder was not sure', () => {
    expect(by(applyAnswers(start, 'idea', { a1: 'Working professionals', a2: '' }), 'target_users')).toMatchObject({ value: 'Working professionals', provenance: 'confirmed', evidence: null });
    expect(by(applyAnswers(start, 'idea', { a1: 'Not sure yet', a2: '' }), 'target_users').provenance).toBe('explicit');
  });
  it('confirms how the problem is handled today when the founder started from an idea', () => {
    expect(by(applyAnswers(start, 'idea', { a1: 'Students', a2: 'Manually or in spreadsheets' }), 'problem')).toMatchObject({ provenance: 'confirmed', value: expect.stringContaining('Manually or in spreadsheets') });
    expect(by(applyAnswers(start, 'opportunity', { a1: 'Students', a2: 'A rule or policy change' }), 'problem').provenance).toBe('inferred');
  });
  it('marks the slots still unknown after the last round as assumptions, and keeps their label', () => {
    expect(MAX_ROUNDS).toBe(2);
    const end = resolveAssumptions(applyAnswers(start, 'idea', { a1: 'Students', a2: 'Manually or in spreadsheets' }));
    expect(by(end, 'constraints')).toMatchObject({ provenance: 'assumption', confidence: 'low' });
    expect(by(end, 'constraints').value).not.toBe('');
    expect(by(end, 'problem').provenance).toBe('confirmed');
    expect(end.every(s => s.provenance !== 'empty')).toBe(true);
  });
  it('does not change the input', () => {
    const copy = JSON.stringify(start);
    applyAnswers(start, 'idea', { a1: 'Students', a2: 'x' }); resolveAssumptions(start);
    expect(JSON.stringify(start)).toBe(copy);
  });
});

describe('who fills each slot', () => {
  it('reads the owner and supporting roles from the spec', () => {
    expect(slotOwners('idea')).toEqual({ owner: 'CEO', supporting: 'CPO' });
    expect(slotOwners('constraints').owner).toBe('CTO');
    for (const id of SLOT_IDS) expect(slotOwners(id).owner, id).not.toBe('');
  });
});

describe('the slots as the screens show them', () => {
  const idea = { option: 'idea' as const, text: EXAMPLE_IDEA, answers: { a1: 'Students', a2: 'Manually or in spreadsheets' } };
  it('shows only the extracted values until the founder has answered', () => {
    const s = slotsFor(idea, false);
    expect(by(s, 'target_users').provenance).toBe('explicit');
    expect(by(s, 'constraints').provenance).toBe('empty');
  });
  it('shows confirmed values and assumptions once the questions are answered', () => {
    const s = slotsFor(idea, true);
    expect(by(s, 'target_users')).toMatchObject({ provenance: 'confirmed', value: 'Students' });
    expect(by(s, 'constraints').provenance).toBe('assumption');
  });
  it('has a plain label for every provenance and slot', () => {
    for (const id of SLOT_IDS) expect(SLOT_LABEL[id], id).toBeTruthy();
    for (const p of ['explicit', 'inferred', 'confirmed', 'assumption', 'empty'] as const) expect(PROVENANCE_LABEL[p], p).toBeTruthy();
  });
});
