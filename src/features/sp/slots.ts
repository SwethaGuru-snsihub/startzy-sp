// The five slots of epic 1 (idea, problem, target_users, expected_outcome, constraints), filled the way the
// sheet describes: extract what the founder said with a quote (T4), rank the questions for what is still
// unknown (T5), confirm from the founder's answers (T6), and mark what is left as assumptions. Pure and
// deterministic, so it is testable and labelled simulated everywhere it appears; no model is called.
import { ideaContext, type StartOption } from './idea';
import { epicOf } from './spec';

export type SlotId = 'idea' | 'problem' | 'target_users' | 'expected_outcome' | 'constraints';
export const SLOT_IDS: readonly SlotId[] = ['idea', 'problem', 'target_users', 'expected_outcome', 'constraints'];
/** explicit: quoted from the founder's words. inferred: the agents' guess, with a rationale. confirmed: the founder answered. */
export type Provenance = 'explicit' | 'inferred' | 'confirmed' | 'assumption' | 'empty';
export type Confidence = 'high' | 'medium' | 'low';
export type SlotValue = {
  slot: SlotId; value: string; provenance: Provenance; confidence: Confidence | null;
  evidence: string | null;      // an exact quote from the founder's text
  rationale: string | null;     // why a value was inferred or assumed
  simulated: true;
};

export const QUESTIONS_PER_ROUND = 3;
export const MAX_ROUNDS = 2;

const make = (slot: SlotId, p: Omit<SlotValue, 'slot' | 'simulated'>): SlotValue => ({ slot, simulated: true, ...p });
const empty = (slot: SlotId) => make(slot, { value: '', provenance: 'empty', confidence: null, evidence: null, rationale: null });
const DEFAULT_DOING = 'reach the outcome you described';

/** T4: the values the founder's words state, with the exact quote, and a labelled guess where they do not. */
export function extractSlots(text: string, option: StartOption): SlotValue[] {
  const t = text.trim(), c = ideaContext(t, option), low = t.toLowerCase();
  const quote = (needle: string) => { const i = low.indexOf(needle.toLowerCase()); return i >= 0 ? t.slice(i, i + needle.length) : null; };

  const idea = t ? make('idea', { value: t, provenance: 'explicit', confidence: 'high', evidence: t, rationale: null }) : empty('idea');
  const problem = option === 'problem' && t
    ? make('problem', { value: t, provenance: 'explicit', confidence: 'high', evidence: t, rationale: null })
    : option === 'define' ? empty('problem')
    : make('problem', { value: c.topic.causes[0], provenance: 'inferred', confidence: 'low', evidence: null, rationale: `Inferred from the topic "${c.topic.name}"; the problem was not stated.` });
  const who = quote(c.who);
  const users = who
    ? make('target_users', { value: c.who, provenance: 'explicit', confidence: 'medium', evidence: who, rationale: null })
    : make('target_users', { value: c.topic.who, provenance: 'inferred', confidence: 'low', evidence: null, rationale: `Inferred from the topic "${c.topic.name}"; no audience was named.` });
  const doing = c.doing === DEFAULT_DOING ? null : quote(c.doing);
  const outcome = doing
    ? make('expected_outcome', { value: c.doing, provenance: 'explicit', confidence: 'medium', evidence: doing, rationale: null })
    : empty('expected_outcome');
  return [idea, problem, users, outcome, empty('constraints')];
}

/** T5: the slots to ask about this round, empty ones first, then guesses, at most three. */
export function rankQuestions(slots: SlotValue[]): SlotId[] {
  const open = (p: Provenance) => slots.filter(s => s.provenance === p).map(s => s.slot);
  return [...open('empty'), ...open('inferred')].slice(0, QUESTIONS_PER_ROUND);
}

const NOT_SURE = new Set(['', 'Not sure yet', 'I am not sure']);
/** T6: the slots the founder's answers confirm. Answer 1 is who it is for; answer 2 is how the problem is handled today (idea start only). */
export function applyAnswers(slots: SlotValue[], option: StartOption, answers: { a1: string; a2: string }): SlotValue[] {
  const confirmed = (s: SlotValue, value: string): SlotValue => ({ ...s, value, provenance: 'confirmed', confidence: 'high', evidence: null, rationale: null });
  return slots.map(s => {
    if (s.slot === 'target_users' && !NOT_SURE.has(answers.a1)) return confirmed(s, answers.a1);
    if (s.slot === 'problem' && option === 'idea' && s.provenance !== 'explicit' && !NOT_SURE.has(answers.a2)) return confirmed(s, `Today: ${answers.a2}`);
    return s;
  });
}

const ASSUMED: Record<SlotId, string> = {
  idea: 'The idea is the one described so far',
  problem: 'The problem is real and frequent enough that people would pay to solve it',
  target_users: 'The first customers are the people the idea names',
  expected_outcome: 'The outcome is the one the idea describes',
  constraints: 'No constraints stated yet; assumed open until confirmed',
};
/** After the last round: what is still unknown becomes a labelled assumption. Inferred values keep their label. */
export function resolveAssumptions(slots: SlotValue[]): SlotValue[] {
  return slots.map(s => s.provenance !== 'empty' ? s
    : { ...s, value: ASSUMED[s.slot], provenance: 'assumption', confidence: 'low', evidence: null, rationale: 'Not stated and not answered; assumed until the founder confirms.' });
}

/** Who fills a slot and who supports them, from the spec's slot table. */
export function slotOwners(slot: SlotId): { owner: string; supporting: string } {
  const s = epicOf(1).slots.find(x => x.slot === slot);
  return { owner: s?.owner ?? '', supporting: s?.supporting ?? '' };
}
