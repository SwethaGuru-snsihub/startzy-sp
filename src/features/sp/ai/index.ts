// Picks the Idea Brief provider. IDEA_PROVIDER=cli uses the local Claude CLI; anything else is simulated.
import { createCliProvider } from './cliProvider';
import { simulatedProvider, type IdeaProvider } from './provider';

export type ProviderName = 'simulated' | 'cli';
export const providerNameFrom = (v: string | undefined): ProviderName => (v?.trim().toLowerCase() === 'cli' ? 'cli' : 'simulated');
export const providerFor = (name: ProviderName): IdeaProvider => (name === 'cli' ? createCliProvider({ model: process.env.CLAUDE_MODEL || undefined }) : simulatedProvider);
