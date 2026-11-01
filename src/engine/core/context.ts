// Founder context: the facts the applicability rules read, each with where it came from.
// Nothing is inferred from industry or role; a missing fact is a clarification question.

export type FactKey =
  | 'goal' | 'org' | 'registration' | 'founders' | 'collaborators' | 'ipOwner' | 'funding' | 'commercial'
  | 'audience' | 'personalData' | 'healthData' | 'regulatedActivity' | 'industry' | 'ui' | 'hires'
  | 'jurisdiction' | 'objBeta' | 'objLaunch' | 'raise';

// founder = confirmed by the founder · artifact = set by an approved artifact · ai = inferred, never decisive
// preset = stated in demo persona data (with cites) · demo-answer = the demo script answering a question
// migrated = carried over by a ruleset migration
export type FactSource = 'founder' | 'artifact' | 'ai' | 'preset' | 'demo-answer' | 'migrated';
export type Cite = { file?: string; line: number; quote: string };
export type Fact = { value: string; source: FactSource; cite?: Cite[]; from?: { task: string; version: number } };
export type Context = Partial<Record<FactKey, Fact>>;

export const fact = (value: string, source: FactSource = 'founder'): Fact => ({ value, source });
