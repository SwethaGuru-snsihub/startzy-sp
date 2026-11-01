// Golden traces: whole projects played from start to finish with both workflows in one project.
// Each trace is the project's event log, stored as a readable file; any change in sequencing,
// ownership, approvals or labels shows up as a diff. Accept an intended change with `npx vitest run -u`.
import { describe, expect, it } from 'vitest';
import { createCore, steppedClock, type Core } from '../project';
import { TASKS } from '../register';
import type { Project } from '../types';
import { CONTEXTS } from './fixtures';
import { play, type Policy } from './script';

function trace(p: Project) {
  return p.events.map(e => [
    String(e.seq).padStart(3, '0'), e.at.slice(0, 16), (e.workflow ?? '--').padEnd(2), e.type.padEnd(19),
    e.task ?? '', e.version ? `v${e.version}` : '', e.by ? `by ${e.by}` : '', e.method ? `(${e.method})` : '', e.detail ?? '',
  ].filter(Boolean).join(' ')).join('\n') + '\n';
}

function finished(core: Core, p: Project) {
  const app = core.applicability(p);
  return TASKS.filter(t => app[t.id].status !== 'na' && !['approved', 'declined'].includes(core.state(p, t.id))).map(t => `${t.id}=${core.state(p, t.id)}/${app[t.id].status}`);
}

const DEMOS: [string, 'veejay' | 'meera' | 'rahul', Policy][] = [
  ['veejay', 'veejay', { takeUp: ['preseed'], facts: { preseed: { raise: 'committed' } } }],
  ['meera', 'meera', { takeUp: ['presell'], facts: { hiring: { collaborators: 'contributors' } } }],
  ['rahul', 'rahul', {}],
];

describe('golden traces: both workflows played to the end in one project', () => {
  for (const [name, persona, policy] of DEMOS) {
    it(`${name} demo`, async () => {
      const core = createCore(steppedClock('2026-01-05T09:00:00.000Z'));
      const p = core.createDemoProject(persona);
      core.applyDemoAnswers(p);
      play(core, p, policy);
      expect(finished(core, p)).toEqual([]);
      expect(core.workflowProgress(p, 'SP').complete).toBe(true);
      expect(core.workflowProgress(p, 'SJ').complete).toBe(true);
      await expect(trace(p)).toMatchFileSnapshot(`./__snapshots__/golden/${name}.txt`);
    });
  }

  it('real founder: a side project to learn, from the founder\'s own idea and answers', async () => {
    const core = createCore(steppedClock('2026-01-05T09:00:00.000Z'));
    const p = core.createFounderProject({ idea: 'A habit tracker I build to learn mobile development' });
    for (const [k, f] of Object.entries(CONTEXTS.learnSolo)) core.setFact(p, k as keyof typeof CONTEXTS.learnSolo, f!.value);
    for (const id of core.awaitingAcknowledgement(p)) core.acknowledgeNA(p, id);
    expect(core.openQuestions(p)).toEqual([]);
    play(core, p, { stopAt: x => core.readyTasks(x)[0] === 'learneval' });
    const ev = core.addEvidence(p, { type: 'feedback', date: p.events.at(-1)!.at.slice(0, 10), inspected: true, origin: 'qa' });
    play(core, p, {
      learning: [{ id: 'O1', statement: 'Learn to ship a mobile app end to end', outcome: 'the app passes QA and goes live', evidence: [ev], result: { observed: 'QA passed; live for 2 users', verdict: 'achieved' }, conclusion: 'Achieved' }],
    });
    expect(finished(core, p)).toEqual([]);
    expect(core.state(p, 'learneval')).toBe('approved');
    expect(core.applicability(p).metrics.status).toBe('na');
    await expect(trace(p)).toMatchFileSnapshot('./__snapshots__/golden/learning-founder.txt');
  });
});
