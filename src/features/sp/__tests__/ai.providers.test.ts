import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { aiProviderFor } from '../ai';
import { cliArgs, cliArgsFor, createCliAiProvider, createCliProvider, KILL_GRACE_MS, ProviderError, spawnRunner, type Runner } from '../ai/cliProvider';
import { simulatedAiProvider } from '../ai/provider';
import { ideaBriefSpec } from '../ai/specs/ideaBrief';
import type { AiTaskSpec } from '../ai/task';
import { EXAMPLE_IDEA } from '../idea';

// A made-up task, to prove the providers know nothing about the Idea Brief.
type Echo = { word: string };
const echoSpec: AiTaskSpec<Echo, { shout: string }> = {
  id: 'echo', title: 'Echo', version: 1, systemPrompt: 'Repeat the word loudly.', jsonSchema: { type: 'object', properties: { shout: { type: 'string' } } },
  dependsOn: ['word'],
  parseInput: raw => ({ ok: true, value: raw as Echo }),
  buildMessage: i => `<word>${i.word}</word>`,
  validate: (raw, _i, provider) => {
    const r = raw as { shout?: unknown };
    return typeof r?.shout === 'string' ? { ok: true, value: { shout: `${r.shout} [${provider}]` } } : { ok: false, error: 'no shout' };
  },
  simulate: i => ({ shout: i.word.toUpperCase() }),
};
const env = (data: unknown) => JSON.stringify({ is_error: false, structured_output: data, result: '' });
const res = (p: Partial<Awaited<ReturnType<Runner>>> = {}): Awaited<ReturnType<Runner>> => ({ code: 0, stdout: '', stderr: '', timedOut: false, tooLarge: false, ...p });

describe('the generic Claude CLI provider', () => {
  it('sends the task\'s own prompt, schema and message, and the input only on stdin', async () => {
    let seen: { exe: string; args: string[]; stdin: string; signal?: AbortSignal } | null = null;
    const ctl = new AbortController();
    const run: Runner = async (exe, args, stdin, o) => { seen = { exe, args, stdin, signal: o.signal }; return res({ stdout: env({ shout: 'HI' }) }); };
    const out = await createCliAiProvider({ exe: 'claude', run, model: 'm1' }).run(echoSpec, { word: 'secret-word' }, { signal: ctl.signal });
    const s = seen!;
    expect(out).toEqual({ shout: 'HI [claude-cli]' });
    expect(s.args[s.args.indexOf('--system-prompt') + 1]).toBe('Repeat the word loudly.');
    expect(s.args[s.args.indexOf('--json-schema') + 1]).toBe(JSON.stringify(echoSpec.jsonSchema));
    expect(s.args[s.args.indexOf('--tools') + 1]).toBe('');
    expect(s.args).toEqual(expect.arrayContaining(['-p', '--no-session-persistence', '--strict-mcp-config', '--model', 'm1']));
    expect(s.args.some(a => a.includes('secret-word'))).toBe(false);
    expect(s.stdin).toBe('<word>secret-word</word>');
    expect(s.signal).toBe(ctl.signal);
  });
  it('uses CLAUDE_CLI_PATH or "claude" when no executable is given, and a neutral working folder', async () => {
    const prev = process.env.CLAUDE_CLI_PATH;
    let cwd = '', exe = '';
    const run: Runner = async (e, _a, _s, o) => { exe = e; cwd = o.cwd; return res({ stdout: env({ shout: 'x' }) }); };
    try {
      delete process.env.CLAUDE_CLI_PATH;
      await createCliAiProvider({ run }).run(echoSpec, { word: 'a' });
      expect(exe).toBe('claude');
      process.env.CLAUDE_CLI_PATH = 'C:/tools/claude.exe';
      await createCliAiProvider({ run }).run(echoSpec, { word: 'a' });
      expect(exe).toBe('C:/tools/claude.exe');
      expect(cwd).toBe(tmpdir());
    } finally { if (prev === undefined) delete process.env.CLAUDE_CLI_PATH; else process.env.CLAUDE_CLI_PATH = prev; }
  });
  it('lets the task decide whether an answer is usable, retries once, then names the task in the error', async () => {
    let n = 0;
    const run: Runner = async () => { n++; return res({ stdout: env({ nope: 1 }) }); };
    await expect(createCliAiProvider({ run }).run(echoSpec, { word: 'a' })).rejects.toThrow("Claude's answer was not a valid Echo (no shout)");
    expect(n).toBe(2);
    n = 0;
    await expect(createCliAiProvider({ run, retries: 0 }).run(echoSpec, { word: 'a' })).rejects.toBeInstanceOf(ProviderError);
    expect(n).toBe(1);
  });
  it('recovers when the retry gives a valid answer', async () => {
    let n = 0;
    const run: Runner = async () => res({ stdout: n++ === 0 ? 'not json' : env({ shout: 'OK' }) });
    await expect(createCliAiProvider({ run }).run(echoSpec, { word: 'a' })).resolves.toEqual({ shout: 'OK [claude-cli]' });
    expect(n).toBe(2);
  });
  it('maps a missing CLI, a failed CLI, a timeout and oversized output to provider errors, and never retries a timeout', async () => {
    let calls = 0;
    const a = (p: Partial<Awaited<ReturnType<Runner>>>) => { calls = 0; return createCliAiProvider({ run: async () => { calls++; return res(p); } }).run(echoSpec, { word: 'a' }); };
    await expect(a({ code: null })).rejects.toThrow(/could not be started/);
    await expect(a({ code: 1 })).rejects.toThrow(/signed in/);
    await expect(a({ timedOut: true })).rejects.toThrow('Claude took too long to answer');
    expect(calls).toBe(1);
    await expect(a({ tooLarge: true })).rejects.toThrow(/more than expected/);
  });
  it('stops on abort without retrying, and does not start a run for a request that is already cancelled', async () => {
    let calls = 0;
    const run: Runner = async () => { calls++; return res({ aborted: true }); };
    await expect(createCliAiProvider({ run }).run(echoSpec, { word: 'a' })).rejects.toThrow('The request was cancelled');
    expect(calls).toBe(1);
    const ctl = new AbortController(); ctl.abort();
    calls = 0;
    await expect(createCliAiProvider({ run }).run(echoSpec, { word: 'a' }, { signal: ctl.signal })).rejects.toThrow('The request was cancelled');
    expect(calls).toBe(0);
  });
});

describe('Epic 1 compatibility of the CLI provider', () => {
  it('builds the Idea Brief command line from the spec exactly as before', () => {
    expect(cliArgs('m')).toEqual(cliArgsFor(ideaBriefSpec, 'm'));
    expect(cliArgs()).toEqual(cliArgsFor(ideaBriefSpec));
    expect(cliArgs()).not.toContain('--model');
  });
  it('gives the same brief through the Epic 1 wrapper and the generic provider', async () => {
    const raw = {
      summary: 'A platform for interview practice.',
      slots: [
        { slot: 'idea', value: EXAMPLE_IDEA, provenance: 'explicit', confidence: 'high', evidence: EXAMPLE_IDEA, rationale: '' },
        { slot: 'problem', value: '', provenance: 'empty', confidence: '', evidence: '', rationale: '' },
        { slot: 'target_users', value: 'students', provenance: 'explicit', confidence: 'medium', evidence: 'students', rationale: '' },
        { slot: 'expected_outcome', value: '', provenance: 'empty', confidence: '', evidence: '', rationale: '' },
        { slot: 'constraints', value: '', provenance: 'empty', confidence: '', evidence: '', rationale: '' },
      ],
      opportunity: '', assumptions: [], missing_information: [], clarifying_questions: [],
    };
    const run: Runner = async () => res({ stdout: env(raw) });
    const input = { text: EXAMPLE_IDEA, option: 'idea' as const };
    const viaWrapper = await createCliProvider({ run }).analyze(input);
    const viaGeneric = await createCliAiProvider({ run }).run(ideaBriefSpec, input);
    expect(viaWrapper).toEqual(viaGeneric);
    expect(viaWrapper.source).toBe('claude-cli');
  });
  it('keeps the wrapper\'s error text for the Idea Brief', async () => {
    const run: Runner = async () => res({ stdout: env({}) });
    await expect(createCliProvider({ run }).analyze({ text: EXAMPLE_IDEA, option: 'idea' })).rejects.toThrow(/not a valid Idea Brief/);
  });
});

describe('the simulated provider runs any task offline', () => {
  it('answers with the task\'s own simulate(), labelled by the task', async () => {
    expect(simulatedAiProvider.name).toBe('simulated');
    expect(await simulatedAiProvider.run(echoSpec, { word: 'quiet' })).toEqual({ shout: 'QUIET' });
    expect((await simulatedAiProvider.run(ideaBriefSpec, { text: EXAMPLE_IDEA, option: 'idea' })).source).toBe('simulated');
  });
  it('is chosen unless the CLI is asked for', () => {
    expect(aiProviderFor('simulated')).toBe(simulatedAiProvider);
    expect(aiProviderFor('cli').name).toBe('claude-cli');
  });
});

// The real runner, against real child processes (node itself), so cleanup is proven and not assumed.
const alive = (pid: number | undefined) => { if (!pid) return false; try { process.kill(pid, 0); return true; } catch { return false; } };
const node = (script: string) => [process.execPath, ['-e', script]] as const;
const opts = { cwd: tmpdir(), timeoutMs: 10_000, maxBytes: 1_000_000 };

describe('spawnRunner against real processes', () => {
  it('feeds stdin, collects stdout and reports the exit code', async () => {
    const [exe, args] = node("process.stdin.on('data', d => process.stdout.write(String(d).toUpperCase())); process.stdin.on('end', () => process.exit(0));");
    const r = await spawnRunner(exe, [...args], 'hello', opts);
    expect(r).toMatchObject({ code: 0, stdout: 'HELLO', timedOut: false, tooLarge: false, aborted: false });
    expect(alive(r.pid)).toBe(false);
    const [exe3, args3] = node('process.exit(3)');
    expect((await spawnRunner(exe3, [...args3], '', opts)).code).toBe(3);
  });
  it('reports a program that cannot be started, without throwing', async () => {
    const r = await spawnRunner('definitely-not-a-real-program-xyz', [], 'x', opts);
    expect(r.code).toBeNull();
    expect(r.stderr).toMatch(/ENOENT|not found|spawn/i);
  });
  it('kills a child that runs past the timeout, and it is gone when the result arrives', async () => {
    const [exe, args] = node('setTimeout(() => {}, 60000)');
    const t0 = Date.now();
    const r = await spawnRunner(exe, [...args], '', { ...opts, timeoutMs: 300 });
    expect(r.timedOut).toBe(true);
    expect(Date.now() - t0).toBeLessThan(KILL_GRACE_MS + 3000);
    expect(alive(r.pid)).toBe(false);
  }, 15_000);
  it('kills a child when the caller aborts mid-run', async () => {
    const [exe, args] = node('setTimeout(() => {}, 60000)');
    const ctl = new AbortController();
    setTimeout(() => ctl.abort(), 250);
    const r = await spawnRunner(exe, [...args], '', { ...opts, signal: ctl.signal });
    expect(r.aborted).toBe(true);
    expect(r.timedOut).toBe(false);
    expect(alive(r.pid)).toBe(false);
  }, 15_000);
  it('does not start a process for a request that was cancelled before it began', async () => {
    const ctl = new AbortController(); ctl.abort();
    const [exe, args] = node('setTimeout(() => {}, 60000)');
    const r = await spawnRunner(exe, [...args], '', { ...opts, signal: ctl.signal });
    expect(r).toMatchObject({ aborted: true, code: null });
    expect(r.pid).toBeUndefined();
  });
  it('kills a child that prints more than the output limit', async () => {
    const [exe, args] = node("setInterval(() => process.stdout.write('x'.repeat(50000)), 5)");
    const r = await spawnRunner(exe, [...args], '', { ...opts, maxBytes: 1000 });
    expect(r.tooLarge).toBe(true);
    expect(alive(r.pid)).toBe(false);
  }, 15_000);
  it('still ends a child that ignores the polite stop, and always settles', async () => {
    const [exe, args] = node("process.on('SIGTERM', () => {}); setInterval(() => {}, 1000); process.stdout.write('up');");
    const r = await spawnRunner(exe, [...args], '', { ...opts, timeoutMs: 300 });
    expect(r.timedOut).toBe(true);
    expect(alive(r.pid)).toBe(false);
  }, 20_000);
  it('leaves no stray kill timers after a normal finish', async () => {
    const [exe, args] = node("process.stdout.write('done')");
    const r = await spawnRunner(exe, [...args], '', opts);
    expect(r.stdout).toBe('done');
    expect(alive(r.pid)).toBe(false);
  });
});
