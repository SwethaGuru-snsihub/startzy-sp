// The idea a founder brings to Solution Planning: where they are starting from, their own words, and
// three clarifying answers. Pure data and pure functions, so the start popup and its tests share them.
// Nothing here calls a model: the questions are shaped from the founder's own text, and any content
// built from this idea elsewhere is labelled simulated.
import type { FactKey } from '@/engine/core/context';
import type { IdeaBrief } from './ai/briefSchema';

export type StartOption = 'idea' | 'problem' | 'opportunity' | 'define';
export type AnswerKey = 'a1' | 'a2' | 'a3';
export type IdeaInput = {
  option: StartOption;
  text: string;
  name: string;
  q2: string;                                  // the wording of the second question the founder was asked
  answers: Record<AnswerKey, string>;
  brief?: IdeaBrief;                           // what the Idea Definition provider wrote from the founder's words, when it ran
};

export const START_OPTIONS: { id: StartOption; title: string; hint: string; placeholder: string }[] = [
  { id: 'idea', title: 'I have an idea', hint: 'I know what I want to build', placeholder: 'Describe your idea. Who is it for and what does it do?' },
  { id: 'problem', title: 'I have a problem to solve', hint: 'I know the pain, not the product', placeholder: 'Describe the problem. Who has it and what happens today?' },
  { id: 'opportunity', title: 'I want to explore an opportunity', hint: 'I see a gap or a trend', placeholder: 'Describe the opportunity you see.' },
  { id: 'define', title: 'I need help defining my idea', hint: 'It is still fuzzy', placeholder: 'Tell us what you have so far, even if it is rough.' },
];
export const EXAMPLE_IDEA = 'I want to build an AI platform that helps students prepare for technical interviews.';
export const MIN_IDEA_LENGTH = 12;
export const isIdeaReady = (option: StartOption | '', text: string) => option !== '' && text.trim().length >= MIN_IDEA_LENGTH;

export type Topic = { name: string; who: string; direct: string; indirect: string; sub: string; tam: [string, string, string]; persona: string; causes: [string, string, string] };
const TOPICS: { test: RegExp; topic: Topic }[] = [
  { test: /interview|resume|career|job\b|hiring/i, topic: { name: 'Interview Prep', who: 'students and job seekers', direct: 'mock-interview and coding-practice platforms', indirect: 'video tutorials, books and forums', sub: 'practising with friends', tam: ['4,200', '900', '45'], persona: 'Aarav, final-year engineering student', causes: ['Practice material is scattered across many sites', 'Feedback on answers is slow or missing', 'Candidates cannot tell how ready they really are'] } },
  { test: /health|clinic|patient|hospital|doctor|medical/i, topic: { name: 'Care Flow', who: 'clinic staff and patients', direct: 'hospital scheduling suites', indirect: 'spreadsheets and phone follow-ups', sub: 'walk-in queues', tam: ['6,800', '1,400', '70'], persona: 'Dr. Nisha, clinic operations lead', causes: ['Appointments are managed by hand', 'Triage information is captured late', 'Staff time goes to admin instead of care'] } },
  { test: /learn|student|course|educat|exam|teach/i, topic: { name: 'Learn Loop', who: 'learners and teachers', direct: 'online course platforms', indirect: 'free video lessons', sub: 'private tutoring', tam: ['5,100', '1,100', '55'], persona: 'Meera, college student', causes: ['Content is generic, not personal', 'Progress is hard to measure', 'Motivation drops without feedback'] } },
  { test: /financ|invoice|payment|bank|loan|account/i, topic: { name: 'Ledger Lite', who: 'small business owners', direct: 'accounting software', indirect: 'spreadsheets', sub: 'a part-time accountant', tam: ['7,400', '1,600', '80'], persona: 'Ravi, shop owner', causes: ['Records are kept in several places', 'Reconciliation is manual', 'Cash flow is seen too late'] } },
];
export const GENERIC_TOPIC: Topic = { name: 'Your Idea', who: 'your first customers', direct: 'direct competing products', indirect: 'workarounds and general tools', sub: 'doing nothing', tam: ['2,500', '600', '30'], persona: 'Primary user (to be refined)', causes: ['The current way of doing it is slow or manual', 'Existing tools do not fit this group well', 'The cost of the problem is hard to see'] };
export const topicOf = (text: string): Topic => TOPICS.find(t => t.test.test(text))?.topic ?? GENERIC_TOPIC;

/** Who the founder's own sentence says it is for ("helps students prepare…" gives "students"). */
export function parseWho(text: string, topic: Topic): string {
  const m = text.match(/\b(?:help(?:s|ing)?|for|serv(?:e|es|ing))\s+(?:the\s+)?([a-z][a-z\- ]{2,28}?)(?=\s+(?:to|prepare|who|that|with|find|get|learn|manage|in|and|on|by)\b|[.,;!?]|$)/i);
  return m ? m[1].trim().toLowerCase() : topic.who;
}
/** What it helps them do ("…prepare for technical interviews"). */
export function parseDoing(text: string): string {
  const m = text.match(/\bhelp(?:s|ing)?\s+[a-z\- ]+?\s+((?:to\s+)?[a-z][a-z\- ]{4,70}?)(?=[.,;!?]|$)/i);
  return m ? m[1].replace(/^to\s+/i, '').trim().toLowerCase() : 'reach the outcome you described';
}

export type Question = { key: AnswerKey; q: string; options: string[] };
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const Q2: Record<StartOption, [string, string[]]> = {
  idea: ['How do people handle this today?', ['Manually or in spreadsheets', 'With a competing product', 'They do not, they live with it', 'I am not sure']],
  problem: ['How often does this problem hit them?', ['Every day', 'Every week', 'A few times a year', 'I am not sure']],
  opportunity: ['What makes this the right time?', ['New technology such as AI', 'A rule or policy change', 'A shift in the market', 'I am not sure']],
  define: ['What bothers you most about the idea right now?', ['Who it is for', 'What exactly it does', 'Whether people will pay', 'All of it']],
};
/** The goal answers, in the order they are asked. Each one is a fact the core's rules read ('goal'). */
export const GOAL_ANSWERS: { answer: string; fact: string }[] = [
  { answer: 'Venture-scale startup', fact: 'venture' },
  { answer: 'Profitable small business', fact: 'smallbiz' },
  { answer: 'New product inside my company', fact: 'internal' },
  { answer: 'A side project to learn', fact: 'learning' },
];
export const GOAL_FACT_KEY: FactKey = 'goal';
export const goalFactOf = (answer: string): string | null => GOAL_ANSWERS.find(g => g.answer === answer)?.fact ?? null;

export function questionsFor(option: StartOption, who: string): Question[] {
  return [
    { key: 'a1', q: `Who do you think feels this most? You mentioned ${who}.`, options: [cap(who), 'Working professionals', 'Small businesses', 'Large organisations', 'Not sure yet'] },
    { key: 'a2', q: Q2[option][0], options: Q2[option][1] },
    { key: 'a3', q: 'What is your goal for this?', options: GOAL_ANSWERS.map(g => g.answer) },
  ];
}

/** What the agents read from the founder's words: the topic, who it is for, what it does, a first name. */
export function ideaContext(text: string, option: StartOption) {
  const topic = topicOf(text), who = parseWho(text, topic);
  return { topic, who, doing: parseDoing(text), name: topic.name, questions: questionsFor(option, who) };
}
