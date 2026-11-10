// What is kept for each AI request. One record per key (task id plus input hash), stored with the project's
// documents. A record says whether the answer is still being fetched, arrived, or failed, and who produced it.
// Pure: no storage, no network. The shared AI service writes these; everything else only reads them.
import type { Provider } from '../provenance';

export type AiStatus = 'pending' | 'ready' | 'failed';

/** The first-choice provider could not answer, so the value shown is the simulated one. Never silent. */
export type AiFallback = { from: Provider; reason: string };

export type AiRecord = {
  /** `${task}:${inputHash}`: the exact task, prompt, schema and input this record answers. */
  key: string;
  task: string;
  status: AiStatus;
  /** Which request attempt owns a pending record. A late answer from any other attempt is discarded. */
  requestId: string;
  /** Network attempts made for this key (a retry adds one). */
  attempts: number;
  requestedAt: string;
  /** pending: the page session that is fetching, and when it last said it was still alive. */
  session?: string;
  heartbeatAt?: string;
  /** pending: after this the request is dead whatever its owner says. */
  deadline?: string;
  /** ready: the validated answer and who produced it. */
  value?: unknown;
  provider?: Provider;
  fallback?: AiFallback;
  /** failed: why, and whether trying the same request again could help. */
  error?: string;
  retryable?: boolean;
  settledAt?: string;
};

const STATUSES: readonly string[] = ['pending', 'ready', 'failed'];
const PROVIDERS: readonly string[] = ['simulated', 'claude-cli'];
const isStr = (x: unknown): x is string => typeof x === 'string';

/** Whether something read back from storage is a usable record. Anything else is dropped, never trusted. */
export function isAiRecord(x: unknown): x is AiRecord {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) return false;
  const r = x as Record<string, unknown>;
  if (!isStr(r.key) || !isStr(r.task) || !r.key.startsWith(`${r.task}:`)) return false;
  if (!isStr(r.status) || !STATUSES.includes(r.status)) return false;
  if (!isStr(r.requestId) || !isStr(r.requestedAt)) return false;
  if (typeof r.attempts !== 'number' || !Number.isInteger(r.attempts) || r.attempts < 0) return false;
  if (r.provider !== undefined && !(isStr(r.provider) && PROVIDERS.includes(r.provider))) return false;
  if (r.status === 'ready' && (r.value === undefined || !isStr(r.provider))) return false;   // a ready record without an answer is not ready
  if (r.fallback !== undefined) {
    const f = r.fallback as Record<string, unknown> | null;
    if (typeof f !== 'object' || f === null || !isStr(f.from) || !PROVIDERS.includes(f.from) || !isStr(f.reason)) return false;
  }
  return true;
}

/** The valid records of whatever was stored under `ai`: an absent or malformed bucket is simply empty. */
export function cleanRecords(raw: unknown): Record<string, AiRecord> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  const out: Record<string, AiRecord> = {};
  for (const [k, v] of Object.entries(raw)) if (isAiRecord(v) && v.key === k) out[k] = v;
  return out;
}

export const MAX_RECORDS_PER_TASK = 2;
export const MAX_FAILED_PER_TASK = 10;

/**
 * Keeps the store small without ever losing something someone is relying on:
 * - every pending record (someone may be waiting on it);
 * - the newest few answers of each task (by when they settled), so old inputs do not pile up in browser storage;
 * - the newest failures of each task, under a separate and larger cap. A failure is tiny, and one that
 *   vanished would read as "nothing asked yet", so the same request would be made again without anyone
 *   choosing to retry it.
 * Pending records and failures never take an answer's place, and answers never take theirs. The record just
 * written (`protect`) is always kept: a write must never evict itself, whatever the order of the others.
 */
export function pruneRecords(records: Record<string, AiRecord>, keep = MAX_RECORDS_PER_TASK, keepFailed = MAX_FAILED_PER_TASK, protect?: string): Record<string, AiRecord> {
  const byTask = new Map<string, AiRecord[]>();
  for (const r of Object.values(records)) byTask.set(r.task, [...(byTask.get(r.task) ?? []), r]);
  const when = (r: AiRecord) => r.settledAt ?? r.requestedAt;
  const newest = (list: AiRecord[]) => [...list].sort((a, b) => (a.key === protect ? -1 : b.key === protect ? 1 : 0) || when(b).localeCompare(when(a)) || a.key.localeCompare(b.key));
  const out: Record<string, AiRecord> = {};
  for (const list of byTask.values()) {
    const kept = [
      ...list.filter(r => r.status === 'pending'),
      ...newest(list.filter(r => r.status === 'ready')).slice(0, keep),
      ...newest(list.filter(r => r.status === 'failed')).slice(0, keepFailed),
    ];
    for (const r of kept) out[r.key] = r;
  }
  return out;
}
