'use client';
import { useEffect, useState } from 'react';
import { S, P } from '@/engine/engine';
import { useEngine } from '@/engine/useEngine';
import Header from './Header';

/* The Founder HQ frame: persona colour, header with journey / stage / approval limit / inbox,
   the page body, the toast and the stage-pass confetti. Used by the standalone demo and by every
   startup project, so both look and behave the same. Render it only once the engine has started. */
export default function LegacyChrome({ children }: { children: React.ReactNode }) {
  useEngine();
  return (
    <div style={{ ['--persona' as string]: `var(${P.color})` }}>
      <Header />
      <main className="px-6 pb-8">{children}</main>
      {S.toast && <div role="status" className="pop fixed left-1/2 -translate-x-1/2 bottom-5 z-50 px-4 py-2.5 rounded-xl t-strong" style={{ background: 'var(--ink)', color: 'var(--panel)', boxShadow: 'var(--shadow)' }}>{S.toast}</div>}
      <Confetti at={S.confetti} />
    </div>
  );
}

function Confetti({ at }: { at: number }) {
  const [show, setShow] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- replay confetti when the engine stamps a new time
  useEffect(() => { if (!at) return; setShow(true); const t = setTimeout(() => setShow(false), 1800); return () => clearTimeout(t); }, [at]);
  if (!show) return null;
  const colors = ['var(--accent)', 'var(--sp)', 'var(--go)', 'var(--sz)', 'var(--ag-cmo)'];
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-40 overflow-hidden">
      {Array.from({ length: 60 }).map((_, i) => (
        <span key={i} style={{ position: 'absolute', left: `${(i * 37) % 100}%`, top: -10, width: 8, height: 4, background: colors[i % 5], animation: `fall ${1 + (i % 5) * 0.15}s ease-in forwards`, animationDelay: `${(i % 10) * 0.04}s`, transform: `rotate(${i * 23}deg)` }} />
      ))}
      <style>{'@keyframes fall { to { transform: translateY(105vh) rotate(540deg); } }'}</style>
    </div>
  );
}
