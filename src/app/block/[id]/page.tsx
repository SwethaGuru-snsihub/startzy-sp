'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { S, B, def, st, nm, startBlock, founderApprove, sendBack, openTask, lakh, isOk, approverFor } from '@/engine/engine';
import { engineById, ROOMS, STAGES } from '@/engine/model';
import { useEngine } from '@/engine/useEngine';
import { Avatar, Rich, StatusChip, ProductTag } from '@/components/ui/kit';
import TaskBody from '@/components/templates/Tasks';

const REASONS = ['Missing evidence', 'Numbers look wrong', 'Not clear enough'];

/* T5 document viewer · founder task template */
export default function BlockPage() {
  useEngine();
  const id = useParams<{ id: string }>().id; const redo = useSearchParams().get('redo') === '1';
  const router = useRouter();
  const b = def(id); const s = b ? st(id) : 'locked';
  const showTask = !!b && b.kind === 'task' && (s === 'ready' || redo);
  useEffect(() => { if (showTask) openTask(id); }, [showTask, id]);
  const [why, setWhy] = useState(false); const [back, setBack] = useState(false);
  if (!b) return <p className="t-small">No such block.</p>;
  const r = B[id]; const e = engineById(b.engine);
  const lines = r.lines || (b.lines && ['review', 'approving', 'inbox', 'building', 'cracked'].includes(s) && r.p >= 0 && s !== 'building' ? b.lines() : null);
  return (
    <div className="grid gap-4 items-start" style={{ gridTemplateColumns: 'minmax(0,1fr) 340px' }}>
      <section className="panel p-6 flex flex-col gap-4 min-w-0">
        <div className="flex items-center gap-2 t-small"><Link href={`/stage/${b.f}`} className="hover:underline">← {STAGES[b.f].name}</Link><span>·</span><span>{e.full} · {ROOMS[e.room].full}</span></div>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div><h1 className="t-title">{b.name}</h1><div className="t-small mt-1">{b.mod} · v{r.ver}</div></div>
          <div className="flex items-center gap-2"><ProductTag tag={b.tag} /><StatusChip s={showTask ? 'task' : s} /></div>
        </div>

        {b.say && showTask && (
          <div className="flex gap-3 items-start p-3 rounded-xl" style={{ background: 'var(--subtle)' }}><Avatar id={b.owner} size={30} /><div><div className="t-caps">{nm(b.owner)}</div><div className="text-[14px]">{b.say()}</div></div></div>
        )}
        {showTask && <TaskBody id={id} />}

        {!showTask && s === 'locked' && <p className="t-small p-3 rounded-xl" style={{ background: 'var(--subtle)' }}>Waiting on {b.needs.filter(n => !isOk(n)).map(n => def(n).name).join(', ') || 'the previous stage'}.</p>}
        {!showTask && s === 'ready' && b.kind === 'auto' && (
          <div className="flex items-center justify-between gap-3 p-4 rounded-xl" style={{ background: 'var(--subtle)' }}>
            <span className="t-small">{nm(b.owner)} drafts this at the {e.name} engine; {b.checker} checks it; {nm(approverFor(b))} approves.</span>
            <button className="btn btn-primary" onClick={() => startBlock(id)}>Start block</button>
          </div>
        )}
        {s === 'building' && <div className="flex flex-col gap-1.5"><span className="t-small">{nm(b.owner)} is drafting… {r.p}%</span><div className="h-1.5 rounded" style={{ background: 'var(--line)' }}><div className="h-1.5 rounded" style={{ width: `${r.p}%`, background: 'var(--sp)', transition: 'width .2s' }} /></div></div>}

        {b.ap === 'money' && ['inbox', 'approving', 'review', 'approved'].includes(s) && (
          <div className="p-3 rounded-xl flex items-center gap-3" style={{ background: 'var(--sz-soft)', border: '1px solid var(--sz)' }}>
            <span className="t-metric" style={{ color: 'var(--sz)' }}>{lakh(b.amount!())}</span>
            <span className="t-small">Spend · Atlas may approve up to {S.deleg === 0 ? 'nothing' : S.deleg === 1 ? '₹10 lakh' : '₹50 lakh'}{s === 'inbox' ? ', so this one is yours.' : '.'}</span>
          </div>
        )}

        {lines && !showTask && (
          <article className="p-5 rounded-xl flex flex-col gap-2" style={{ background: 'var(--paper)', border: '1px solid var(--line)' }}>
            {lines.map((l, i) => <p key={i} className="text-[14px]"><Rich text={l} /></p>)}
          </article>
        )}
        {!showTask && b.kind === 'task' && isOk(id) && !lines && <p className="t-small p-3 rounded-xl" style={{ background: 'var(--go-soft)', color: 'var(--go)' }}>You completed this task.</p>}

        {s === 'inbox' && (
          <div className="flex flex-col gap-2">
            {back ? (
              <div className="flex flex-wrap gap-1.5 items-center"><span className="t-small mr-1">Why?</span>{REASONS.map(x => <button key={x} className="btn btn-sm" onClick={() => { sendBack(id, x); setBack(false); }}>{x}</button>)}<button className="btn btn-sm" onClick={() => setBack(false)}>Cancel</button></div>
            ) : (
              <div className="flex gap-2 justify-end"><button className="btn" onClick={() => setBack(true)}>Send back</button><button className="btn btn-go" onClick={() => { founderApprove(id); router.push('/hq'); }}>Approve</button></div>
            )}
          </div>
        )}
        {s === 'cracked' && <p className="t-small p-3 rounded-xl" style={{ background: 'var(--stop-soft)', color: 'var(--stop)' }}>Something this block is built on changed. Re-check it from your inbox.</p>}

        <div>
          <button className="t-small underline" onClick={() => setWhy(!why)} aria-expanded={why}>Why this {b.kind === 'task' ? 'task' : 'document'}?</button>
          {why && <div className="t-small mt-2 p-3 rounded-xl" style={{ background: 'var(--subtle)' }}>Built on: {b.needs.map(n => def(n).name).join(', ') || 'nothing; it starts the journey'}. Used by the {e.full} ({e.skill}).</div>}
        </div>
      </section>

      <section className="panel p-4 flex flex-col gap-2.5" aria-label="Review trail">
        <div className="t-h3">Review trail</div>
        <div className="flex gap-2 flex-wrap t-small">
          <span>Maker: {b.kind === 'task' ? 'You' : nm(b.owner)}</span>{b.checker && <span>· Checker: {nm(b.checker)}</span>}{r.by && <span>· Approved by {nm(r.by)}</span>}
        </div>
        {!r.cm.length && <p className="t-small">No activity yet.</p>}
        {r.cm.map((c, i) => (
          <div key={i} className="flex gap-2 items-start text-[13px]"><Avatar id={c.k} size={22} /><div className="p-2 rounded-lg flex-1" style={{ background: c.tone === 'warn' ? 'var(--stop-soft)' : c.tone === 'ok' ? 'var(--go-soft)' : 'var(--subtle)' }}><b>{nm(c.k)}</b> · <Rich text={c.t} /></div></div>
        ))}
      </section>
    </div>
  );
}
