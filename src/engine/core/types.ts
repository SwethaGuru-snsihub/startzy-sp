// Project state for the new core. Plain data only (no Set, Map, class or function), so a project
// can be saved and restored as JSON. Approved versions and decisions are frozen when created.
import type { Context } from './context';
import type { DemoPresetId } from './presets';
import type { DirectionLog } from './direction';
import type { EvidenceItem } from './evidence';
import type { PackageVersion, Phase14 } from './packages';
import type { Workflow } from './definitions';

// Three separate axes per task: applicability (from context, see applicability.ts), execution
// state (below), and execution method: who or what did the work. Nothing is presented as real
// AI or human work when it was simulated.
export type ExecutionMethod = 'simulated' | 'ai' | 'human';
export type ExecState =
  | 'not-started' | 'in-progress' | 'in-review' | 'awaiting-approval' | 'approved' | 'declined'
  | 'needs-revalidation'      // an approved artifact whose inputs or applicability changed
  | 'needs-reconfirmation'    // a decision the founder must confirm again
  | 'paused';                 // work stopped because an input became invalid
export type Approver = 'FOUNDER' | 'CEO' | 'SOLUTION_BUILDER';

export type ArtifactVersion = Readonly<{
  v: number; at: string; method: ExecutionMethod;
  pins: Readonly<Record<string, number>>;
  approval: Readonly<{ by: Approver; method: ExecutionMethod }>;
  outcome?: 'pass';
}>;
export type TaskRuntime = { state: ExecState; method: ExecutionMethod | null; versions: ArtifactVersion[]; reworks: number; atRisk: boolean };
export type WorkflowInstance = { id: Workflow; tasks: Record<string, TaskRuntime> };

export type EventType =
  | 'created' | 'fact' | 'acknowledged' | 'started' | 'submitted' | 'reviewed' | 'approved' | 'declined' | 'decided'
  | 'package' | 'accepted' | 'returned' | 'phase14-unlocked' | 'reopened' | 'needs-revalidation' | 'needs-reconfirmation'
  | 'paused' | 'at-risk' | 'notice' | 'no-longer-applicable' | 'archived' | 'resumed' | 'evidence';
export type ProjectEvent = {
  seq: number; at: string; type: EventType; workflow?: Workflow; task?: string; version?: number;
  by?: Approver | string; method?: ExecutionMethod; detail?: string;
};

export type Project = {
  schema: 1;
  id: string;
  origin: 'founder' | 'demo';
  demoPreset?: DemoPresetId;
  ruleset: 'rev7-1';
  idea: string;
  createdAt: string;
  context: Context;
  acknowledged: string[];
  archived: boolean;
  workflows: Record<Workflow, WorkflowInstance>;
  direction: DirectionLog;
  pivotSnapshot: { workflows: Record<Workflow, WorkflowInstance>; packages: PackageVersion[]; approvalsAt: number } | null;
  packages: PackageVersion[];
  phase14: Phase14;
  evidence: EvidenceItem[];
  events: ProjectEvent[];
};
