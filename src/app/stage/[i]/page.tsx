'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { S, B, active, st, isOk, startBlock, autoRun, nm } from '@/engine/engine';
import { STAGES, engineById, ROOMS } from '@/engine/model';
import { useEngine } from '@/engine/useEngine';
import { Avatar, StatusChip, ProductTag } from '@/components/ui/kit';
import { ActivityFeed } from '@/components/rail/Rail';
import { useHref } from '@/components/shell/ProjectBase';

/* G10 · Stage overview */
export default function StagePage() {
  useEngine(); const href = useHref();
  const i = Number(useParams<{ i: string }>().i); const F = STAGES[i];
  if (!F) return <p className="t-small">No such stage.</p>;
  const blocks = active().filter(b => b.f === i);
  const req = blocks.filter(b => !b.opt); const done = req.filter(b => isOk(b.id)).length;
  const locked = i > S.floor; const handed = S.auto.has(i);
  const gateNo = ({ 1: 1, 3: 2, 8: 3 } as Record<number, number>)[i];
  return (
    <div className="grid gap-4 items-start" style={{ gridTemplateColumns: 'minmax(0,1fr) 340px' }}>
      <section className="panel p-6 flex flex-col gap-4 min-w-0">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div><div className="t-eyebrow">Stage {i + 1} of 11</div><h1 className="t-title">{F.name}</h1>
            <p className="t-small mt-1">{done} of {req.length} required blocks approved{locked ? ' · locked until the previous stage passes' : ''}</p></div>
          {!locked && !S.passed[i] && <button className="btn btn-primary" disabled={handed} onClick={() => autoRun(i)}>{handed ? 'Atlas is running this stage' : 'Let Atlas run this stage'}</button>}
        </div>
        <div className="h-1.5 rounded" style={{ background: 'var(--line)' }}><div className="h-1.5 rounded" style={{ width: `${req.length ? (done / req.length) * 100 : 0}%`, background: 'var(--go)', transition: 'width .4s' }} /></div>
        <div className="flex flex-col gap-2">
          {blocks.map(b => {
            const s = st(b.id); const e = engineById(b.engine); const isTask = b.kind === 'task' && s === 'ready';
            return (
              <div key={b.id} className="flex items-center gap-3 p-3 rounded-xl" style={{ border: '1px solid var(--line)', background: s === 'inbox' || isTask ? 'var(--accent-soft)' : 'var(--panel)' }}>
                <Avatar id={b.kind === 'task' ? 'YOU' : b.owner} size={28} />
                <div className="flex-1 min-w-0">
                  <div className="t-strong">{b.name}{b.opt ? ' (optional)' : ''}</div>
                  <div className="t-small truncate" style={{ fontSize: 12 }}>{b.kind === 'task' ? 'You' : nm(b.owner)} · {e.name} · {ROOMS[e.room].name}{b.checker ? ` · checked by ${b.checker}` : ''}</div>
                  {s === 'building' && <div className="h-1 mt-1.5 rounded" style={{ background: 'var(--line)' }}><div className="h-1 rounded" style={{ width: `${B[b.id].p}%`, background: 'var(--sp)' }} /></div>}
                </div>
                <ProductTag tag={b.tag} />
                <StatusChip s={isTask ? 'task' : s} />
                {s === 'ready' && b.kind === 'auto' ? <button className="btn btn-sm btn-primary" onClick={() => startBlock(b.id)}>Start</button>
                  : <Link className="btn btn-sm" href={href(`/block/${b.id}`)}>{isTask ? 'Do it' : s === 'inbox' ? 'Review' : 'Open'}</Link>}
              </div>
            );
          })}
        </div>
        {F.gate !== 'none' && (
          <div className="p-4 rounded-xl flex items-center gap-3" style={{ background: 'var(--subtle)', border: `1px solid ${F.gate === 'you' ? 'var(--accent)' : 'var(--line)'}` }}>
            <div className="flex-1"><div className="t-h3">{F.gate === 'you' ? F.gateName : 'Atlas stage check'}</div>
              <div className="t-small">{S.passed[i] ? 'Passed.' : F.gate === 'you' ? 'You inspect this gate in the Strategy & Finance Centre once every required block is approved.' : 'Atlas passes this stage automatically when every required block is approved.'}</div></div>
            {F.gate === 'you' && (S.pending[i] === true || S.passed[i]) && <Link href={href(`/gate/${gateNo}`)} className={`btn ${S.passed[i] ? '' : 'btn-primary'}`}>{S.passed[i] ? 'View gate' : 'Start inspection'}</Link>}
          </div>
        )}
      </section>
      <ActivityFeed n={8} />
    </div>
  );
}
