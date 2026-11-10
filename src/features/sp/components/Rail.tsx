'use client';
import { useState } from 'react';
import type { Notice } from '../aiNotices';
import { agentLook } from '../model';
import { actionFor, needsYou, STATUS_LABEL, statusTone, type TaskRow } from '../viewModel';

const FILTERS = ['All', 'Running', 'Needs you', 'Done'] as const;
type Filter = (typeof FILTERS)[number];
const clock = (iso: string) => { const d = new Date(iso); return isNaN(+d) ? '' : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const KIND: Record<string, string> = { review: 'Artifact review', input: 'Your input', gate: 'Gate decision', choose: 'Your choice', reconfirm: 'Confirm again', impact: 'Re-check' };

/* The right rail, the same on every tab: what needs the founder, the work queue, and live activity.
   Everything comes from the core instance; nothing here is a separate list. Cards and rows are clickable. */
export default function Rail({ rows, feed, started, progress, onOpen, onTask, notices = [] }: {
  rows: TaskRow[]; feed: { seq: number; at: string; text: string }[]; started: boolean;
  progress: (task: string) => number; onOpen: (r: TaskRow) => void; onTask: (r: TaskRow) => void;
  /** Notices about the AI: waiting for Claude, a failure on hold, a simulated fallback. */
  notices?: Notice[];
}) {
  const [filter, setFilter] = useState<Filter>('All');
  const need = needsYou(rows);
  const shown = rows.filter(r => filter === 'All' ? started : filter === 'Running' ? r.status === 'working' || r.status === 'review' : filter === 'Needs you' ? need.includes(r) : r.status === 'done');
  return (
    <aside className="sp-rail" aria-label="Notifications and activity">
      <section className="sp-card">
        <h3>Notifications {need.length > 0 && <span className="sp-badge">{need.length}</span>}</h3>
        {notices.map(n => <div key={n.id} className={`sp-banner ${n.tone === 'bad' ? 'bad' : ''}`} role="status"><span>{n.text}</span></div>)}
        {need.length ? need.map(r => {
          const a = actionFor(r);
          return (
            <button key={r.id} type="button" className="sp-need" onClick={() => onOpen(r)}>
              <span className="sp-row"><span className="sp-pill you">{a ? KIND[a] : STATUS_LABEL[r.status]}</span><span className="sp-pill sp">{r.step}</span></span>
              <b>{r.artifact}</b>
              <span className="t-small" style={{ fontSize: 12 }}>{r.owner === 'FOUNDER' ? 'Only you can do this' : r.status === 'recheck' ? 'Built on an older version. Review the impact.' : `Prepared by ${agentLook(r.owner).name}`}</span>
            </button>
          );
        }) : <div className="sp-empty">{started ? 'Nothing needs you right now. The agents are working.' : 'Nothing yet. Start your idea to put the agents to work.'}</div>}
      </section>
      <section className="sp-card">
        <h3>Work queue</h3>
        <div className="sp-filter">{FILTERS.map(f => <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>{f}</button>)}</div>
        <div className="sp-queue">
          {shown.length ? shown.map(r => (
            <button key={r.id} type="button" className="sp-qrow" onClick={() => onTask(r)}>
              <span className="t"><b>{r.artifact}</b><span className={`sp-pill ${statusTone(r.status)}`}>{STATUS_LABEL[r.status]}</span></span>
              <span className="sp-row t-small" style={{ fontSize: 11.5 }}><span className="sp-pill sp">{r.step}</span>{agentLook(r.owner).name}</span>
              {(r.status === 'working' || r.status === 'review') && <span className="sp-bar blue"><i style={{ width: `${progress(r.id)}%` }} /></span>}
            </button>
          )) : <div className="sp-empty">{started ? 'No tasks here.' : 'Tasks are created as the workflow reaches each step.'}</div>}
        </div>
      </section>
      <section className="sp-card">
        <h3>Activity <span className="sp-pill run">Live</span></h3>
        <div className="sp-act">
          {feed.length ? feed.map(f => <div key={f.seq}><span className="tm">{clock(f.at)}</span><span>{f.text}</span></div>) : <div className="sp-empty">Activity will appear here.</div>}
        </div>
      </section>
    </aside>
  );
}
