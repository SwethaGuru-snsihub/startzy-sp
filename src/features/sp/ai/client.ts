// The browser side of the AI routes. Neither function throws: the caller always has an answer to show.
import type { StartOption } from '../idea';
import type { Provider } from '../provenance';
import type { IdeaBrief } from './briefSchema';

export type AiFetchResult<O = unknown> =
  | { ok: true; task: string; key: string; provider: Provider; result: O }
  | { ok: false; error: string; status: number | null; retryable: boolean };

/**
 * POST /api/ai for one task. `retryable` is true only for a busy server (429) or no answer at all; a
 * refusal, a bad request or a failed provider is not worth repeating without something changing.
 */
export async function fetchAi<O = unknown>(task: string, input: unknown, f: typeof fetch = fetch, signal?: AbortSignal): Promise<AiFetchResult<O>> {
  try {
    const res = await f('/api/ai', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ task, input }), signal });
    const data = await res.json().catch(() => null) as { task?: string; key?: string; provider?: Provider; result?: O; error?: string } | null;
    if (res.ok && data && typeof data.task === 'string' && typeof data.key === 'string' && data.provider && data.result !== undefined) {
      return { ok: true, task: data.task, key: data.key, provider: data.provider, result: data.result };
    }
    return { ok: false, error: data?.error ?? 'The AI service did not answer.', status: res.status, retryable: res.status === 429 };
  } catch {
    return { ok: false, error: 'Could not reach the AI service.', status: null, retryable: true };
  }
}

export type BriefResult = { ok: true; brief: IdeaBrief } | { ok: false; error: string };

export async function fetchBrief(text: string, option: StartOption, f: typeof fetch = fetch): Promise<BriefResult> {
  try {
    const res = await f('/api/idea-brief', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, option }) });
    const data = await res.json().catch(() => null) as { brief?: IdeaBrief; error?: string } | null;
    if (res.ok && data?.brief) return { ok: true, brief: data.brief };
    return { ok: false, error: data?.error ?? 'The Idea Brief service did not answer.' };
  } catch {
    return { ok: false, error: 'Could not reach the Idea Brief service.' };
  }
}
