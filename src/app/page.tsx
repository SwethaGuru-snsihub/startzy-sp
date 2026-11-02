'use client';
import Link from 'next/link';
import { S, P, active, isOk, ev, st, def } from '@/engine/engine';
import { STAGES } from '@/engine/model';
import { useEngine } from '@/engine/useEngine';
import { InboxCard, ActivityFeed } from '@/components/rail/Rail';
import { StatusChip, ProductTag } from '@/components/ui/kit';
import { useHref } from '@/components/shell/ProjectBase';

/* G03 · Workspace overview */
export default function Workspace() {
  useEngine(); const href = useHref();
  const cur = Math.min(S.floor, 10);
  const stageBlocks = active().filter(b => b.f === cur);
  const done = stageBlocks.filter(b => isOk(b.id) || st(b.id) === 'skipped').length;
  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: 'minmax(0,1fr) 360px' }}>
      <div className="flex flex-col gap-4 min-w-0">
        <section className="panel p-6 flex flex-col gap-3">
          <div className="t-eyebrow">Workspace · {P.pathLabel}</div>
          <div className="t-title">{S.idea}</div>
          <p className="t-small" style={{ fontSize: 14 }}>{S.pitch}</p>
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))' }}>
            {[['Stage', `${cur + 1} · ${STAGES[cur].name}`], ['Evidence', String(ev())], [P.runwayLabel, `${S.runway.toFixed(1)} months`], ['Gates passed', `${[1, 3, 8].filter(f => S.passed[f]).length} of 3`]].map(([l, v]) => (
              <div key={l} className="p-3 rounded-xl" style={{ background: 'var(--subtle)' }}><div className="t-caps">{l}</div><div className="t-metric">{v}</div></div>
            ))}
          </div>
          <div className="flex gap-2 pt-1">
            <Link href={href('/hq')} className="btn btn-primary">Enter Founder HQ</Link>
            <Link href={href(`/stage/${cur}`)} className="btn">Open {STAGES[cur].name}</Link>
            {S.ended && <span className="pill t-strong px-3" style={{ background: 'var(--go-soft)', color: 'var(--go)' }}>Journey complete</span>}
          </div>
        </section>
        <section className="panel p-5 flex flex-col gap-3" aria-label="Current stage">
          <div className="flex items-center justify-between"><div className="t-h3">{STAGES[cur].name}</div><span className="t-small">{done} of {stageBlocks.length} done</span></div>
          {stageBlocks.map(b => (
            <Link key={b.id} href={href(`/block/${b.id}`)} className="flex items-center gap-3 p-2.5 rounded-xl row-hover" style={{ border: '1px solid var(--line)' }}>
              <span className="flex-1 min-w-0"><span className="t-strong block">{b.name}{b.opt ? ' (optional)' : ''}</span><span className="t-small">{b.mod}</span></span>
              <ProductTag tag={b.tag} />
              <StatusChip s={b.kind === 'task' && st(b.id) === 'ready' ? 'task' : st(b.id)} />
            </Link>
          ))}
        </section>
        <section className="panel p-5 flex flex-col gap-2" aria-label="Journey">
          <div className="t-h3">Journey</div>
          <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
            {STAGES.map((s, i) => {
              const locked = i > S.floor; const ok = !!S.passed[i];
              return (
                <Link key={s.name} href={locked ? '#' : href(`/stage/${i}`)} aria-disabled={locked} className="p-2.5 rounded-xl flex flex-col gap-0.5" style={{ background: i === cur ? 'var(--accent-soft)' : 'var(--subtle)', border: `1px solid ${i === cur ? 'var(--accent)' : 'var(--line)'}`, opacity: locked ? 0.55 : 1, pointerEvents: locked ? 'none' : undefined }}>
                  <span className="t-caps">Stage {i + 1}{s.gate === 'you' ? ' · Gate' : ''}</span>
                  <span className="t-strong">{s.name}</span>
                  <span className="t-small" style={{ color: ok ? 'var(--go)' : undefined }}>{ok ? 'Passed' : i === cur ? 'In progress' : locked ? 'Locked' : ''}</span>
                </Link>
              );
            })}
          </div>
        </section>
      </div>
      <div className="flex flex-col gap-4">
        <InboxCard limit={4} />
        <ActivityFeed n={7} />
        {S.ended && <section className="panel p-4 t-small">Final decision recorded: {def('scale').name}.</section>}
      </div>
    </div>
  );
}
