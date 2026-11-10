// The rules of the AI routes, free of Next so they can be tested: who may call them, what is accepted, how
// many Claude processes may run at once, and what comes back. POST /api/ai runs any registered task;
// POST /api/idea-brief is the Epic 1 route and answers exactly as it always has. Both refuse the Claude
// CLI unless the page is served from this machine, and both share one cap on running CLI processes.
import type { Provider } from '../provenance';
import type { IdeaBrief } from './briefSchema';
import { ProviderError } from './cliProvider';
import { aiKey } from './hash';
import { getCliLimiter, type Limiter } from './limiter';
import type { IdeaProvider } from './provider';
import { getTask } from './registry';
import { ideaBriefSpec } from './specs/ideaBrief';
import type { AiProvider } from './task';

export type ApiRequest = { host: string | null; origin: string | null; body: unknown; /** Aborts when the browser goes away. */ signal?: AbortSignal };
export type ResponseHeaders = Record<string, string>;
export type ApiResult = { status: number; body: { brief: IdeaBrief } | { error: string }; headers?: ResponseHeaders };
export type AiApiResult = { status: number; body: { task: string; key: string; provider: Provider; result: unknown } | { error: string }; headers?: ResponseHeaders };

const hostname = (h: string) => { try { return new URL(`http://${h}`).hostname; } catch { return ''; } };
export const isLocalHost = (h: string | null) => !!h && ['localhost', '127.0.0.1', '[::1]'].includes(hostname(h));

/** Someone else's browser must never be able to spend this machine's Claude login. Returns the refusal, or null. */
export function cliGuard(req: { host: string | null; origin: string | null }): string | null {
  if (!isLocalHost(req.host)) return 'The Claude CLI provider only runs on this computer.';
  if (req.origin && hostname(req.origin.replace(/^https?:\/\//, '')) !== hostname(req.host ?? '')) return 'Cross-site requests are not allowed.';
  return null;
}

export const BUSY_MESSAGE = 'Claude is busy. Try again in a moment.';
export const BUSY_HEADERS: ResponseHeaders = { 'Retry-After': '5' };
export const MAX_BODY_BYTES = 100_000;

/** Reads a request body as JSON, refusing one that is too large or not JSON. */
export function parseJsonBody(text: string, maxBytes = MAX_BODY_BYTES): { ok: true; body: unknown } | { ok: false; status: number; error: string } {
  if (text.length > maxBytes) return { ok: false, status: 413, error: 'The request is too large.' };
  try { return { ok: true, body: JSON.parse(text) }; } catch { return { ok: false, status: 400, error: 'The request is not valid JSON.' }; }
}

type Options = { limiter?: Limiter };

/** POST /api/idea-brief. Same checks, same words, same status codes as Epic 1 has always had. */
export async function handleIdeaBrief(req: ApiRequest, provider: IdeaProvider, o: Options = {}): Promise<ApiResult> {
  const err = (status: number, error: string, headers?: ResponseHeaders): ApiResult => ({ status, body: { error }, ...(headers ? { headers } : {}) });
  const cli = provider.name === 'claude-cli';
  if (cli) { const refused = cliGuard(req); if (refused) return err(403, refused); }
  const parsed = ideaBriefSpec.parseInput(req.body);
  if (!parsed.ok) return err(400, parsed.error);
  // A slot is taken only for a valid request, and always given back.
  const release = cli ? (o.limiter ?? getCliLimiter()).tryAcquire() : null;
  if (cli && !release) return err(429, BUSY_MESSAGE, BUSY_HEADERS);
  try {
    return { status: 200, body: { brief: await provider.analyze(parsed.value, { signal: req.signal }) } };
  } catch (e) {
    return err(e instanceof ProviderError ? 502 : 500, e instanceof ProviderError ? e.message : 'Could not build the Idea Brief.');
  } finally {
    release?.();
  }
}

/** POST /api/ai: body { task, input }. Runs one registered task and returns { task, key, provider, result }. */
export async function handleAiTask(req: ApiRequest, provider: AiProvider, o: Options = {}): Promise<AiApiResult> {
  const err = (status: number, error: string, headers?: ResponseHeaders): AiApiResult => ({ status, body: { error }, ...(headers ? { headers } : {}) });
  const cli = provider.name === 'claude-cli';
  if (cli) { const refused = cliGuard(req); if (refused) return err(403, refused); }
  const b = req.body as { task?: unknown; input?: unknown } | null;
  if (typeof b !== 'object' || b === null || Array.isArray(b) || typeof b.task !== 'string') return err(400, 'Send the task name and its input.');
  const spec = getTask(b.task);
  if (!spec) return err(404, 'Unknown AI task.');
  const parsed = spec.parseInput(b.input);
  if (!parsed.ok) return err(400, parsed.error);
  const release = cli ? (o.limiter ?? getCliLimiter()).tryAcquire() : null;
  if (cli && !release) return err(429, BUSY_MESSAGE, BUSY_HEADERS);
  try {
    const key = aiKey(spec, parsed.value);   // before running: a task whose input has an undeclared field fails here, loudly
    const result = await provider.run(spec, parsed.value, { signal: req.signal });
    return { status: 200, body: { task: spec.id, key, provider: provider.name, result } };
  } catch (e) {
    return err(e instanceof ProviderError ? 502 : 500, e instanceof ProviderError ? e.message : `Could not complete the ${spec.title}.`);
  } finally {
    release?.();
  }
}
