import { describe, expect, it } from 'vitest';
import { steppedClock } from '@/engine/core/project';
import { TASK } from '@/engine/core/register';
import { createCoreRuntime } from '@/services/coreRuntime';
import { createCoreStorage, MemoryAdapter } from '@/services/coreStorage';
import { approve, saveDocEdit, startProject, type Env } from '../actions';
import { createDocStore } from '../docStore';
import { EXAMPLE_IDEA, ideaContext, type IdeaInput } from '../idea';
import { createRunner } from '../runner';
import { EPIC1_STEPS, epic1Rows, epic1Statuses, featureStatus, stepsOfFeature } from '../spec/epic1';
import { epicOf } from '../spec';
import { taskStatus, type TaskStatus } from '../viewModel';
import { SP1_FEATURES } from '../workflow';

const ids = EPIC1_STEPS.map(s => s.id);
const st = (goal: TaskStatus, clarify: TaskStatus, brief: TaskStatus) => epic1Statuses({ goal, clarify, brief });
const row = (r: Record<string, TaskStatus>) => ids.map(i => r[i]);

describe('the mapping of the 11 sheet tasks', () => {
  it('covers every task of epic 1 once, in order', () => {
    expect(ids).toEqual(epicOf(1).tasks.map(t => t.id));
  });
  it('puts each task in one of the four features, in feature order, on a real engine task', () => {
    const order = SP1_FEATURES.map(f => f.id);
    const at = EPIC1_STEPS.map(s => order.indexOf(s.feature));
    expect(at.every(i => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    for (const f of order) expect(stepsOfFeature(f).length, f).toBeGreaterThan(0);
    for (const s of EPIC1_STEPS) expect(TASK[s.engineTask], s.id).toBeDefined();
    for (const f of SP1_FEATURES) for (const s of stepsOfFeature(f.id)) expect(['goal', 'clarify', 'brief']).toContain(s.engineTask);
  });
  it('marks the steps the engine does not have as UI only: classify, allocate, extract, questions, CEO sign-off', () => {
    expect(EPIC1_STEPS.filter(s => s.backing === 'ui').map(s => s.id)).toEqual(['1.T2', '1.T3', '1.T4', '1.T5', '1.T9']);
  });
});

describe('deriving the 11 statuses from the three engine tasks', () => {
  it('waits for everything before the founder has given the idea', () => {
    expect(row(st('blocked', 'blocked', 'blocked'))).toEqual(Array(11).fill('blocked'));
  });
  it('asks the founder for the idea first', () => {
    expect(row(st('needs', 'blocked', 'blocked'))).toEqual(['needs', ...Array(10).fill('blocked')]);
  });
  it('finishes the idea, extraction and the questions together, and gets the draft ready', () => {
    expect(row(st('done', 'done', 'ready'))).toEqual(['done', 'done', 'done', 'done', 'done', 'done', 'ready', 'blocked', 'blocked', 'blocked', 'blocked']);
  });
  it('follows the brief through drafting, review, sign-off, the founder\'s confirmation and the lock', () => {
    expect(st('done', 'done', 'working')['1.T7']).toBe('working');
    expect(row(st('done', 'done', 'review')).slice(6)).toEqual(['done', 'review', 'blocked', 'blocked', 'blocked']);
    expect(row(st('done', 'done', 'needs')).slice(6)).toEqual(['done', 'done', 'done', 'needs', 'blocked']);
    expect(row(st('done', 'done', 'done'))).toEqual(Array(11).fill('done'));
  });
  it('marks the brief steps for a re-check when the brief is stale, and does not lock', () => {
    expect(row(st('done', 'done', 'recheck')).slice(6)).toEqual(['recheck', 'recheck', 'recheck', 'recheck', 'blocked']);
    expect(row(st('done', 'done', 'reconfirm'))[9]).toBe('recheck');
  });
  it('marks the questions and extraction for a re-check when the clarifying answers are stale', () => {
    const r = st('done', 'recheck', 'recheck');
    expect(r['1.T6']).toBe('recheck');
    expect(r['1.T4']).toBe('done');
  });
  it('never shows a step after an unfinished one as done within its feature', () => {
    const all: TaskStatus[] = ['blocked', 'ready', 'working', 'review', 'needs', 'done', 'recheck'];
    for (const g of all) for (const c of all) for (const b of all) {
      const r = st(g, c, b);
      for (const f of SP1_FEATURES) {
        const seq = stepsOfFeature(f.id).map(s => r[s.id]);
        const firstOpen = seq.findIndex(x => x !== 'done');
        if (firstOpen >= 0) expect(seq.slice(firstOpen + 1).includes('done'), `${g}/${c}/${b} ${f.id}`).toBe(false);
      }
    }
  });
  it('summarises a feature as done only when all its steps are done', () => {
    expect(featureStatus('brief', st('done', 'done', 'needs'))).toBe('needs');
    expect(featureStatus('brief', st('done', 'done', 'done'))).toBe('done');
    expect(featureStatus('capture', st('done', 'done', 'ready'))).toBe('done');
  });
});

const makeIdea = (): IdeaInput => {
  const c = ideaContext(EXAMPLE_IDEA, 'idea');
  return { option: 'idea', text: EXAMPLE_IDEA, name: 'Interview Coach', q2: c.questions[1].q, answers: { a1: 'Students', a2: 'Manually or in spreadsheets', a3: 'Venture-scale startup' } };
};

describe('against the real project', () => {
  function setup() {
    const rt = createCoreRuntime({ storage: createCoreStorage(new MemoryAdapter()), clock: steppedClock('2026-11-06T09:00:00.000Z') });
    rt.ensure({ id: 'e1', name: 'New project', pitch: '' });
    const docs = createDocStore(new MemoryAdapter(), 'e1', () => '2026-11-06T09:00:00.000Z');
    let idea: IdeaInput | null = null;
    const env: Env = { rt, id: 'e1', docs, idea: () => idea, setIdea: i => { idea = i; } };
    const runner = createRunner({ rt, id: 'e1', docs, idea: () => idea });
    const project = () => { const e = rt.getEntry('e1'); if (!e || e.status !== 'ready') throw new Error('not ready'); return e.project; };
    const eng = () => { const ctx = { takenUp: docs.takenUp(), rechecks: docs.rechecks() }; return { goal: taskStatus(rt.core, project(), 'goal', ctx), clarify: taskStatus(rt.core, project(), 'clarify', ctx), brief: taskStatus(rt.core, project(), 'brief', ctx) }; };
    const until = (cond: () => boolean) => { for (let i = 0; i < 400 && !cond(); i++) runner.tick(250); if (!cond()) throw new Error('timed out'); };
    return { env, docs, eng, until };
  }
  it('walks from nothing to a locked brief without ever disagreeing with the core', () => {
    const o = setup();
    expect(row(epic1Statuses(o.eng())).every(s => s === 'blocked' || s === 'needs')).toBe(true);
    expect(startProject(o.env, makeIdea())).toBeNull();
    expect(epic1Statuses(o.eng())['1.T6']).toBe('done');
    const seen = new Set<string>();
    o.until(() => { seen.add(epic1Statuses(o.eng())['1.T7']); return o.eng().brief === 'needs'; });
    expect([...seen]).toEqual(expect.arrayContaining(['ready', 'working', 'done']));
    expect(epic1Statuses(o.eng())['1.T10']).toBe('needs');
    expect(approve(o.env, 'brief')).toBeNull();
    expect(row(epic1Statuses(o.eng()))).toEqual(Array(11).fill('done'));
  });
  it('flags the brief steps for a re-check when the answers are edited after approval', () => {
    const o = setup(); startProject(o.env, makeIdea());
    o.until(() => o.eng().brief === 'needs'); approve(o.env, 'brief');
    const secs = o.docs.latest('clarify')!.secs.map(s => (s.h === 'Who it is for' ? { ...s, b: 'Working professionals' } : s));
    expect(saveDocEdit(o.env, 'clarify', secs, 'Edited')).toBeNull();
    const r = epic1Statuses(o.eng());
    expect(r['1.T10']).toBe('recheck');
    expect(r['1.T11']).toBe('blocked');
  });
});

describe('the rows a timeline shows', () => {
  it('lists the steps of a feature with the sheet\'s wording, who does them and whether they are simulated', () => {
    const r = epic1Rows('brief', st('done', 'done', 'needs'));
    expect(r.map(x => x.label)).toEqual(['T7', 'T8', 'T9', 'T10', 'T11']);
    expect(r[0]).toMatchObject({ id: '1.T7', title: 'Idea Brief Draft', status: 'done', simulatedStep: false });
    expect(r[2]).toMatchObject({ title: 'Strategically Approved Brief', simulatedStep: true });
    expect(r[3]).toMatchObject({ title: 'User-Confirmed Idea Brief', status: 'needs' });
    expect(r.every(x => x.responsible && x.process)).toBe(true);
  });
  it('covers all 11 steps across the four features', () => {
    expect(SP1_FEATURES.flatMap(f => epic1Rows(f.id, st('blocked', 'blocked', 'blocked'))).map(x => x.id)).toEqual(ids);
  });
});
