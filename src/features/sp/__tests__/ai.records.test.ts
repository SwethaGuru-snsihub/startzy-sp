import { describe, expect, it, vi } from 'vitest';
import { MemoryAdapter } from '@/services/coreStorage';
import { cleanRecords, isAiRecord, MAX_RECORDS_PER_TASK, pruneRecords, type AiRecord } from '../ai/records';
import { createDocStore, DOC_KEY_PREFIX } from '../docStore';

const rec = (over: Partial<AiRecord> = {}): AiRecord => ({
  key: 'research:aaa', task: 'research', status: 'ready', requestId: 'r1', attempts: 1, requestedAt: '2026-11-10T10:00:00.000Z',
  value: { facts: [] }, provider: 'claude-cli', settledAt: '2026-11-10T10:00:20.000Z', ...over,
});
const pending = (over: Partial<AiRecord> = {}): AiRecord => rec({ status: 'pending', value: undefined, provider: undefined, settledAt: undefined, session: 's1', heartbeatAt: '2026-11-10T10:00:00.000Z', deadline: '2026-11-10T10:03:20.000Z', ...over });
const seed = (data: unknown, id = 'p1') => { const a = new MemoryAdapter(); a.set(`${DOC_KEY_PREFIX}${id}`, JSON.stringify(data)); return a; };
const stored = (a: MemoryAdapter, id = 'p1') => JSON.parse(a.get(`${DOC_KEY_PREFIX}${id}`)!);

describe('what counts as an AI record', () => {
  it('accepts a ready, a pending and a failed record', () => {
    expect(isAiRecord(rec())).toBe(true);
    expect(isAiRecord(pending())).toBe(true);
    expect(isAiRecord(rec({ status: 'failed', value: undefined, provider: undefined, error: 'busy', retryable: true }))).toBe(true);
    expect(isAiRecord(rec({ provider: 'simulated', fallback: { from: 'claude-cli', reason: 'Claude took too long to answer' } }))).toBe(true);
  });
  it.each([
    ['null', null], ['a string', 'x'], ['an array', []],
    ['no key', { ...rec(), key: undefined }], ['a key that is not the task\'s', rec({ key: 'other:aaa' })],
    ['an unknown status', rec({ status: 'done' as never })], ['no request id', { ...rec(), requestId: undefined }],
    ['negative attempts', rec({ attempts: -1 })], ['fractional attempts', rec({ attempts: 1.5 })],
    ['an unknown provider', rec({ provider: 'gpt' as never })],
    ['ready without a value', rec({ value: undefined })], ['ready without a provider', rec({ provider: undefined })],
    ['a malformed fallback', rec({ fallback: { from: 'nope', reason: 'x' } as never })],
  ])('rejects %s', (_n, x) => { expect(isAiRecord(x)).toBe(false); });
  it('keeps only valid records filed under their own key, and treats a missing or malformed bucket as empty', () => {
    expect(cleanRecords(undefined)).toEqual({});
    expect(cleanRecords(null)).toEqual({});
    expect(cleanRecords([rec()])).toEqual({});
    expect(cleanRecords('x')).toEqual({});
    expect(Object.keys(cleanRecords({ 'research:aaa': rec(), 'research:bbb': rec({ key: 'research:aaa' }), 'research:ccc': { nope: 1 } }))).toEqual(['research:aaa']);
  });
});

describe('keeping the store small', () => {
  it('keeps the newest few records of a task and leaves other tasks alone', () => {
    const all: Record<string, AiRecord> = {};
    for (const [i, t] of ['09', '10', '11', '12'].entries()) all[`research:k${i}`] = rec({ key: `research:k${i}`, requestedAt: `2026-11-10T${t}:00:00.000Z` });
    all['market:m0'] = rec({ key: 'market:m0', task: 'market' });
    const out = pruneRecords(all);
    expect(Object.keys(out).sort()).toEqual(['market:m0', 'research:k2', 'research:k3']);
    expect(MAX_RECORDS_PER_TASK).toBe(2);
  });
  it('never drops a pending record, however old', () => {
    const all = {
      'research:old': pending({ key: 'research:old', requestedAt: '2026-01-01T00:00:00.000Z' }),
      'research:a': rec({ key: 'research:a', requestedAt: '2026-11-10T09:00:00.000Z' }),
      'research:b': rec({ key: 'research:b', requestedAt: '2026-11-10T10:00:00.000Z' }),
      'research:c': rec({ key: 'research:c', requestedAt: '2026-11-10T11:00:00.000Z' }),
    };
    expect(Object.keys(pruneRecords(all)).sort()).toEqual(['research:c', 'research:old']);   // the pending one uses one of the two places
  });
});

describe('AI records in the document store', () => {
  it('starts empty, saves a record, and finds it by key and by task', () => {
    const s = createDocStore(new MemoryAdapter(), 'p1');
    expect(s.aiRecords()).toEqual([]);
    expect(s.putAi(rec())).toBe(true);
    expect(s.aiRecord('research:aaa')).toEqual(rec());
    expect(s.aiRecord('research:nope')).toBeNull();
    s.putAi(rec({ key: 'market:m', task: 'market' }));
    expect(s.aiRecords('market').map(r => r.key)).toEqual(['market:m']);
    expect(s.aiRecords()).toHaveLength(2);
  });
  it('survives a reload', () => {
    const a = new MemoryAdapter();
    createDocStore(a, 'p1').putAi(rec());
    expect(createDocStore(a, 'p1').aiRecord('research:aaa')).toEqual(rec());
  });
  it('saves only when the check on the record in storage passes, so a late answer cannot replace a newer request', () => {
    const s = createDocStore(new MemoryAdapter(), 'p1');
    s.putAi(pending({ requestId: 'new' }));
    expect(s.putAi(rec({ requestId: 'old' }), cur => cur?.requestId === 'old')).toBe(false);
    expect(s.aiRecord('research:aaa')?.status).toBe('pending');
    expect(s.putAi(rec({ requestId: 'new' }), cur => cur?.requestId === 'new')).toBe(true);
    expect(s.aiRecord('research:aaa')?.status).toBe('ready');
    expect(s.putAi(rec({ key: 'research:zzz' }), cur => cur === null)).toBe(true);     // "only if nobody has it yet"
    expect(s.putAi(rec({ key: 'research:zzz' }), cur => cur === null)).toBe(false);
  });
  it('removes a record, and tells the screens about every change', () => {
    const s = createDocStore(new MemoryAdapter(), 'p1');
    const heard = vi.fn();
    s.subscribe(heard);
    const v0 = s.getVersion();
    s.putAi(rec());
    s.removeAi('research:aaa');
    expect(s.aiRecord('research:aaa')).toBeNull();
    expect(heard).toHaveBeenCalledTimes(2);
    expect(s.getVersion()).toBe(v0 + 2);
    s.removeAi('research:aaa');                       // nothing to remove: no noise
    expect(heard).toHaveBeenCalledTimes(2);
  });
  it('prunes old settled records as new ones arrive', () => {
    const s = createDocStore(new MemoryAdapter(), 'p1');
    for (const h of ['09', '10', '11']) s.putAi(rec({ key: `research:h${h}`, requestedAt: `2026-11-10T${h}:00:00.000Z` }));
    expect(s.aiRecords('research').map(r => r.key).sort()).toEqual(['research:h10', 'research:h11']);
  });
  it('records on a document version which AI request it came from and whether it is a fallback', () => {
    const s = createDocStore(new MemoryAdapter(), 'p1');
    const v = s.add('research', { by: 'Asha (simulated)', note: 'First draft', secs: [], provider: 'simulated', aiKey: 'research:aaa', fallback: { from: 'claude-cli', reason: 'Claude took too long to answer' } });
    expect(v).toMatchObject({ provider: 'simulated', aiKey: 'research:aaa', fallback: { from: 'claude-cli', reason: 'Claude took too long to answer' } });
    expect(s.latest('research')).toEqual(v);
    expect(s.add('brief', { by: 'x', note: 'n', secs: [] })).not.toHaveProperty('aiKey');
  });
});

describe('stored projects from before AI records existed', () => {
  const OLD = {
    docs: { goal: [{ v: 1, by: 'You', note: 'Entered by you', at: '2026-11-03T09:00:00.000Z', secs: [{ h: 'Idea', b: 'x' }] }], brief: [{ v: 1, by: 'Asha (Claude CLI)', note: 'First draft', at: '2026-11-03T09:05:00.000Z', secs: [{ h: 'Summary (Claude)', b: 's' }], provider: 'claude-cli' }] },
    notes: { brief: 'make it shorter' }, takenUp: ['market'], rechecks: ['problem'],
  };
  it('load unchanged, with an empty AI bucket', () => {
    const s = createDocStore(seed(OLD), 'p1');
    expect(s.latest('goal')?.secs[0].b).toBe('x');
    expect(s.latest('brief')).toMatchObject({ provider: 'claude-cli', by: 'Asha (Claude CLI)' });
    expect(s.takenUp()).toEqual(['market']);
    expect(s.rechecks()).toEqual(['problem']);
    expect(s.takeNote('brief')).toBe('make it shorter');
    expect(s.aiRecords()).toEqual([]);
  });
  it('keep everything they had when the first AI record is written', () => {
    const a = seed(OLD);
    createDocStore(a, 'p1').putAi(rec());
    const d = stored(a);
    expect(d.docs.goal).toEqual(OLD.docs.goal);
    expect(d.docs.brief).toEqual(OLD.docs.brief);
    expect(d.takenUp).toEqual(['market']);
    expect(Object.keys(d.ai)).toEqual(['research:aaa']);
  });
  it('are still readable by the code that did not know about AI records (rolling back)', () => {
    const a = seed(OLD);
    createDocStore(a, 'p1').putAi(rec());
    // the shape check the previous version of the store applied to what it read
    const d = stored(a);
    const readableBefore = d && typeof d.docs === 'object' && d.docs !== null && Array.isArray(d.takenUp) && Array.isArray(d.rechecks) && typeof d.notes === 'object' && d.notes !== null && Object.values(d.docs).every(Array.isArray);
    expect(readableBefore).toBe(true);
  });
  it('ignore a damaged AI bucket instead of failing to load', () => {
    for (const ai of ['junk', 5, [1, 2], { 'research:x': { nope: true } }, null]) {
      const s = createDocStore(seed({ ...OLD, ai }), 'p1');
      expect(s.aiRecords()).toEqual([]);
      expect(s.latest('goal')).not.toBeNull();
    }
  });
  it('keep fields a newer version added, as unknown top-level keys survive a write', () => {
    const a = seed({ ...OLD, futureThing: { x: 1 } });
    createDocStore(a, 'p1').putAi(rec());
    expect(stored(a).futureThing).toEqual({ x: 1 });
  });
});

describe('two tabs working on the same project', () => {
  it('do not overwrite each other: every change starts from what storage holds now', () => {
    const a = new MemoryAdapter();
    const tabA = createDocStore(a, 'p1'), tabB = createDocStore(a, 'p1');
    tabA.latest('goal'); tabB.latest('goal');                        // both have loaded their (empty) copy
    tabA.add('goal', { by: 'You', note: 'n', secs: [{ h: 'Idea', b: 'x' }] });
    tabB.putAi(rec());                                                 // tab B still holds the old copy in memory
    tabA.takeUp('market');
    const d = stored(a);
    expect(d.docs.goal).toHaveLength(1);
    expect(Object.keys(d.ai)).toEqual(['research:aaa']);
    expect(d.takenUp).toEqual(['market']);
  });
  it('see each other\'s changes after refresh(), which also tells the screens', () => {
    const a = new MemoryAdapter();
    const tabA = createDocStore(a, 'p1'), tabB = createDocStore(a, 'p1');
    expect(tabB.aiRecords()).toEqual([]);
    tabA.putAi(rec());
    expect(tabB.aiRecords()).toEqual([]);                              // not yet: tab B has not been told
    const heard = vi.fn();
    tabB.subscribe(heard);
    tabB.refresh();
    expect(tabB.aiRecords()).toHaveLength(1);
    expect(heard).toHaveBeenCalledTimes(1);
  });
  it('exposes the storage key so the browser can match a storage event to this store', () => {
    expect(createDocStore(new MemoryAdapter(), 'abc').storageKey).toBe(`${DOC_KEY_PREFIX}abc`);
  });
});
