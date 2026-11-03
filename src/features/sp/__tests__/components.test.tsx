import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createCore, steppedClock } from '@/engine/core/project';
import OfficeMap from '../components/OfficeMap';
import Rail from '../components/Rail';
import StartPopup from '../components/StartPopup';
import { EXAMPLE_IDEA, ideaContext, type IdeaInput } from '../idea';
import { ROOMS } from '../model';
import { startIdea } from '../startIdea';
import { activity, agentSpots, discoverRows, roomCards } from '../viewModel';

const started = () => {
  const core = createCore(steppedClock('2026-11-03T09:00:00.000Z'));
  const p = core.createFounderProject({ idea: 'New project', id: 'sp-render' });
  const c = ideaContext(EXAMPLE_IDEA, 'idea');
  const idea: IdeaInput = { option: 'idea', text: EXAMPLE_IDEA, name: c.name, q2: c.questions[1].q, answers: { a1: 'Students', a2: 'Manually or in spreadsheets', a3: 'Venture-scale startup' } };
  startIdea(core, p, idea);
  return { core, p };
};

describe('start popup', () => {
  it('opens on the four starting options, with Continue off until there is something to continue with', () => {
    const html = renderToStaticMarkup(<StartPopup userName="Veejay" onStart={() => null} />);
    for (const t of ['I have an idea', 'I have a problem to solve', 'I want to explore an opportunity', 'I need help defining my idea']) expect(html).toContain(t);
    expect(html).toContain('Welcome, Veejay');
    expect(html).toContain('SIMULATED OUTPUTS');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Continue<\/button>/);
  });
});

describe('office and rail', () => {
  it('draws every room, every agent, and the Repository count from the core', () => {
    const { core, p } = started();
    const rows = discoverRows(core, p);
    const html = renderToStaticMarkup(<OfficeMap rooms={roomCards(rows)} spots={agentSpots(rows)} memory={3} docs={{ count: 2, waiting: 0 }} docsHref="/sp/x/documentation" onAgent={() => {}} onRoom={() => {}} />);
    for (const r of ROOMS) expect(html).toContain(r.name.replace(/&/g, '&amp;'));
    expect(html).toContain('Atlas · shared memory');
    expect(html).toContain('2</div><small>documents');
    expect(html).toContain('href="/sp/x/documentation"');
    for (const n of ['Asha', 'Tej', 'Maya', 'You', 'Atlas']) expect(html).toContain(n);
  });
  it('shows what is waiting, the queue and real activity in the rail', () => {
    const { core, p } = started();
    const html = renderToStaticMarkup(<Rail rows={discoverRows(core, p)} feed={activity(p)} started progress={() => 0} onOpen={() => {}} onTask={() => {}} />);
    expect(html).toContain('Nothing needs you right now');
    expect(html).toContain('Idea brief');
    expect(html).toContain('You approved Idea goal');
  });
  it('asks the founder to start before showing a queue', () => {
    const core = createCore(steppedClock('2026-11-03T09:00:00.000Z'));
    const p = core.createFounderProject({ idea: 'New project', id: 'sp-empty' });
    const html = renderToStaticMarkup(<Rail rows={discoverRows(core, p)} feed={activity(p)} started={false} progress={() => 0} onOpen={() => {}} onTask={() => {}} />);
    expect(html).toContain('Start your idea to put the agents to work');
    expect(html).toContain('Tasks are created as the workflow reaches each step');
  });
});
