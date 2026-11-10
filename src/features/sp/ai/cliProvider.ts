// Runs the locally authenticated Claude Code CLI (`claude -p`) for any AI task spec. Server only, and
// meant for building and demos on a developer's own machine: a personal login is not for a deployed,
// multi-user product (that is the API provider's job). The founder's text goes in on stdin, never into a
// shell string, the CLI gets no tools, its answer is validated by the task before anything uses it, and
// the child process is always ended: on timeout, on too much output, and when the caller aborts.
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import type { IdeaBrief } from './briefSchema';
import type { IdeaProvider, IdeaRequest } from './provider';
import { ideaBriefSpec } from './specs/ideaBrief';
import type { AiProvider, AiRunOptions, AiTaskSpec } from './task';

export type RunResult = { code: number | null; stdout: string; stderr: string; timedOut: boolean; tooLarge: boolean; aborted?: boolean; pid?: number };
export type RunOptions = { cwd: string; timeoutMs: number; maxBytes: number; signal?: AbortSignal };
export type Runner = (exe: string, args: string[], stdin: string, o: RunOptions) => Promise<RunResult>;

export const DEFAULT_TIMEOUT_MS = 90_000;
/** How long a child gets to leave after being asked to, before it is killed outright, and before we stop waiting. */
export const KILL_GRACE_MS = 2_000;
export const KILL_GIVE_UP_MS = 5_000;
const MAX_BYTES = 512 * 1024;

/**
 * The real runner: spawn without a shell, feed stdin, cap time and output, and honour an abort signal.
 * It always settles, even if the child ignores being stopped, so whoever holds a capacity slot can release it.
 */
export const spawnRunner: Runner = (exe, args, stdin, { cwd, timeoutMs, maxBytes, signal }) => new Promise(resolve => {
  if (signal?.aborted) { resolve({ code: null, stdout: '', stderr: '', timedOut: false, tooLarge: false, aborted: true }); return; }
  let stdout = '', stderr = '', timedOut = false, tooLarge = false, aborted = false, done = false;
  const timers: ReturnType<typeof setTimeout>[] = [];
  const child = spawn(exe, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  const finish = (code: number | null) => {
    if (done) return;
    done = true;
    timers.forEach(clearTimeout);
    signal?.removeEventListener('abort', onAbort);
    resolve({ code, stdout, stderr, timedOut, tooLarge, aborted, pid: child.pid });
  };
  const stop = () => {
    if (done) return;
    child.kill();
    const hard = setTimeout(() => child.kill('SIGKILL'), KILL_GRACE_MS);
    const giveUp = setTimeout(() => finish(null), KILL_GIVE_UP_MS);
    hard.unref?.(); giveUp.unref?.();
    timers.push(hard, giveUp);
  };
  const onAbort = () => { aborted = true; stop(); };
  timers.push(setTimeout(() => { timedOut = true; stop(); }, timeoutMs));
  signal?.addEventListener('abort', onAbort, { once: true });
  child.stdout.on('data', d => { stdout += d; if (stdout.length > maxBytes && !tooLarge) { tooLarge = true; stop(); } });
  child.stderr.on('data', d => { if (stderr.length < 4000) stderr += d; });
  child.on('error', e => { stderr += e.message; finish(null); });
  child.on('close', finish);
  child.stdin.on('error', () => { /* the process ended before reading stdin; the close handler reports it */ });
  child.stdin.end(stdin);
});

/** The flags that keep the CLI to one job: answer once, in the task's schema, with no tools and no saved session. */
export const cliArgsFor = (spec: AiTaskSpec, model?: string): string[] => [
  '-p', '--output-format', 'json',
  '--tools', '',
  '--no-session-persistence',
  '--strict-mcp-config',
  '--system-prompt', spec.systemPrompt,
  '--json-schema', JSON.stringify(spec.jsonSchema),
  ...(model ? ['--model', model] : []),
];

/** The Idea Brief's command line, as it has always been. */
export const cliArgs = (model?: string): string[] => cliArgsFor(ideaBriefSpec, model);

/** Pulls the model's answer out of the CLI's JSON envelope. */
export function readEnvelope(stdout: string): { ok: true; data: unknown } | { ok: false; error: string } {
  let env: unknown;
  try { env = JSON.parse(stdout); } catch { return { ok: false, error: 'The CLI did not return JSON' }; }
  if (typeof env !== 'object' || env === null) return { ok: false, error: 'The CLI answer has an unexpected shape' };
  const e = env as { is_error?: boolean; structured_output?: unknown; result?: unknown };
  if (e.is_error) return { ok: false, error: 'The CLI reported an error' };
  if (e.structured_output !== undefined && e.structured_output !== null) return { ok: true, data: e.structured_output };
  if (typeof e.result === 'string') { try { return { ok: true, data: JSON.parse(e.result) }; } catch { /* fall through */ } }
  return { ok: false, error: 'The CLI answer had no structured output' };
}

export class ProviderError extends Error {}

export type CliOptions = { exe?: string; run?: Runner; timeoutMs?: number; model?: string; retries?: number };

/** Runs any task spec through the Claude CLI. A task's own validation decides whether an answer is usable. */
export function createCliAiProvider(o: CliOptions = {}): AiProvider {
  const exe = o.exe ?? process.env.CLAUDE_CLI_PATH ?? 'claude';
  const run = o.run ?? spawnRunner, timeoutMs = o.timeoutMs ?? DEFAULT_TIMEOUT_MS, retries = o.retries ?? 1;
  return {
    name: 'claude-cli',
    async run<I, O>(spec: AiTaskSpec<I, O>, input: I, opts: AiRunOptions = {}): Promise<O> {
      const message = spec.buildMessage(input);
      let last = 'No attempt was made';
      for (let attempt = 0; attempt <= retries; attempt++) {
        if (opts.signal?.aborted) throw new ProviderError('The request was cancelled');
        // Run from a neutral folder so the CLI does not load this project's instructions or files.
        const r = await run(exe, cliArgsFor(spec as AiTaskSpec, o.model), message, { cwd: tmpdir(), timeoutMs, maxBytes: MAX_BYTES, signal: opts.signal });
        if (r.aborted) throw new ProviderError('The request was cancelled');
        if (r.timedOut) throw new ProviderError('Claude took too long to answer');   // not retried: it would only wait again
        if (r.tooLarge) throw new ProviderError('Claude returned far more than expected');
        if (r.code !== 0) throw new ProviderError(r.code === null ? 'The Claude CLI could not be started. Is it installed and on the PATH?' : 'The Claude CLI failed. Is it signed in?');
        const env = readEnvelope(r.stdout);
        if (!env.ok) { last = env.error; continue; }
        const checked = spec.validate(env.data, input, 'claude-cli');
        if (checked.ok) return checked.value;
        last = checked.error;
      }
      throw new ProviderError(`Claude's answer was not a valid ${spec.title} (${last})`);
    },
  };
}

/** The Idea Brief provider Epic 1 uses, now a thin wrapper over the generic provider. */
export function createCliProvider(o: CliOptions = {}): IdeaProvider {
  const ai = createCliAiProvider(o);
  return {
    name: 'claude-cli',
    analyze: (req: IdeaRequest, opts?: AiRunOptions): Promise<IdeaBrief> => ai.run(ideaBriefSpec, req, opts),
  };
}
