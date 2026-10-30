'use client';
import Link from 'next/link';
import { inboxItems, reinspectAll, active, B, isOk, nm } from '@/engine/engine';
import { useEngine } from '@/engine/useEngine';

/* G07 · Inbox */
const GROUPS: [string, string[]][] = [['Inspections', ['gate']], ['Spend approvals', ['money']], ['Document approvals', ['doc']], ['Your tasks', ['task']], ['Re-checks', ['crack']]];
export default function Inbox() {
  useEngine();
  const items = inboxItems();
  const recent = active().filter(b => isOk(b.id) && B[b.id].doneAt).sort((a, b) => B[b.id].doneAt! - B[a.id].doneAt!).slice(0, 6);
  return (
    <div className="grid gap-4 items-start" style={{ gridTemplateColumns: 'minmax(0,1fr) 340px' }}>
      <section className="panel p-6 flex flex-col gap-4">
        <div><div className="t-eyebrow">Inbox</div><h1 className="t-title">{items.length ? `${items.length} need you` : 'All clear'}</h1>
          <p className="t-small mt-1">Atlas sends you only what is over its approval limit, your own tasks and gate inspections.</p></div>
        {GROUPS.map(([title, tys]) => {
          const g = items.filter(x => tys.includes(x.ty)); if (!g.length) return null;
          return (
            <div key={title} className="flex flex-col gap-2">
              <div className="t-caps">{title} · {g.length}</div>
              {g.map((x, i) => x.ty === 'crack'
                ? <button key={i} onClick={() => reinspectAll()} className="flex items-center justify-between gap-3 p-3 rounded-xl text-left row-hover" style={{ border: '1px solid var(--line)' }}><span><span className="t-strong block">{x.n}</span><span className="t-small">Traceability re-checks each one; blocks that mention the price get updated.</span></span><span className="btn btn-sm btn-primary">Re-check all</span></button>
                : <Link key={i} href={x.href} className="flex items-center justify-between gap-3 p-3 rounded-xl row-hover" style={{ border: '1px solid var(--line)' }}><span><span className="t-strong block">{x.n}</span>{x.s && <span className="t-small">{x.s}</span>}</span><span className="btn btn-sm">{x.t}</span></Link>)}
            </div>
          );
        })}
      </section>
      <section className="panel p-4 flex flex-col gap-2" aria-label="Recently approved">
        <div className="t-h3">Recently approved</div>
        {!recent.length && <p className="t-small">Nothing yet.</p>}
        {recent.map(b => <Link key={b.id} href={`/block/${b.id}`} className="flex justify-between gap-2 p-2 rounded-lg row-hover"><span className="t-strong">{b.name}</span><span className="t-small">by {nm(B[b.id].by!)}</span></Link>)}
      </section>
    </div>
  );
}
