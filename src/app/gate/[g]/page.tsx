'use client';
import Link from 'next/link';
import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { S, B, P, gateChecks, enterGate, passFloor, topUp, reopen, reinspectAll, mutate, spendMonths, log, isOk, active } from '@/engine/engine';
import { STAGES } from '@/engine/model';
import { useEngine } from '@/engine/useEngine';
import { Avatar } from '@/components/ui/kit';

/* T6 · Gate inspection */
export default function GatePage() {
  useEngine();
  const g = Number(useParams<{ g: string }>().g); const router = useRouter();
  const ok = [1, 2, 3].includes(g);
  useEffect(() => { if (ok) enterGate(g); }, [g, ok]);
  if (!ok) return <p className="t-small">No such gate.</p>;
  const { f, checks } = gateChecks(g); const F = STAGES[f];
  const all = checks.every(c => c.ok); const passed = !!S.passed[f]; const ready = S.pending[f] === true;
  const cracked = active().some(b => B[b.id].st === 'cracked');
  const fixes: { t: string; d: string; on: () => void; show: boolean }[] = [
    { t: 'Talk to more people', d: 'Half a month of interviews', show: g === 1 && (S.calls.length < 4 || checks[2].ok === false), on: () => router.push('/block/interviews?redo=1') },
    { t: 'Change the price', d: 'Re-checks every block built on it', show: g === 2 && !checks[0].ok, on: () => { reopen('model'); router.push('/block/model'); } },
    { t: `Top up ${P.runwayLabel.toLowerCase()}`, d: '+3 months', show: (g === 2 || g === 3) && checks[checks.length - 1].ok === false, on: topUp },
    { t: 'Invite more beta users', d: 'Groups you have not invited yet', show: g === 3 && !checks[0].ok, on: () => router.push('/block/beta?redo=1') },
    { t: 'Improve and re-survey', d: 'One month of fixes, then ask again', show: g === 3 && !checks[1].ok && isOk('pmf'), on: () => { spendMonths(1); mutate(s => { s.pmf = Math.min(85, (s.pmf ?? 0) + 12); }); B.pmf.ver++; log(`You improved the product. PMF survey re-run: <b>${S.pmf}%</b>.`, 'founder'); } },
    { t: 'Run the pricing test', d: 'Confirm the price with beta users', show: g === 3 && !checks[2].ok, on: () => router.push('/block/pricetest') },
    { t: 'Re-check changed blocks', d: 'Traceability re-inspects them', show: cracked, on: () => reinspectAll() },
  ];
  return (
    <div className="max-w-4xl mx-auto">
      <section className="panel p-6 flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div><div className="t-eyebrow">Strategy & Finance · {F.name}</div><h1 className="t-title">{F.gateName}</h1></div>
          <div className="flex gap-1.5">{(F.board || []).map(k => <Avatar key={k} id={k} size={30} />)}<Avatar id="YOU" size={30} /></div>
        </div>
        {!ready && !passed && <p className="t-small p-3 rounded-xl" style={{ background: 'var(--subtle)' }}>This gate opens once every required block in {F.name} is approved. <Link className="underline" href={`/stage/${f}`}>Open the stage</Link></p>}
        <ul className="flex flex-col gap-2">
          {checks.map(c => (
            <li key={c.t} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: c.ok ? 'var(--go-soft)' : 'var(--stop-soft)' }}>
              <span aria-hidden className="w-6 h-6 rounded-full grid place-items-center font-extrabold text-[13px]" style={{ background: c.ok ? 'var(--go)' : 'var(--stop)', color: 'var(--on-color)' }}>{c.ok ? '✓' : '!'}</span>
              <span className="flex-1 t-strong">{c.t}</span>{c.d && <span className="t-small">{c.d}</span>}
              <span className="sr-only">{c.ok ? 'Passed' : 'Not yet'}</span>
            </li>
          ))}
        </ul>
        {!passed && fixes.some(x => x.show) && (
          <div className="flex flex-col gap-2"><div className="t-caps">Ways to fix it</div>
            <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px,1fr))' }}>
              {fixes.filter(x => x.show).map(x => <button key={x.t} className="opt" onClick={x.on}><b className="t-strong">{x.t}</b><span className="t-small">{x.d}</span></button>)}
            </div>
          </div>
        )}
        <div className="flex justify-end gap-2">
          {passed ? <span className="pill t-strong px-3 py-1.5" style={{ background: 'var(--go-soft)', color: 'var(--go)' }}>Gate passed</span>
            : <button className="btn btn-go" disabled={!all || !ready} onClick={() => { passFloor(f, 'You'); router.push(`/stage/${f + 1}`); }}>Pass the gate</button>}
        </div>
      </section>
    </div>
  );
}
