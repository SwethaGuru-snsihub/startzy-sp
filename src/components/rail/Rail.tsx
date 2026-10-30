'use client';
import Link from 'next/link';
import { useState } from 'react';
import { S, B, active, inboxItems, engineState, isOk, st, nm, reinspectAll } from '@/engine/engine';
import { ENGINES, engineById, ROOMS, AGENTS } from '@/engine/model';
import { Avatar, PanelHead, Rich, StatusChip } from '@/components/ui/kit';

const TY: Record<string, [string, string]> = {
  gate: ['var(--stop-soft)', 'var(--stop)'], money: ['var(--sz-soft)', 'var(--sz)'], doc: ['var(--go-soft)', 'var(--go)'],
  task: ['var(--accent)', 'var(--on-accent)'], crack: ['var(--stop)', 'var(--on-color)'],
};

export function InboxCard({ limit }: { limit?: number }) {
  const items = inboxItems(); const shown = limit ? items.slice(0, limit) : items;
  return (
    <section className="panel p-4 flex flex-col gap-2" aria-label="Your inbox">
      <PanelHead title="Your inbox" sub={items.length ? `${items.length} need you` : 'All clear'} />
      {!items.length && <p className="t-small">Nothing needs you right now. Start blocks in the current stage, or let Atlas run it.</p>}
      {shown.map((x, i) => (
        x.ty === 'crack'
          ? <button key={i} onClick={() => reinspectAll()} className="flex items-center gap-2.5 p-2.5 rounded-xl text-left row-hover" style={{ background: 'var(--subtle)', border: '1px solid var(--line)' }}><Badge ty={x.ty} t={x.t} /><span><span className="t-strong block">{x.n}</span><span className="t-small">Traceability will re-check them</span></span></button>
          : <Link key={i} href={x.href} className="flex items-center gap-2.5 p-2.5 rounded-xl row-hover" style={{ background: 'var(--subtle)', border: '1px solid var(--line)' }}><Badge ty={x.ty} t={x.t} /><span className="min-w-0"><span className="t-strong block">{x.n}</span>{x.s && <span className="t-small block truncate">{x.s}</span>}</span></Link>
      ))}
      {limit && items.length > limit && <Link href="/inbox" className="t-small underline">View all {items.length}</Link>}
    </section>
  );
}
function Badge({ ty, t }: { ty: string; t: string }) { const [bg, fg] = TY[ty]; return <span className="pill t-micro px-2 py-0.5 flex-none" style={{ background: bg, color: fg }}>{t}</span>; }

export function WorkQueue() {
  const [scope, setScope] = useState<'stage' | 'all'>('stage');
  const [filter, setFilter] = useState<'all' | 'running' | 'you' | 'done'>('all');
  let rows = active().filter(b => scope === 'all' ? b.f <= S.floor : b.f === Math.min(S.floor, 10));
  const cls = (id: string) => { const s = st(id); return ['building', 'review', 'approving'].includes(s) ? 'running' : s === 'inbox' || (s === 'ready' && rows.find(r => r.id === id)?.kind === 'task') ? 'you' : s === 'approved' ? 'done' : 'other'; };
  const counts = { all: rows.length, running: rows.filter(b => cls(b.id) === 'running').length, you: rows.filter(b => cls(b.id) === 'you').length, done: rows.filter(b => cls(b.id) === 'done').length };
  if (filter !== 'all') rows = rows.filter(b => cls(b.id) === filter);
  return (
    <section className="panel p-4 flex flex-col gap-2.5" aria-label="Work queue">
      <PanelHead title="Work queue" right={
        <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--line-strong)' }}>
          {([['stage', 'This stage'], ['all', 'Whole journey']] as const).map(([k, l]) => <button key={k} onClick={() => setScope(k)} className="t-micro px-2.5 py-1" style={{ fontSize: 11, background: scope === k ? 'var(--ink)' : 'var(--panel)', color: scope === k ? 'var(--panel)' : 'var(--ink)' }}>{l}</button>)}
        </div>} />
      <div className="flex gap-1.5 flex-wrap">
        {([['all', 'All'], ['running', 'Running'], ['you', 'Needs you'], ['done', 'Done']] as const).map(([k, l]) => <button key={k} onClick={() => setFilter(k)} className={`btn btn-sm ${filter === k ? 'btn-primary' : ''}`}>{l} {counts[k]}</button>)}
      </div>
      {rows.map(b => {
        const s = st(b.id); const r = B[b.id]; const isTask = b.kind === 'task' && s === 'ready';
        const prog = s === 'approved' ? 100 : s === 'building' ? r.p : s === 'review' ? 70 : s === 'approving' || s === 'inbox' ? 100 : 0;
        const bar = s === 'approved' ? 'var(--go)' : s === 'inbox' ? 'var(--accent)' : ['building', 'review', 'approving'].includes(s) ? 'var(--sp)' : 'var(--line-strong)';
        return (
          <Link key={b.id} href={`/block/${b.id}`} className="flex flex-col gap-1.5 p-2.5 rounded-xl row-hover" style={{ background: 'var(--subtle)' }}>
            <div className="flex items-center gap-2"><Avatar id={b.kind === 'task' ? 'YOU' : b.owner} /><div className="flex-1 min-w-0"><div className="t-strong truncate">{b.name}</div><div className="t-small truncate" style={{ fontSize: 11 }}>{engineById(b.engine).name} · {ROOMS[engineById(b.engine).room].name}</div></div><StatusChip s={isTask ? 'task' : s} /></div>
            <div className="h-1 rounded" style={{ background: 'var(--line)' }}><div className="h-1 rounded" style={{ width: `${prog}%`, background: bar, transition: 'width .3s' }} /></div>
          </Link>
        );
      })}
      {!rows.length && <p className="t-small">Nothing here for this filter.</p>}
    </section>
  );
}

export function EngineDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const e = engineById(id); const es = engineState(id);
  const operators = (Object.keys(AGENTS) as (keyof typeof AGENTS)[]).filter(k => AGENTS[k].home === id);
  const outs = active().filter(b => b.engine === id);
  return (
    <section className="panel p-4 flex flex-col gap-2.5" aria-label={`${e.full} detail`}>
      <button onClick={onClose} className="t-eyebrow text-left">← {ROOMS[e.room].full} · engine</button>
      <div className="flex items-center justify-between gap-2"><div className="t-h2">{e.id} · {e.full}</div><StatusChip s={es.status === 'Waiting for you' ? 'inbox' : es.status === 'Running' ? 'building' : es.status === 'Reviewing' ? 'review' : es.status === 'Ready' ? 'approved' : es.status === 'Re-check' ? 'cracked' : 'idle'} label={es.status === 'Idle' ? 'Idle' : es.status} /></div>
      <dl className="grid gap-x-3 gap-y-2 text-[13px]" style={{ gridTemplateColumns: '96px 1fr' }}>
        <dt className="t-caps pt-0.5">Operator</dt><dd>{es.job ? nm(es.job.kind === 'task' ? 'YOU' : es.job.owner) : operators.length ? operators.map(nm).join(', ') + ' (home)' : 'Automated'}</dd>
        <dt className="t-caps pt-0.5">Skill</dt><dd>{e.skill}</dd>
        <dt className="t-caps pt-0.5">Seats</dt><dd>{e.seats || 'None (automated)'}</dd>
        <dt className="t-caps pt-0.5">Current job</dt><dd>{es.job ? `${es.job.name} · v${B[es.job.id].ver}` : '—'}</dd>
        <dt className="t-caps pt-0.5">Outputs</dt><dd className="flex flex-col gap-0.5">{outs.length ? outs.map(b => <Link key={b.id} href={`/block/${b.id}`} className="underline-offset-2 hover:underline">{isOk(b.id) ? '✓' : '◐'} {b.name}</Link>) : '—'}</dd>
      </dl>
      {es.job && <div className="flex justify-end"><Link className="btn btn-sm btn-primary" href={`/block/${es.job.id}`}>Open block</Link></div>}
    </section>
  );
}

const DOT: Record<string, string> = { start: 'var(--sp)', issue: 'var(--stop)', approve: 'var(--go)', escalate: 'var(--accent)', gate: 'var(--ag-cro)', ripple: 'var(--stop)', founder: 'var(--ink)' };
export function ActivityFeed({ n = 5 }: { n?: number }) {
  return (
    <section className="panel p-4 flex flex-col gap-2" aria-label="Activity">
      <PanelHead title="Activity" right={<span className="pill t-micro" style={{ color: 'var(--go)' }}><span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--go)' }} />Live · simulated</span>} />
      {S.log.slice(0, n).map((l: { id: number; m: number; text: string; kind: string }) => (
        <div key={l.id} className="flex items-baseline gap-2.5 text-[13px]"><span className="w-1.5 h-1.5 rounded-full flex-none translate-y-[-1px]" style={{ background: DOT[l.kind] }} /><span className="t-log flex-none">M{l.m}</span><span><Rich text={l.text} /></span></div>
      ))}
    </section>
  );
}
export const ENGINE_LIST = ENGINES;
