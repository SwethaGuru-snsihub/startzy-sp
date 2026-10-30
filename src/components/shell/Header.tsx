'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { S, P, ev, active, isOk, inboxItems, setDelegation, getSpeed, setSpeed, def, lakh, B } from '@/engine/engine';
import { STAGES } from '@/engine/model';
import { Avatar } from '@/components/ui/kit';

const DELEG = [
  { t: 'Nothing', d: 'Every document and spend comes to you.' },
  { t: 'Docs + spend ≤ ₹10 lakh', d: 'Atlas approves documents and spend up to ₹10 lakh.' },
  { t: 'Docs + spend ≤ ₹50 lakh', d: 'Atlas approves documents and spend up to ₹50 lakh.' },
];

function usePopover() {
  const [open, setOpen] = useState(false); const ref = useRef<HTMLDivElement>(null);
  const path = usePathname(); const [seen, setSeen] = useState(path);
  if (seen !== path) { setSeen(path); setOpen(false); }
  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc); document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, []);
  return { open, setOpen, ref };
}

export default function Header() {
  const router = useRouter();
  const { open: stageOpen, setOpen: setStageOpen, ref: stageRef } = usePopover(); const { open: dgOpen, setOpen: setDgOpen, ref: dgRef } = usePopover();
  const req = active().filter(b => !b.opt); const done = req.filter(b => isOk(b.id)).length;
  const inbox = inboxItems().length;
  const cur = Math.min(S.floor, 10);
  const gatesPassed = [1, 3, 8].filter(f => S.passed[f]).length;
  const pendingSpend = active().find(b => b.ap === 'money' && B[b.id].st !== 'approved' && B[b.id].st !== 'idle');
  const metric = (l: string, v: string, tone?: string) => (
    <div><div className="t-caps">{l}</div><div className="t-metric" style={{ color: tone }}>{v}</div></div>
  );
  return (
    <header className="px-6 pt-3 pb-3 flex flex-col gap-2.5">
      <div className="flex items-center gap-4 flex-wrap">
        <Link href="/" className="t-h2">Founder HQ</Link>
        <span className="pill pl-1 pr-2.5 py-1 t-small" style={{ background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--ink)' }}><Avatar id="YOU" size={22} />{P.name} · {S.idea}</span>
        <div className="flex-1" />
        <span className="pill t-micro px-2.5 py-1.5" style={{ background: 'var(--go-soft)', color: 'var(--go)', fontSize: 11 }}><span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--go)' }} />Live</span>
        <button className="btn btn-sm" onClick={() => { location.reload(); }}>Switch founder</button>
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="t-caps">Journey</span>
          <span className="block w-[140px] h-1.5 rounded" style={{ background: 'var(--line)' }}><span className="block h-1.5 rounded" style={{ width: `${S.ended ? 100 : (Object.keys(S.passed).length / 11) * 100}%`, background: 'var(--go)', transition: 'width .6s' }} /></span>
          <span className="t-metric">{cur + 1}/11</span>
        </div>
        <div ref={stageRef} className="relative">
          <button aria-haspopup="menu" aria-expanded={stageOpen} onClick={() => setStageOpen(!stageOpen)} className="pill px-3 py-1.5" style={{ background: 'var(--accent-soft)', border: '1.5px solid var(--accent)' }}>
            <span className="t-caps">Stage</span><span className="t-strong">{STAGES[cur].name}{STAGES[cur].gate === 'you' ? ' ◆' : ''}</span><span aria-hidden>▾</span>
          </button>
          {stageOpen && (
            <div role="menu" className="panel absolute z-30 mt-2 w-[340px] p-3 flex flex-col gap-1">
              <div className="t-h3 px-2">Your journey</div>
              <div className="t-small px-2 mb-1" style={{ fontSize: 11 }}>{cur + 1} of 11 stages · {gatesPassed} of 3 gates passed</div>
              {STAGES.map((st, i) => {
                const doneS = !!S.passed[i]; const now = i === cur; const locked = i > S.floor;
                const gateTag = st.gate === 'you' ? (doneS ? '◆ Gate passed' : now ? `◆ Gate · ${active().filter(b => b.f === i && !b.opt && !isOk(b.id)).length} left` : '◆ Gate') : null;
                return (
                  <button key={st.name} role="menuitem" disabled={locked} onClick={() => { setStageOpen(false); router.push(`/stage/${i}`); }}
                    className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left row-hover disabled:cursor-default" style={{ background: now ? 'var(--accent-soft)' : undefined, color: locked ? 'var(--muted)' : undefined }}>
                    {locked ? <span aria-hidden className="w-2.5 text-[11px]">🔒</span> : <span className="w-2.5 h-2.5 rounded-full" style={{ background: doneS ? 'var(--go)' : 'var(--panel)', border: now ? '3px solid var(--accent)' : undefined }} />}
                    <span className={now ? 't-strong flex-1' : 'flex-1'} style={{ fontSize: now ? 14 : 13 }}>{st.name}</span>
                    {gateTag ? <span className="pill t-micro px-2 py-0.5" style={{ background: doneS ? 'var(--go-soft)' : now ? 'var(--accent)' : 'var(--subtle)', color: doneS ? 'var(--go)' : now ? 'var(--on-accent)' : 'var(--muted)' }}>{gateTag}</span> : doneS ? <span style={{ color: 'var(--go)' }}>✓</span> : null}
                  </button>
                );
              })}
              <div className="flex justify-end pt-1"><button className="btn btn-sm" onClick={() => { setStageOpen(false); router.push(`/stage/${cur}`); }}>Open stage overview</button></div>
            </div>
          )}
        </div>
        <div ref={dgRef} className="relative">
          <button aria-haspopup="dialog" aria-expanded={dgOpen} onClick={() => setDgOpen(!dgOpen)} className="pill pl-1 pr-3 py-1" style={{ background: 'var(--panel)', border: '1px solid var(--line-strong)', boxShadow: 'var(--shadow)' }}>
            <Avatar id="CEO" size={22} /><span className="flex flex-col text-left leading-tight"><span className="t-caps">Atlas may approve</span><span className="t-strong">{DELEG[S.deleg].t} ▾</span></span>
          </button>
          {dgOpen && (
            <div role="dialog" aria-label="Atlas approval limit" className="panel absolute z-30 mt-2 w-[380px] p-4 flex flex-col gap-2.5">
              <div className="flex items-center gap-2"><Avatar id="CEO" size={30} /><div><div className="t-h3">Atlas may approve</div><div className="t-small">Anything above this comes to your inbox</div></div></div>
              {DELEG.map((o, i) => {
                const amt = pendingSpend ? pendingSpend.amount!() : P.estimate + 2;
                const note = i === 0 ? o.d : (i === 1 ? amt <= 10 : amt <= 50) ? `Atlas would approve your ${lakh(amt)} estimate.` : `Your ${lakh(amt)} estimate comes to you.`;
                return (
                  <button key={o.t} onClick={() => setDelegation(i)} className="flex items-center gap-2.5 p-3 rounded-xl text-left" style={{ background: S.deleg === i ? 'var(--accent-soft)' : 'var(--subtle)', border: `${S.deleg === i ? 1.5 : 1}px solid ${S.deleg === i ? 'var(--accent)' : 'var(--line)'}` }}>
                    <span className="w-3.5 h-3.5 rounded-full flex-none" style={{ background: S.deleg === i ? 'var(--ink)' : 'var(--panel)', border: `${S.deleg === i ? 4 : 1.5}px solid var(--line-strong)` }} />
                    <span><span className="t-strong block">{o.t}</span><span className="t-small">{note}</span></span>
                  </button>
                );
              })}
              <div className="t-small" style={{ fontSize: 11 }}>Changing this re-routes waiting items within a second ({active().filter(b => B[b.id].st === 'inbox').length} waiting now).</div>
            </div>
          )}
        </div>
        <Link href="/inbox" className="pill px-3 py-1.5 t-strong" style={{ background: inbox ? 'var(--accent)' : 'var(--panel)', color: inbox ? 'var(--on-accent)' : 'var(--ink)', border: inbox ? '1px solid var(--accent)' : '1px solid var(--line)' }}>Inbox · {inbox}</Link>
        <Link href="/hq" className="btn btn-sm">Founder HQ</Link>
        {S.ended && <span className="t-small">Journey complete · {def('scale').name} done</span>}
      </div>
    </header>
  );
}
