import { describe, expect, it } from 'vitest';
import { IDEA_MAX, IDEA_MIN, submitIdea, validateIdea } from './ideaDraft';

describe('idea validation', () => {
  it('accepts an unfinished idea', () => { expect(validateIdea('An app for tutors to track fees')).toBeNull(); });
  it('rejects empty and whitespace-only input', () => { expect(validateIdea('')).toBe('empty'); expect(validateIdea('   \n ')).toBe('empty'); });
  it('rejects near-empty input', () => { expect(validateIdea('x'.repeat(IDEA_MIN - 1))).toBe('too_short'); });
  it('accepts the minimum and maximum lengths', () => { expect(validateIdea('x'.repeat(IDEA_MIN))).toBeNull(); expect(validateIdea('x'.repeat(IDEA_MAX))).toBeNull(); });
  it('rejects oversized input', () => { expect(validateIdea('x'.repeat(IDEA_MAX + 1))).toBe('too_long'); });
});

describe('submitIdea', () => {
  it('returns the validation error and does not store anything', async () => { expect(await submitIdea(' ')).toEqual({ ok: false, error: 'empty' }); });
  it('succeeds without browser storage (falls back to memory)', async () => { expect(await submitIdea('A booking tool for dental clinics')).toEqual({ ok: true, persisted: false }); });
});
