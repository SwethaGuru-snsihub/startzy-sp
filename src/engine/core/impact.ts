// Impact of a post-Go pivot on SP1-SP4: reopen only the target, flag what depends on it, and
// leave everything upstream and unrelated untouched.
import type { PivotTarget } from './direction';
import { TASKS, TASK, consumers, informedConsumers, isDecision } from './register';
import type { ExecState } from './types';

export type PivotImpact = {
  reopen: string[];      // the target step's tasks
  revalidate: string[];  // approved tasks that use the target directly
  atRisk: string[];      // approved tasks further downstream; they are revalidated when their inputs change
  paused: string[];      // downstream work in progress
  reconfirm: string[];   // gates downstream; the founder confirms them again
  notice: string[];      // tasks only informed by affected work
  unaffected: string[];
};

const IN_PROGRESS: ExecState[] = ['in-progress', 'in-review', 'awaiting-approval'];
// the direction decision is never flagged by its own pivot; the founder approves the revised direction
const downstream = (id: string) => consumers(id).filter(c => c !== 'sj8');

export function pivotImpact(target: PivotTarget, status: Record<string, ExecState>): PivotImpact {
  const reopen = TASKS.filter(t => t.home === target && !isDecision(t.id)).map(t => t.id);
  const closure = new Set<string>(), queue = [...reopen];
  while (queue.length) for (const c of downstream(queue.pop()!)) if (!closure.has(c) && !reopen.includes(c)) { closure.add(c); queue.push(c); }
  const direct = new Set(reopen.flatMap(downstream).filter(c => !reopen.includes(c)));
  const inClosure = [...closure];
  const approved = (id: string) => status[id] === 'approved';
  const notice = [...new Set([...reopen, ...inClosure].flatMap(informedConsumers))].filter(i => !closure.has(i));
  const touched = new Set([...reopen, ...inClosure, ...notice]);
  return {
    reopen,
    revalidate: inClosure.filter(i => approved(i) && direct.has(i) && !isDecision(i)),
    atRisk: inClosure.filter(i => approved(i) && !direct.has(i) && !isDecision(i)),
    paused: inClosure.filter(i => IN_PROGRESS.includes(status[i])),
    reconfirm: inClosure.filter(i => isDecision(i) && TASK[i].kind === 'gate'),
    notice,
    unaffected: TASKS.map(t => t.id).filter(i => !touched.has(i) && i !== 'sj8'),
  };
}
