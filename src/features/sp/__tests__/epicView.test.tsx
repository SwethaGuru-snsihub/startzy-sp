import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { steppedClock } from '@/engine/core/project';
import { createCoreRuntime } from '@/services/coreRuntime';
import { createCoreStorage, MemoryAdapter } from '@/services/coreStorage';
import { approve, startProject, type Env } from '../actions';
import EpicTimeline from '../components/EpicTimeline';
import SlotsPanel from '../components/SlotsPanel';
import WorkflowView from '../components/WorkflowView';
import { createDocStore } from '../docStore';
import { EXAMPLE_IDEA, ideaContext, type IdeaInput } from '../idea';
import { createRunner } from '../runner';
import { SpContext, type SpValue } from '../SpContext';
import { extractSlots, slotsFor } from '../slots';
import { epic1Rows } from '../spec/epic1';
import { discoverRows } from '../viewModel';

const makeIdea = (): IdeaInput => {
  const c = ideaContext(EXAMPLE_IDEA, 'idea');
  return { option: 'idea', text: EXAMPLE_IDEA, name: 'Interview Coach', q2: c.questions[1].q, answers: { a1: 'Students', a2: 'Manually or in spreadsheets', a3: 'Venture-scale startup' } };
};

describe('the epic timeline', () => {
  const rows = epic1Rows('brief', { '1.T7': 'done', '1.T8': 'done', '1.T9': 'done', '1.T10': 'needs', '1.T11': 'blocked' });
  const h = renderToStaticMarkup(<EpicTimeline rows={rows} />);
  it('lists every step in order with who does it', () => {
    const at = ['T7', 'T8', 'T9', 'T10', 'T11'].map(t => h.indexOf(`>${t}<`));
    expect(at.every(i => i > 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    for (const t of ['Idea Brief Draft', 'User-Confirmed Idea Brief', 'Assigned Domain Agents + CQRO']) expect(h, t).toContain(t.replace('&', '&amp;'));
  });
  it('shows what waits for the founder and marks the steps that are simulated', () => {
    expect(h).toContain('Needs you');
    expect(h).toContain('Simulated');
    expect(h).toContain('Done');
  });
  it('renders nothing for an empty list', () => {
    expect(renderToStaticMarkup(<EpicTimeline rows={[]} />)).toBe('');
  });
});

describe('the slots panel', () => {
  const slots = slotsFor({ option: 'idea', text: EXAMPLE_IDEA, answers: { a1: 'Students', a2: 'Manually or in spreadsheets' } }, true);
  const h = renderToStaticMarkup(<SlotsPanel slots={slots} />);
  it('shows the five slots by name, with who fills each', () => {
    for (const n of ['Idea', 'Problem', 'Target users', 'Expected outcome', 'Constraints']) expect(h, n).toContain(n);
    expect(h).toContain('CEO');
    expect(h).toContain('CTO');
  });
  it('labels where each value came from and quotes the founder\'s words', () => {
    expect(h).toContain('Confirmed by you');
    expect(h).toContain('Assumption');
    const e = renderToStaticMarkup(<SlotsPanel slots={extractSlots(EXAMPLE_IDEA, 'idea')} />);
    expect(e).toContain('From your words');
    expect(e).toContain('Inferred');
    expect(e).toContain('prepare for technical interviews');
    expect(e).toContain('Not known');
  });
  it('says the values are simulated', () => {
    expect(h).toContain('SIMULATED');
  });
});

function office() {
  const rt = createCoreRuntime({ storage: createCoreStorage(new MemoryAdapter()), clock: steppedClock('2026-11-06T09:00:00.000Z') });
  rt.ensure({ id: 'sp-e', name: 'New project', pitch: '' });
  const docs = createDocStore(new MemoryAdapter(), 'sp-e', () => '2026-11-06T09:00:00.000Z');
  let idea: IdeaInput | null = null;
  const env: Env = { rt, id: 'sp-e', docs, idea: () => idea, setIdea: i => { idea = i; } };
  const runner = createRunner({ rt, id: 'sp-e', docs, idea: () => idea });
  startProject(env, makeIdea());
  const until = (cond: () => boolean) => { for (let i = 0; i < 400 && !cond(); i++) runner.tick(250); };
  const html = (initial?: string) => {
    const e = rt.getEntry('sp-e'); if (!e || e.status !== 'ready') throw new Error('not ready');
    const value: SpValue = {
      id: 'sp-e', record: { id: 'sp-e', name: 'Interview Coach', createdAt: '', idea: idea! }, rt, core: rt.core, project: e.project,
      rows: discoverRows(rt.core, e.project, { takenUp: docs.takenUp(), rechecks: docs.rechecks() }), docs, env, runner, phases: runner.phases(), speed: 1, setSpeed: () => {},
      modal: null, open: () => {}, openTask: () => {}, toast: () => {}, goDoc: () => {}, docTarget: null, clearDocTarget: () => {}, start: () => null,
    };
    return renderToStaticMarkup(<SpContext.Provider value={value}><WorkflowView initial={initial} /></SpContext.Provider>);
  };
  const brief = () => { const e = rt.getEntry('sp-e'); if (!e || e.status !== 'ready') throw new Error('not ready'); return rt.core.state(e.project, 'brief'); };
  return { env, until, html, brief };
}

describe('the Workflow tab shows the sheet tasks of each feature', () => {
  it('lists T1 under Idea Capture', () => {
    const h = office().html('capture');
    expect(h).toContain('>T1<');
    expect(h).not.toContain('>T2<');
  });
  it('lists T2 to T4 and the five slots under Key fields Extraction, with quotes and labels', () => {
    const h = office().html('extract');
    for (const t of ['T2', 'T3', 'T4']) expect(h, t).toContain(`>${t}<`);
    expect(h).toContain('Slot Values + Evidence (quote) + Confidence');
    expect(h).toContain('Target users');
    expect(h).toContain('From your words');
    expect(h).toContain('SIMULATED');
  });
  it('lists T5 and T6 under the clarifying questions, and shows what the answers confirmed', () => {
    const h = office().html('clarify');
    expect(h).toContain('>T5<'); expect(h).toContain('>T6<');
    expect(h).toContain('Confirmed by you');
    expect(h).toContain('Assumption');
  });
  it('lists T7 to T11 under the brief, with the founder\'s confirmation waiting for them', () => {
    const o = office(); o.until(() => o.brief() === 'awaiting-approval');
    const h = o.html();
    for (const t of ['T7', 'T8', 'T9', 'T10', 'T11']) expect(h, t).toContain(`>${t}<`);
    expect(h).toContain('User-Confirmed Idea Brief');
    expect(h).toContain('Needs you');
    expect(h).not.toContain('Idea brief v1 locked');
  });
  it('shows the brief as locked once the founder confirms it', () => {
    const o = office(); o.until(() => o.brief() === 'awaiting-approval'); approve(o.env, 'brief');
    const h = o.html('brief');
    expect(h).toContain('Idea brief v1 locked');
  });
});
