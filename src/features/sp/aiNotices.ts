// The notices the founder sees about the AI: an agent waiting for Claude's answer, a failure that is holding
// the work, and a draft that is simulated because Claude was unavailable. Pure: the rail shows what this says.
import type { GateState } from './ai/gate';
import type { AiFallback } from './ai/records';
import { agentLook } from './model';
import type { RunPhase, TaskRow } from './viewModel';

export type Notice = { id: string; tone: 'wait' | 'bad'; text: string };

export function aiNotices(
  rows: Pick<TaskRow, 'id' | 'artifact' | 'status' | 'owner'>[],
  src: { phases: Record<string, RunPhase>; ai: (task: string) => GateState | null; fallbackOf: (task: string) => AiFallback | null },
): Notice[] {
  const out: Notice[] = [];
  for (const r of rows) {
    const g = src.ai(r.id);
    if (src.phases[r.id] === 'wait' && g) {
      if (g.status === 'pending') out.push({ id: `${r.id}:wait`, tone: 'wait', text: `${agentLook(r.owner).name} is waiting for Claude to answer for ${r.artifact}.` });
      else if (g.status === 'failed') out.push({ id: `${r.id}:failed`, tone: 'bad', text: `Claude could not answer for ${r.artifact}: ${g.error ?? 'no reason given'} The work is on hold and will not retry by itself.` });
    }
    const f = r.status === 'needs' ? src.fallbackOf(r.id) : null;      // while the draft waits for the founder
    if (f) out.push({ id: `${r.id}:fallback`, tone: 'bad', text: `${r.artifact} was drafted by the simulated provider because Claude was unavailable. ${f.reason}` });
  }
  return out;
}
