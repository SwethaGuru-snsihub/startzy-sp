import { describe, expect, it } from 'vitest';
import { createCore, steppedClock } from '@/engine/core/project';
import { TASK } from '@/engine/core/register';
import { EXAMPLE_IDEA, GOAL_ANSWERS, ideaContext, isIdeaReady, parseDoing, parseWho, questionsFor, topicOf, type IdeaInput } from '../idea';
import { startIdea } from '../startIdea';
import { activity, discoverRows, discoverSteps, needsYou, roomCards, taskStatus, agentSpots } from '../viewModel';

const fresh = () => {
  const core = createCore(steppedClock('2026-11-03T09:00:00.000Z'));
  return { core, p: core.createFounderProject({ idea: 'New project', id: 'sp-test' }) };
};
const ideaWith = (a3 = 'Venture-scale startup'): IdeaInput => {
  const ctx = ideaContext(EXAMPLE_IDEA, 'idea');
  return { option: 'idea', text: EXAMPLE_IDEA, name: ctx.name, q2: ctx.questions[1].q, answers: { a1: 'Students', a2: 'Manually or in spreadsheets', a3 } };
};

describe('reading the founder\'s words', () => {
  it('finds who it is for and what it does from the sentence', () => {
    const topic = topicOf(EXAMPLE_IDEA);
    expect(parseWho(EXAMPLE_IDEA, topic)).toBe('students');
    expect(parseDoing(EXAMPLE_IDEA)).toBe('prepare for technical interviews');
    expect(topic.name).toBe('Interview Prep');
  });
  it('falls back to the topic when the sentence names nobody', () => {
    expect(parseWho('A tool for the thing', topicOf('A tool'))).toBeTruthy();
    expect(parseDoing('Something vague')).toBe('reach the outcome you described');
  });
  it('asks three questions, and the second depends on where the founder is starting', () => {
    const q = (o: Parameters<typeof questionsFor>[0]) => questionsFor(o, 'students');
    expect(q('idea')).toHaveLength(3);
    expect(q('idea')[0].q).toContain('students');
    expect(new Set(['idea', 'problem', 'opportunity', 'define'].map(o => q(o as never)[1].q)).size).toBe(4);
    expect(q('idea')[2].options).toEqual(GOAL_ANSWERS.map(g => g.answer));
  });
  it('needs an option and a sentence before it can continue', () => {
    expect(isIdeaReady('', EXAMPLE_IDEA)).toBe(false);
    expect(isIdeaReady('idea', 'too short')).toBe(false);
    expect(isIdeaReady('idea', EXAMPLE_IDEA)).toBe(true);
  });
});

describe('starting an idea in the core', () => {
  it('records the founder profile, the idea goal and the clarification as the founder\'s own work', () => {
    const { core, p } = fresh();
    startIdea(core, p, ideaWith());
    for (const id of ['profile', 'goal', 'clarify']) expect(core.state(p, id)).toBe('approved');
    const approvals = p.events.filter(e => e.type === 'approved' && ['profile', 'goal', 'clarify'].includes(e.task!));
    expect(approvals.map(e => e.by)).toEqual(['FOUNDER', 'FOUNDER', 'FOUNDER']);
    expect(p.idea).toBe(EXAMPLE_IDEA);
    expect(p.delegation).toBe(0);
  });
  it('turns the goal answer into the goal fact the Discover tasks read', () => {
    for (const g of GOAL_ANSWERS) {
      const { core, p } = fresh();
      startIdea(core, p, ideaWith(g.answer));
      expect(p.context.goal).toEqual({ value: g.fact, source: 'founder' });
    }
  });
  it('leaves the Idea Brief ready for an agent and everything after it waiting', () => {
    const { core, p } = fresh();
    startIdea(core, p, ideaWith());
    expect(core.readyTasks(p)).toContain('brief');
    expect(taskStatus(core, p, 'brief')).toBe('ready');
    expect(taskStatus(core, p, 'research')).toBe('blocked');
    expect(taskStatus(core, p, 'gate1')).toBe('blocked');
  });
  it('makes market, competitors and interviews optional for a learning project, required otherwise', () => {
    const venture = fresh(); startIdea(venture.core, venture.p, ideaWith('Venture-scale startup'));
    const learning = fresh(); startIdea(learning.core, learning.p, ideaWith('A side project to learn'));
    for (const id of ['market', 'competitors', 'interviews']) {
      expect(venture.core.taskView(venture.p, id).applicability).toBe('required');
      expect(learning.core.taskView(learning.p, id).applicability).toBe('optional');
    }
  });
  it('sends every approval to the founder, never to Atlas', () => {
    const { core, p } = fresh();
    startIdea(core, p, ideaWith());
    for (const id of ['brief', 'research', 'problem', 'market', 'personas', 'competitors']) expect(core.approverFor(p, id).approver).toBe('FOUNDER');
  });
  it('refuses to start twice, an empty idea, or an unknown goal, and changes nothing when it refuses', () => {
    const { core, p } = fresh();
    expect(() => startIdea(core, p, { ...ideaWith(), text: '   ' })).toThrow(/idea/i);
    expect(() => startIdea(core, p, ideaWith('Something else'))).toThrow(/goal/i);
    expect(core.state(p, 'goal')).toBe('not-started');
    startIdea(core, p, ideaWith());
    expect(() => startIdea(core, p, ideaWith())).toThrow(/already/i);
  });
});

describe('what the screens read from the core', () => {
  it('shows a fresh project as waiting on the founder\'s first answers', () => {
    const { core, p } = fresh();
    const rows = discoverRows(core, p);
    expect(rows.map(r => r.id)).toEqual(['goal', 'clarify', 'brief', 'research', 'interviews', 'problem', 'market', 'personas', 'competitors', 'gate1']);
    expect(taskStatus(core, p, 'goal')).toBe('blocked');   // needs the founder profile first
    expect(discoverSteps(core, p).map(s => s.status)).toEqual(['not-started', 'not-started', 'not-started', 'not-started']);
  });
  it('maps each core state to a founder-facing status, and the owner and reviewer come from the register', () => {
    const { core, p } = fresh();
    startIdea(core, p, ideaWith());
    core.startTask(p, 'brief', 'simulated');
    expect(taskStatus(core, p, 'brief')).toBe('working');
    core.submitTask(p, 'brief');
    expect(taskStatus(core, p, 'brief')).toBe('review');
    core.reviewTask(p, 'brief', { passed: true });
    expect(taskStatus(core, p, 'brief')).toBe('needs');
    expect(needsYou(discoverRows(core, p)).map(r => r.id)).toContain('brief');
    const row = discoverRows(core, p).find(r => r.id === 'brief')!;
    expect([row.owner, row.reviewer]).toEqual([TASK.brief.owner, TASK.brief.reviewer]);
    core.approveTask(p, 'brief', { by: 'FOUNDER' });
    expect(taskStatus(core, p, 'brief')).toBe('done');
    expect(taskStatus(core, p, 'research')).toBe('ready');
  });
  it('puts agents at their desks, and lights the room where work happens', () => {
    const { core, p } = fresh();
    startIdea(core, p, ideaWith());
    core.startTask(p, 'brief', 'simulated');
    const rows = discoverRows(core, p);
    expect(roomCards(rows).find(r => r.id === 'discovery')).toMatchObject({ doing: 1, active: true });
    expect(roomCards(rows).find(r => r.id === 'research')?.active).toBe(false);
    const spots = agentSpots(rows);
    expect(spots.find(s => s.id === 'CSO')).toMatchObject({ state: 'working', bubble: 'working…' });
    expect(spots.find(s => s.id === 'CDO')?.state).toBe('idle');
  });
  it('builds the activity feed from real events', () => {
    const { core, p } = fresh();
    startIdea(core, p, ideaWith());
    const text = activity(p).map(a => a.text);
    expect(text).toContain('You approved Founder profile');
    expect(text).toContain('You approved Idea goal');
    expect(text.some(t => t.startsWith('Recorded: goal='))).toBe(true);
  });
});
