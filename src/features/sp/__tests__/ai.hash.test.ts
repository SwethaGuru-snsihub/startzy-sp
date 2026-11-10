import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { aiKey, canonicalJson, inputHash, sha256Hex, specDigest } from '../ai/hash';
import { ideaBriefSpec } from '../ai/specs/ideaBrief';
import type { AiTaskSpec } from '../ai/task';

const node = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

describe('sha256Hex', () => {
  it('matches the published test vectors', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
  });
  it('matches node:crypto around every block boundary and for non-ASCII text', () => {
    for (const n of [0, 1, 54, 55, 56, 57, 63, 64, 65, 119, 120, 121, 127, 128, 129, 1000]) expect(sha256Hex('a'.repeat(n))).toBe(node('a'.repeat(n)));
    for (const s of ['héllo wörld', 'データベース', '👩‍💻 launch 🚀', 'line1\r\nline2\n', '\u0000\u0001']) expect(sha256Hex(s)).toBe(node(s));
  });
  it('matches node:crypto for many pseudo-random strings', () => {
    let seed = 12345;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (let i = 0; i < 200; i++) {
      const len = Math.floor(rnd() * 300);
      let s = '';
      for (let j = 0; j < len; j++) s += String.fromCharCode(32 + Math.floor(rnd() * 0x2000));
      expect(sha256Hex(s)).toBe(node(s));
    }
  });
});

describe('canonicalJson', () => {
  it('ignores key order and drops undefined members', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: undefined, e: 'x' } })).toBe('{"a":{"d":2,"e":"x"},"b":1}');
    expect(canonicalJson({ a: 1, b: 2 })).toBe(canonicalJson({ b: 2, a: 1 }));
  });
  it('keeps array order and writes undefined items as null', () => {
    expect(canonicalJson([2, 1])).not.toBe(canonicalJson([1, 2]));
    expect(canonicalJson([1, undefined])).toBe('[1,null]');
  });
  it('escapes strings and tells values apart', () => {
    expect(canonicalJson('a"b\n')).toBe('"a\\"b\\n"');
    expect(canonicalJson('1')).not.toBe(canonicalJson(1));
    expect(canonicalJson(null)).toBe('null');
    expect(canonicalJson(false)).toBe('false');
  });
  it('refuses what it cannot hash faithfully', () => {
    expect(() => canonicalJson(NaN)).toThrow();
    expect(() => canonicalJson(Infinity)).toThrow();
    expect(() => canonicalJson(() => 1)).toThrow();
    expect(() => canonicalJson(undefined)).toThrow();
    expect(() => canonicalJson(BigInt(1))).toThrow();
  });
});

const fake = (over: Partial<AiTaskSpec> = {}): AiTaskSpec => ({
  id: 'fake', title: 'Fake', version: 1, systemPrompt: 'Be brief.', jsonSchema: { type: 'object' }, dependsOn: ['a', 'b'],
  parseInput: raw => ({ ok: true, value: raw }), buildMessage: () => 'm', validate: raw => ({ ok: true, value: raw }), simulate: () => ({}),
  ...over,
});

describe('specDigest', () => {
  it('changes when anything that defines the task changes', () => {
    const base = specDigest(fake());
    expect(specDigest(fake({ id: 'other' }))).not.toBe(base);
    expect(specDigest(fake({ version: 2 }))).not.toBe(base);
    expect(specDigest(fake({ systemPrompt: 'Be brief!' }))).not.toBe(base);
    expect(specDigest(fake({ jsonSchema: { type: 'array' } }))).not.toBe(base);
    expect(specDigest(fake({ dependsOn: ['a', 'b', 'c'] }))).not.toBe(base);
  });
  it('does not depend on the order dependencies are listed in', () => {
    expect(specDigest(fake({ dependsOn: ['b', 'a'] }))).toBe(specDigest(fake()));
  });
  it('is 128 bits of hex', () => { expect(specDigest(fake())).toMatch(/^[0-9a-f]{32}$/); });
});

describe('inputHash', () => {
  it('is the same for the same input however its keys are ordered', () => {
    expect(inputHash(fake(), { a: 1, b: 'x' })).toBe(inputHash(fake(), { b: 'x', a: 1 }));
  });
  it('changes when any declared dependency changes', () => {
    const base = inputHash(fake(), { a: 1, b: 'x' });
    expect(inputHash(fake(), { a: 2, b: 'x' })).not.toBe(base);
    expect(inputHash(fake(), { a: 1, b: 'y' })).not.toBe(base);
    expect(inputHash(fake(), { a: 1 })).not.toBe(base);                   // absent is not the same as present
    expect(inputHash(fake(), { a: 1, b: { n: [1, 2] } })).not.toBe(inputHash(fake(), { a: 1, b: { n: [2, 1] } }));
  });
  it('changes when the task itself changes: prompt, schema or version', () => {
    const input = { a: 1, b: 'x' };
    const base = inputHash(fake(), input);
    expect(inputHash(fake({ systemPrompt: 'Different.' }), input)).not.toBe(base);
    expect(inputHash(fake({ jsonSchema: { type: 'array' } }), input)).not.toBe(base);
    expect(inputHash(fake({ version: 2 }), input)).not.toBe(base);
  });
  it('refuses an input that carries a field the spec did not declare', () => {
    expect(() => inputHash(fake(), { a: 1, b: 'x', extra: 'secret context' })).toThrow(/not declared in dependsOn: extra/);
    expect(() => inputHash(fake(), { a: 1, b: 'x', extra: undefined })).not.toThrow();   // an undefined field carries nothing
  });
  it('refuses input that is not an object', () => {
    for (const bad of [null, 'text', 3, [1, 2], undefined]) expect(() => inputHash(fake(), bad)).toThrow(/must be an object/);
  });
  it('is 128 bits of hex, and the key is task id plus hash', () => {
    expect(inputHash(fake(), { a: 1, b: 2 })).toMatch(/^[0-9a-f]{32}$/);
    expect(aiKey(fake(), { a: 1, b: 2 })).toBe(`fake:${inputHash(fake(), { a: 1, b: 2 })}`);
  });
});

describe('the Idea Brief hash', () => {
  const input = { text: 'I want to build an AI platform that helps students prepare for technical interviews.', option: 'idea' as const };
  it('covers both the founder\'s words and where they started', () => {
    const base = inputHash(ideaBriefSpec, input);
    expect(inputHash(ideaBriefSpec, { ...input, text: input.text + ' Also for teachers.' })).not.toBe(base);
    expect(inputHash(ideaBriefSpec, { ...input, option: 'problem' })).not.toBe(base);
    expect(inputHash(ideaBriefSpec, { ...input })).toBe(base);
  });
  it('is stable: stored keys must not change when the hashing code is touched', () => {
    expect(specDigest(ideaBriefSpec)).toMatchInlineSnapshot(`"4832de1afd26dda5aea64f9f3aa183c6"`);
    expect(inputHash(ideaBriefSpec, input)).toMatchInlineSnapshot(`"a2936058cb86d20d4099b21968917f47"`);
  });
});
