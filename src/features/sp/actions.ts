// What the founder does, as plain functions on the project's core instance and its documents. Every
// one runs through the core's own actions (so its rules decide), returns an error message or null, and
// leaves nothing half done: the core change is atomic, and the documents are written only after it worked.
import type { Core } from '@/engine/core/project';
import { TASK } from '@/engine/core/register';
import type { Project } from '@/engine/core/types';
import type { CoreRuntime, MutationResult } from '@/services/coreRuntime';
import { gateChecks, genSections, interviewSections, NO_INTERVIEWS, parseInterviews, type ContentCtx, type Interviews, type Section } from './content';
import type { DocStore } from './docStore';
import { goalFactOf, type IdeaInput } from './idea';
import { startIdea } from './startIdea';
import { recheckScope } from './viewModel';

export type Env = { rt: CoreRuntime; id: string; docs: DocStore; idea: () => IdeaInput | null; setIdea: (i: IdeaInput) => void };
const fail = (r: MutationResult<unknown>) => (r.ok ? null : r.error);

export function contentCtx(env: Env): ContentCtx | null {
  const idea = env.idea();
  return idea ? { idea, interviews: parseInterviews(env.docs.latest('interviews')?.secs) } : null;
}
function project(env: Env): { core: Core; p: Project } | null {
  const e = env.rt.getEntry(env.id);
  return e && e.status === 'ready' ? { core: env.rt.core, p: e.project } : null;
}

/** The start popup: records the founder's own tasks in the core, then their words as the first two documents. */
export function startProject(env: Env, idea: IdeaInput): string | null {
  const bad = fail(env.rt.mutate(env.id, (c, p) => startIdea(c, p, idea)));   // all or nothing
  if (bad) return bad;
  env.setIdea(idea);
  const ctx: ContentCtx = { idea, interviews: NO_INTERVIEWS };
  env.docs.add('goal', { by: 'You', note: 'Entered by you', secs: genSections('goal', ctx) });
  env.docs.add('clarify', { by: 'You', note: 'Entered by you', secs: genSections('clarify', ctx) });
  return null;
}

export function approve(env: Env, task: string): string | null {
  const bad = fail(env.rt.mutate(env.id, (c, p) => c.approveTask(p, task, { by: 'FOUNDER' })));
  if (bad) return bad;
  env.docs.clearRecheck(task);
  const pr = project(env);
  if (pr && recheckScope(pr.core, pr.p).flagged.length === 0) env.docs.clearRechecks();   // the re-check is finished
  return null;
}

/** Sends work that waits for approval back to its maker with the founder's note; the agent revises it. */
export function sendBack(env: Env, task: string, note: string): string | null {
  if (!note.trim()) return 'Add a note so the agent knows what to change.';
  const bad = fail(env.rt.mutate(env.id, (c, p) => c.returnTask(p, task, note)));
  if (!bad) env.docs.setNote(task, note.trim());
  return bad;
}

export function validateInterviews(i: Interviews): string | null {
  if (![i.n, i.strong].every(Number.isInteger) || i.n < 0 || i.strong < 0) return 'Enter whole numbers, zero or more.';
  if (i.strong > i.n) return 'Strong signals cannot be more than the people you spoke to.';
  return null;
}
/** The founder provides the interview notes (first time), as their own work. */
export function saveInterviews(env: Env, i: Interviews): string | null {
  const bad = validateInterviews(i);
  if (bad) return bad;
  const had = env.docs.versions('interviews').length > 0;
  const err = fail(env.rt.mutate(env.id, (c, p) => { c.startTask(p, 'interviews', 'human'); c.submitTask(p, 'interviews'); c.approveTask(p, 'interviews', { by: 'FOUNDER' }); }));
  if (!err) env.docs.add('interviews', { by: 'You', note: had ? 'Updated by you' : 'Entered by you', secs: interviewSections(i) });
  return err;
}

/** The founder confirms their own earlier work still holds after something it depends on changed. */
export function reconfirm(env: Env, task: string): string | null {
  if (TASK[task].owner !== 'FOUNDER') return 'Only your own work is confirmed by you.';
  return fail(env.rt.mutate(env.id, (c, p) => { c.startTask(p, task, 'human'); c.submitTask(p, task); c.approveTask(p, task, { by: 'FOUNDER' }); }));
}

export function gateChecksNow(env: Env) {
  const pr = project(env);
  const ok = (id: string) => !!pr && pr.core.state(pr.p, id) === 'approved';
  return gateChecks(parseInterviews(env.docs.latest('interviews')?.secs), { research: ok('research'), problem: ok('problem') });
}
export function decideGate(env: Env, outcome: 'pass' | 'not-yet'): string | null {
  const checks = gateChecksNow(env);
  if (outcome === 'pass' && !checks.every(c => c.ok)) return 'Pass is locked until every check is met.';
  const had = env.docs.versions('gate1').length > 0;
  const bad = fail(env.rt.mutate(env.id, (c, p) => c.decideGate(p, 'gate1', outcome)));
  if (!bad && outcome === 'pass') env.docs.add('gate1', { by: 'You', note: had ? 'Decided again: passed' : 'Passed Gate 1', secs: [{ h: 'Decision', b: 'Passed by the founder.' }, { h: 'Checks', b: checks.map(c => `${c.ok ? '✓' : '✕'} ${c.label}: ${c.detail}`).join('\n') }] });
  return bad;
}

export const takeUp = (env: Env, task: string): null => { env.docs.takeUp(task); return null; };
export const declineOptional = (env: Env, task: string): string | null => fail(env.rt.mutate(env.id, (c, p) => c.declineTask(p, task)));

/** What a saved edit means for the idea and the facts the core reads. Returns an error for a value they cannot use. */
function applyEdit(task: string, secs: Section[], idea: IdeaInput): { idea: IdeaInput; goalFact?: string; error?: string } {
  const g = (h: string) => (secs.find(s => s.h === h)?.b ?? '').trim();
  if (task === 'goal') {
    if (!g('Idea')) return { idea, error: 'The idea cannot be empty.' };
    return { idea: { ...idea, text: g('Idea'), name: g('Working name') || idea.name } };
  }
  if (task === 'clarify') {
    const fact = goalFactOf(g('Goal'));
    if (!fact) return { idea, error: 'Goal must be one of: Venture-scale startup, Profitable small business, New product inside my company, A side project to learn.' };
    return { idea: { ...idea, answers: { a1: g('Who it is for') || idea.answers.a1, a2: g('Context') || idea.answers.a2, a3: g('Goal') } }, goalFact: fact };
  }
  return { idea };
}

/**
 * The founder edits an approved document. The edit is saved as a new version (and, for the idea and
 * answers, becomes what the agents read), the core records it as a new approved version, and whatever
 * was built on the old one is flagged for re-check. Nothing re-runs until the founder approves the re-check.
 */
export function saveDocEdit(env: Env, task: string, secs: Section[], note: string): string | null {
  const pr = project(env), prev = env.docs.latest(task), idea = env.idea();
  if (!pr || !prev || !idea) return 'This document cannot be edited yet.';
  const st = pr.core.state(pr.p, task);
  if (st !== 'approved' && st !== 'needs-revalidation') return 'Only approved documents can be edited. Work that waits for your approval is sent back with a note instead.';
  if (secs.every((s, i) => s.b === prev.secs[i]?.b)) return 'No changes to save.';
  if (task === 'interviews') {
    const num = (h: string) => Number((secs.find(s => s.h === h)?.b ?? '').trim());   // raw, so a bad number is reported instead of quietly fixed
    const bad = validateInterviews({ n: num('People spoken to'), strong: num('Strong problem signals'), notes: '' });
    if (bad) return bad;
  }
  const next = applyEdit(task, secs, idea);
  if (next.error) return next.error;
  const bad = fail(env.rt.mutate(env.id, (c, p) => {
    if (next.goalFact && p.context.goal?.value !== next.goalFact) c.setFact(p, 'goal', next.goalFact);
    if (task === 'goal') p.idea = next.idea.text;
    c.reviseTask(p, task, { by: 'FOUNDER' });
  }));
  if (bad) return bad;
  if (task === 'goal' || task === 'clarify') env.setIdea(next.idea);
  env.docs.add(task, { by: 'You', note: note.trim() || 'Edited by you', secs: secs.map((s, i) => ({ ...s, edited: s.edited || s.b !== prev.secs[i]?.b })) });
  return null;
}

export function restoreVersion(env: Env, task: string, v: number): string | null {
  const old = env.docs.versions(task).find(x => x.v === v);
  return old ? saveDocEdit(env, task, old.secs.map(s => ({ ...s })), `Restored v${v}`) : 'That version no longer exists.';
}

/** The founder approves the re-check: the agents redo what is flagged, and what is built on it as each is approved again. */
export function approveRecheck(env: Env): number {
  const pr = project(env); if (!pr) return 0;
  const { flagged, later } = recheckScope(pr.core, pr.p);
  const agentOwned = [...flagged, ...later].filter(id => TASK[id].owner !== 'FOUNDER' && TASK[id].kind !== 'gate');
  env.docs.setRechecks(agentOwned);
  return flagged.length + later.length;
}
