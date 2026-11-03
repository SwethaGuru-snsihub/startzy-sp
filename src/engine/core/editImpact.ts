// What editing an approved artifact does downstream, before anything is changed. The core flags the
// artifacts that were approved on the old version one step at a time (see project.ts cascade): the
// direct consumers are flagged at once, and each further one when the one before it is approved again.
import { TASK, consumers } from './register';
import type { ExecState } from './types';

export type EditImpact = {
  direct: string[];   // approved on the old version: flagged for re-check (decisions: confirm again) as soon as the edit is saved
  paused: string[];   // work in progress that uses it: paused
  later: string[];    // approved further downstream: flagged when the artifact before it is approved again
};

const IN_PROGRESS: ExecState[] = ['in-progress', 'in-review', 'awaiting-approval'];
const skip = (id: string) => TASK[id].kind === 'direction';   // the direction decision changes only by the founder deciding

export function editImpact(id: string, status: Record<string, ExecState>): EditImpact {
  const direct = consumers(id).filter(c => !skip(c) && status[c] === 'approved');
  const paused = consumers(id).filter(c => !skip(c) && IN_PROGRESS.includes(status[c]));
  const seen = new Set<string>([id, ...direct, ...paused]);
  const later: string[] = [], queue = [...direct];
  while (queue.length) {
    for (const c of consumers(queue.pop()!)) {
      if (skip(c) || seen.has(c)) continue;
      seen.add(c);
      if (status[c] === 'approved') { later.push(c); queue.push(c); }
    }
  }
  return { direct, paused, later };
}
