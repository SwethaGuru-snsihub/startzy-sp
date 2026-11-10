// The workflow tasks an AI task writes the draft of. Epic 1's Idea Brief is not here: it is fetched while the
// founder fills in the start popup and is kept on the idea (`idea.brief`), exactly as before. Later epics add
// their bindings here, one per task, each with the AI task's spec and how to build its input.
import type { AiBinding } from './gate';

export const AI_BINDINGS: readonly AiBinding[] = [];
