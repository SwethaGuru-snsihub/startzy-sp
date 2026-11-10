// The browser side of POST /api/idea-brief. Never throws: the popup always has an answer to show.
import type { StartOption } from '../idea';
import type { IdeaBrief } from './briefSchema';

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
