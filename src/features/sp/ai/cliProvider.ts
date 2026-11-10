// Runs the locally authenticated Claude Code CLI (`claude -p`) to write the Idea Brief. Server only, and
// meant for building and demos on a developer's own machine: a personal login is not for a deployed,
// multi-user product (that is the API provider's job). The founder's text goes in on stdin, never into a
// shell string, the CLI gets no tools, and its answer is validated before anything uses it.
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { BRIEF_JSON_SCHEMA, validateBrief, type IdeaBrief } from './briefSchema';
import { SYSTEM_PROMPT, userMessage } from './prompt';
import type { IdeaProvider, IdeaRequest } from './provider';

export type RunResult = { code: number | null; stdout: string; stderr: string; timedOut: boolean; tooLarge: boolean };
export type Runner = (exe: string, args: string[], stdin: string, o: { cwd: string; timeoutMs: number; maxBytes: number }) => Promise<RunResult>;

export const DEFAULT_TIMEOUT_MS = 90_000;
const MAX_BYTES = 512 * 1024;

/** The real runner: spawn without a shell, feed stdin, cap time and output. */
export const spawnRunner: Runner = (exe, args, stdin, { cwd, timeoutMs, maxBytes }) => new Promise(resolve => {
  let stdout = '', stderr = '', timedOut = false, tooLarge = false, done = false;
  const finish = (code: number | null) => { if (!done) { done = true; clearTimeout(timer); resolve({ code, stdout, stderr, timedOut, tooLarge }); } };
  const child = spawn(exe, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  const timer = setTimeout(() => { timedOut = true; child.kill(); }, timeoutMs);
  child.stdout.on('data', d => { stdout += d; if (stdout.length > maxBytes) { tooLarge = true; child.kill(); } });
  child.stderr.on('data', d => { if (stderr.length < 4000) stderr += d; });
  child.on('error', e => { stderr += e.message; finish(null); });
  child.on('close', finish);
  child.stdin.on('error', () => { /* the process ended before reading stdin; the close handler reports it */ });
  child.stdin.end(stdin);
});

/** The flags that keep the CLI to one job: answer once, in this schema, with no tools and no saved session. */
export const cliArgs = (model?: string): string[] => [
  '-p', '--output-format', 'json',
  '--tools', '',
  '--no-session-persistence',
  '--strict-mcp-config',
  '--system-prompt', SYSTEM_PROMPT,
  '--json-schema', JSON.stringify(BRIEF_JSON_SCHEMA),
  ...(model ? ['--model', model] : []),
];

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

export function createCliProvider(o: { exe?: string; run?: Runner; timeoutMs?: number; model?: string; retries?: number } = {}): IdeaProvider {
  const exe = o.exe ?? process.env.CLAUDE_CLI_PATH ?? 'claude';
  const run = o.run ?? spawnRunner, timeoutMs = o.timeoutMs ?? DEFAULT_TIMEOUT_MS, retries = o.retries ?? 1;
  return {
    name: 'claude-cli',
    async analyze({ text, option }: IdeaRequest): Promise<IdeaBrief> {
      const input = userMessage(text, option);
      let last = 'No attempt was made';
      for (let attempt = 0; attempt <= retries; attempt++) {
        // Run from a neutral folder so the CLI does not load this project's instructions or files.
        const r = await run(exe, cliArgs(o.model), input, { cwd: tmpdir(), timeoutMs, maxBytes: MAX_BYTES });
        if (r.timedOut) throw new ProviderError('Claude took too long to answer');   // not retried: it would only wait again
        if (r.tooLarge) throw new ProviderError('Claude returned far more than expected');
        if (r.code !== 0) throw new ProviderError(r.code === null ? 'The Claude CLI could not be started. Is it installed and on the PATH?' : 'The Claude CLI failed. Is it signed in?');
        const env = readEnvelope(r.stdout);
        if (!env.ok) { last = env.error; continue; }
        const checked = validateBrief(env.data, text, 'claude-cli');
        if (checked.ok) return checked.brief;
        last = checked.error;
      }
      throw new ProviderError(`Claude's answer was not a valid Idea Brief (${last})`);
    },
  };
}
