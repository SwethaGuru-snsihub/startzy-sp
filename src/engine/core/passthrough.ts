// N/A and declined pass-through. A task that is not performed is satisfied only when its own
// inputs are, so skipping a task can never let a consumer start past an unsatisfied requirement.
import type { Context } from './context';
import { requiredInputs } from './register';

/** The performed tasks a task actually waits for: its inputs, looking through skipped ones to theirs. */
export function effectiveInputs(id: string, skipped: (id: string) => boolean, ctx?: Context): string[] {
  const out: string[] = [];
  const add = (x: string) => { if (!out.includes(x)) out.push(x); };
  for (const p of requiredInputs(id, ctx)) (skipped(p) ? effectiveInputs(p, skipped, ctx) : [p]).forEach(add);
  return out;
}

/** Every performed task upstream of a task, following effective inputs all the way. */
export function effectiveClosure(id: string, skipped: (id: string) => boolean, ctx?: Context): Set<string> {
  const seen = new Set<string>(), queue = [...effectiveInputs(id, skipped, ctx)];
  while (queue.length) {
    const n = queue.pop()!;
    if (seen.has(n)) continue;
    seen.add(n); queue.push(...effectiveInputs(n, skipped, ctx));
  }
  return seen;
}
