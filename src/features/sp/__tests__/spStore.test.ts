import { describe, expect, it } from 'vitest';
import { MemoryAdapter } from '@/services/coreStorage';
import { createSpStore, NEW_PROJECT_NAME, SP_KEY_PREFIX } from '../spStore';
import { EXAMPLE_IDEA, ideaContext, type IdeaInput } from '../idea';

const idea = (): IdeaInput => { const c = ideaContext(EXAMPLE_IDEA, 'idea'); return { option: 'idea', text: EXAMPLE_IDEA, name: 'Interview Coach', q2: c.questions[1].q, answers: { a1: 'Students', a2: 'Manually or in spreadsheets', a3: 'Venture-scale startup' } }; };
let n = 0;
const store = (a = new MemoryAdapter(), user = 'user-alex') => createSpStore(a, user, { now: () => '2026-11-03T09:00:00.000Z', newId: () => `sp-${++n}` });

describe('Solution Planning project store', () => {
  it('starts empty, creates a project, and returns the newest first', () => {
    const s = store();
    expect(s.all()).toEqual([]);
    expect(s.latest()).toBeNull();
    const a = s.create(), b = s.create('Second');
    expect(a.name).toBe(NEW_PROJECT_NAME);
    expect(s.all().map(p => p.id)).toEqual([b.id, a.id]);
    expect(s.latest()?.id).toBe(b.id);
    expect(s.byId(a.id)?.name).toBe(NEW_PROJECT_NAME);
  });
  it('keeps the founder\'s idea, and renames the project to the name they chose', () => {
    const s = store(); const p = s.create();
    const saved = s.saveIdea(p.id, idea());
    expect(saved?.name).toBe('Interview Coach');
    expect(s.byId(p.id)?.idea?.answers.a3).toBe('Venture-scale startup');
    expect(s.saveIdea('nope', idea())).toBeNull();
  });
  it('keeps each user\'s projects apart', () => {
    const a = new MemoryAdapter();
    const alex = store(a, 'user-alex'), meera = store(a, 'user-meera');
    alex.create();
    expect(meera.all()).toEqual([]);
  });
  it('removes a project', () => {
    const s = store(); const p = s.create(); s.remove(p.id);
    expect(s.all()).toEqual([]);
  });
  it('keeps an unreadable store aside instead of overwriting it, and starts fresh', () => {
    const a = new MemoryAdapter(); a.set(`${SP_KEY_PREFIX}user-alex`, '{not json');
    const s = store(a);
    expect(s.all()).toEqual([]);
    expect(a.keys(`${SP_KEY_PREFIX}user-alex:corrupt:`)).toHaveLength(1);
    expect(s.create().id).toBeTruthy();
  });
  it('ignores records it cannot use and tolerates blocked storage', () => {
    const a = new MemoryAdapter(); a.set(`${SP_KEY_PREFIX}user-alex`, JSON.stringify({ projects: [{ id: 'x', name: 'Ok' }, { nope: 1 }] }));
    expect(store(a).all().map(p => p.id)).toEqual(['x']);
    const blocked = new MemoryAdapter(); blocked.failWrites = true;
    expect(() => store(blocked).create()).not.toThrow();
  });
});
