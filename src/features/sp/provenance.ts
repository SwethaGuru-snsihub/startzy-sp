// Who wrote a document's content. The labels on every screen come from here, so a Claude-written brief is
// never shown as simulated, and simulated text is never shown as AI. Pure.
import type { IdeaBrief } from './ai/briefSchema';
import type { AiFallback } from './ai/records';
import type { IdeaInput } from './idea';

export type Provider = 'simulated' | 'claude-cli';
export const AI_BADGE = 'AI-GENERATED · Claude CLI (local)';
/** The tasks whose drafts the Idea Brief provider writes. Every other agent task is still simulated. */
export const AI_WRITTEN_TASKS: readonly string[] = ['brief'];

/** The provider's brief, only while it still matches the founder's words. */
export const usableBrief = (idea: Pick<IdeaInput, 'brief' | 'briefStale'> | null | undefined): IdeaBrief | null =>
  idea?.brief && !idea.briefStale ? idea.brief : null;

/** Which provider writes (or wrote) the draft of this task, from the idea it is built on. */
export const providerOf = (task: string, idea: Pick<IdeaInput, 'brief' | 'briefStale'> | null | undefined): Provider =>
  AI_WRITTEN_TASKS.includes(task) && usableBrief(idea)?.source === 'claude-cli' ? 'claude-cli' : 'simulated';

/** What the AI gate says about a task, as far as provenance needs to know. */
export type AiDraftState = { status: string; key?: string; provider?: Provider; fallback?: AiFallback; error?: string };
export type DraftSource = { provider: Provider; aiKey?: string; fallback?: AiFallback };
export const AI_UNAVAILABLE_AT_DRAFT = 'The AI answer was not available when the draft was written.';

/**
 * Who writes the draft of a task. For a task the AI gate drives, it is the provider of the answer the draft is
 * built from; if the answer is not there when the draft is written, the draft is simulated and says why. For
 * every other task it is the Epic 1 rule (`providerOf`).
 */
export function draftSource(task: string, idea: Pick<IdeaInput, 'brief' | 'briefStale'> | null | undefined, gated: boolean, ai: AiDraftState | null): DraftSource {
  if (!gated) return { provider: providerOf(task, idea) };
  if (ai?.status === 'ready' && ai.provider) return { provider: ai.provider, ...(ai.key ? { aiKey: ai.key } : {}), ...(ai.fallback ? { fallback: ai.fallback } : {}) };
  return { provider: 'simulated', ...(ai?.key ? { aiKey: ai.key } : {}), fallback: { from: 'claude-cli', reason: ai?.error || AI_UNAVAILABLE_AT_DRAFT } };
}

/** The maker's name tag on a version: "Asha (Claude CLI)" or "Asha (simulated)". */
export const makerTag = (name: string, p: Provider) => `${name} (${p === 'claude-cli' ? 'Claude CLI' : 'simulated'})`;

/** A stored version's provider; versions saved before providers were recorded were all simulated. */
export const versionProvider = (v: { provider?: Provider } | null | undefined): Provider => v?.provider ?? 'simulated';

/** Why a version is simulated when Claude was meant to write it, or undefined if it is not a fallback. */
export const versionFallback = (v: { fallback?: AiFallback } | null | undefined): AiFallback | undefined => v?.fallback;
