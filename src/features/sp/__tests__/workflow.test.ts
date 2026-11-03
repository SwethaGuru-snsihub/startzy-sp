import { describe, expect, it } from 'vitest';
import { steppedClock } from '@/engine/core/project';
import { createCoreRuntime } from '@/services/coreRuntime';
import { createCoreStorage, MemoryAdapter } from '@/services/coreStorage';
import { approve, approveRecheck, saveDocEdit, startProject, type Env } from '../actions';
import { createDocStore } from '../docStore';
import { EXAMPLE_IDEA, ideaContext, type IdeaInput } from '../idea';
import { createRunner } from '../runner';
import { discoverRows, activity, taskStatus } from '../viewModel';
import { genSections } from '../content';
import { defaultItem, detect, doneIn, FEATURES_OF_TASK, highlight, itemStatuses, ITEMS, questionsOf, SP1_FEATURES, STEPS, stepStates } from '../workflow';

const makeIdea = (): IdeaInput => {
  const c = ideaContext(EXAMPLE_IDEA, 'idea');
  return { option: 'idea', text: EXAMPLE_IDEA, name: 'Interview Coach', q2: c.questions[1].q, answers: { a1: 'Students', a2: 'Manually or in spreadsheets', a3: 'Venture-scale startup' } };
};
function setup(start = true) {
  const rt = createCoreRuntime({ storage: createCoreStorage(new MemoryAdapter()), clock: steppedClock('2026-11-03T09:00:00.000Z') });
  rt.ensure({ id: 'sp-w', name: 'New project', pitch: '' });
  const docs = createDocStore(new MemoryAdapter(), 'sp-w', () => '2026-11-03T09:00:00.000Z');
  let idea: IdeaInput | null = null;
  const env: Env = { rt, id: 'sp-w', docs, idea: () => idea, setIdea: i => { idea = i; } };
  const runner = createRunner({ rt, id: 'sp-w', docs, idea: () => idea });
  if (start) expect(startProject(env, makeIdea())).toBeNull();
  const project = () => { const e = rt.getEntry('sp-w'); if (!e || e.status !== 'ready') throw new Error('not ready'); return e.project; };
  const status = () => itemStatuses(rt.core, project(), { takenUp: docs.takenUp(), rechecks: docs.rechecks() });
  const until = (cond: () => boolean) => { for (let i = 0; i < 400 && !cond(); i++) runner.tick(250); if (!cond()) throw new Error('timed out'); };
  return { rt, docs, env, runner, status, until, project, idea: () => idea };
}

describe('the four features of Idea Definition', () => {
  it('are the ones in the epic list, in the order they run', () => {
    expect(SP1_FEATURES.map(f => f.name)).toEqual(['Idea Capture', 'Key fields Extraction / intent detection', 'Targeted Clarifying Questions', 'Idea Brief Review & Confirmation']);
    expect(new Set(SP1_FEATURES.map(f => f.id)).size).toBe(4);
  });
});

describe('where each feature stands, from the real project', () => {
  it('waits for the founder before they have given the idea', () => {
    const o = setup(false);
    expect(o.status()).toMatchObject({ capture: 'blocked', extract: 'blocked', clarify: 'blocked', brief: 'blocked' });
    expect(doneIn(STEPS[0], o.status())).toBe(0);
    expect(defaultItem(o.status())).toBe('capture');
  });
  it('finishes capture, key fields and the questions at the start, and gets the brief ready', () => {
    const o = setup();
    expect(o.status()).toMatchObject({ capture: 'done', extract: 'done', clarify: 'done', brief: 'ready' });
    expect(doneIn(STEPS[0], o.status())).toBe(3);
    expect(defaultItem(o.status())).toBe('brief');
  });
  it('follows the brief through working, review, the founder\'s turn and confirmation', () => {
    const o = setup(); const seen: string[] = [];
    o.until(() => { seen.push(o.status().brief); return o.status().brief === 'needs'; });
    expect(seen).toEqual(expect.arrayContaining(['ready', 'working', 'review', 'needs']));
    expect(defaultItem(o.status())).toBe('brief');
    expect(approve(o.env, 'brief')).toBeNull();
    expect(o.status().brief).toBe('done');
    expect(doneIn(STEPS[0], o.status())).toBe(4);
  });
  it('flags the brief for a re-check when the clarifying answers are edited, and clears it after the re-check', () => {
    const o = setup();
    o.until(() => o.status().brief === 'needs'); approve(o.env, 'brief');
    const secs = o.docs.latest('clarify')!.secs.map(s => (s.h === 'Who it is for' ? { ...s, b: 'Working professionals' } : s));
    expect(saveDocEdit(o.env, 'clarify', secs, 'Edited answers')).toBeNull();
    expect(o.status()).toMatchObject({ clarify: 'done', brief: 'recheck' });
    expect(defaultItem(o.status())).toBe('brief');
    o.runner.tick(30000);
    expect(o.status().brief).toBe('recheck');   // nothing re-runs until the founder approves
    expect(approveRecheck(o.env)).toBeGreaterThan(0);
    expect(o.status().brief).toBe('ready');
    o.until(() => o.status().brief === 'needs');
    expect(o.docs.latest('brief')?.secs.find(s => s.h === 'Who it is for')?.b).toBe('Working professionals');
    approve(o.env, 'brief');
    expect(o.status().brief).toBe('done');
  });
});

describe('what was detected in the idea', () => {
  it('finds who it is for, what it does and the topic, and marks them in the sentence', () => {
    const d = detect(makeIdea());
    expect([d.who, d.doing, d.topic, d.start]).toEqual(['students', 'prepare for technical interviews', 'Interview Prep', 'I have an idea']);
    expect(d.segments.map(s => s.kind ?? '-')).toEqual(['-', 'who', '-', 'doing', '-']);
    expect(d.segments.map(s => s.t).join('')).toBe(EXAMPLE_IDEA);
    expect(d.segments.find(s => s.kind === 'who')?.t).toBe('students');
  });
  it('never loses or reorders the sentence, whatever is found', () => {
    for (const [text, who, doing] of [['Nothing to find here.', 'students', 'x y z'], ['A tool for Students to prepare', 'students', 'prepare'], ['same same', 'same', 'same same'], ['', 'a', 'b']] as const) {
      expect(highlight(text, who, doing).map(s => s.t).join(''), text).toBe(text);
    }
    expect(highlight('Nothing to find here.', 'students', 'x y z')).toEqual([{ t: 'Nothing to find here.' }]);
    expect(highlight('A tool for Students to prepare', 'students', 'prepare').map(s => s.kind ?? '-')).toEqual(['-', 'who', '-', 'doing']);
  });
  it('asks the three questions the idea leaves open, and shows the answers in the same order', () => {
    const qs = questionsOf(makeIdea());
    expect(qs).toHaveLength(3);
    expect(qs[0].q).toContain('students');
    expect(qs[2].options).toContain('Venture-scale startup');
  });
});

describe('every tab reads the same state', () => {
  const ctx = (o: ReturnType<typeof setup>) => ({ takenUp: o.docs.takenUp(), rechecks: o.docs.rechecks() });
  it('lists SP2, SP3 and Gate 1 with their real tasks, and gives each the status the office shows', () => {
    const o = setup(); o.until(() => o.status().brief === 'needs'); approve(o.env, 'brief'); o.runner.tick(4000);
    const s = o.status(), rows = discoverRows(o.rt.core, o.project(), ctx(o));
    expect(STEPS.map(x => x.id)).toEqual(['SP1', 'SP2', 'SP3', 'gate1']);
    for (const i of ITEMS.filter(x => x.kind === 'task')) expect(s[i.key], i.key).toBe(rows.find(r => r.id === i.task)!.status);
    expect(Object.keys(s)).toHaveLength(ITEMS.length);
  });
  it('shows a step as started as soon as the office has started it', () => {
    const o = setup(); o.until(() => o.status().brief === 'needs'); approve(o.env, 'brief');
    o.until(() => stepStates(o.rt.core, o.project()).SP2 === 'in-progress');
    expect(['ready', 'working', 'review', 'needs']).toContain(o.status().research);
    expect(stepStates(o.rt.core, o.project()).SP1).toBe('done');
  });
  it('counts a step done in the Workflow tab when the engine says the step is complete', () => {
    const o = setup(); o.until(() => o.status().brief === 'needs'); approve(o.env, 'brief');
    const by = Object.fromEntries(o.rt.core.workflowProgress(o.project(), 'SP').steps.map(x => [x.id, x.status]));
    expect(by.SP1).toBe('complete'); expect(stepStates(o.rt.core, o.project()).SP1).toBe('done');
    expect(doneIn(STEPS[0], o.status())).toBe(4);
  });
  it('uses one status per task everywhere, and the same label for work in progress', () => {
    const o = setup(); o.until(() => o.status().brief === 'working');
    expect(taskStatus(o.rt.core, o.project(), 'brief', ctx(o))).toBe('working');
    expect(o.status().brief).toBe('working');
  });
  it('records that the key fields were detected, right after the idea was accepted', () => {
    const o = setup(); const feed = activity(o.project()).map(a => a.text);
    const at = feed.findIndex(t => t.includes('detected the key fields')), appr = feed.findIndex(t => /goal|idea/i.test(t) && !t.includes('detected'));
    expect(at).toBeGreaterThanOrEqual(0); expect(appr).toBeGreaterThan(at);   // newest first: the detection comes after the approval in time
  });
  it('words the clarifying questions the same in the document and the Workflow tab', () => {
    const idea = makeIdea(), secs = genSections('clarify', { idea, interviews: { n: 0, strong: 0, notes: '' } }), qs = questionsOf(idea);
    expect(secs[0].hint).toBe(qs[0].q); expect(secs[2].hint).toBe(qs[2].q); expect(secs[1].hint).toBe(idea.q2);
  });
  it('lets every Workflow feature point to its task, and each task to its features', () => {
    for (const f of SP1_FEATURES) expect(FEATURES_OF_TASK[f.task]).toContain(f.name);
  });
  it('edits the answers once and the Documentation and Workflow views both see it', () => {
    const o = setup(); o.until(() => o.status().brief === 'needs'); approve(o.env, 'brief');
    const secs = o.docs.latest('clarify')!.secs.map(s => (s.h === 'Goal' ? { ...s, b: 'Profitable small business' } : s));
    expect(saveDocEdit(o.env, 'clarify', secs, 'x')).toBeNull();
    expect(o.idea()!.answers.a3).toBe('Profitable small business');
    expect(o.docs.latest('clarify')!.secs.find(s => s.h === 'Goal')!.b).toBe('Profitable small business');
    expect(o.status().brief).toBe('recheck');
  });
});
