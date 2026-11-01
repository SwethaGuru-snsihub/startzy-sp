// Demo presets for the three demo founders. They are demo and test data only, never a real
// founder's context. A preset carries only facts stated in personas.ts, each citing the line and
// the words it comes from. Anything the persona data does not state is a clarification question
// in the demo too, answered by the demo script and stored as a 'demo-answer', never as a persona fact.
import type { Cite, Context, Fact, FactKey } from './context';

export type DemoPresetId = 'veejay' | 'meera' | 'rahul';
const S = (value: string, ...cite: [number, string][]): Fact => ({ value, source: 'preset', cite: cite.map(([line, quote]): Cite => ({ file: 'src/engine/personas.ts', line, quote })) });
const A = (value: string): Fact => ({ value, source: 'demo-answer' });

export const DEMO_PRESETS: Readonly<Record<DemoPresetId, { idea: string; stated: Context; demoAnswers: Context }>> = {
  veejay: {
    idea: 'ClinicFlow: Appointment reminders for dental clinics',
    stated: {
      goal: S('venture', [21, 'goal:0']),
      org: S('independent', [22, 'First-time founder leaving a job'], [21, "path:'funded'"]),
      funding: S('investor', [21, "path:'funded'"], [42, "who:'angel investors'"]),
      commercial: S('yes', [38, '₹500 per clinic per month']),
      registration: S('company', [43, 'Private limited registration']),
      personalData: S('yes', [40, 'Phone numbers encrypted; consent captured at booking']),
      healthData: S('contact', [23, 'Appointment reminders for dental clinics'], [39, "{n:'Patient records',core:0}"]),
      audience: S('public', [41, 'As a patient, I want to rebook with one tap']),
      jurisdiction: S('IN', [21, 'Bengaluru'], [28, 'Karnataka']),
      industry: S('healthcare (dental clinics)', [23, 'dental clinics']),
      ui: S('yes', [39, 'One-tap rebooking']),
      hires: S('yes', [44, 'Full-stack developer']),
    },
    demoAnswers: { founders: A('1'), ipOwner: A('founders'), collaborators: A('none'), regulatedActivity: A('no') },
  },
  meera: {
    idea: 'TutorBooks: Fee tracking and reminders for home tutors',
    stated: {
      goal: S('smallbiz', [47, 'goal:1']),
      org: S('independent', [48, 'Solo founder who keeps freelancing']),
      founders: S('1', [48, 'Solo founder']),
      funding: S('revenue', [48, 'No investors: grows from revenue']),
      commercial: S('yes', [64, '₹199 per tutor per month']),
      personalData: S('yes', [66, 'Stores only names, phone numbers and fees']),
      healthData: S('none', [66, 'Stores only names, phone numbers and fees']),
      audience: S('public', [67, 'As a parent, I want to see what I owe and pay in one tap.']),
      jurisdiction: S('IN', [47, 'Pune']),
      industry: S('education services', [49, 'Home tutors']),
      ui: S('yes', [65, 'Parent payment page']),
      hires: S('yes', [70, 'Contract designer']),
    },
    demoAnswers: { registration: A('sole'), ipOwner: A('founders'), collaborators: A('none'), regulatedActivity: A('no') },
  },
  rahul: {
    idea: 'DockSlot: Truck dock scheduling for warehouses',
    stated: {
      goal: S('internal', [73, 'goal:2']),
      org: S('company', [74, 'Builds a new product inside a large company']),
      funding: S('budget', [74, 'Needs budget approval, not investors'], [94, 'the steering committee']),
      commercial: S('yes', [90, 'Savings case: shorter waits, more trips']),
      personalData: S('yes', [92, 'Driver phone numbers deleted after 90 days'], [95, 'Data privacy review']),
      audience: S('invited', [93, 'book a dock slot from a link'], [97, 'Onboarding calls with partners']),
      jurisdiction: S('IN', [73, 'Chennai']),
      industry: S('logistics', [73, 'logistics company']),
      ui: S('yes', [91, 'Live dock board']),
      hires: S('yes', [96, 'Business analyst']),
    },
    demoAnswers: { healthData: A('none'), regulatedActivity: A('no') },
  },
};

export const statedFacts = (id: DemoPresetId): Context => ({ ...DEMO_PRESETS[id].stated });
/** Stated facts plus the demo script's answers: the context after the demo's clarification questions. */
export const presetContext = (id: DemoPresetId): Context => ({ ...DEMO_PRESETS[id].stated, ...DEMO_PRESETS[id].demoAnswers });
export const demoAnswerKeys = (id: DemoPresetId) => Object.keys(DEMO_PRESETS[id].demoAnswers) as FactKey[];
