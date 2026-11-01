// Contexts used across the core tests: the three demo presets (stated facts plus the demo
// script's answers) and four founder-entered contexts that exercise the rules.
import { fact, type Context } from '../context';
import { presetContext } from '../presets';
import { IMPORTANT_TASKS } from '../applicability';

const F = (value: string) => fact(value, 'founder');

export const CONTEXTS: Record<string, Context> = {
  veejay: presetContext('veejay'),
  meera: presetContext('meera'),
  rahul: presetContext('rahul'),
  bootQuiet: { goal: F('smallbiz'), org: F('independent'), registration: F('sole'), founders: F('1'), collaborators: F('none'), ipOwner: F('founders'), funding: F('revenue'), commercial: F('yes'), audience: F('invited'), personalData: F('no'), healthData: F('none'), regulatedActivity: F('no'), industry: F('retail'), ui: F('yes'), hires: F('no'), jurisdiction: F('IN') },
  learnSolo: { goal: F('learning'), org: F('independent'), registration: F('none'), founders: F('1'), collaborators: F('none'), ipOwner: F('founders'), funding: F('none'), commercial: F('none'), audience: F('me'), personalData: F('no'), healthData: F('none'), regulatedActivity: F('no'), industry: F('software'), ui: F('yes'), hires: F('no'), objBeta: F('no'), objLaunch: F('no'), jurisdiction: F('IN') },
  learnPublic: { goal: F('learning'), org: F('independent'), registration: F('none'), founders: F('1'), collaborators: F('none'), ipOwner: F('founders'), funding: F('none'), commercial: F('later'), audience: F('public'), personalData: F('yes'), healthData: F('none'), regulatedActivity: F('no'), industry: F('software'), ui: F('yes'), hires: F('no'), objBeta: F('yes'), objLaunch: F('yes'), jurisdiction: F('IN') },
  learnPair: { goal: F('learning'), org: F('independent'), registration: F('none'), founders: F('2+'), collaborators: F('contributors'), ipOwner: F('founders'), funding: F('none'), commercial: F('none'), audience: F('invited'), personalData: F('no'), healthData: F('none'), regulatedActivity: F('no'), industry: F('software'), ui: F('yes'), hires: F('no'), objBeta: F('no'), objLaunch: F('no'), jurisdiction: F('IN') },
};

export const CONTEXT_NAMES = Object.keys(CONTEXTS);
export const ACK_ALL: readonly string[] = [...IMPORTANT_TASKS];
export { F };
