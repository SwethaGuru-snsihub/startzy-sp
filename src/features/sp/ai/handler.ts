// The rules of POST /api/idea-brief, free of Next so they can be tested: who may call it, what is accepted,
// and what comes back. The Claude CLI path only runs for a page served from this machine.
import { START_OPTIONS, MIN_IDEA_LENGTH, type StartOption } from '../idea';
import type { IdeaBrief } from './briefSchema';
import { ProviderError } from './cliProvider';
import { MAX_IDEA_CHARS } from './prompt';
import type { IdeaProvider } from './provider';

export type ApiResult = { status: number; body: { brief: IdeaBrief } | { error: string } };
export type ApiRequest = { host: string | null; origin: string | null; body: unknown };

const hostname = (h: string) => { try { return new URL(`http://${h}`).hostname; } catch { return ''; } };
export const isLocalHost = (h: string | null) => !!h && ['localhost', '127.0.0.1', '[::1]'].includes(hostname(h));

export async function handleIdeaBrief(req: ApiRequest, provider: IdeaProvider): Promise<ApiResult> {
  const err = (status: number, error: string): ApiResult => ({ status, body: { error } });
  if (provider.name === 'claude-cli') {
    // Someone else's browser must never be able to spend this machine's Claude login.
    if (!isLocalHost(req.host)) return err(403, 'The Claude CLI provider only runs on this computer.');
    if (req.origin && hostname(req.origin.replace(/^https?:\/\//, '')) !== hostname(req.host ?? '')) return err(403, 'Cross-site requests are not allowed.');
  }
  const b = req.body as { text?: unknown; option?: unknown } | null;
  if (!b || typeof b.text !== 'string' || typeof b.option !== 'string') return err(400, 'Send the idea text and where you are starting from.');
  if (!START_OPTIONS.some(o => o.id === b.option)) return err(400, 'Unknown starting option.');
  const text = b.text.trim();
  if (text.length < MIN_IDEA_LENGTH) return err(400, 'Describe the idea in a sentence or more.');
  if (text.length > MAX_IDEA_CHARS) return err(400, `Keep the idea under ${MAX_IDEA_CHARS} characters.`);
  try {
    return { status: 200, body: { brief: await provider.analyze({ text, option: b.option as StartOption }) } };
  } catch (e) {
    return err(e instanceof ProviderError ? 502 : 500, e instanceof ProviderError ? e.message : 'Could not build the Idea Brief.');
  }
}
