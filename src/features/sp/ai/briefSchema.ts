// The Idea Brief a provider returns for a founder's idea: the five epic 1 slots plus the opportunity,
// assumptions, missing information and clarifying questions. Pure: the JSON schema that is handed to the
// model, and a validator that never trusts what came back. Whatever the source, the shape is the same, so
// the screens do not care whether the brief is simulated or written by Claude.
import { SLOT_IDS, type Confidence, type Provenance, type SlotId, type SlotValue } from '../slots';

export type BriefSource = 'simulated' | 'claude-cli';
export type IdeaBrief = {
  source: BriefSource;
  summary: string;
  slots: SlotValue[];                 // always the five slots, in the sheet order
  opportunity: string;
  assumptions: string[];
  missingInformation: string[];
  clarifyingQuestions: string[];      // at most MAX_QUESTIONS
};

export const MAX_QUESTIONS = 3;
const MAX_LIST = 8, MAX_ITEM = 300, MAX_TEXT = 600;
/** What a model may claim. 'confirmed' is deliberately absent: only the founder confirms a value. */
const MODEL_PROVENANCE: readonly Provenance[] = ['explicit', 'inferred', 'assumption', 'empty'];
const CONFIDENCE: readonly Confidence[] = ['high', 'medium', 'low'];

const str = { type: 'string' };
const strList = (max: number) => ({ type: 'array', items: str, maxItems: max });
/** JSON Schema handed to the model so it answers in exactly this shape. */
export const BRIEF_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'slots', 'opportunity', 'assumptions', 'missing_information', 'clarifying_questions'],
  properties: {
    summary: str,
    slots: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['slot', 'value', 'provenance', 'confidence', 'evidence', 'rationale'],
        properties: {
          slot: { type: 'string', enum: [...SLOT_IDS] },
          value: str,
          provenance: { type: 'string', enum: [...MODEL_PROVENANCE] },
          confidence: { type: 'string', enum: [...CONFIDENCE, ''] },
          evidence: str,
          rationale: str,
        },
      },
    },
    opportunity: str,
    assumptions: strList(MAX_LIST),
    missing_information: strList(MAX_LIST),
    clarifying_questions: strList(MAX_QUESTIONS),
  },
} as const;

export type Checked = { ok: true; brief: IdeaBrief } | { ok: false; error: string };
const bad = (error: string): Checked => ({ ok: false, error });

const clean = (s: string) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();
const squash = (s: string) => s.toLowerCase().replace(/\s+/g, ' ');
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Finds `needle` in the founder's text, ignoring case and spacing, and returns the founder's own wording. */
function quoteFrom(text: string, needle: string): string | null {
  const t = text.replace(/\s+/g, ' ').trim(), n = needle.replace(/\s+/g, ' ').trim();
  if (!n) return null;
  const i = squash(t).indexOf(squash(n));
  return i >= 0 ? t.slice(i, i + n.length) : null;
}

function list(v: unknown, name: string, max: number): string[] | string {
  if (!Array.isArray(v)) return `${name} must be a list`;
  const out: string[] = [];
  for (const x of v) {
    if (typeof x !== 'string') return `${name} must contain only text`;
    const s = clean(x);
    if (s) out.push(s.slice(0, MAX_ITEM));
  }
  return out.slice(0, max);       // a model that over-answers is trimmed, not rejected
}

/** Checks a model's raw answer against the founder's text. A quote that is not in their words is not kept. */
export function validateBrief(raw: unknown, founderText: string, source: BriefSource = 'claude-cli'): Checked {
  if (!isObj(raw)) return bad('The answer is not an object');
  const summary = typeof raw.summary === 'string' ? clean(raw.summary).slice(0, MAX_TEXT) : '';
  if (!summary) return bad('summary is missing');
  const opportunity = typeof raw.opportunity === 'string' ? clean(raw.opportunity).slice(0, MAX_TEXT) : '';
  const assumptions = list(raw.assumptions, 'assumptions', MAX_LIST); if (typeof assumptions === 'string') return bad(assumptions);
  const missing = list(raw.missing_information, 'missing_information', MAX_LIST); if (typeof missing === 'string') return bad(missing);
  const questions = list(raw.clarifying_questions, 'clarifying_questions', MAX_QUESTIONS); if (typeof questions === 'string') return bad(questions);

  if (!Array.isArray(raw.slots)) return bad('slots must be a list');
  const found = new Map<SlotId, SlotValue>();
  for (const item of raw.slots) {
    if (!isObj(item)) return bad('A slot is not an object');
    const id = item.slot as SlotId;
    if (!SLOT_IDS.includes(id)) return bad(`Unknown slot "${String(item.slot)}"`);
    if (found.has(id)) return bad(`Slot "${id}" appears twice`);
    if (!MODEL_PROVENANCE.includes(item.provenance as Provenance)) return bad(`Slot "${id}" has an invalid provenance`);
    let provenance = item.provenance as Provenance;
    const value = typeof item.value === 'string' ? clean(item.value).slice(0, MAX_TEXT) : null;
    if (value === null) return bad(`Slot "${id}" has no value`);
    const evidenceRaw = typeof item.evidence === 'string' ? clean(item.evidence) : '';
    const rationaleRaw = typeof item.rationale === 'string' ? clean(item.rationale).slice(0, MAX_TEXT) : '';
    let confidence: Confidence | null = null;
    if (provenance !== 'empty') {
      if (!value) return bad(`Slot "${id}" is marked ${provenance} but has no value`);
      if (!CONFIDENCE.includes(item.confidence as Confidence)) return bad(`Slot "${id}" has an invalid confidence`);
      confidence = item.confidence as Confidence;
    }
    let evidence: string | null = null, rationale: string | null = rationaleRaw || null;
    if (provenance === 'explicit') {
      evidence = quoteFrom(founderText, evidenceRaw);
      if (!evidence) {   // claimed to be the founder's words but is not: keep the value, drop the claim
        provenance = 'inferred'; confidence = 'low';
        rationale = 'The agent said this came from your words, but the quote is not in them, so it is treated as inferred.';
      }
    }
    found.set(id, { slot: id, value: provenance === 'empty' ? '' : value, provenance, confidence, evidence, rationale, simulated: false });
  }
  const missingSlots = SLOT_IDS.filter(id => !found.has(id));
  if (missingSlots.length) return bad(`Missing slots: ${missingSlots.join(', ')}`);

  return { ok: true, brief: { source, summary, slots: SLOT_IDS.map(id => found.get(id)!), opportunity, assumptions, missingInformation: missing, clarifyingQuestions: questions } };
}
