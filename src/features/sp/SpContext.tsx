'use client';
// The open Solution Planning project: its identity, its core instance, its documents, the live runner
// and the popup state. Provided by the /sp/[id] layout once the project's core instance has loaded,
// so every tab reads the same one and the rail and popups work the same on every page.
import { createContext, useContext } from 'react';
import type { Core } from '@/engine/core/project';
import type { Project } from '@/engine/core/types';
import type { CoreRuntime } from '@/services/coreRuntime';
import type { Env } from './actions';
import type { DocStore } from './docStore';
import type { IdeaInput } from './idea';
import type { Runner } from './runner';
import type { SpProject } from './spStore';
import type { RunPhase, TaskRow } from './viewModel';

/** A popup over the office. */
export type ModalSpec =
  | { kind: 'review' | 'input' | 'gate' | 'choose' | 'reconfirm' | 'task' | 'agent' | 'room'; id: string }
  | { kind: 'impact' | 'finish' };

export type SpValue = {
  id: string;
  record: SpProject;
  rt: CoreRuntime;
  core: Core;
  project: Project;
  /** The Discover tasks with their founder-facing status, read from the core on every render. */
  rows: TaskRow[];
  docs: DocStore;
  /** What the founder does, wired to this project. */
  env: Env;
  runner: Runner;
  phases: Record<string, RunPhase>;
  speed: number;
  setSpeed: (n: number) => void;
  modal: ModalSpec | null;
  open: (m: ModalSpec | null) => void;
  /** Opens the right popup for a task that waits for the founder. */
  openTask: (r: TaskRow) => void;
  toast: (message: string) => void;
  /** Goes to a document in the Documentation tab, optionally straight into editing. */
  goDoc: (task: string, edit?: boolean) => void;
  docTarget: { task: string; edit: boolean } | null;
  clearDocTarget: () => void;
  /** Records the founder's idea and starts the workflow. Returns an error message, or null when it worked. */
  start: (idea: IdeaInput) => string | null;
};
export const SpContext = createContext<SpValue | null>(null);

export function useSp(): SpValue {
  const v = useContext(SpContext);
  if (!v) throw new Error('useSp must be used inside the /sp/[id] layout.');
  return v;
}
