import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { providerNameFromEnv } from '../ai';
import { createCliAiProvider, ProviderError, spawnRunner, type Runner, type RunResult } from '../ai/cliProvider';
import { fetchAi } from '../ai/client';
import { aiKey } from '../ai/hash';
import { BUSY_MESSAGE, handleAiTask, handleIdeaBrief, MAX_BODY_BYTES, parseJsonBody, type ApiRequest } from '../ai/handler';
import { createLimiter, getCliLimiter, MAX_CLI_PROCESSES } from '../ai/limiter';
import { simulatedAiProvider, simulatedProvider } from '../ai/provider';
import { ideaBriefSpec } from '../ai/specs/ideaBrief';
import type { AiProvider, AiRunOptions } from '../ai/task';
import { EXAMPLE_IDEA } from '../idea';

const IDEA = { text: EXAMPLE_IDEA, option: 'idea' };
const req = (body: unknown, host: string | null = 'localhost:3000', origin: string | null = null, signal?: AbortSignal): ApiRequest => ({ host, origin, body, signal });
const task = (input: unknown, id: unknown = 'idea-brief') => ({ task: id, input });
const fakeAi = (name: 'simulated' | 'claude-cli', run?: AiProvider['run']): AiProvider => ({ name, run: run ?? (async (spec, input) => spec.simulate(input)) });
/** A provider whose run() waits until told to finish, so requests can overlap. */
function gated() {
  const waiting: { release: () => void; fail: (e: Error) => void }[] = [];
  const provider: AiProvider = { name: 'claude-cli', run: (spec, input) => new Promise((resolve, reject) => { waiting.push({ release: () => resolve(spec.simulate(input) as never), fail: reject }); }) };
  return { provider, waiting };
}
const settle = () => new Promise(r => setTimeout(r, 5));

describe('POST /api/ai: which tasks and which requests are accepted', () => {
  it.each([null, undefined, 'idea-brief', 7, [], [task(IDEA)], {}, { input: IDEA }, { task: 5, input: IDEA }, { task: null }])('rejects a body that is not { task, input }: %j', async body => {
    const r = await handleAiTask(req(body), fakeAi('simulated'));
    expect(r).toEqual({ status: 400, body: { error: 'Send the task name and its input.' } });
  });
  it.each(['nope', '', 'Idea-Brief', '__proto__', 'constructor', 'toString', 'hasOwnProperty'])('answers 404 for the unknown task %j', async id => {
    expect(await handleAiTask(req(task(IDEA, id)), fakeAi('simulated'))).toEqual({ status: 404, body: { error: 'Unknown AI task.' } });
  });
  it('gives the task\'s own reasons for refusing its input', async () => {
    const cases: [unknown, string][] = [
      [undefined, 'Send the idea text and where you are starting from.'],
      [{ text: EXAMPLE_IDEA, option: 'nope' }, 'Unknown starting option.'],
      [{ text: 'short', option: 'idea' }, 'Describe the idea in a sentence or more.'],
      [{ text: 'x'.repeat(2001), option: 'idea' }, 'Keep the idea under 2000 characters.'],
    ];
    for (const [input, error] of cases) expect(await handleAiTask(req(task(input)), fakeAi('simulated'))).toEqual({ status: 400, body: { error } });
  });
  it('returns the task, its key, who produced the answer and the answer', async () => {
    const r = await handleAiTask(req(task({ text: `  ${EXAMPLE_IDEA}  `, option: 'idea' })), simulatedAiProvider);
    expect(r.status).toBe(200);
    if (!('result' in r.body)) throw new Error('expected a result');
    expect(r.body.task).toBe('idea-brief');
    expect(r.body.provider).toBe('simulated');
    expect(r.body.key).toBe(aiKey(ideaBriefSpec, IDEA));          // built from the trimmed, parsed input
    expect(r.body.result).toEqual(ideaBriefSpec.simulate(IDEA as never));
  });
  it('maps provider failures to 502 with their message, and anything else to a generic 500 that leaks nothing', async () => {
    const a = await handleAiTask(req(task(IDEA)), fakeAi('simulated', async () => { throw new ProviderError('Claude took too long to answer'); }));
    expect(a).toEqual({ status: 502, body: { error: 'Claude took too long to answer' } });
    const b = await handleAiTask(req(task(IDEA)), fakeAi('simulated', async () => { throw new Error('secret path C:\\x'); }));
    expect(b).toEqual({ status: 500, body: { error: 'Could not complete the Idea Brief.' } });
  });
  it('passes the caller\'s abort signal on to the provider', async () => {
    let got: AiRunOptions | undefined;
    const ctl = new AbortController();
    await handleAiTask(req(task(IDEA), 'localhost:3000', null, ctl.signal), fakeAi('simulated', async (spec, input, opts) => { got = opts; return spec.simulate(input); }));
    expect(got?.signal).toBe(ctl.signal);
  });
});

describe('the Claude CLI guard', () => {
  it('lets the CLI run only for a page served from this machine, before it even reads the body', async () => {
    const cli = fakeAi('claude-cli');
    expect((await handleAiTask(req(task(IDEA), 'example.com'), cli)).status).toBe(403);
    expect((await handleAiTask(req(task(IDEA), null), cli)).status).toBe(403);
    expect((await handleAiTask(req(null, 'example.com'), cli)).status).toBe(403);
    expect((await handleAiTask(req(task(IDEA), 'localhost.evil.com'), cli)).status).toBe(403);
    for (const host of ['localhost:3000', '127.0.0.1:3000', '[::1]:3000']) expect((await handleAiTask(req(task(IDEA), host), cli)).status).toBe(200);
  });
  it('refuses cross-site requests for the CLI, and accepts a same-origin one', async () => {
    const cli = fakeAi('claude-cli');
    expect(await handleAiTask(req(task(IDEA), 'localhost:3000', 'https://evil.example'), cli)).toEqual({ status: 403, body: { error: 'Cross-site requests are not allowed.' } });
    expect((await handleAiTask(req(task(IDEA), 'localhost:3000', 'http://localhost:3000'), cli)).status).toBe(200);
  });
  it('does not limit where the simulated provider runs', async () => {
    expect((await handleAiTask(req(task(IDEA), 'example.com'), simulatedAiProvider)).status).toBe(200);
  });
});

describe('capacity: at most two Claude CLI processes at once', () => {
  it('turns the third overlapping request away with 429 and Retry-After, and the first two still finish', async () => {
    const limiter = createLimiter(2);
    const { provider, waiting } = gated();
    const go = () => handleAiTask(req(task(IDEA)), provider, { limiter });
    const a = go(), b = go();
    await settle();
    expect(limiter.active).toBe(2);
    const c = await go();
    expect(c).toEqual({ status: 429, body: { error: BUSY_MESSAGE }, headers: { 'Retry-After': '5' } });
    expect(limiter.active).toBe(2);            // the refused request took nothing
    waiting.forEach(w => w.release());
    expect((await a).status).toBe(200);
    expect((await b).status).toBe(200);
    expect(limiter.active).toBe(0);
  });
  it('gives the slot back after a success, a provider error, an unexpected error and a cancellation', async () => {
    const limiter = createLimiter(1);
    const outcomes: AiProvider[] = [
      fakeAi('claude-cli'),
      fakeAi('claude-cli', async () => { throw new ProviderError('Claude took too long to answer'); }),
      fakeAi('claude-cli', async () => { throw new Error('boom'); }),
      fakeAi('claude-cli', async () => { throw new ProviderError('The request was cancelled'); }),
    ];
    const statuses: number[] = [];
    for (const p of outcomes) { statuses.push((await handleAiTask(req(task(IDEA)), p, { limiter })).status); expect(limiter.active).toBe(0); }
    expect(statuses).toEqual([200, 502, 500, 502]);
    expect((await handleAiTask(req(task(IDEA)), fakeAi('claude-cli'), { limiter })).status).toBe(200);   // capacity is really free again
  });
  it('lets the next request in as soon as a slot frees up', async () => {
    const limiter = createLimiter(1);
    const { provider, waiting } = gated();
    const first = handleAiTask(req(task(IDEA)), provider, { limiter });
    await settle();
    expect((await handleAiTask(req(task(IDEA)), provider, { limiter })).status).toBe(429);
    waiting[0].release();
    await first;
    const second = handleAiTask(req(task(IDEA)), provider, { limiter });
    await settle();
    expect(limiter.active).toBe(1);
    waiting[1].release();
    expect((await second).status).toBe(200);
  });
  it('spends no slot on a request that is refused before it starts', async () => {
    const limiter = createLimiter(1);
    const cli = fakeAi('claude-cli');
    await handleAiTask(req(task(IDEA), 'example.com'), cli, { limiter });
    await handleAiTask(req(task(IDEA), 'localhost:3000', 'https://evil.example'), cli, { limiter });
    await handleAiTask(req({ nope: 1 }), cli, { limiter });
    await handleAiTask(req(task(IDEA, 'nope')), cli, { limiter });
    await handleAiTask(req(task({ text: 'short', option: 'idea' })), cli, { limiter });
    expect(limiter.active).toBe(0);
  });
  it('never limits the simulated provider', async () => {
    const limiter = createLimiter(1);
    const results = await Promise.all([1, 2, 3, 4].map(() => handleAiTask(req(task(IDEA)), simulatedAiProvider, { limiter })));
    expect(results.every(r => r.status === 200)).toBe(true);
  });
  it('applies to the Epic 1 route too, and the two routes share one count', async () => {
    const limiter = createLimiter(2);
    const { provider, waiting } = gated();
    const legacy: Parameters<typeof handleIdeaBrief>[1] = { name: 'claude-cli', analyze: () => new Promise((resolve, reject) => { waiting.push({ release: () => resolve(ideaBriefSpec.simulate(IDEA as never)), fail: reject }); }) };
    const a = handleIdeaBrief(req(IDEA), legacy, { limiter });
    const b = handleAiTask(req(task(IDEA)), provider, { limiter });
    await settle();
    expect((await handleIdeaBrief(req(IDEA), legacy, { limiter })).status).toBe(429);
    expect((await handleAiTask(req(task(IDEA)), provider, { limiter })).status).toBe(429);
    waiting.forEach(w => w.release());
    expect([(await a).status, (await b).status]).toEqual([200, 200]);
    expect(limiter.active).toBe(0);
  });
  it('releases a slot only once however often release is called', () => {
    const l = createLimiter(1);
    const r1 = l.tryAcquire()!;
    expect(l.tryAcquire()).toBeNull();
    r1(); r1(); r1();
    expect(l.active).toBe(0);
    const r2 = l.tryAcquire()!;
    expect(l.tryAcquire()).toBeNull();     // a double release did not hand out a second slot
    r2();
  });
  it('shares one process-wide limiter of two slots', () => {
    expect(MAX_CLI_PROCESSES).toBe(2);
    expect(getCliLimiter()).toBe(getCliLimiter());
    expect(getCliLimiter().max).toBe(2);
    expect(() => createLimiter(0)).toThrow();
    expect(() => createLimiter(1.5)).toThrow();
  });
});

describe('cleanup when the browser goes away: a real child process is ended and the slot freed', () => {
  const alive = (pid: number | undefined) => { if (!pid) return false; try { process.kill(pid, 0); return true; } catch { return false; } };
  /** The real runner, pointed at a long-lived node child instead of the claude program. */
  const sleepRunner = (log: RunResult[]): Runner => async (_exe, _args, stdin, o) => {
    const r = await spawnRunner(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], stdin, { ...o, cwd: tmpdir() });
    log.push(r);
    return r;
  };
  it('kills the child, answers 502, and frees the slot when the request is cancelled mid-run', async () => {
    const limiter = createLimiter(1);
    const log: RunResult[] = [];
    const provider = createCliAiProvider({ run: sleepRunner(log) });
    const ctl = new AbortController();
    const pending = handleAiTask(req(task(IDEA), 'localhost:3000', null, ctl.signal), provider, { limiter });
    await new Promise(r => setTimeout(r, 400));
    expect(limiter.active).toBe(1);
    ctl.abort();
    const r = await pending;
    expect(r).toEqual({ status: 502, body: { error: 'The request was cancelled' } });
    expect(limiter.active).toBe(0);
    expect(log).toHaveLength(1);
    expect(log[0].aborted).toBe(true);
    expect(alive(log[0].pid)).toBe(false);
  }, 20_000);
  it('kills the child and frees the slot when Claude runs past the timeout', async () => {
    const limiter = createLimiter(1);
    const log: RunResult[] = [];
    const provider = createCliAiProvider({ run: sleepRunner(log), timeoutMs: 300 });
    const r = await handleAiTask(req(task(IDEA)), provider, { limiter });
    expect(r).toEqual({ status: 502, body: { error: 'Claude took too long to answer' } });
    expect(limiter.active).toBe(0);
    expect(log).toHaveLength(1);                  // a timeout is not retried
    expect(alive(log[0].pid)).toBe(false);
  }, 20_000);
});

describe('reading a request body', () => {
  it('parses JSON and refuses what is not JSON or is too large', () => {
    expect(parseJsonBody('{"task":"idea-brief"}')).toEqual({ ok: true, body: { task: 'idea-brief' } });
    expect(parseJsonBody('')).toMatchObject({ ok: false, status: 400 });
    expect(parseJsonBody('{oops')).toEqual({ ok: false, status: 400, error: 'The request is not valid JSON.' });
    expect(parseJsonBody('x'.repeat(MAX_BODY_BYTES + 1))).toEqual({ ok: false, status: 413, error: 'The request is too large.' });
    expect(parseJsonBody('x'.repeat(10), 5)).toMatchObject({ ok: false, status: 413 });
  });
});

describe('Epic 1 route parity with the generic route', () => {
  const idea = (text: string) => ({ text, option: 'idea' });
  const cases: [string, unknown, string | null][] = [
    ['ok', idea(EXAMPLE_IDEA), 'localhost:3000'],
    ['padded', idea(`  ${EXAMPLE_IDEA}  `), 'localhost:3000'],
    ['edge 12', idea('x'.repeat(12)), 'localhost:3000'],
    ['edge 2000', idea('x'.repeat(2000)), 'localhost:3000'],
    ['short', idea('short'), 'localhost:3000'],
    ['long', idea('x'.repeat(2001)), 'localhost:3000'],
    ['bad option', { text: EXAMPLE_IDEA, option: 'nope' }, 'localhost:3000'],
    ['no option', { text: EXAMPLE_IDEA }, 'localhost:3000'],
    ['null', null, 'localhost:3000'],
    ['array', [EXAMPLE_IDEA], 'localhost:3000'],
  ];
  it.each(cases)('%s: the same status, the same words, the same answer', async (_n, input, host) => {
    const legacy = await handleIdeaBrief(req(input, host), simulatedProvider);
    const generic = await handleAiTask(req(task(input), host), simulatedAiProvider);
    expect(generic.status).toBe(legacy.status);
    if ('error' in legacy.body) expect(generic.body).toEqual(legacy.body);
    else expect('result' in generic.body && generic.body.result).toEqual(legacy.body.brief);
  });
});

describe('choosing the provider from the environment', () => {
  it('keeps IDEA_PROVIDER working, lets AI_PROVIDER take over, and defaults to simulated', () => {
    expect(providerNameFromEnv({})).toBe('simulated');
    expect(providerNameFromEnv({ IDEA_PROVIDER: 'cli' })).toBe('cli');
    expect(providerNameFromEnv({ AI_PROVIDER: 'cli' })).toBe('cli');
    expect(providerNameFromEnv({ AI_PROVIDER: ' CLI ' })).toBe('cli');
    expect(providerNameFromEnv({ AI_PROVIDER: 'simulated', IDEA_PROVIDER: 'cli' })).toBe('simulated');   // the new setting wins
    expect(providerNameFromEnv({ AI_PROVIDER: 'cli', IDEA_PROVIDER: 'simulated' })).toBe('cli');
    expect(providerNameFromEnv({ AI_PROVIDER: '   ', IDEA_PROVIDER: 'cli' })).toBe('cli');                // blank counts as not set
    expect(providerNameFromEnv({ AI_PROVIDER: 'api' })).toBe('simulated');
  });
});

describe('the browser client for /api/ai', () => {
  const resp = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
  it('returns the answer with its key and provider', async () => {
    const body = { task: 'idea-brief', key: 'idea-brief:abc', provider: 'claude-cli', result: { summary: 's' } };
    expect(await fetchAi('idea-brief', IDEA, resp(200, body))).toEqual({ ok: true, ...body });
  });
  it('sends { task, input } as JSON to /api/ai with the abort signal', async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const ctl = new AbortController();
    const f = (async (url: string, init: RequestInit) => { seen = { url, init }; return new Response(JSON.stringify({ error: 'x' }), { status: 400 }); }) as unknown as typeof fetch;
    await fetchAi('idea-brief', IDEA, f, ctl.signal);
    expect(seen!.url).toBe('/api/ai');
    expect(seen!.init.method).toBe('POST');
    expect(JSON.parse(String(seen!.init.body))).toEqual({ task: 'idea-brief', input: IDEA });
    expect(seen!.init.signal).toBe(ctl.signal);
  });
  it('marks only a busy server or no answer as worth retrying', async () => {
    expect(await fetchAi('t', {}, resp(429, { error: BUSY_MESSAGE }))).toEqual({ ok: false, error: BUSY_MESSAGE, status: 429, retryable: true });
    for (const status of [400, 403, 404, 500, 502]) expect(await fetchAi('t', {}, resp(status, { error: 'no' }))).toMatchObject({ ok: false, status, retryable: false });
    expect(await fetchAi('t', {}, (async () => { throw new Error('offline'); }) as unknown as typeof fetch)).toEqual({ ok: false, error: 'Could not reach the AI service.', status: null, retryable: true });
  });
  it('does not trust an answer that is missing its parts', async () => {
    expect(await fetchAi('t', {}, resp(200, { task: 't' }))).toMatchObject({ ok: false });
    expect(await fetchAi('t', {}, (async () => new Response('not json', { status: 200 })) as unknown as typeof fetch)).toMatchObject({ ok: false, error: 'The AI service did not answer.' });
  });
});
