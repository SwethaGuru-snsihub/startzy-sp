// How an Idea Brief is produced. The Idea Definition workflow only knows this interface, so the local Claude
// CLI used while building and a production API provider later are interchangeable.
import { ideaContext, type StartOption } from '../idea';
import { extractSlots, SLOT_LABEL } from '../slots';
import { MAX_QUESTIONS, type IdeaBrief } from './briefSchema';

export type IdeaRequest = { text: string; option: StartOption };
export interface IdeaProvider {
  readonly name: 'simulated' | 'claude-cli';
  analyze(req: IdeaRequest): Promise<IdeaBrief>;
}

/** Today's deterministic logic behind the same interface. No model is called; everything is labelled simulated. */
export const simulatedProvider: IdeaProvider = {
  name: 'simulated',
  async analyze({ text, option }) {
    const slots = extractSlots(text, option), c = ideaContext(text, option);
    return {
      source: 'simulated',
      summary: text.trim(),
      slots,
      opportunity: `Today, people use ${c.topic.direct} or ${c.topic.indirect}; ${c.who} may be underserved.`,
      assumptions: slots.filter(s => s.provenance === 'inferred').map(s => `${SLOT_LABEL[s.slot]}: ${s.value}`),
      missingInformation: slots.filter(s => s.provenance === 'empty').map(s => SLOT_LABEL[s.slot]),
      clarifyingQuestions: c.questions.map(q => q.q).slice(0, MAX_QUESTIONS),
    };
  },
};
