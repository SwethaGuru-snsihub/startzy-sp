// The simulated content of each Discover document, built from the founder's own words and answers and
// from the documents it depends on. No model is called: this is deterministic template text, and every
// screen that shows it says it is simulated. Pure functions, so they are testable and reusable.
import { ideaContext, START_OPTIONS, type IdeaInput } from './idea';

export type Section = { h: string; b: string; hint?: string; edited?: boolean; locked?: boolean };
export type Interviews = { n: number; strong: number; notes: string };
export type ContentCtx = { idea: IdeaInput; interviews: Interviews };
export type GateCheck = { label: string; ok: boolean; detail: string };

export const NO_INTERVIEWS: Interviews = { n: 0, strong: 0, notes: '' };
const NOTES_EMPTY = 'No notes yet. Add what people told you.';
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

export const evidenceScore = (i: Interviews) => Math.min(100, 15 + 6 * Math.min(i.n, 10) + 10 * Math.min(i.strong, 5));

/** The Gate 1 checks, from what has actually been approved and what the founder recorded. */
export function gateChecks(i: Interviews, approved: { research: boolean; problem: boolean }): GateCheck[] {
  const score = evidenceScore(i);
  return [
    { label: 'Desk research approved', ok: approved.research, detail: approved.research ? 'Approved' : 'Not yet' },
    { label: 'Talked to at least 4 people', ok: i.n >= 4, detail: `${i.n} interviews` },
    { label: 'At least 2 strong problem signals', ok: i.strong >= 2, detail: `${i.strong} strong` },
    { label: 'Problem statement approved', ok: approved.problem, detail: approved.problem ? 'Approved' : 'Not yet' },
    { label: 'Evidence score 45 or more', ok: score >= 45, detail: `Score ${score}` },
  ];
}

export const parseInterviews = (secs?: Section[]): Interviews => {
  if (!secs) return NO_INTERVIEWS;
  const g = (h: string) => secs.find(s => s.h === h)?.b ?? '';
  const n = Math.max(0, parseInt(g('People spoken to'), 10) || 0);
  const notes = g('Notes');
  return { n, strong: Math.min(n, Math.max(0, parseInt(g('Strong problem signals'), 10) || 0)), notes: notes === NOTES_EMPTY ? '' : notes };
};
export const interviewSections = (i: Interviews): Section[] => [
  { h: 'People spoken to', b: String(i.n) }, { h: 'Strong problem signals', b: String(i.strong) }, { h: 'Notes', b: i.notes || NOTES_EMPTY },
];

/** Who the document says it is for: the founder's own answer, unless they were not sure. */
const whoOf = (idea: IdeaInput, fallback: string) => (idea.answers.a1 && idea.answers.a1 !== 'Not sure yet' ? idea.answers.a1.toLowerCase() : fallback);

export function genSections(task: string, ctx: ContentCtx): Section[] {
  const { idea, interviews: i } = ctx;
  const c = ideaContext(idea.text, idea.option), t = c.topic, w = whoOf(idea, c.who);
  const start = START_OPTIONS.find(o => o.id === idea.option)?.title ?? idea.option;
  switch (task) {
    case 'goal': return [{ h: 'Idea', b: idea.text }, { h: 'Where you started', b: start, locked: true }, { h: 'Working name', b: idea.name }];
    case 'clarify': return [{ h: 'Who it is for', b: idea.answers.a1 }, { h: 'Context', hint: idea.q2, b: idea.answers.a2 }, { h: 'Goal', hint: 'Venture-scale startup, Profitable small business, New product inside my company, or A side project to learn', b: idea.answers.a3 }];
    case 'brief': return [
      { h: 'Idea', b: idea.text }, { h: 'Working name', b: idea.name }, { h: 'Who it is for', b: idea.answers.a1 }, { h: 'Context', hint: idea.q2, b: idea.answers.a2 }, { h: 'Goal', b: idea.answers.a3 },
      { h: 'Starting assumptions', b: `• ${cap(w)} will change how they ${c.doing} if the new way is clearly better.\n• The problem is frequent enough to pay for.` }];
    case 'research': return [
      { h: 'What we found (simulated)', b: `• Today, ${w} handle this by: ${idea.answers.a2.toLowerCase()}.\n• Existing options: ${t.direct}; ${t.indirect}.\n• Most people fall back on ${t.sub}.` },
      { h: 'Gaps', b: `• No option is built around ${idea.name}'s approach.\n• Switching cost looks low for ${w}.` }];
    case 'interviews': return interviewSections(i);
    case 'problem': return [
      { h: 'Problem statement (simulated draft)', b: `${cap(w)} have no reliable, affordable way to ${c.doing}.` }, { h: 'Root causes', b: t.causes.map(x => '• ' + x).join('\n') },
      { h: 'Evidence so far', b: `${i.n} interviews, ${i.strong} strong problem signals. Evidence score ${evidenceScore(i)} of 100.` },
      { h: 'Riskiest assumption', b: `That ${w} will pay for this rather than keep ${t.sub}.` }];
    case 'market': return [
      { h: 'Opportunity (simulated)', b: 'Opportunity score 7.4 / 10: problem fit high, urgency medium, feasibility high.' },
      { h: 'Market size (illustrative)', b: `TAM ₹${t.tam[0]} Cr: all ${w} in the target region\nSAM ₹${t.tam[1]} Cr: those reachable online\nSOM ₹${t.tam[2]} Cr: share reachable in 3 years` }];
    case 'personas': return [{ h: 'Persona (synthetic)', b: `${t.persona}. Built by the agents, not from real interviews.` }, { h: 'Jobs to be done', b: `• ${cap(c.doing)} with confidence\n• Know how ready they are` }];
    case 'competitors': return [{ h: 'Competitor landscape', b: `Direct: ${t.direct}\nIndirect: ${t.indirect}\nSubstitute: ${t.sub}` }, { h: 'Where we can differ', b: `• Built around ${w}, not a general audience\n• Faster feedback than ${t.sub}` }];
    default: return [];
  }
}

/** A fresh draft keeps the sections the founder edited by hand, and replaces the rest. */
export const mergeEdited = (fresh: Section[], prev?: Section[] | null): Section[] =>
  fresh.map(s => { const p = prev?.find(x => x.h === s.h); return p?.edited ? { ...p } : s; });

/** The one-line result shown when a finished task is opened. */
export function resultOf(task: string, ctx: ContentCtx): string {
  const { idea, interviews: i } = ctx, c = ideaContext(idea.text, idea.option);
  const r: Record<string, string> = {
    goal: `Your idea: “${idea.text.length > 80 ? idea.text.slice(0, 79) + '…' : idea.text}”`, clarify: 'Your three answers and the working name.', brief: 'Idea Brief drafted and reviewed.',
    research: 'How the problem is handled today and the existing options.', interviews: `${i.n} conversations, ${i.strong} strong signals.`, problem: `Problem statement drafted. Evidence score ${evidenceScore(i)} of 100.`,
    market: `TAM ₹${c.topic.tam[0]} Cr, SAM ₹${c.topic.tam[1]} Cr, SOM ₹${c.topic.tam[2]} Cr (illustrative).`, personas: `Persona: ${c.topic.persona}.`, competitors: 'Direct, indirect and substitute competitors profiled.', gate1: 'Gate 1 decision recorded.',
  };
  return r[task] ?? '';
}
