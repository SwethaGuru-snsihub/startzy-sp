// Headless founder for engine regression tests.
//
// The engine rules live in engine.ts, but what a founder DOES on each task screen is still coded
// inside the React components (src/components/templates/Tasks.tsx). This driver mirrors those
// mutations exactly so a whole journey can run without a browser. When the task logic is
// extracted into the engine (Phase 0b), this file shrinks to calls into those actions.
import {
  S, P, B, active, def, st, isOk, inboxItems, founderApprove, completeTask, autoRun, passFloor, gateChecks,
  mutate, log, spendMonths, topUp, strong, fit, ev, growth, finish, setSpeed, getVersion, crackFrom, start,
} from '../engine';

export const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Wait until no block is mid-pipeline and the engine has been quiet for a few ticks. */
export async function settle(maxMs = 20000) {
  const t0 = Date.now(); let last = -1, quiet = 0;
  while (Date.now() - t0 < maxMs) {
    await sleep(8);
    const busy = active().some(b => ['building', 'review', 'approving'].includes(B[b.id].st)) || Object.values(S.pending).some(v => v === 'ceo');
    const v = getVersion();
    if (!busy && v === last) { if (++quiet >= 6) return; } else quiet = 0;
    last = v;
  }
  throw new Error('engine did not settle');
}

export function begin(personaId: string) { setSpeed(1000); start(personaId); }

// ---- what the founder does on each task screen (mirrors Tasks.tsx) ----
const FOUNDER: Record<string, () => void> = {
  profile: () => {},
  goal: () => mutate(s => { s.idea = s.idea.trim(); s.pitch = s.pitch.trim() || P.pitch; }),
  clarify: () => mutate(s => { s.answers = P.clarify.map(([, opts]) => opts[0]); s.notes += 6; }),
  interviews: () => {
    const order = [...P.contacts.keys()].filter(i => P.contacts[i].sig !== 'none').sort((a, b) => (P.contacts[b].sig === 'strong' ? 1 : 0) - (P.contacts[a].sig === 'strong' ? 1 : 0));
    order.slice(0, 4).forEach(i => { mutate(s => { s.calls.push(i); s.notes += 3; }); log(`You interviewed ${P.contacts[i].who.split(' · ')[0]}.`, 'founder'); });
  },
  model: () => { const best = P.pricing.findIndex(p => p.fit === 2); mutate(s => { s.pricing = best; s.bump = 1; }); },
  preseed: () => { // venture path: raise at the middle ask
    const deal = P.fund.asks[1], e = ev(), got = e >= 70 ? 1 : e >= 55 ? 1 : 0, d = P.fund.asks[got] ?? deal;
    mutate(s => { s.runway += d.r; s.raised = d.l; });
  },
  budget: () => { const e = ev(), got = e >= 70 ? 1 : e >= 55 ? 1 : 0, d = P.fund.asks[got]; mutate(s => { s.runway += d.r; s.raised = d.l; }); },
  presell: () => {
    const k = [1, 3, 4][fit()]; let sent = 0;
    P.fund.leads.slice(0, 3).forEach(() => { const yes = S.presold < k && sent + 1 <= k + 1; if (yes) mutate(s => { s.presold++; }); sent++; });
    mutate(s => { s.runway += +(S.presold * 1.2).toFixed(1); });
  },
  mvp: () => mutate(s => { s.mvp = [...P.features].sort((a, b) => b.core - a.core).slice(0, 4).map(f => f.n); }),
  company: () => mutate(s => { s.stamped = 3; }),
  hiring: () => mutate(s => { s.hires = P.hires.filter(h => h.fit).slice(0, 2).map(h => h); if (s.hires.length < 2) s.hires = P.hires.slice(0, 2); }),
  sprints: () => { const total = 3 + (S.mvp.length - S.mvp.filter((n: string) => P.features.find(f => f.n === n)!.core).length); for (let n = 1; n <= total; n++) spendMonths(0.75); },
  beta: () => { const groups = [Math.max(2, strong() * 2), Math.round(P.betaN / 2), Math.round(P.betaN / 4)]; mutate(s => { s.beta += groups[0] + groups[1]; s.betaGroups = [0, 1]; }); },
  pricetest: () => mutate(s => { s.priceOk = true; }), // keep the best price
  launch: () => { const score = P.channels.map(c => c.v).sort((a, b) => b - a).slice(0, 2).reduce((a, b) => a + b, 0); const target = Math.max(4, Math.round(score * 10 * [0.3, 0.6, 1][fit()] * (0.6 + ev() / 250))); mutate(s => { s.customers = target; }); },
  scale: () => {},
};

function doTask(id: string) {
  FOUNDER[def(id).task!]();
  if (id === 'scale') { finish(); return; }
  completeTask(id);
}

/** Fix whatever a failed gate check says, the way the gate screen's "Ways to fix it" does. */
function fixGate(g: number) {
  const { checks } = gateChecks(g);
  checks.forEach(c => {
    if (c.ok) return;
    if (/months of/.test(c.t)) topUp();
    else if (/disappointed/.test(c.t)) { spendMonths(1); mutate(s => { s.pmf = Math.min(85, (s.pmf ?? 0) + 12); }); }
    else throw new Error(`gate ${g}: no automated fix for "${c.t}"`);
  });
}

const GATE_OF_FLOOR: Record<number, number> = { 1: 1, 3: 2, 8: 3 };

/** Play a persona from Brief to Journey complete. Returns the number of steps taken. */
export async function playJourney(opts: { delegation?: 0 | 1 | 2 } = {}) {
  if (opts.delegation != null) { const { setDelegation } = await import('../engine'); setDelegation(opts.delegation); }
  let steps = 0;
  while (!S.ended) {
    if (++steps > 400) throw new Error(`journey stuck at stage ${S.floor}: ${inboxItems().map(i => i.n).join(', ')}`);
    if (!S.auto.has(S.floor)) autoRun(S.floor);
    await settle();
    const items = inboxItems();
    const gate = items.find(i => i.ty === 'gate');
    if (gate) {
      const g = GATE_OF_FLOOR[S.floor]; fixGate(g);
      if (!gateChecks(g).checks.every(c => c.ok)) throw new Error(`gate ${g} still failing`);
      passFloor(S.floor, 'You'); continue;
    }
    const approve = items.find(i => i.ty === 'money' || i.ty === 'doc');
    if (approve) { founderApprove(approve.href.split('/').pop()!); continue; }
    if (items.some(i => i.ty === 'crack')) { throw new Error('unexpected re-check in the happy path'); }
    const task = active().find(b => b.kind === 'task' && st(b.id) === 'ready' && b.f <= S.floor && !b.opt)
      ?? active().find(b => b.kind === 'task' && st(b.id) === 'ready' && b.f <= S.floor);
    if (task) { doTask(task.id); continue; }
    if (!S.auto.has(S.floor)) continue; // the stage advanced while we were settling
    if (!active().some(b => ['building', 'review', 'approving'].includes(B[b.id].st))) throw new Error(`no move available at stage ${S.floor}: ` + active().filter(b => b.f >= S.floor - 1 && b.f <= S.floor).map(b => `${b.id}=${st(b.id)}`).join(' ') + ` pending=${JSON.stringify(S.pending)} auto=${[...S.auto]}`);
  }
  await settle();
  return steps;
}

export function summary() {
  const blocks = active();
  return {
    ended: S.ended,
    stagesPassed: Object.keys(S.passed).map(Number).sort((a, b) => a - b),
    approved: blocks.filter(b => isOk(b.id)).length,
    skipped: blocks.filter(b => B[b.id].st === 'skipped').map(b => b.id),
    approvedBy: { YOU: S.by.YOU, CEO: S.by.CEO },
    bounces: S.bounces,
    versions: Object.fromEntries(blocks.filter(b => B[b.id].ver > 1).map(b => [b.id, B[b.id].ver])),
    evidence: ev(),
    pmf: S.pmf,
    customers: S.customers,
    retention: growth().ret,
  };
}

export { crackFrom };
