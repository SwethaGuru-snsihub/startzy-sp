// Characterization of the Epic 1 Idea Brief path, recorded from the code as it was before the AI provider
// architecture was generalised. These values must never change while the architecture is refactored:
// if one does, Epic 1 behaviour changed. (The hashes are SHA-256 of the exact text or JSON.)
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { BRIEF_JSON_SCHEMA } from '../ai/briefSchema';
import { cliArgs, ProviderError } from '../ai/cliProvider';
import { handleIdeaBrief } from '../ai/handler';
import { SYSTEM_PROMPT } from '../ai/prompt';
import { simulatedProvider } from '../ai/provider';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const TEXTS = [
  'I want to build an AI platform that helps students prepare for technical interviews.',
  'Patients wait too long at our clinic and staff keep phone follow-ups in spreadsheets.',
  'Something rough about invoices and small shops, not sure yet.',
];

describe('Epic 1 golden: the Claude CLI call', () => {
  it('builds exactly the same command line', () => {
    const args = cliArgs('some-model');
    expect(args.slice(0, 8)).toEqual(['-p', '--output-format', 'json', '--tools', '', '--no-session-persistence', '--strict-mcp-config', '--system-prompt']);
    expect(args.slice(args.indexOf('--json-schema') + 2)).toEqual(['--model', 'some-model']);
    expect(cliArgs()).toHaveLength(11);
    expect(args[args.indexOf('--system-prompt') + 1]).toBe(SYSTEM_PROMPT);
    expect(args[args.indexOf('--json-schema') + 1]).toBe(JSON.stringify(BRIEF_JSON_SCHEMA));
  });
  it('keeps the same prompt and schema text', () => {
    expect(sha(SYSTEM_PROMPT)).toBe('88504686b7c83f775f86a569236129c4db061cd186cbe036af4db0ba43610805');
    expect(sha(JSON.stringify(BRIEF_JSON_SCHEMA))).toBe('c074697e3aca634694403043b6544766eb24e3bea48c1f05ab81a34403dcec7b');
  });
});

describe('Epic 1 golden: the simulated provider', () => {
  it('returns byte-identical briefs', async () => {
    const got: string[] = [];
    for (const [i, t] of TEXTS.entries()) for (const o of ['idea', 'problem', 'define'] as const) got.push(sha(JSON.stringify(await simulatedProvider.analyze({ text: t, option: i === 0 ? o : 'idea' }))));
    expect(got).toEqual([
      '9dd162c526acd367f8dd225d446d7d1b3ed0c1d3e289d829714755d2ab1b75ed', '8c919e1b1d59a77101a6c29d636c60e74a08d7613656a06758f916b58da076ee', 'a1a72381621dd5ebf643fa782ca734320306d25823705ad676770d6a8ad7c057',
      'a487d3d42f91498a281652e6e12ec26f4a43c87268e09996fb76f65b08247508', 'a487d3d42f91498a281652e6e12ec26f4a43c87268e09996fb76f65b08247508', 'a487d3d42f91498a281652e6e12ec26f4a43c87268e09996fb76f65b08247508',
      'dea25aff2a7575be9269bb5b7ec728c497f1843ae5b634a4704682698e39c6fc', 'dea25aff2a7575be9269bb5b7ec728c497f1843ae5b634a4704682698e39c6fc', 'dea25aff2a7575be9269bb5b7ec728c497f1843ae5b634a4704682698e39c6fc',
    ]);
  });
});

describe('Epic 1 golden: POST /api/idea-brief rules', () => {
  const fake = (name: 'simulated' | 'claude-cli', fail?: Error) => ({ name, analyze: async () => { if (fail) throw fail; return simulatedProvider.analyze({ text: TEXTS[0], option: 'idea' }); } });
  const req = (body: unknown, host: string | null = 'localhost:3000', origin: string | null = null) => ({ host, origin, body });
  const OK = '3123d4db2ea7be9180b3855b4cfea84d93d9d622680b9afbd79e7fba2062c64b';
  const NEEDS = 'Send the idea text and where you are starting from.';
  const CLI_LOCAL = 'The Claude CLI provider only runs on this computer.';
  const cases: [string, Parameters<typeof handleIdeaBrief>[0], ReturnType<typeof fake>, number, string][] = [
    ['null body', req(null), fake('simulated'), 400, NEEDS],
    ['empty', req({}), fake('simulated'), 400, NEEDS],
    ['text number', req({ text: 5, option: 'idea' }), fake('simulated'), 400, NEEDS],
    ['option missing', req({ text: TEXTS[0] }), fake('simulated'), 400, NEEDS],
    ['bad option', req({ text: TEXTS[0], option: 'nope' }), fake('simulated'), 400, 'Unknown starting option.'],
    ['short', req({ text: 'short', option: 'idea' }), fake('simulated'), 400, 'Describe the idea in a sentence or more.'],
    ['short spaces', req({ text: '   short     ', option: 'idea' }), fake('simulated'), 400, 'Describe the idea in a sentence or more.'],
    ['long', req({ text: 'x'.repeat(2001), option: 'idea' }), fake('simulated'), 400, 'Keep the idea under 2000 characters.'],
    ['edge 2000', req({ text: 'x'.repeat(2000), option: 'idea' }), fake('simulated'), 200, OK],
    ['edge 12', req({ text: 'x'.repeat(12), option: 'idea' }), fake('simulated'), 200, OK],
    ['array body', req([TEXTS[0]]), fake('simulated'), 400, NEEDS],
    ['ok simulated', req({ text: `  ${TEXTS[0]}  `, option: 'idea' }), fake('simulated'), 200, OK],
    ['ok simulated remote host', req({ text: TEXTS[0], option: 'idea' }, 'example.com'), fake('simulated'), 200, OK],
    ['cli remote host', req({ text: TEXTS[0], option: 'idea' }, 'example.com'), fake('claude-cli'), 403, CLI_LOCAL],
    ['cli null host', req({ text: TEXTS[0], option: 'idea' }, null), fake('claude-cli'), 403, CLI_LOCAL],
    ['cli cross-site', req({ text: TEXTS[0], option: 'idea' }, 'localhost:3000', 'https://evil.example'), fake('claude-cli'), 403, 'Cross-site requests are not allowed.'],
    ['cli ok', req({ text: TEXTS[0], option: 'idea' }), fake('claude-cli'), 200, OK],
    ['cli ok same origin', req({ text: TEXTS[0], option: 'idea' }, 'localhost:3000', 'http://localhost:3000'), fake('claude-cli'), 200, OK],
    ['cli guard before body', req(null, 'example.com'), fake('claude-cli'), 403, CLI_LOCAL],
    ['provider error', req({ text: TEXTS[0], option: 'idea' }), fake('simulated', new ProviderError('Claude took too long to answer')), 502, 'Claude took too long to answer'],
    ['unknown error', req({ text: TEXTS[0], option: 'idea' }), fake('simulated', new Error('secret')), 500, 'Could not build the Idea Brief.'],
  ];
  it.each(cases)('%s', async (_name, r, p, status, expected) => {
    const res = await handleIdeaBrief(r, p);
    expect(res.status).toBe(status);
    expect('error' in res.body ? res.body.error : sha(JSON.stringify(res.body))).toBe(expected);
  });
});
