// UI regression baseline (Tier 1): server-renders the shared screens at fixed demo states and
// compares a structural outline of each with a stored snapshot. Runs in the existing Vitest node
// environment with react-dom/server; no browser. Timers and the clock are faked, so every state is
// reached the same way on every run. The founder moves below mirror the legacy test driver.
//
// To accept an intended change, review the outline diff, then run `npx vitest run -u`.
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { S, B, P, BUBBLES, active, autoRun, completeTask, founderApprove, inboxItems, log, mutate, setDelegation, start, st } from '@/engine/engine';
import Header from '@/components/shell/Header';
import Landing from '@/components/shell/Landing';
import IdeaIntake from '@/components/shell/IdeaIntake';
import TaskBody from '@/components/templates/Tasks';
import Workspace from '@/app/page';
import FounderHQ from '@/app/hq/page';
import Inbox from '@/app/inbox/page';
import StagePage from '@/app/stage/[i]/page';
import GatePage from '@/app/gate/[g]/page';
import BlockPage from '@/app/block/[id]/page';
import { outline } from './outline';

const nav = vi.hoisted(() => ({ params: {} as Record<string, string>, path: '/' }));
vi.mock('next/navigation', () => ({
  useParams: () => nav.params,
  usePathname: () => nav.path,
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push() {}, replace() {}, back() {}, forward() {}, refresh() {}, prefetch() {} }),
}));

const PERSONA_IDS = ['veejay', 'meera', 'rahul'] as const;
const noop = () => {};

function render(el: ReactElement, path = '/', params: Record<string, string> = {}) {
  nav.path = path; nav.params = params;
  return outline(renderToString(el));
}
const at = (dir: string) => (name: string, el: ReactElement, path?: string, params?: Record<string, string>) =>
  expect(render(el, path, params)).toMatchFileSnapshot(`./__snapshots__/${dir}/${name}.txt`);

// ---- founder moves (same choices as src/engine/__tests__/driver.ts) ----
function doIdeaTasks() {
  completeTask('profile');
  mutate(s => { s.idea = s.idea.trim(); s.pitch = s.pitch.trim() || P.pitch; }); completeTask('goal');
  mutate(s => { s.answers = P.clarify.map(([, opts]) => opts[0]); s.notes += 6; }); completeTask('clarify');
}
function doInterviews() {
  const order = [...P.contacts.keys()].filter(i => P.contacts[i].sig !== 'none').sort((a, b) => (P.contacts[b].sig === 'strong' ? 1 : 0) - (P.contacts[a].sig === 'strong' ? 1 : 0));
  order.slice(0, 4).forEach(i => { mutate(s => { s.calls.push(i); s.notes += 3; }); log(`You interviewed ${P.contacts[i].who.split(' · ')[0]}.`, 'founder'); });
  completeTask('interviews');
}
const busy = () => active().some(b => ['building', 'review', 'approving'].includes(B[b.id].st)) || Object.values(S.pending).some(v => v === 'ceo');
async function settle() {
  for (let i = 0; i < 1000; i++) { await vi.advanceTimersByTimeAsync(100); if (!busy()) return; }
  throw new Error('engine did not settle');
}

beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-01-05T09:00:00Z') });
  for (const k of Object.keys(BUBBLES)) delete BUBBLES[k as keyof typeof BUBBLES];
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe('entry screens', () => {
  it('landing (home)', async () => { await at('entry')('landing', <Landing />); });
  it('idea intake, kept in this tab', async () => { await at('entry')('intake-persisted', <IdeaIntake idea="A booking app for physiotherapy clinics" persisted onEdit={noop} onBack={noop} />); });
  it('idea intake, storage blocked', async () => { await at('entry')('intake-not-persisted', <IdeaIntake idea="A booking app for physiotherapy clinics" persisted={false} onEdit={noop} onBack={noop} />); });
});

describe.each(PERSONA_IDS)('%s demo', persona => {
  it('opened: first task waiting', async () => {
    start(persona);
    const shot = at(`${persona}/1-opened`);
    expect(inboxItems().map(i => i.n)).toEqual(['Founder profile']);
    await shot('header', <Header />);
    await shot('workspace', <Workspace />);
    await shot('hq', <FounderHQ />, '/hq');
    await shot('inbox', <Inbox />, '/inbox');
    await shot('stage-0', <StagePage />, '/stage/0', { i: '0' });
    await shot('block-profile', <BlockPage />, '/block/profile', { id: 'profile' });
    await shot('gate-1', <GatePage />, '/gate/1', { g: '1' });
  });

  it('drafting: Atlas runs the first stage while documents come to the founder', async () => {
    start(persona); doIdeaTasks(); setDelegation(0); autoRun(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(st('brief')).toBe('building');
    const shot = at(`${persona}/2-drafting`);
    await shot('header', <Header />);
    await shot('hq', <FounderHQ />, '/hq');
    await shot('stage-0', <StagePage />, '/stage/0', { i: '0' });
    await shot('block-brief', <BlockPage />, '/block/brief', { id: 'brief' });
  });

  it('approval: a checked document waits in the inbox', async () => {
    start(persona); doIdeaTasks(); setDelegation(0); autoRun(0);
    await settle();
    expect(st('brief')).toBe('inbox');
    const shot = at(`${persona}/3-approval`);
    await shot('header', <Header />);
    await shot('workspace', <Workspace />);
    await shot('hq', <FounderHQ />, '/hq');
    await shot('inbox', <Inbox />, '/inbox');
    await shot('block-brief', <BlockPage />, '/block/brief', { id: 'brief' });
  });

  it('gate ready: Gate 1 waits for inspection; every task template renders', async () => {
    start(persona); doIdeaTasks(); setDelegation(0); autoRun(0);
    await settle(); founderApprove('brief'); await settle();
    autoRun(1); doInterviews();
    for (let i = 0; i < 20 && S.pending[1] !== true; i++) {
      await settle();
      inboxItems().filter(x => x.ty === 'doc' || x.ty === 'money').forEach(x => founderApprove(x.href.split('/').pop()!));
    }
    expect(S.pending[1]).toBe(true);
    const shot = at(`${persona}/4-gate-ready`);
    await shot('header', <Header />);
    await shot('workspace', <Workspace />);
    await shot('hq', <FounderHQ />, '/hq');
    await shot('inbox', <Inbox />, '/inbox');
    await shot('stage-1', <StagePage />, '/stage/1', { i: '1' });
    await shot('gate-1', <GatePage />, '/gate/1', { g: '1' });
    await shot('block-problem', <BlockPage />, '/block/problem', { id: 'problem' });
    for (const b of active().filter(x => x.kind === 'task')) await shot(`task-${b.id}`, <TaskBody id={b.id} />, `/block/${b.id}`, { id: b.id });
  });
});
