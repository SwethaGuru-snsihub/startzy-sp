// The common contract for a task an AI provider can do. A task is described once, as a spec: its prompt,
// the JSON schema the answer must fit, how the request is checked, how the model's answer is checked, and
// what the simulated provider answers offline. Providers (the Claude CLI, the simulated one, and later an
// API provider) run any spec; they know nothing about a particular task.
import type { Provider } from '../provenance';

export type Validated<T> = { ok: true; value: T } | { ok: false; error: string };

// Members use method syntax on purpose: that makes their parameters bivariant, so a spec for one task
// (AiTaskSpec<IdeaBriefInput, IdeaBrief>) can sit in a registry typed AiTaskSpec (unknown input and output).
export type AiTaskSpec<I = unknown, O = unknown> = {
  /** Registry key and the name callers use, for example 'idea-brief'. */
  readonly id: string;
  /** Names the task in messages, for example 'Idea Brief'. */
  readonly title: string;
  /** Bump when the meaning of the prompt, schema or validation changes. Editing their text also changes the digest. */
  readonly version: number;
  readonly systemPrompt: string;
  readonly jsonSchema: object;
  /**
   * Every field of the input that can change the answer. The input hash covers exactly these, and hashing an
   * input that carries any other field throws: a value that matters but is not declared would be silently
   * ignored by the stale-result check. Anything the answer is built from (the founder's words, answers, the
   * content of approved documents it depends on) must be one of these fields.
   */
  readonly dependsOn: readonly string[];
  /** Checks and normalises a request's input (server and client share it). */
  parseInput(raw: unknown): Validated<I>;
  /** The message sent to the model. Founder text in it is data, never instructions. */
  buildMessage(input: I): string;
  /** Checks the model's raw answer against the input. `provider` says who produced it. */
  validate(raw: unknown, input: I, provider: Provider): Validated<O>;
  /** The deterministic answer used offline and in tests. */
  simulate(input: I): O;
  /**
   * A cheap check of an answer read back from the network or from browser storage, which must not be trusted
   * just because it is there. It is not a replacement for `validate`, which sees the model's raw output.
   */
  checkResult?(value: unknown): boolean;
};

export type AiRunOptions = {
  /** Aborting stops the work and, for the CLI, kills the child process. */
  signal?: AbortSignal;
};

/** Runs a task. Always returns a validated value, or throws (ProviderError for failures a caller may show). */
export interface AiProvider {
  readonly name: Provider;
  run<I, O>(spec: AiTaskSpec<I, O>, input: I, opts?: AiRunOptions): Promise<O>;
}
