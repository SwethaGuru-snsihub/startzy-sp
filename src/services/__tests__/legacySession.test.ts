import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { B, LOC, S, completeTask, mutate, setSpeed, startBlock } from '@/engine/engine';
import { MemoryAdapter } from '../coreStorage';
import { LEGACY_KEY_PREFIX, capture, createLegacySessionHost, createLegacyStore, quiesce, restore, type SessionProject } from '../legacySession';

const A: SessionProject = { id: 'proj-a', name: 'Alpha Co', pitch: 'Alpha pitch', template: 'veejay' };
const Bp: SessionProject = { id: 'proj-b', name: 'Beta Co', pitch: 'Beta pitch', template: 'meera' };
const mk = () => {
  const adapter = new MemoryAdapter();
  const store = createLegacyStore(adapter);
  const syncs: string[] = [];
  return { adapter, store, syncs, host: createLegacySessionHost({ store, onSync: id => syncs.push(id) }) };
};
/** The founder's first three tasks, so the first agent block can run. */
function doBrief() {
  completeTask('profile');
  mutate(s => { s.idea = s.idea.trim(); });
  completeTask('goal');
  mutate(s => { s.answers = ['a', 'b', 'c']; });
  completeTask('clarify');
}
const approved = () => Object.keys(B).filter(id => B[id].st === 'approved').sort();

beforeEach(() => { setSpeed(100); });
afterEach(async () => { await quiesce(); setSpeed(1); (S as { started?: boolean }).started = false; });

describe('Founder HQ session per project', () => {
  it('starts a new project fresh, with its own idea, on the journey template for its type', async () => {
    const { host } = mk();
    expect(await host.activate(A)).toMatchObject({ ok: true, fresh: true });
    expect(S.started).toBe(true);
    expect(S.idea).toBe('Alpha Co'); expect(S.pitch).toBe('Alpha pitch');
    expect(approved()).toEqual([]);
    expect(host.owner()).toBe('proj-a');
  });

  it('keeps two projects apart and brings each back exactly as it was left', async () => {
    const { host, store } = mk();
    await host.activate(A);
    doBrief();
    const aApproved = approved(), aLog = S.log.length;
    expect(aApproved).toEqual(['clarify', 'goal', 'profile']);

    expect(await host.activate(Bp)).toMatchObject({ ok: true, fresh: true });
    expect(S.idea).toBe('Beta Co');
    expect(approved()).toEqual([]);                      // nothing of Alpha is visible in Beta
    completeTask('profile');
    expect(approved()).toEqual(['profile']);

    await host.activate(A);
    expect(approved()).toEqual(aApproved);
    expect(S.log.length).toBe(aLog);
    expect(S.idea).toBe('Alpha Co');
    expect(store.load('proj-b').snapshot!.B.profile.st).toBe('approved');
    await host.activate(Bp);
    expect(approved()).toEqual(['profile']);
  });

  it('never lets work started in one project land in another when switching mid-run', async () => {
    const { host, store } = mk();
    await host.activate(A);
    doBrief();
    startBlock('brief');                                  // an agent is now drafting in Alpha
    expect(['building', 'review', 'approving']).toContain(B.brief.st);
    const switched = await host.activate(Bp);             // waits for the run to finish before switching
    expect(switched).toMatchObject({ ok: true });
    expect(['approved', 'inbox']).toContain(store.load('proj-a').snapshot!.B.brief.st);   // finished and saved in Alpha
    await new Promise(r => setTimeout(r, 400));          // any stray timer would have fired by now
    expect(approved()).toEqual([]);                      // Beta untouched
    expect(Object.values(B).every(b => b.st === 'idle')).toBe(true);
    expect(Object.keys(LOC)).toEqual([]);
  });

  it('resumes an agent that was mid-run when the page closed', async () => {
    const { host } = mk();
    await host.activate(A);
    doBrief();
    startBlock('brief');
    await new Promise(r => setTimeout(r, 30));
    const midRun = capture('veejay');
    expect(['building', 'review', 'approving']).toContain(midRun.B.brief.st);
    await quiesce();                                      // let the live run end before simulating a reload
    restore(midRun);
    expect(await quiesce()).toBe(true);
    expect(['approved', 'inbox']).toContain(B.brief.st);
    expect(approved()).toEqual(expect.arrayContaining(['profile', 'goal', 'clarify']));
  });

  it('saves while the project is open and records each save for the core bridge', async () => {
    const { host, store, syncs } = mk();
    await host.activate(A);
    completeTask('profile');
    await new Promise(r => setTimeout(r, 400));
    expect(store.load('proj-a').snapshot!.B.profile.st).toBe('approved');
    expect(syncs.filter(s => s === 'proj-a').length).toBeGreaterThan(0);
  });

  it('leaving a project saves it and clears the engine, so the demo never shows a project', async () => {
    const { host, store } = mk();
    await host.activate(A);
    completeTask('profile');
    expect(await host.release()).toBe(true);
    expect(S.started).toBe(false);
    expect(host.owner()).toBeNull();
    expect(store.load('proj-a').snapshot!.B.profile.st).toBe('approved');
  });

  it('keeps an unreadable saved copy aside and starts the project again', async () => {
    const { host, adapter } = mk();
    adapter.set(`${LEGACY_KEY_PREFIX}proj-a`, '{broken');
    expect(await host.activate(A)).toMatchObject({ ok: true, fresh: true, recovered: true });
    expect(adapter.keys(`${LEGACY_KEY_PREFIX}corrupt:`)).toHaveLength(1);
  });

  it('serializes quick successive opens so they cannot interleave', async () => {
    const { host } = mk();
    const r = await Promise.all([host.activate(A), host.activate(Bp), host.activate(A)]);
    expect(r.every(x => x.ok)).toBe(true);
    expect(host.owner()).toBe('proj-a');
    expect(S.idea).toBe('Alpha Co');
  });
});
