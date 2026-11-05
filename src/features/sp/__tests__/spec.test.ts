import { describe, expect, it } from 'vitest';
import { epicOf, SPEC, taskOf } from '../spec';
import { SP1_FEATURES } from '../workflow';

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '');

describe('the parsed epic spec', () => {
  it('has the 27 epics in order, with Problem Discovery second and Opportunity third', () => {
    expect(SPEC.epics.map(e => e.epic)).toEqual(Array.from({ length: 27 }, (_, i) => i + 1));
    expect(epicOf(2).name).toBe('Problem Discovery & Validation');
    expect(epicOf(3).name).toBe('Opportunity, Market & Customer Discovery');
    expect(epicOf(2).sheetEpic).toBe(3);
    expect(epicOf(3).sheetEpic).toBe(2);
  });
  it('keeps every task id unique and prefixed with its own epic number', () => {
    const ids = SPEC.epics.flatMap(e => e.tasks.map(t => t.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of SPEC.epics) for (const t of e.tasks) expect(t.id.startsWith(`${e.epic}.`), t.id).toBe(true);
  });
  it('counts what the sheet export held, so a re-export that loses rows is caught', () => {
    expect(SPEC.epics.reduce((n, e) => n + e.tasks.length, 0)).toBe(250);
    expect(SPEC.epics.reduce((n, e) => n + e.slots.length, 0)).toBe(147);
    expect(SPEC.epics.reduce((n, e) => n + e.features.length, 0)).toBe(271);
  });
  it('finds a task by id', () => {
    expect(taskOf('2.T1')?.responsible).toContain('CSO');
    expect(taskOf('nope')).toBeUndefined();
  });
});

describe('epic 1, Idea Understanding & Brief', () => {
  const e = epicOf(1);
  it('has 11 tasks in order, five slots and the four features the Workflow tab shows', () => {
    expect(e.tasks.map(t => t.id)).toEqual(Array.from({ length: 11 }, (_, i) => `1.T${i + 1}`));
    expect(e.slots.map(s => s.slot)).toEqual(['idea', 'problem', 'target_users', 'expected_outcome', 'constraints']);
    expect(e.features.map(norm)).toEqual(SP1_FEATURES.map(f => norm(f.name)));
  });
  it('gives every slot an owner', () => {
    for (const s of e.slots) expect(s.owner, s.slot).not.toBe('');
  });
});
