import { describe, expect, it } from 'vitest';
import { CONTAINS, SJ_PHASES, SP_STEPS } from '../definitions';
import { LINKS, TASK, TASKS, isDecision, requiredInputs } from '../register';

describe('the 18 Startup Journey phases and 16 Solution Planning steps', () => {
  it('defines the 18 phases in the order of the original brief, each with its room and agents', () => {
    expect(SJ_PHASES.map(p => p.name)).toEqual([
      'Founder Onboarding', 'Idea & Goal Discovery', 'Problem Discovery', 'Market Research', 'Problem Validation',
      'Solution Ideation', 'Solution Validation', 'Go / Pivot / Stop', 'Business Planning', 'Product Definition',
      'Design & Technical Planning', 'Company Setup, Legal & Funding', 'Hiring & Project Setup', 'MVP Development',
      'Testing & Quality Validation', 'Beta Testing with Early Users', 'Launch & Go-to-Market', 'Business Operations, Growth & Scaling',
    ]);
    expect(SJ_PHASES.map(p => p.id)).toEqual(Array.from({ length: 18 }, (_, i) => `SJ${i + 1}`));
    expect(SJ_PHASES.every(p => p.room && p.agents.length > 0)).toBe(true);
  });

  it('defines the 16 steps in four groups, in the order of the original brief', () => {
    expect(SP_STEPS.map(s => s.name)).toEqual([
      'Idea Definition', 'Problem Discovery', 'Opportunity & Market', 'Solution Discovery', 'Business Model & Case',
      'Product Definition', 'Requirements Register', 'BRD / PRD / SRS',
      'Solution Blueprint', 'Experience Design', 'Technical Design', 'Design Review',
      'Task Breakdown', 'Estimates & Release Plan', 'Quality, Release & Operations', 'Handoff to Solution Builder',
    ]);
    expect(SP_STEPS.map(s => s.group)).toEqual([
      ...Array(5).fill('discover'), ...Array(3).fill('define'), ...Array(4).fill('design'), ...Array(4).fill('delivery'),
    ]);
  });

  it('SP9 to SP15 sit inside SJ11; SP16 sits outside every phase', () => {
    expect(CONTAINS.SJ11).toEqual(['SP9', 'SP10', 'SP11', 'SP12', 'SP13', 'SP14', 'SP15']);
    expect(Object.values(CONTAINS).flat()).not.toContain('SP16');
  });
});

describe('artifact register: lifecycle coverage, ownership, reviewer independence', () => {
  it('52 artifacts, one producing task each', () => {
    expect(TASKS).toHaveLength(52);
    expect(new Set(TASKS.map(t => t.artifact)).size).toBe(52);
  });
  it('every artifact has exactly one owner', () => {
    expect(TASKS.every(t => typeof t.owner === 'string' && t.owner.length > 0)).toBe(true);
  });
  it('every task belongs to exactly one workflow, which owns its artifact', () => {
    expect(TASKS.every(t => (t.workflow === 'SJ' && t.home.startsWith('SJ')) || (t.workflow === 'SP' && t.home.startsWith('SP')))).toBe(true);
  });
  it('no reviewer owns or contributes to what it reviews', () => {
    expect(TASKS.filter(t => t.reviewer && (t.reviewer === t.owner || t.contributors.includes(t.reviewer)))).toEqual([]);
  });
  it('CQRO owns only review records', () => {
    expect(TASKS.filter(t => t.owner === 'CQRO').every(t => t.kind === 'review')).toBe(true);
  });
  it('learning evaluation: SJ18, CEO owner, CTO and CDO contribute, CQRO reviews', () => {
    const l = TASK.learneval;
    expect([l.home, l.owner, l.contributors.join(), l.reviewer]).toEqual(['SJ18', 'CEO', 'CTO,CDO', 'CQRO']);
  });
  it('learning evaluation and metrics review are separate artifacts with no link between them', () => {
    expect(TASK.metrics.artifact).not.toBe(TASK.learneval.artifact);
    expect(TASK.learneval.links.some(l => l.to === 'metrics')).toBe(false);
    expect(TASK.metrics.links.some(l => l.to === 'learneval')).toBe(false);
  });
  it('all 16 SP steps have tasks', () => {
    const homes = new Set(TASKS.map(t => t.home));
    expect(SP_STEPS.every(s => homes.has(s.id))).toBe(true);
  });
  it('all 18 SJ phases have tasks or contain SP steps', () => {
    const homes = new Set(TASKS.map(t => t.home));
    expect(SJ_PHASES.every(p => homes.has(p.id) || CONTAINS[p.id])).toBe(true);
  });
});

describe('dependency register', () => {
  it('every link names an existing task', () => {
    expect(LINKS.every(l => TASK[l.to] && TASK[l.from])).toBe(true);
  });
  it('no cycles across both workflows (requires and informed-by)', () => {
    const state: Record<string, number> = {}; let cycle: string | null = null;
    const visit = (id: string) => {
      if (state[id] === 2) return; if (state[id] === 1) { cycle = id; return; }
      state[id] = 1; TASK[id].links.forEach(l => visit(l.to)); state[id] = 2;
    };
    TASKS.forEach(t => visit(t.id));
    expect(cycle).toBeNull();
  });
  it('132 links = 111 requires + 18 decision + 1 informed-by + 2 conditional', () => {
    const n = (type: string) => LINKS.filter(l => l.type === type).length;
    expect([LINKS.length, n('requires'), n('decision'), n('informed-by'), n('conditional')]).toEqual([132, 111, 18, 1, 2]);
  });
  it('a link into a gate or the direction decision is a decision link', () => {
    expect(LINKS.filter(l => isDecision(l.to)).every(l => l.type === 'decision')).toBe(true);
  });
  it('exactly 20 cross-workflow links', () => {
    expect(LINKS.filter(l => l.cross)).toHaveLength(20);
    expect(LINKS.every(l => l.cross === (TASK[l.from].workflow !== TASK[l.to].workflow))).toBe(true);
  });
  it('the handoff requires exactly the SP1-SP15 artifacts, Gates 1-3 and SJ8, goal and clarify included', () => {
    const spInputs = TASKS.filter(t => t.workflow === 'SP' && Number(t.home.slice(2)) <= 15).map(t => t.id).concat('sj8').sort();
    expect([...requiredInputs('handoff')].sort()).toEqual(spInputs);
    expect(spInputs).toHaveLength(28);
  });
  it('hiring is only informed by the roadmap', () => {
    expect(TASK.hiring.links.find(l => l.to === 'roadmap')!.type).toBe('informed-by');
  });
});
