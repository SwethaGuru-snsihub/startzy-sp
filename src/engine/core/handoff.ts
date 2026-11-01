// SP16 handoff: it cannot be approved or submitted while any input is invalid. N/A and declined
// inputs pass through to their own inputs, so they can never hide an invalid upstream input.
import type { ApplicabilityMap } from './applicability';
import type { Context } from './context';
import { requiredInputs } from './register';

// valid = approved and not flagged (a decision: its current version) · declined = optional and not taken up
export type InputValidity = 'valid' | 'declined' | 'invalid';

export function handoffBlockers(ctx: Context, app: ApplicabilityMap, validity: Record<string, InputValidity>): string[] {
  const ok = (id: string): boolean => {
    if (app[id].status === 'na' || validity[id] === 'declined') return requiredInputs(id, ctx).every(ok);
    return validity[id] === 'valid';
  };
  return requiredInputs('handoff', ctx).filter(id => !ok(id));
}
