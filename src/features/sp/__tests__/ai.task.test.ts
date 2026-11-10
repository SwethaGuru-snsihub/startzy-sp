import { describe, expect, it } from 'vitest';
import { validateBrief } from '../ai/briefSchema';
import { inputHash } from '../ai/hash';
import { MAX_IDEA_CHARS, userMessage } from '../ai/prompt';
import { simulatedProvider } from '../ai/provider';
import { AI_TASKS, getTask } from '../ai/registry';
import { ideaBriefSpec } from '../ai/specs/ideaBrief';
import type { AiTaskSpec } from '../ai/task';
import { EXAMPLE_IDEA } from '../idea';

describe('the task registry', () => {
  it('finds a registered task by id', () => {
    expect(getTask('idea-brief')).toBe(ideaBriefSpec);
  });
  it('knows nothing else, including inherited object keys', () => {
    for (const id of ['', 'nope', 'Idea-Brief', '__proto__', 'constructor', 'toString', 'hasOwnProperty', 'valueOf']) expect(getTask(id)).toBeNull();
  });
  it('cannot be changed after it is built', () => {
    expect(Object.isFrozen(AI_TASKS)).toBe(true);
    expect(() => { (AI_TASKS as Record<string, AiTaskSpec>).sneaky = ideaBriefSpec; }).toThrow();
  });
  it.each(Object.entries(AI_TASKS))('%s is a sound spec', (key, spec) => {
    expect(spec.id).toBe(key);
    expect(spec.title.length).toBeGreaterThan(0);
    expect(Number.isInteger(spec.version) && spec.version >= 1).toBe(true);
    expect(spec.dependsOn.length).toBeGreaterThan(0);
    expect(new Set(spec.dependsOn).size).toBe(spec.dependsOn.length);
    expect(spec.systemPrompt.length).toBeGreaterThan(20);
  });
  it('gives every registered spec an input whose fields are all declared, so hashing a parsed input never throws', () => {
    const samples: Record<string, unknown> = { 'idea-brief': { text: EXAMPLE_IDEA, option: 'idea' } };
    for (const [id, spec] of Object.entries(AI_TASKS)) {
      const parsed = spec.parseInput(samples[id]);
      expect(parsed.ok).toBe(true);
      if (parsed.ok) expect(() => inputHash(spec, parsed.value)).not.toThrow();
    }
  });
});

describe('the Idea Brief spec', () => {
  it('declares exactly the fields its input has', () => {
    expect([...ideaBriefSpec.dependsOn].sort()).toEqual(['option', 'text']);
  });
  describe('parseInput keeps the rules Epic 1 has always had', () => {
    const parse = (raw: unknown) => ideaBriefSpec.parseInput(raw);
    it('trims the text and keeps the option', () => {
      expect(parse({ text: `  ${EXAMPLE_IDEA}  `, option: 'define' })).toEqual({ ok: true, value: { text: EXAMPLE_IDEA, option: 'define' } });
    });
    it('drops fields it does not know about', () => {
      const r = parse({ text: EXAMPLE_IDEA, option: 'idea', extra: 'x' });
      expect(r.ok && Object.keys(r.value).sort()).toEqual(['option', 'text']);
    });
    it('explains each refusal in the same words', () => {
      const msg = (raw: unknown) => { const r = parse(raw); return r.ok ? null : r.error; };
      for (const raw of [null, undefined, {}, [], 'text', { text: 5, option: 'idea' }, { text: EXAMPLE_IDEA }, { option: 'idea' }]) expect(msg(raw)).toBe('Send the idea text and where you are starting from.');
      expect(msg({ text: EXAMPLE_IDEA, option: 'nope' })).toBe('Unknown starting option.');
      expect(msg({ text: 'short', option: 'idea' })).toBe('Describe the idea in a sentence or more.');
      expect(msg({ text: '  x  '.repeat(2), option: 'idea' })).toBe('Describe the idea in a sentence or more.');
      expect(msg({ text: 'x'.repeat(MAX_IDEA_CHARS + 1), option: 'idea' })).toBe(`Keep the idea under ${MAX_IDEA_CHARS} characters.`);
    });
    it('accepts the limits themselves', () => {
      expect(parse({ text: 'x'.repeat(12), option: 'idea' }).ok).toBe(true);
      expect(parse({ text: 'x'.repeat(MAX_IDEA_CHARS), option: 'idea' }).ok).toBe(true);
    });
  });
  it('builds the same message the CLI has always been sent', () => {
    expect(ideaBriefSpec.buildMessage({ text: EXAMPLE_IDEA, option: 'problem' })).toBe(userMessage(EXAMPLE_IDEA, 'problem'));
  });
  it('validates the model\'s answer with the same checks and records who produced it', () => {
    const raw = {
      summary: 'A platform for interview practice.',
      slots: [
        { slot: 'idea', value: EXAMPLE_IDEA, provenance: 'explicit', confidence: 'high', evidence: EXAMPLE_IDEA, rationale: '' },
        { slot: 'problem', value: '', provenance: 'empty', confidence: '', evidence: '', rationale: '' },
        { slot: 'target_users', value: 'students', provenance: 'explicit', confidence: 'medium', evidence: 'students', rationale: '' },
        { slot: 'expected_outcome', value: '', provenance: 'empty', confidence: '', evidence: '', rationale: '' },
        { slot: 'constraints', value: '', provenance: 'empty', confidence: '', evidence: '', rationale: '' },
      ],
      opportunity: '', assumptions: [], missing_information: [], clarifying_questions: [],
    };
    const viaSpec = ideaBriefSpec.validate(raw, { text: EXAMPLE_IDEA, option: 'idea' }, 'claude-cli');
    const direct = validateBrief(raw, EXAMPLE_IDEA, 'claude-cli');
    expect(viaSpec.ok && direct.ok && viaSpec.value).toEqual(direct.ok && direct.brief);
    expect(viaSpec.ok && viaSpec.value.source).toBe('claude-cli');
    expect(ideaBriefSpec.validate({}, { text: EXAMPLE_IDEA, option: 'idea' }, 'claude-cli').ok).toBe(false);
  });
  it('simulates with the same answer the simulated provider gives', async () => {
    const input = { text: EXAMPLE_IDEA, option: 'idea' as const };
    expect(ideaBriefSpec.simulate(input)).toEqual(await simulatedProvider.analyze(input));
    expect(ideaBriefSpec.simulate(input).source).toBe('simulated');
  });
});
