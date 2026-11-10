import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { aiNotices } from '../aiNotices';
import type { GateState } from '../ai/gate';
import FallbackBanner from '../components/FallbackBanner';
import Provenance from '../components/Provenance';
import Rail from '../components/Rail';
import { versionFallback } from '../provenance';
import { WALK_MS } from '../runner';
import { discoverRows, type RunPhase } from '../viewModel';
import { office } from './aiHarness';

const FALLBACK = { from: 'claude-cli' as const, reason: 'Claude took too long to answer' };

describe('the provenance label', () => {
  it('says Claude for Claude\'s text, SIMULATED for simulated text, and names the fallback when Claude was meant to write it', () => {
    expect(renderToStaticMarkup(<Provenance provider="claude-cli" />)).toContain('AI-GENERATED · Claude CLI (local)');
    expect(renderToStaticMarkup(<Provenance provider="simulated" />)).toContain('>SIMULATED<');
    expect(renderToStaticMarkup(<Provenance provider="simulated" simulatedText="SIMULATED OUTPUT" />)).toContain('SIMULATED OUTPUT');
    const fb = renderToStaticMarkup(<Provenance provider="simulated" fallback={FALLBACK} />);
    expect(fb).toContain('SIMULATED · CLAUDE UNAVAILABLE');
    expect(fb).toContain('Claude was unavailable: Claude took too long to answer');   // the reason, on hover
    expect(fb).not.toContain('AI-GENERATED');
  });
  it('never presents a fallback as Claude\'s work, even if both are passed', () => {
    const html = renderToStaticMarkup(<Provenance provider="claude-cli" fallback={FALLBACK} />);
    expect(html).toContain('AI-GENERATED');                  // a record that says claude-cli is claude-cli; the flag only applies to simulated drafts
  });
  it('reads the fallback off a stored version', () => {
    expect(versionFallback({ fallback: FALLBACK })).toEqual(FALLBACK);
    expect(versionFallback({})).toBeUndefined();
    expect(versionFallback(null)).toBeUndefined();
    expect(versionFallback(undefined)).toBeUndefined();
  });
});

describe('the fallback banner', () => {
  it('says the draft is simulated and why, as a status message', () => {
    const html = renderToStaticMarkup(<FallbackBanner fallback={FALLBACK} />);
    expect(html).toContain('Claude was unavailable.');
    expect(html).toContain('simulated, not written by Claude');
    expect(html).toContain('Claude took too long to answer');
    expect(html).toContain('role="status"');
  });
});

describe('notices about the AI', () => {
  const rows = (status: string) => [{ id: 'research', artifact: 'Desk research', status, owner: 'CSO' }] as never;
  const src = (g: GateState | null, phase: RunPhase | null, fb: typeof FALLBACK | null) => ({ phases: (phase ? { research: phase } : {}) as Record<string, RunPhase>, ai: () => g, fallbackOf: () => fb });
  it('says an agent is waiting for Claude while the request is on', () => {
    expect(aiNotices(rows('ready'), src({ status: 'pending' }, 'wait', null))).toEqual([{ id: 'research:wait', tone: 'wait', text: 'Asha is waiting for Claude to answer for Desk research.' }]);
  });
  it('says plainly when a failure is holding the work, and that it will not retry by itself', () => {
    const [n] = aiNotices(rows('ready'), src({ status: 'failed', error: 'Claude took too long to answer' }, 'wait', null));
    expect(n).toMatchObject({ id: 'research:failed', tone: 'bad' });
    expect(n.text).toContain('Claude could not answer for Desk research');
    expect(n.text).toContain('Claude took too long to answer');
    expect(n.text).toContain('will not retry by itself');
  });
  it('says a draft waiting for the founder is simulated because Claude was unavailable', () => {
    const [n] = aiNotices(rows('needs'), src({ status: 'ready', provider: 'simulated', fallback: FALLBACK }, null, FALLBACK));
    expect(n).toMatchObject({ id: 'research:fallback', tone: 'bad' });
    expect(n.text).toBe('Desk research was drafted by the simulated provider because Claude was unavailable. Claude took too long to answer');
  });
  it('stays quiet once the founder has dealt with the draft, for tasks the AI does not write, and when there is nothing to say', () => {
    expect(aiNotices(rows('done'), src(null, null, FALLBACK))).toEqual([]);                       // approved: it is history now
    expect(aiNotices(rows('ready'), src(null, 'wait', null))).toEqual([]);                        // not an AI task
    expect(aiNotices(rows('ready'), src({ status: 'none' }, 'wait', null))).toEqual([]);          // nothing to ask yet
    expect(aiNotices(rows('ready'), src({ status: 'ready', provider: 'claude-cli' }, null, null))).toEqual([]);
    expect(aiNotices([], src(null, null, null))).toEqual([]);
  });
  it('shows in the rail, and the rail is unchanged without notices', () => {
    const props = { rows: [], feed: [], started: true, progress: () => 0, onOpen: () => {}, onTask: () => {} };
    const plain = renderToStaticMarkup(<Rail {...props} />);
    expect(renderToStaticMarkup(<Rail {...props} notices={[]} />)).toBe(plain);
    const html = renderToStaticMarkup(<Rail {...props} notices={[{ id: 'a', tone: 'bad', text: 'Claude could not answer for Desk research' }, { id: 'b', tone: 'wait', text: 'Asha is waiting for Claude' }]} />);
    expect(html).toContain('Claude could not answer for Desk research');
    expect(html).toContain('Asha is waiting for Claude');
    expect(html).toContain('sp-banner bad');
    expect(html).not.toBe(plain);
  });
});

describe('what the founder sees, end to end on the real core', () => {
  const notices = (o: ReturnType<typeof office>) => aiNotices(
    discoverRows(o.rt.core, o.entry(), { takenUp: o.first.docs.takenUp(), rechecks: o.first.docs.rechecks() }),
    { phases: o.first.runner.phases(), ai: t => o.first.runner.aiState(t), fallbackOf: t => versionFallback(o.first.docs.latest(t)) ?? null },
  );
  it('shows waiting, then nothing once Claude has answered, and no fallback anywhere', async () => {
    const o = office();
    o.approveBrief();
    o.tickFor(WALK_MS + 500);
    expect(notices(o).map(n => n.id)).toEqual(['research:wait']);
    o.first.srv.calls[0].ok('claude-cli');
    await o.clk.tick();
    o.until(() => o.status('research') === 'needs');
    expect(notices(o)).toEqual([]);
  });
  it('shows the failure that is holding the work, and clears it when a retry succeeds', async () => {
    const o = office({ onFailure: 'hold' });
    o.approveBrief();
    o.tickFor(WALK_MS + 500);
    o.first.srv.calls[0].fail(502, 'Claude took too long to answer');
    await o.clk.tick();
    o.tickFor(500);
    expect(notices(o).map(n => n.id)).toEqual(['research:failed']);
    o.first.gate!.retry('research');
    o.first.srv.calls[1].ok('claude-cli');
    await o.clk.tick();
    o.until(() => o.status('research') === 'needs');
    expect(notices(o)).toEqual([]);
  });
  it('shows the simulated fallback while the founder reviews the draft, and the draft itself carries it', async () => {
    const o = office({ onFailure: 'simulate' });
    o.approveBrief();
    o.tickFor(WALK_MS + 500);
    o.first.srv.calls[0].fail(502, 'Claude took too long to answer');
    await o.clk.tick();
    o.until(() => o.status('research') === 'needs');
    expect(notices(o).map(n => n.id)).toEqual(['research:fallback']);
    const v = o.first.docs.latest('research')!;
    expect(versionFallback(v)).toEqual(FALLBACK);
    expect(renderToStaticMarkup(<Provenance provider={v.provider ?? 'simulated'} fallback={versionFallback(v)} />)).toContain('SIMULATED · CLAUDE UNAVAILABLE');
  });
});
