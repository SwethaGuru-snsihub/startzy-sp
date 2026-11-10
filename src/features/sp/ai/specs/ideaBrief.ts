// The Idea Brief task (epic 1), described as a spec. Its prompt, schema, request checks, answer
// validation and simulated answer are the ones Epic 1 has always used, only gathered in one place.
import { ideaContext, MIN_IDEA_LENGTH, START_OPTIONS, type StartOption } from '../../idea';
import { extractSlots, SLOT_IDS, SLOT_LABEL } from '../../slots';
import { BRIEF_JSON_SCHEMA, MAX_QUESTIONS, validateBrief, type IdeaBrief } from '../briefSchema';
import { MAX_IDEA_CHARS, SYSTEM_PROMPT, userMessage } from '../prompt';
import type { AiTaskSpec } from '../task';

export type IdeaBriefInput = { text: string; option: StartOption };

/** Today's deterministic logic: the answer when no model is used. Everything in it is labelled simulated. */
function simulateBrief({ text, option }: IdeaBriefInput): IdeaBrief {
  const slots = extractSlots(text, option), c = ideaContext(text, option);
  return {
    source: 'simulated',
    summary: text.trim(),
    slots,
    opportunity: `Today, people use ${c.topic.direct} or ${c.topic.indirect}; ${c.who} may be underserved.`,
    assumptions: slots.filter(s => s.provenance === 'inferred').map(s => `${SLOT_LABEL[s.slot]}: ${s.value}`),
    missingInformation: slots.filter(s => s.provenance === 'empty').map(s => SLOT_LABEL[s.slot]),
    clarifyingQuestions: c.questions.map(q => q.q).slice(0, MAX_QUESTIONS),
  };
}

export const ideaBriefSpec: AiTaskSpec<IdeaBriefInput, IdeaBrief> = {
  id: 'idea-brief',
  title: 'Idea Brief',
  version: 1,
  systemPrompt: SYSTEM_PROMPT,
  jsonSchema: BRIEF_JSON_SCHEMA,
  dependsOn: ['text', 'option'],
  parseInput(raw) {
    const b = raw as { text?: unknown; option?: unknown } | null;
    if (!b || typeof b.text !== 'string' || typeof b.option !== 'string') return { ok: false, error: 'Send the idea text and where you are starting from.' };
    if (!START_OPTIONS.some(o => o.id === b.option)) return { ok: false, error: 'Unknown starting option.' };
    const text = b.text.trim();
    if (text.length < MIN_IDEA_LENGTH) return { ok: false, error: 'Describe the idea in a sentence or more.' };
    if (text.length > MAX_IDEA_CHARS) return { ok: false, error: `Keep the idea under ${MAX_IDEA_CHARS} characters.` };
    return { ok: true, value: { text, option: b.option as StartOption } };
  },
  buildMessage: input => userMessage(input.text, input.option),
  validate(raw, input, provider) {
    const r = validateBrief(raw, input.text, provider);
    return r.ok ? { ok: true, value: r.brief } : { ok: false, error: r.error };
  },
  simulate: simulateBrief,
  checkResult(value) {
    const b = value as Partial<IdeaBrief> | null;
    return typeof b === 'object' && b !== null
      && (b.source === 'simulated' || b.source === 'claude-cli')
      && typeof b.summary === 'string' && typeof b.opportunity === 'string'
      && Array.isArray(b.slots) && b.slots.length === SLOT_IDS.length && SLOT_IDS.every((id, i) => b.slots?.[i]?.slot === id)
      && [b.assumptions, b.missingInformation, b.clarifyingQuestions].every(l => Array.isArray(l) && l.every(x => typeof x === 'string'));
  },
};
