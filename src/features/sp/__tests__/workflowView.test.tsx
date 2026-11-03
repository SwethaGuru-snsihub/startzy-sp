import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { steppedClock } from '@/engine/core/project';
import { createCoreRuntime } from '@/services/coreRuntime';
import { createCoreStorage, MemoryAdapter } from '@/services/coreStorage';
import { approve, approveRecheck, saveDocEdit, startProject, type Env } from '../actions';
import WorkflowView from '../components/WorkflowView';
import { createDocStore } from '../docStore';
import { EXAMPLE_IDEA, ideaContext, type IdeaInput } from '../idea';
import { createRunner } from '../runner';
import { SpContext, type SpValue } from '../SpContext';
import { discoverRows } from '../viewModel';

const makeIdea = (): IdeaInput => {
  const c = ideaContext(EXAMPLE_IDEA, 'idea');
  return { option: 'idea', text: EXAMPLE_IDEA, name: 'Interview Coach', q2: c.questions[1].q, answers: { a1: 'Students', a2: 'Manually or in spreadsheets', a3: 'Venture-scale startup' } };
};
function office(start = true) {
  const rt = createCoreRuntime({ storage: createCoreStorage(new MemoryAdapter()), clock: steppedClock('2026-11-03T09:00:00.000Z') });
  rt.ensure({ id: 'sp-v', name: 'New project', pitch: '' });
  const docs = createDocStore(new MemoryAdapter(), 'sp-v', () => '2026-11-03T09:00:00.000Z');
  let idea: IdeaInput | null = null;
  const env: Env = { rt, id: 'sp-v', docs, idea: () => idea, setIdea: i => { idea = i; } };
  const runner = createRunner({ rt, id: 'sp-v', docs, idea: () => idea });
  if (start) startProject(env, makeIdea());
  const until = (cond: () => boolean) => { for (let i = 0; i < 400 && !cond(); i++) runner.tick(250); };
  const html = () => {
    const e = rt.getEntry('sp-v'); if (!e || e.status !== 'ready') throw new Error('not ready');
    const value: SpValue = {
      id: 'sp-v', record: { id: 'sp-v', name: idea?.name ?? 'New project', createdAt: '', ...(idea ? { idea } : {}) }, rt, core: rt.core, project: e.project,
      rows: discoverRows(rt.core, e.project, { takenUp: docs.takenUp(), rechecks: docs.rechecks() }), docs, env, runner, phases: runner.phases(), speed: 1, setSpeed: () => {},
      modal: null, open: () => {}, openTask: () => {}, toast: () => {}, goDoc: () => {}, docTarget: null, clearDocTarget: () => {}, start: () => null,
    };
    return renderToStaticMarkup(<SpContext.Provider value={value}><WorkflowView /></SpContext.Provider>);
  };
  return { env, docs, runner, until, html };
}
const status = (o: ReturnType<typeof office>, id: string) => {
  const e = o.env.rt.getEntry('sp-v');
  if (!e || e.status !== 'ready') throw new Error('not ready');
  return o.env.rt.core.state(e.project, id);
};

describe('Workflow tab', () => {
  it('asks the founder to start before there is anything to show', () => {
    expect(office(false).html()).toContain('Start your idea to see how Idea Definition runs');
  });
  it('lists the four features in order, with the step, and the steps that come next', () => {
    const h = office().html();
    const at = ['Idea Capture', 'Key fields Extraction / intent detection', 'Targeted Clarifying Questions', 'Idea Brief Review &amp; Confirmation'].map(n => h.indexOf(n));
    expect(at.every(i => i > 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    for (const t of ['SP1 · Idea Definition', '3/4', 'SP2 · Problem Discovery', 'SP3 · Opportunity &amp; Market', 'Gate 1', 'Define · Design · Delivery']) expect(h, t).toContain(t);
    expect(h).toContain('Feature 4 of 4');   // the brief is open first: it is the one that is not done yet
  });
  it('shows the founder\'s turn on the brief once it is drafted, with confirm and request changes', () => {
    const o = office(); o.until(() => status(o, 'brief') === 'awaiting-approval');
    const h = o.html();
    expect(h).toContain('Your turn: confirm the brief');
    expect(h).toContain('Confirm brief'); expect(h).toContain('Request changes');
    expect(h).toContain('Idea brief v1');
  });
  it('shows the progress while Asha drafts', () => {
    const o = office(); o.until(() => status(o, 'brief') === 'in-progress');
    expect(o.html()).toContain('Asha is drafting the brief');
  });
  it('says the step is complete once the brief is confirmed, and keeps the versions', () => {
    const o = office(); o.until(() => status(o, 'brief') === 'awaiting-approval'); approve(o.env, 'brief');
    const h = o.html();
    expect(h).toContain('4/4');   // SP1 is done, so the tab opens on the next thing that waits for the founder
    expect(h).toContain('Interview notes'); expect(h).toContain('Where this stands'); expect(h).toContain('Discover › SP2');
  });
  it('flags the brief for a re-check after the answers are edited, and explains what happens', () => {
    const o = office(); o.until(() => status(o, 'brief') === 'awaiting-approval'); approve(o.env, 'brief');
    const secs = o.docs.latest('clarify')!.secs.map(s => (s.h === 'Goal' ? { ...s, b: 'Profitable small business' } : s));
    expect(saveDocEdit(o.env, 'clarify', secs, 'x')).toBeNull();
    const h = o.html();
    expect(h).toContain('This brief needs a re-check'); expect(h).toContain('Approve re-check'); expect(h).toContain('Built on earlier answers'); expect(h).toContain('Needs re-check');
    expect(h).not.toContain('Idea Definition is complete');
    approveRecheck(o.env);
    expect(o.html()).toContain('Asha is about to start the brief');
  });
});
