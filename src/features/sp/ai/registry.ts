// The tasks the AI route will run. Only ids listed here can be requested, so a request can never name
// anything else (including inherited object keys such as "constructor").
import { ideaBriefSpec } from './specs/ideaBrief';
import type { AiTaskSpec } from './task';

export const AI_TASKS: Readonly<Record<string, AiTaskSpec>> = Object.freeze({
  [ideaBriefSpec.id]: ideaBriefSpec,
});

export const getTask = (id: string): AiTaskSpec | null =>
  (Object.prototype.hasOwnProperty.call(AI_TASKS, id) ? AI_TASKS[id] : null);
