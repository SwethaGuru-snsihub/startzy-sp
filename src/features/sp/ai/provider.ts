// How an Idea Brief is produced. The Idea Definition workflow only knows this interface, so the local Claude
// CLI used while building and a production API provider later are interchangeable.
import type { IdeaBrief } from './briefSchema';
import { ideaBriefSpec, type IdeaBriefInput } from './specs/ideaBrief';

export type IdeaRequest = IdeaBriefInput;
export interface IdeaProvider {
  readonly name: 'simulated' | 'claude-cli';
  analyze(req: IdeaRequest): Promise<IdeaBrief>;
}

/** Today's deterministic logic behind the same interface. No model is called; everything is labelled simulated. */
export const simulatedProvider: IdeaProvider = {
  name: 'simulated',
  async analyze(req) { return ideaBriefSpec.simulate(req); },
};
