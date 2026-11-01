// The SJ8 direction decision: Go, Pivot, Pivot withdrawn and Stop, with Resume after a Stop.
// Every decision appends an immutable version; history is never edited.

// The full decision flow, including the steps that are not decision versions themselves
// (a pivot draft, the direction review that ends in a Go, a discarded draft).
export const DIRECTION_FLOW: Readonly<Record<string, readonly string[]>> = {
  open: ['go', 'pivot', 'stop'],
  go: ['pivot-draft', 'stop'],
  'pivot-draft': ['pivot', 'discard'],
  pivot: ['direction-review', 'pivot-withdrawn', 'stop'],
  'direction-review': ['go', 'pivot', 'stop'],
  'pivot-withdrawn': ['go'],
  discard: ['go'],
  stop: ['resume'],
  resume: ['go', 'pivot'],
};

export type DirectionKind = 'go' | 'pivot' | 'pivot-withdrawn' | 'stop';
export type PivotTarget = 'SP1' | 'SP2' | 'SP3' | 'SP4';
export type DirectionVersion = Readonly<{
  v: number; kind: DirectionKind; at: string; by: 'FOUNDER';
  target?: PivotTarget; restores?: number; revises?: number; resume?: boolean;
}>;
export type DirectionLog = { versions: DirectionVersion[] };
export type DirectionInput = Omit<DirectionVersion, 'v'>;

export const emptyDirectionLog = (): DirectionLog => ({ versions: [] });

/** Where the decision stands: open, go (also after a withdrawn pivot), pivot, or stopped. */
export function directionState(log: DirectionLog): 'open' | 'go' | 'pivot' | 'stopped' {
  const last = log.versions.at(-1);
  if (!last) return 'open';
  if (last.kind === 'pivot-withdrawn') return 'go';
  return last.kind === 'stop' ? 'stopped' : last.kind;
}

// decision versions each state accepts; drafts and the direction review are not versions
const ALLOWED: Record<ReturnType<typeof directionState>, DirectionKind[]> = {
  open: ['go', 'pivot', 'stop'], go: ['pivot', 'stop'], pivot: ['go', 'pivot', 'pivot-withdrawn', 'stop'], stopped: ['go', 'pivot'],
};

export function recordDirection(log: DirectionLog, d: DirectionInput): DirectionLog {
  const state = directionState(log);
  if (!ALLOWED[state].includes(d.kind)) throw new Error(`direction: ${d.kind} is not allowed after ${state}`);
  if (state === 'stopped' && !d.resume) throw new Error('direction: a stopped project continues only by an explicit resume');
  if (d.kind === 'pivot' && !d.target) throw new Error('direction: a pivot needs a target step');
  if (d.kind === 'pivot-withdrawn' && !log.versions.some(x => x.v === d.restores && x.kind === 'go')) throw new Error('direction: a withdrawn pivot restores an earlier Go');
  const version = Object.freeze({ ...d, v: log.versions.length + 1 });
  return { versions: [...log.versions, version] };
}

/** The Go decision currently in force, or null (none yet, or stopped). A pending pivot keeps the earlier Go in force. */
export function currentGo(log: DirectionLog): number | null {
  let current: number | null = null;
  for (const d of log.versions) {
    if (d.kind === 'go') current = d.v;
    else if (d.kind === 'pivot-withdrawn') current = d.restores!;
    else if (d.kind === 'stop') current = null;
  }
  return current;
}
