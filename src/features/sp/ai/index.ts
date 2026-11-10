// Picks the AI provider. "cli" uses the local Claude CLI; anything else is simulated.
import { createCliAiProvider, createCliProvider } from './cliProvider';
import { simulatedAiProvider, simulatedProvider, type IdeaProvider } from './provider';
import type { AiProvider } from './task';

export type ProviderName = 'simulated' | 'cli';
export const providerNameFrom = (v: string | undefined): ProviderName => (v?.trim().toLowerCase() === 'cli' ? 'cli' : 'simulated');

/**
 * Reads the provider from the environment. AI_PROVIDER is the setting for every AI task; IDEA_PROVIDER, the
 * name Epic 1 used, still works when AI_PROVIDER is not set.
 */
export const providerNameFromEnv = (env: Record<string, string | undefined>): ProviderName =>
  providerNameFrom(env.AI_PROVIDER?.trim() ? env.AI_PROVIDER : env.IDEA_PROVIDER);

/** The Idea Brief provider Epic 1 uses. */
export const providerFor = (name: ProviderName): IdeaProvider => (name === 'cli' ? createCliProvider({ model: process.env.CLAUDE_MODEL || undefined }) : simulatedProvider);

/** The generic provider: runs any registered task spec. */
export const aiProviderFor = (name: ProviderName): AiProvider => (name === 'cli' ? createCliAiProvider({ model: process.env.CLAUDE_MODEL || undefined }) : simulatedAiProvider);
