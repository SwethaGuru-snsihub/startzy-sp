import { describe, expect, it } from 'vitest';
import { BLOCKS } from '@/engine/engine';
import { steppedClock } from '@/engine/core/project';
import { TASK } from '@/engine/core/register';
import { createCoreRuntime, type ProjectInit } from '../coreRuntime';
import { createCoreStorage, MemoryAdapter } from '../coreStorage';
import { OFFICE_GATE_TO_CORE, syncOfficeToCore, type OfficeView } from '../coreBridge';
import { viewOf } from '../projectSelectors';
import { seedAdvanced } from './helpers';

const VJ: ProjectInit = { id: 'p-sample', name: 'Sample', pitch: 'x', presetId: 'veejay' };
const RH: ProjectInit = { id: 'p-rahul', name: 'Rahul Co', pitch: 'x', presetId: 'rahul' };
const mk = () => {
  const adapter = new MemoryAdapter();
  const rt = createCoreRuntime({ storage: createCoreStorage(adapter), clock: steppedClock('2026-11-02T09:00:00.000Z') });
  return { adapter, rt };
};
const office = (approved: OfficeView['approved'], extra: Partial<OfficeView> = {}): OfficeView => ({ approved, passedFloors: [], ...extra });
const proj = (rt: ReturnType<typeof mk>['rt'], id: string) => { const e = rt.getEntry(id); if (e?.status !== 'ready') throw new Error('not ready'); return e.project; };
const json = (x: unknown) => JSON.stringify(x);

describe('the Office and the core describe the same artifacts', () => {
  it('every Office block is a core task, so no approved block is ever dropped', () => {
    for (const b of BLOCKS) expect(TASK[b.id], b.id).toBeDefined();
    expect(BLOCKS).toHaveLength(37);
  });
  it('the three Office gates map onto core gates', () => {
    for (const g of Object.values(OFFICE_GATE_TO_CORE)) expect(TASK[g].kind).toBe('gate');
  });
});

describe('recording Office work in the core', () => {
  it('walks each approved block through the core: start, submit, review, approve', () => {
    const { rt } = mk(); rt.ensure(VJ);
    const r = syncOfficeToCore(rt, VJ.id, office([{ id: 'profile', by: 'YOU' }, { id: 'goal', by: 'YOU' }, { id: 'clarify', by: 'YOU' }, { id: 'brief', by: 'CEO' }]));
    expect(r.applied).toEqual(['profile', 'goal', 'clarify', 'brief']);
    const p = proj(rt, VJ.id);
    expect(['profile', 'goal', 'clarify', 'brief'].map(id => rt.core.state(p, id))).toEqual(['approved', 'approved', 'approved', 'approved']);
    const ev = (id: string, type: string) => p.events.find(e => e.task === id && e.type === type)!;
    expect(ev('profile', 'approved')).toMatchObject({ by: 'FOUNDER', method: 'human' });
    expect(ev('goal', 'started').method).toBe('human');                        // the founder's own task
    expect(ev('brief', 'started').method).toBe('simulated');                   // an agent's task
    expect(ev('brief', 'reviewed')).toMatchObject({ by: 'CQRO', method: 'simulated' });
    expect(ev('brief', 'approved')).toMatchObject({ by: 'CEO', method: 'simulated' });
    expect(viewOf(rt.core, p).sp.steps.find(s => s.id === 'SP1')!.status).toBe('complete');
  });

  it('is idempotent: recording the same Office state again changes nothing', () => {
    const { rt } = mk(); rt.ensure(VJ);
    const o = office([{ id: 'profile', by: 'YOU' }, { id: 'goal', by: 'YOU' }]);
    syncOfficeToCore(rt, VJ.id, o);
    const before = json(proj(rt, VJ.id));
    const again = syncOfficeToCore(rt, VJ.id, o);
    expect(again.applied).toEqual([]);
    expect(json(proj(rt, VJ.id))).toBe(before);
  });

  it('holds back what the core is not ready for, with the reason, and invents nothing', () => {
    const { rt } = mk(); rt.ensure(VJ);
    const r = syncOfficeToCore(rt, VJ.id, office([{ id: 'model', by: 'YOU' }]));   // the core needs the Go decision, solution options, ...
    expect(r.applied).toEqual([]);
    expect(proj(rt, VJ.id).workflows.SP.tasks.model.state).toBe('not-started');
    expect(r.waiting).toEqual([expect.objectContaining({ id: 'model', reason: expect.stringMatching(/waiting for/) })]);
    expect(proj(rt, VJ.id).events.filter(e => e.type === 'approved')).toEqual([]);
  });

  it('never records Atlas\'s approval as the founder\'s: what the core reserves for the founder waits for them', () => {
    const { rt } = mk(); rt.ensure(VJ);
    const r = syncOfficeToCore(rt, VJ.id, office([{ id: 'profile', by: 'CEO' }]));   // Atlas's own work: no self-approval
    expect(proj(rt, VJ.id).workflows.SJ.tasks.profile.state).toBe('awaiting-approval');
    expect(r.waiting[0]).toMatchObject({ id: 'profile', reason: expect.stringMatching(/waits for you/) });
    expect(viewOf(rt.core, proj(rt, VJ.id)).pending.some(a => a.taskId === 'profile' && a.kind === 'approval')).toBe(true);
  });

  it('follows the delegation level the founder set in the Office, with the audit event', () => {
    const { rt } = mk(); rt.ensure(VJ);
    syncOfficeToCore(rt, VJ.id, office([{ id: 'profile', by: 'YOU' }, { id: 'goal', by: 'YOU' }, { id: 'clarify', by: 'YOU' }, { id: 'brief', by: 'CEO' }], { delegation: 0 }));
    const p = proj(rt, VJ.id);
    expect(p.delegation).toBe(0);
    expect(p.events.some(e => e.type === 'delegation' && e.by === 'FOUNDER')).toBe(true);
    expect(p.workflows.SP.tasks.brief.state).toBe('awaiting-approval');            // level 0: nothing is delegated
  });

  it('passes a core gate once the Office gate passed and the core is ready for it', () => {
    const { rt, adapter } = mk();
    seedAdvanced(adapter, RH); rt.ensure(RH);                                      // research, interviews and the problem statement approved
    const early = syncOfficeToCore(rt, RH.id, office([], { passedFloors: [1] }));
    expect(early.applied).toEqual([]);                                             // the core also needs market, personas and competitors
    expect(proj(rt, RH.id).workflows.SP.tasks.gate1.state).toBe('not-started');
    const r = syncOfficeToCore(rt, RH.id, office([{ id: 'market', by: 'CEO' }, { id: 'personas', by: 'CEO' }, { id: 'competitors', by: 'CEO' }], { passedFloors: [1] }));
    expect(r.applied).toEqual(expect.arrayContaining(['market', 'personas', 'competitors', 'gate1']));
    const gate = proj(rt, RH.id).events.find(e => e.type === 'decided' && e.task === 'gate1')!;
    expect(gate).toMatchObject({ by: 'FOUNDER', method: 'human' });
  });

  it('leaves the core-only steps to the workflows: it never decides Go / Pivot / Stop or solution options', () => {
    const { rt, adapter } = mk();
    seedAdvanced(adapter, RH); rt.ensure(RH);
    syncOfficeToCore(rt, RH.id, office(
      ['market', 'personas', 'competitors', 'model', 'estimate', 'mvp', 'brd', 'prd', 'srs'].map(id => ({ id, by: 'CEO' as const, amount: 10 })),
      { passedFloors: [1, 3] }));
    const p = proj(rt, RH.id);
    for (const id of ['solution', 'validation', 'sj8', 'reqs']) expect(rt.core.state(p, id), id).toBe('not-started');
    expect(p.direction.versions).toEqual([]);
  });

  it('only records tasks that have not started: work the core flagged for re-check is left alone', () => {
    const { rt } = mk(); rt.ensure(VJ);
    const o = office([{ id: 'profile', by: 'YOU' }, { id: 'goal', by: 'YOU' }, { id: 'clarify', by: 'YOU' }]);
    syncOfficeToCore(rt, VJ.id, o);
    rt.mutate(VJ.id, (_c, p) => { p.workflows.SP.tasks.goal.state = 'needs-revalidation'; });
    const before = json(proj(rt, VJ.id));
    syncOfficeToCore(rt, VJ.id, o);
    expect(json(proj(rt, VJ.id))).toBe(before);
  });
});
