// The Workflow tab: every step of Discover and what is inside it, in the order it runs. SP1 Idea Definition
// lists its four features (capabilities inside the workflow's tasks); the steps whose features are not
// defined yet list their real tasks, so the tab never says a step has not started while the office is working
// on it. Every status is read from the project's core instance through the same function the office, the rail
// and Documentation use (taskStatus), so the tabs cannot disagree. Pure functions: screens and tests share them.
import type { Core } from '@/engine/core/project';
import type { Project } from '@/engine/core/types';
import { TASK } from '@/engine/core/register';
import { ideaContext, START_OPTIONS, type IdeaInput, type Question } from './idea';
import { discoverSteps, taskStatus, type StatusCtx, type TaskStatus } from './viewModel';

export type FeatureId = 'capture' | 'extract' | 'clarify' | 'brief';
export type Feature = { id: FeatureId; name: string; does: string; meta: string; task: string };

/** The four features of Idea Understanding & Brief, named as in the epic list, in the order they run. */
export const SP1_FEATURES: readonly Feature[] = [
  { id: 'capture', name: 'Idea Capture', task: 'goal', meta: 'Provided by you', does: 'Takes your idea in your own words and records where you started from.' },
  { id: 'extract', name: 'Key fields Extraction / intent detection', task: 'goal', meta: 'Asha, with BA', does: 'Reads your idea and pulls out the fields the team needs: who it is for, what it does, the topic and where you started.' },
  { id: 'clarify', name: 'Targeted Clarifying Questions', task: 'clarify', meta: 'Asha asks, you answer', does: 'Asks only what your idea leaves open, shaped by what you wrote. Your answers become the Clarification answers.' },
  { id: 'brief', name: 'Idea Brief Review & Confirmation', task: 'brief', meta: 'Asha drafts, Quinn reviews, you confirm', does: 'Asha drafts the Idea brief from your idea and answers, Quinn reviews it, and you confirm it before the problem work begins.' },
];
export const featureOf = (id: string) => SP1_FEATURES.find(f => f.id === id);
/** For a task, the features of the Workflow tab that it carries out, so the other tabs can point to them. */
export const FEATURES_OF_TASK: Readonly<Record<string, readonly string[]>> = {
  goal: ['Idea Capture', 'Key fields Extraction / intent detection'],
  clarify: ['Targeted Clarifying Questions'],
  brief: ['Idea Brief Review & Confirmation'],
};

export type StepId = 'SP1' | 'SP2' | 'SP3' | 'gate1';
/** An item in the tree: a feature (SP1) or a real task (steps whose features are not defined yet). */
export type Item = { key: string; step: StepId; kind: 'feature' | 'task'; name: string; task: string };
export type WorkflowStep = { id: StepId; label: string; items: Item[] };

const feature = (f: Feature): Item => ({ key: f.id, step: 'SP1', kind: 'feature', name: f.name, task: f.task });
const task = (step: StepId, id: string): Item => ({ key: id, step, kind: 'task', name: TASK[id].artifact, task: id });
export const STEPS: readonly WorkflowStep[] = [
  { id: 'SP1', label: 'Idea Definition', items: SP1_FEATURES.map(feature) },
  { id: 'SP2', label: 'Problem Discovery', items: ['research', 'interviews', 'problem'].map(t => task('SP2', t)) },
  { id: 'SP3', label: 'Opportunity & Market', items: ['market', 'personas', 'competitors'].map(t => task('SP3', t)) },
  { id: 'gate1', label: 'Gate 1', items: [task('gate1', 'gate1')] },
];
export const ITEMS: readonly Item[] = STEPS.flatMap(s => s.items);
export const itemOf = (key: string) => ITEMS.find(i => i.key === key);

/**
 * Where every item stands. Capture, key fields and the questions are the founder's start: they are done
 * when the Idea goal and the Clarification answers are approved. The brief and every real task follow
 * their own task, with the very same status function as the rest of the app.
 */
export function itemStatuses(core: Core, p: Project, ctx: StatusCtx = {}): Record<string, TaskStatus> {
  const goal = taskStatus(core, p, 'goal', ctx) === 'done';
  const out: Record<string, TaskStatus> = {};
  for (const i of ITEMS) {
    if (i.kind === 'task') { out[i.key] = taskStatus(core, p, i.task, ctx); continue; }
    const t = taskStatus(core, p, i.task, ctx);
    if (i.key === 'capture' || i.key === 'extract') out[i.key] = goal ? 'done' : 'blocked';
    else if (i.key === 'clarify') out[i.key] = t === 'done' ? 'done' : t === 'recheck' || t === 'reconfirm' ? 'recheck' : 'blocked';
    else out[i.key] = t === 'done' || t === 'ready' || t === 'working' || t === 'review' || t === 'needs' || t === 'recheck' ? t : 'blocked';
  }
  return out;
}
export const doneIn = (step: WorkflowStep, s: Record<string, TaskStatus>) => step.items.filter(i => s[i.key] === 'done').length;

export type StepState = 'done' | 'in-progress' | 'next';
/** A step's state comes from the core's own progress for that step, the same one the header chips show. */
export function stepStates(core: Core, p: Project): Record<StepId, StepState> {
  const by = Object.fromEntries(discoverSteps(core, p).map(s => [s.id, s.status])) as Record<string, 'complete' | 'in-progress' | 'not-started'>;
  const f = (id: string): StepState => (by[id] === 'complete' ? 'done' : by[id] === 'in-progress' ? 'in-progress' : 'next');
  return { SP1: f('SP1'), SP2: f('SP2'), SP3: f('SP3'), gate1: f('gate1') };
}
export const STEP_LABEL: Record<StepState, string> = { done: 'Done', 'in-progress': 'In progress', next: 'Next' };

const WAITS_FOR_YOU: readonly TaskStatus[] = ['needs', 'recheck', 'reconfirm', 'optional'];
/** The item to open first: the first one that waits for the founder, otherwise the first that is not done. */
export function defaultItem(s: Record<string, TaskStatus>): string {
  return (ITEMS.find(i => WAITS_FOR_YOU.includes(s[i.key])) ?? ITEMS.find(i => s[i.key] !== 'done') ?? ITEMS[ITEMS.length - 1]).key;
}

export type Segment = { t: string; kind?: 'who' | 'doing' };
/** The founder's sentence cut into pieces, marking the audience and what it does, so the reader sees what was detected. */
export function highlight(text: string, who: string, doing: string): Segment[] {
  const low = text.toLowerCase();
  const spans: { a: number; b: number; kind: 'who' | 'doing' }[] = [];
  const find = (needle: string, kind: 'who' | 'doing') => {
    const n = needle.trim().toLowerCase(); if (!n) return;
    const a = low.indexOf(n); if (a < 0) return;
    if (spans.some(s => a < s.b && a + n.length > s.a)) return;
    spans.push({ a, b: a + n.length, kind });
  };
  find(who, 'who'); find(doing, 'doing');
  spans.sort((x, y) => x.a - y.a);
  const out: Segment[] = []; let at = 0;
  for (const s of spans) { if (s.a > at) out.push({ t: text.slice(at, s.a) }); out.push({ t: text.slice(s.a, s.b), kind: s.kind }); at = s.b; }
  if (at < text.length) out.push({ t: text.slice(at) });
  return out.length ? out : [{ t: text }];
}

export type Detected = { who: string; doing: string; topic: string; start: string; segments: Segment[] };
/** What the agents read from the founder's idea. */
export function detect(idea: IdeaInput): Detected {
  const c = ideaContext(idea.text, idea.option);
  return { who: c.who, doing: c.doing, topic: c.topic.name, start: START_OPTIONS.find(o => o.id === idea.option)?.title ?? idea.option, segments: highlight(idea.text, c.who, c.doing) };
}
export const questionsOf = (idea: IdeaInput): Question[] => ideaContext(idea.text, idea.option).questions;
export const answersOf = (idea: IdeaInput): string[] => [idea.answers.a1, idea.answers.a2, idea.answers.a3];
