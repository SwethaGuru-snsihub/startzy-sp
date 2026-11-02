// The clarification questions the core asks a founder, with the answers its rules understand
// (values match what applicability.ts reads). A founder's own project starts with none of these
// answered; nothing is guessed from the idea or the industry.
import type { FactKey } from '@/engine/core/context';

const YN: [string, string][] = [['yes', 'Yes'], ['no', 'No']];
export const FACT_QUESTIONS: Partial<Record<FactKey, { q: string; options: [string, string][] }>> = {
  goal: { q: 'What is this startup for?', options: [['venture', 'A venture-funded company'], ['smallbiz', 'A small business'], ['internal', 'A product inside a company'], ['learning', 'Learning by building']] },
  org: { q: 'Where does it live?', options: [['independent', 'On my own'], ['company', 'Inside a company']] },
  funding: { q: 'How will it be funded?', options: [['investor', 'Investors'], ['revenue', 'Its own revenue'], ['budget', 'A company budget'], ['none', 'No funding']] },
  commercial: { q: 'Will it earn money?', options: [['yes', 'Yes'], ['later', 'Maybe later'], ['none', 'No']] },
  audience: { q: 'Who will use it?', options: [['public', 'The public'], ['invited', 'Invited people'], ['me', 'Only me']] },
  personalData: { q: 'Will it handle personal data?', options: YN },
  healthData: { q: 'Will it handle health information?', options: [['none', 'No'], ['contact', 'Patient contact details'], ['sensitive', 'Sensitive health records']] },
  regulatedActivity: { q: 'Does it carry out a regulated activity?', options: YN },
  jurisdiction: { q: 'Where will it operate?', options: [['IN', 'India'], ['US', 'United States'], ['EU', 'European Union'], ['UK', 'United Kingdom'], ['OTHER', 'Elsewhere']] },
  ui: { q: 'Does it have screens users see?', options: YN },
  hires: { q: 'Will you hire people for it?', options: YN },
  registration: { q: 'How is it registered?', options: [['none', 'Not registered'], ['sole', 'Sole proprietor'], ['company', 'A company']] },
  founders: { q: 'How many founders?', options: [['1', 'One'], ['2+', 'Two or more']] },
  collaborators: { q: 'Will other people create IP for it?', options: [['none', 'No'], ['contributors', 'Yes, contributors']] },
  ipOwner: { q: 'Who owns the IP today?', options: [['founders', 'The founders'], ['employer', 'An employer may claim it']] },
  objBeta: { q: 'Is a beta part of what you want to learn?', options: YN },
  objLaunch: { q: 'Is a launch part of what you want to learn?', options: YN },
};
