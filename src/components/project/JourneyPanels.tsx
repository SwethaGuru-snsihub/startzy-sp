'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useEngine } from '@/engine/useEngine';
import { def } from '@/engine/engine';
import { TASK } from '@/engine/core/register';
import { useHref } from '@/components/shell/ProjectBase';
import { useReadyProject } from '@/features/shell/ProjectProvider';
import { waitingFor } from '@/services/coreBridge';
import { FACT_QUESTIONS } from '@/services/factQuestions';
import { formatDate, viewOf, type PendingAction, type StepView, type WorkflowView } from '@/services/projectSelectors';
import { readOffice, syncNow } from '@/services/projectSessions';
import type { SimulatedStepResult } from '@/services/simulatedStep';
import { useCoreRuntime } from '@/services/useProjectCore';
import type { FactKey } from '@/engine/core/context';
import type { PivotTarget } from '@/engine/core/direction';

const stepColor = (s: StepView['status']) => (s === 'complete' ? 'var(--go)' : s === 'in-progress' ? 'var(--accent)' : 'var(--muted)');
const DIRECTION_TEXT = { open: 'Go / Pivot / Stop not decided yet', go: 'Direction: Go', pivot: 'Direction: Pivot open (it can be withdrawn)', stopped: 'Direction: Stopped (read-only)' };
const wfName = (w: string) => (w === 'SJ' ? 'Startup Journey' : 'Solution Planning');

/* The 18-phase Startup Journey and the 16-step Solution Planning workflow of this startup, shown under
   the Founder HQ workspace. Everything here is read from, and acts on, this project's own core
   instance; the Office above records its approved work into it. */
export default function JourneyPanels() {
  useEngine();                                   // the Office state changes what is waiting to be recorded
  const { id } = useReadyProject();
  const href = useHref();
  const rt = useCoreRuntime();
  const [last, setLast] = useState<SimulatedStepResult | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [target, setTarget] = useState<PivotTarget>('SP4');

  const entry = rt.getEntry(id);
  if (!entry || entry.status !== 'ready') {
    return entry?.status === 'error'
      ? (
        <section className="panel p-5 mt-4 flex flex-col gap-2" role="alert" style={{ border: '1px solid var(--stop)' }}>
          <div className="t-h3">The journey records for this startup are not usable</div>
          <p className="t-small">{entry.message}</p>
        </section>
      ) : null;
  }
  const p = entry.project;
  const v = viewOf(rt.core, p);
  const waiting = waitingFor(rt.core, p, readOffice());
  const questions = rt.core.openQuestions(p).filter(k => FACT_QUESTIONS[k]);

  const act = (fn: Parameters<typeof rt.mutate>[1], after?: () => void) => {
    const r = rt.mutate(id, fn);
    setMsg(r.ok ? null : r.error);
    if (r.ok) { syncNow(id, true); after?.(); }
  };
  const runStep = () => {
    setMsg(null);
    const r = rt.runSimulatedStep(id);
    if (!r.ok) { setMsg(r.error); return; }
    if (!r.value.ok) { setLast(null); setMsg(r.value.reason); return; }
    setLast(r.value); syncNow(id, true);
  };

  const controls = (a: PendingAction) => {
    const t = TASK[a.taskId];
    const inOffice = !!def(a.taskId);
    if (a.kind === 'approval') return <button className="btn btn-sm btn-go" onClick={() => act((c, q) => c.approveTask(q, a.taskId, { by: 'FOUNDER' }))}>Approve</button>;
    if (a.kind === 'acknowledge') return <button className="btn btn-sm" onClick={() => act((c, q) => c.acknowledgeNA(q, a.taskId))}>Acknowledge</button>;
    if (a.kind === 'external') return (
      <span className="flex gap-1.5"><button className="btn btn-sm btn-primary" onClick={() => act((c, q) => c.solutionBuilderAccept(q))}>Accept package</button>
        <button className="btn btn-sm" onClick={() => act((c, q) => c.solutionBuilderReturn(q, 'returned for changes'))}>Return</button></span>);
    if (a.kind === 'decision' && t.kind === 'gate') return (
      <span className="flex gap-1.5"><button className="btn btn-sm btn-go" onClick={() => act((c, q) => c.decideGate(q, a.taskId, 'pass'))}>Pass</button>
        <button className="btn btn-sm" onClick={() => act((c, q) => c.decideGate(q, a.taskId, 'not-yet'))}>Not yet</button></span>);
    if (a.kind === 'decision' && t.kind === 'direction') return (
      <span className="flex gap-1.5 flex-wrap items-center">
        <button className="btn btn-sm btn-go" onClick={() => act((c, q) => c.decideDirection(q, { kind: 'go' }))}>Go</button>
        <select aria-label="Pivot target" className="btn btn-sm" value={target} onChange={e => setTarget(e.target.value as PivotTarget)}>{(['SP1', 'SP2', 'SP3', 'SP4'] as const).map(s => <option key={s} value={s}>{s}</option>)}</select>
        <button className="btn btn-sm" onClick={() => act((c, q) => c.decideDirection(q, { kind: 'pivot', target }))}>Pivot</button>
        <button className="btn btn-sm" onClick={() => { if (window.confirm('Stop this startup? Both workflows become read-only until you resume.')) act((c, q) => c.decideDirection(q, { kind: 'stop' })); }}>Stop</button>
      </span>);
    if (a.kind === 'optional') return <span className="flex gap-1.5">{inOffice && <Link className="btn btn-sm" href={href(`/block/${a.taskId}`)}>Open in the Office</Link>}<button className="btn btn-sm" onClick={() => act((c, q) => c.declineTask(q, a.taskId))}>Decline</button></span>;
    if (a.kind === 'task' && inOffice) return <Link className="btn btn-sm btn-primary" href={href(`/block/${a.taskId}`)}>Do it in the Office</Link>;
    return null;
  };

  return (
    <div className="flex flex-col gap-4 mt-4" aria-label="Startup journey and solution planning">
      <section className="panel p-5 flex flex-col gap-4" aria-label="Workflow progress">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="t-eyebrow">This startup&apos;s two workflows</div>
            <div className="t-h3">Startup Journey (18 phases) · Solution Planning (16 steps)</div>
            <p className="t-small text-[12px]" style={{ maxWidth: '70ch' }}>
              Each workflow keeps its own steps, gates and artifacts. Work approved in the Office is recorded here as it is done; nothing is filled in for you.
              Handoff: <b>{v.handoff.label}</b>. {DIRECTION_TEXT[v.direction]}{v.pivotOpen ? ' · a pivot is open' : ''}{v.archived ? ' · stopped' : ''}.
            </p>
          </div>
          <div className="t-small text-[12px] text-right">
            {v.lastActivityAt ? `Last journey activity ${formatDate(v.lastActivityAt)}` : 'No journey activity yet'}<br />
            Evidence {v.evidence.total} items · Planned spend ₹{v.plannedSpendLakh}L · Runway not tracked
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <WorkflowCard title="Startup Journey" unit="phases" w={v.sj} color="var(--go)" prefix="Phase" />
          <WorkflowCard title="Solution Planning" unit="steps" w={v.sp} color="var(--sp)" prefix="Step" />
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          {[v.sj, v.sp].map(w => (
            <div key={w.workflow} className="flex flex-col gap-1">
              <div className="t-caps">{wfName(w.workflow)} · gates and decisions</div>
              {w.gates.map(g => <div key={g.id} className="flex justify-between gap-2 t-small text-[12px] p-2 rounded-lg" style={{ background: 'var(--subtle)' }}><span className="t-strong">{g.name}</span><span style={{ color: g.state === 'approved' ? 'var(--go)' : 'var(--muted)' }}>{g.state}</span></div>)}
            </div>
          ))}
        </div>
      </section>

      {questions.length > 0 && (
        <section className="panel p-5 flex flex-col gap-3" aria-label="Questions">
          <div className="t-h3">Questions Atlas needs answered</div>
          <p className="t-small text-[12px]">The workflows decide which steps apply to you from your answers. Nothing is assumed from your idea.</p>
          <div className="grid sm:grid-cols-2 gap-3">
            {questions.map(k => {
              const q = FACT_QUESTIONS[k]!;
              return (
                <label key={k} className="flex flex-col gap-1">
                  <span className="t-strong text-[13px]">{q.q}</span>
                  <select className="btn" defaultValue="" onChange={e => { if (e.target.value) act((c, s) => c.setFact(s, k as FactKey, e.target.value)); }}>
                    <option value="" disabled>Choose…</option>
                    {q.options.map(([val, label]) => <option key={val} value={val}>{label}</option>)}
                  </select>
                </label>
              );
            })}
          </div>
        </section>
      )}

      <section className="panel p-5 flex flex-col gap-2.5" aria-label="Needs you in the journey">
        <div className="t-h3">Needs you in the journey ({v.pending.length})</div>
        {v.pending.length === 0 && <p className="t-small">Nothing is waiting for you in the two workflows right now.</p>}
        {v.pending.map((a, i) => (
          <div key={`${a.taskId}-${i}`} className="flex items-center gap-3 p-2.5 rounded-xl flex-wrap" style={{ background: 'var(--subtle)' }}>
            <span className="flex-1 min-w-[200px]"><span className="t-strong block text-[13px]">{a.label}</span><span className="t-small text-[11px]" style={{ color: 'var(--muted)' }}>{wfName(a.workflow)} · {a.detail}</span></span>
            {controls(a)}
          </div>
        ))}
        {msg && <p role="status" className="t-small text-[13px] p-2.5 rounded-xl" style={{ border: '1px solid var(--line)' }}>{msg}</p>}
      </section>

      {waiting.length > 0 && (
        <section className="panel p-5 flex flex-col gap-2" aria-label="Approved in the Office, not yet recorded">
          <div className="t-h3">Approved in the Office, not yet recorded ({waiting.length})</div>
          <p className="t-small text-[12px]">The workflows have more steps than the Office. These are recorded as soon as the steps they depend on are done.</p>
          {waiting.map(w => <div key={w.id} className="t-small text-[12px] p-2 rounded-lg" style={{ background: 'var(--subtle)' }}><span className="t-strong">{w.name}</span> · {w.reason}</div>)}
        </section>
      )}

      <section className="panel p-5 flex flex-col gap-3" aria-label="Simulated agent step">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="t-h3">Agent work the Office does not cover</div>
            <p className="t-small text-[12px]" style={{ maxWidth: '64ch' }}>
              Runs the next task a simulated agent owns in the workflows (for example solution options or the design review). It never takes your tasks, gates,
              Go / Pivot / Stop or Solution Builder acceptance, and anything routed to you waits for you.
            </p>
          </div>
          <button className="btn btn-primary" onClick={runStep} disabled={v.archived}>Run next simulated step</button>
        </div>
        {last && last.ok && (
          <div role="status" className="p-3 rounded-xl flex flex-col gap-1" style={{ border: '1px solid var(--line)', background: 'var(--subtle)' }}>
            <div className="t-strong text-[13px]"><span className="pill t-micro px-2 py-0.5 mr-2" style={{ background: 'var(--accent-soft)', color: 'var(--accent)', border: '1px solid var(--accent)' }}>SIMULATED</span>{wfName(last.workflow)} · {last.artifact}</div>
            {last.actions.map((a, i) => <div key={i} className="t-small text-[12px]">{a}</div>)}
          </div>
        )}
      </section>

      <section className="panel p-5 flex flex-col gap-1.5" aria-label="Journey activity">
        <div className="t-h3">Journey activity</div>
        {v.recentEvents.map(e => (
          <div key={e.seq} className="t-small text-[12px]">
            <span className="t-strong">{e.type}</span>{e.task ? ` · ${e.task}` : ''}{e.by ? ` · ${e.by}` : ''}{e.method ? ` (${e.method})` : ''}
            {e.detail ? <span style={{ color: 'var(--muted)' }}> — {e.detail}</span> : null}
          </div>
        ))}
      </section>
    </div>
  );
}

function WorkflowCard({ title, unit, w, color, prefix }: { title: string; unit: string; w: WorkflowView; color: string; prefix: string }) {
  return (
    <div className="p-4 rounded-xl flex flex-col gap-2.5" style={{ background: 'var(--subtle)', border: '1px solid var(--line)' }}>
      <div className="flex items-center justify-between">
        <span className="t-caps">{title}</span>
        <span className="t-strong text-[13px]">{w.completeCount} / {w.total} {unit} complete</span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--line)' }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${(w.completeCount / w.total) * 100}%`, background: color }} />
      </div>
      <span className="t-small text-[12px]" style={{ color: 'var(--muted)' }}>
        {w.current ? `${prefix} ${w.current.n} · ${w.current.name} (${w.current.status === 'in-progress' ? 'in progress' : 'not started'})` : 'All complete'}
      </span>
      <ol className="flex flex-col gap-0.5 mt-1">
        {w.steps.map(s => (
          <li key={s.id} className="flex justify-between gap-2 t-small text-[11px]">
            <span>{s.n}. {s.name}</span>
            <span style={{ color: stepColor(s.status) }}>{s.status === 'in-progress' ? 'in progress' : s.status === 'not-started' ? '—' : 'complete'}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
