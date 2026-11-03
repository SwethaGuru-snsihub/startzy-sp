// What submitting the start popup does to a project's core instance. The popup is the founder's
// answer to three real tasks, so each is recorded as the founder's own work, through real core actions:
//   Founder profile   confirmed by the founder (their sign-in)
//   Idea goal         the founder's idea, in their words
//   Clarification     the founder's three answers
// The goal answer is also the 'goal' fact that the Discover tasks' applicability rules read.
// Delegation is set to 0 so every approval in Solution Planning goes to the founder.
import type { Core } from '@/engine/core/project';
import type { Project } from '@/engine/core/types';
import { goalFactOf, type IdeaInput } from './idea';

export const STARTED_TASKS = ['profile', 'goal', 'clarify'] as const;

export const isStarted = (core: Core, p: Project) => core.state(p, 'goal') !== 'not-started';

function recordFounderWork(core: Core, p: Project, id: string) {
  core.startTask(p, id, 'human');
  core.submitTask(p, id);
  core.approveTask(p, id, { by: 'FOUNDER' });
}

export function startIdea(core: Core, p: Project, idea: IdeaInput): void {
  if (isStarted(core, p)) throw new Error('This project already has its idea.');
  const goal = goalFactOf(idea.answers.a3);
  if (!goal) throw new Error('Choose what the goal is for before starting.');
  if (!idea.text.trim()) throw new Error('Describe the idea first.');
  p.idea = idea.text.trim();
  core.setDelegation(p, 0);
  core.setFact(p, 'goal', goal);
  // The profile is the founder's signed-in identity; Atlas prepares it, and only the founder can approve it.
  core.startTask(p, 'profile', 'simulated');
  core.submitTask(p, 'profile');
  core.approveTask(p, 'profile', { by: 'FOUNDER' });
  recordFounderWork(core, p, 'goal');
  recordFounderWork(core, p, 'clarify');
}
