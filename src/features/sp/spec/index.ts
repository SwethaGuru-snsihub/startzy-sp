// The epic spec as data: the 27 epics of the "Slots mapped" sheet, parsed into docs/spec/spec.json.
// Read only. Screens and the epic mappings take their task, slot and feature names from here, so a
// re-exported sheet changes the UI text without code changes (the tests guard the shape and totals).
import raw from '../../../../docs/spec/spec.json';

export type SpecTask = {
  id: string; row: number; group: string | null; responsible: string; input: string; slots: string;
  process: string; flow: string; output: string; prompt: string;
};
export type SpecSlot = { slot: string; owner: string; supporting: string };
export type SpecEpic = {
  epic: number; sheetEpic: number; name: string; mappingTitle: string;
  features: string[]; tasks: SpecTask[]; slots: SpecSlot[];
};
export type Spec = { source: string; epics: SpecEpic[] };

export const SPEC = raw as unknown as Spec;

export function epicOf(n: number): SpecEpic {
  const e = SPEC.epics.find(x => x.epic === n);
  if (!e) throw new Error(`No epic ${n} in the spec`);
  return e;
}
export const taskOf = (id: string): SpecTask | undefined => SPEC.epics.flatMap(e => e.tasks).find(t => t.id === id);
