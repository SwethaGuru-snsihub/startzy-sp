// Who wrote a document's content. The labels on every screen come from here, so a Claude-written brief is
// never shown as simulated, and simulated text is never shown as AI. Pure.
import type { IdeaBrief } from './ai/briefSchema';
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

/** The maker's name tag on a version: "Asha (Claude CLI)" or "Asha (simulated)". */
export const makerTag = (name: string, p: Provider) => `${name} (${p === 'claude-cli' ? 'Claude CLI' : 'simulated'})`;

/** A stored version's provider; versions saved before providers were recorded were all simulated. */
export const versionProvider = (v: { provider?: Provider } | null | undefined): Provider => v?.provider ?? 'simulated';
