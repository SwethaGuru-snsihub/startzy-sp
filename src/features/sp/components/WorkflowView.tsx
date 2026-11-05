'use client';
// The Workflow tab. On the left, every step of Discover and what is inside it in the order it runs; in the
// middle, a flow strip and one card for the selected item. Everything is read from the project's real state
// through the same status function as the other tabs, and the actions are the same ones the popups and the
// Documentation tab use.
import { useState } from 'react';
import { TASK } from '@/engine/core/register';
import { approve, approveRecheck, saveDocEdit, sendBack } from '../actions';
import { useSp } from '../SpContext';
import { slotsFor } from '../slots';
import { epic1Rows, epic1StatusesOf } from '../spec/epic1';
import { actionFor, recheckScope, STATUS_LABEL, statusTone, type TaskStatus } from '../viewModel';
import { answersOf, defaultItem, detect, doneIn, featureOf, itemOf, itemStatuses, questionsOf, STEP_LABEL, STEPS, stepStates, type FeatureId, type Item } from '../workflow';
import EpicTimeline from './EpicTimeline';
import { Sections } from './Sections';
import SlotsPanel from './SlotsPanel';

const mark = (s: TaskStatus, n: number) => (s === 'done' ? '✓' : s === 'needs' || s === 'recheck' || s === 'reconfirm' ? '!' : String(n));
const clock = (iso: string) => { const d = new Date(iso); return isNaN(+d) ? '' : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const HEADING: Record<string, string> = { capture: 'Your idea', extract: 'What was detected', clarify: 'Questions and answers', brief: 'Idea brief' };

export default function WorkflowView({ initial }: { initial?: string } = {}) {
  const { core, project, docs, record, runner, rows, open, openTask, goDoc } = useSp();
  const [pick, setPick] = useState<string | null>(initial ?? null);
  const idea = record.idea;
  const status = itemStatuses(core, project, { takenUp: docs.takenUp(), rechecks: docs.rechecks() });
  const e1 = epic1StatusesOf(core, project, { takenUp: docs.takenUp(), rechecks: docs.rechecks() });
  if (!idea) return <section className="sp-card"><div className="sp-empty">Start your idea to see how Idea Definition runs.</div></section>;

  const states = stepStates(core, project);
  const sel = itemOf(pick ?? '') ?? itemOf(defaultItem(status))!;
  const step = STEPS.find(x => x.id === sel.step)!;
  const n = step.items.findIndex(x => x.key === sel.key) + 1;
  const pct = runner.progress(sel.task);
  const f = featureOf(sel.key), row = rows.find(r => r.id === sel.task);
  const stepDone = doneIn(step, status) === step.items.length;
  const all = STEPS.every(x => doneIn(x, status) === x.items.length);
  const stepName = (id: string, label: string) => (id === 'gate1' ? 'Gate 1' : `${id} · ${label}`);

  return (
    <div className="sp-wf">
      <aside className="sp-card sp-wf-tree" aria-label="Workflow steps">
        <div className="sp-wf-phase"><span>Discover</span><span className={`sp-pill ${all ? 'go' : 'run'}`}>{all ? 'Phase done' : 'In progress'}</span></div>
        {STEPS.map(st => (
          <div key={st.id}>
            <div className="sp-wf-step"><span>{stepName(st.id, st.label)}</span><span className="t-small">{states[st.id] === 'next' ? STEP_LABEL.next : `${doneIn(st, status)}/${st.items.length}`}</span></div>
            <div className={`sp-bar ${doneIn(st, status) === st.items.length ? '' : 'blue'}`} style={{ margin: '0 10px 6px' }}><i style={{ width: `${(doneIn(st, status) / st.items.length) * 100}%` }} /></div>
            <ul className="sp-wf-feats">
              {st.items.map((x, i) => (
                <li key={x.key}>
                  <button type="button" className="sp-wf-feat" aria-current={sel.key === x.key} onClick={() => setPick(x.key)}>
                    <span className={`sp-wf-ico ${status[x.key]}`} aria-hidden>{mark(status[x.key], i + 1)}</span>
                    <span><span className="t">{x.name}</span><br /><span className="s">{STATUS_LABEL[status[x.key]]}{status[x.key] === 'working' ? ` · ${runner.progress(x.task)}%` : ''}</span></span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <div className="sp-wf-phase" style={{ paddingTop: 14 }}><span>Define · Design · Delivery</span><span className="sp-pill">Locked</span></div>
      </aside>

      <div className="sp-wf-main">
        <div>
          <div className="t-small" style={{ fontSize: 12 }}>Discover › {stepName(step.id, step.label)} › {sel.kind === 'feature' ? 'Feature' : 'Task'} {n} of {step.items.length}</div>
          <div className="sp-row" style={{ marginTop: 6, gap: 12 }}><h2 className="t-h2" style={{ margin: 0 }}>{sel.name}</h2><span className={`sp-pill ${statusTone(status[sel.key])}`}>{STATUS_LABEL[status[sel.key]]}</span><span className="sp-sim">SIMULATED</span></div>
          {f && <p className="t-small" style={{ marginTop: 6, maxWidth: '70ch' }}>{f.does}</p>}
          {f && <p className="t-small" style={{ fontSize: 12, marginTop: 2, opacity: .8 }}>{f.meta}</p>}
          <p className="t-small" style={{ fontSize: 12, marginTop: 4 }}>
            Task: <button type="button" className="sp-link" onClick={() => open({ kind: 'task', id: sel.task })}>{TASK[sel.task].artifact}</button>
            {' · '}Document: <button type="button" className="sp-link" onClick={() => goDoc(sel.task)}>{TASK[sel.task].artifact}</button>
          </p>
        </div>
        {step.id === 'SP1' && stepDone && <div className="sp-banner ok"><b>Idea Definition is complete.</b><span className="t-small">SP2 Problem Discovery is next.</span></div>}
        <nav className="sp-wf-flow sp-card" aria-label="Order the items run in">
          {step.items.map((x, i) => (
            <button key={x.key} type="button" className={`sp-wf-node ${i === 0 || status[step.items[i - 1].key] === 'done' ? 'reached' : ''}`} aria-current={sel.key === x.key} onClick={() => setPick(x.key)}>
              <span className={`sp-wf-ico ${status[x.key]}`} aria-hidden>{mark(status[x.key], i + 1)}</span>
              <span className="l">{x.name.split(' / ')[0].replace('Targeted ', '').replace(' & Confirmation', '')}</span>
            </button>
          ))}
        </nav>
        <section className="sp-card"><h3 style={{ padding: '14px 16px 0' }}>{sel.key === 'brief' && status.brief === 'needs' ? 'Your turn: confirm the brief' : HEADING[sel.key] ?? 'Where this stands'}</h3>
          <div className="sp-wf-body">
            {sel.key === 'capture' && <Capture />}
            {sel.key === 'extract' && <Extract />}
            {sel.key === 'extract' && <SlotsPanel slots={slotsFor(idea, false)} />}
            {sel.key === 'clarify' && <Clarify status={status.clarify} />}
            {sel.key === 'clarify' && <SlotsPanel slots={slotsFor(idea, e1['1.T6'] === 'done')} />}
            {sel.key === 'brief' && <Brief status={status.brief} progress={pct} />}
            {sel.kind === 'feature' && <EpicTimeline rows={epic1Rows(sel.key as FeatureId, e1)} />}
            {sel.kind === 'task' && row && <TaskCard item={sel} status={status[sel.key]} progress={pct} onAct={() => openTask(row)} canAct={!!actionFor(row)} />}
          </div>
        </section>
      </div>
    </div>
  );
}

/** An item whose features are not defined yet: the real task, where it stands and what moves it. */
function TaskCard({ item, status, progress, onAct, canAct }: { item: Item; status: TaskStatus; progress: number; onAct: () => void; canAct: boolean }) {
  const { goDoc, docs } = useSp();
  const t = TASK[item.task], v = docs.latest(item.task);
  const line: Partial<Record<TaskStatus, string>> = {
    blocked: 'Waiting for earlier work to finish.', ready: 'Ready: an agent will pick it up.', review: 'A reviewer agent is checking it.', needs: 'Waiting for you.',
    optional: 'Optional: you choose whether to take it up.', recheck: 'An earlier document changed, so this needs a re-check.', reconfirm: 'Confirm your earlier decision again.', done: 'Finished.',
  };
  return (
    <>
      {status === 'working' ? <div className="sp-io"><b>An agent is working on it</b><span className="sp-bar blue"><i style={{ width: `${progress}%` }} /></span></div> : <p className="t-small">{line[status] ?? STATUS_LABEL[status]}</p>}
      <dl className="sp-kv"><dt>Step</dt><dd>{t.home}</dd><dt>Document</dt><dd>{t.artifact}{v ? ` · v${v.v}` : ''}</dd></dl>
      <div className="sp-row">
        {canAct && <button type="button" className="btn btn-primary" onClick={onAct}>Open</button>}
        {v && <button type="button" className="btn" onClick={() => goDoc(item.task)}>View document</button>}
      </div>
    </>
  );
}

function Capture() {
  const { record } = useSp();
  const i = record.idea!;
  return (
    <>
      <blockquote className="sp-quote">{i.text}</blockquote>
      <dl className="sp-kv"><dt>Where you started</dt><dd>{detect(i).start}</dd><dt>Working name</dt><dd>{i.name}</dd></dl>
    </>
  );
}

function Extract() {
  const { record } = useSp();
  const d = detect(record.idea!);
  return (
    <>
      <p className="t-small">Detected from your sentence:</p>
      <blockquote className="sp-quote">{d.segments.map((s, k) => s.kind ? <mark key={k} className={s.kind}>{s.t}</mark> : <span key={k}>{s.t}</span>)}</blockquote>
      <div className="sp-tw">
        <table className="sp-table"><thead><tr><th>Field</th><th>Detected</th></tr></thead>
          <tbody>
            <tr><td>Who it is for</td><td><mark className="who">{d.who}</mark></td></tr>
            <tr><td>What it does</td><td><mark className="doing">{d.doing}</mark></td></tr>
            <tr><td>Topic</td><td>{d.topic}</td></tr>
            <tr><td>Starting point</td><td>{d.start}</td></tr>
          </tbody></table>
      </div>
    </>
  );
}

function Clarify({ status }: { status: TaskStatus }) {
  const { record, env, docs, open, toast, rt, id } = useSp();
  const idea = record.idea!, qs = questionsOf(idea), saved = answersOf(idea);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string[]>(saved);
  const [error, setError] = useState<string | null>(null);
  const canEdit = status === 'done' || status === 'recheck';
  const changed = draft.some((a, i) => a !== saved[i]);

  const save = () => {
    const prev = docs.latest('clarify');
    if (!prev) { setError('The answers are not saved yet.'); return; }
    const by: Record<string, string> = { 'Who it is for': draft[0], Context: draft[1], Goal: draft[2] };
    const e = saveDocEdit(env, 'clarify', prev.secs.map(s => (s.h in by ? { ...s, b: by[s.h] } : s)), 'Edited answers in Workflow');
    if (e) { setError(e); return; }
    setEditing(false); setError(null); toast('Answers saved.');
    const fresh = rt.getEntry(id);
    if (fresh && fresh.status === 'ready' && recheckScope(env.rt.core, fresh.project).flagged.length) open({ kind: 'impact' });
  };

  if (!editing) {
    return (
      <>
        <div className="sp-qa">{qs.map((q, i) => <div key={q.key} className="sp-qa-row"><span className="sp-qa-q">{q.q}</span><b>{saved[i]}</b></div>)}</div>
        {canEdit && <div className="sp-row"><button type="button" className="btn" onClick={() => { setDraft(saved); setEditing(true); setError(null); }}>Edit answers</button></div>}
      </>
    );
  }
  return (
    <>
      {qs.map((q, i) => (
        <div key={q.key} className="sp-field" role="group" aria-label={q.q}>
          <span className="lbl">{q.q}</span>
          <div className="sp-chips">{q.options.map(o => <button key={o} type="button" aria-pressed={draft[i] === o} onClick={() => setDraft(d => d.map((x, j) => (j === i ? o : x)))}>{o}</button>)}</div>
        </div>
      ))}
      {error && <div className="sp-error" role="alert">{error}</div>}
      <div className="sp-row">
        <button type="button" className="btn btn-primary" disabled={!changed} onClick={save}>Save changes</button>
        <button type="button" className="btn" onClick={() => { setEditing(false); setError(null); }}>Cancel</button>
        <span className="t-small" style={{ fontSize: 12 }}>The Idea brief was built on your earlier answers, so saving flags it for a re-check.</span>
      </div>
    </>
  );
}

function Brief({ status, progress }: { status: TaskStatus; progress: number }) {
  const { env, docs, toast, open } = useSp();
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const versions = docs.versions('brief'), cur = versions.at(-1), prev = versions.at(-2);

  if (status === 'blocked') return <div className="sp-io"><b>Starts after your answers</b><span className="t-small">Asha drafts the brief from your idea and the three answers.</span></div>;
  if (status === 'ready') return <div className="sp-io"><b>Asha is about to start the brief</b><span className="t-small">It is ready for the agents.</span></div>;
  if (status === 'working') return <div className="sp-io"><b>Asha is drafting the brief</b><span className="sp-bar blue"><i style={{ width: `${progress}%` }} /></span></div>;
  if (status === 'review') return <div className="sp-io"><b>Quinn is reviewing the draft</b><span className="t-small">A reviewer agent checks every document before it reaches you (simulated).</span></div>;
  if (!cur) return <div className="sp-io"><b>The draft is not saved yet</b></div>;

  if (status === 'recheck') {
    return (
      <>
        <div className="sp-banner bad"><span><b>This brief needs a re-check.</b> Your clarifying answers changed after it was drafted. Asha redrafts it from the new answers, and you confirm it again.</span>
          <button type="button" className="btn btn-sm btn-primary" onClick={() => { const n = approveRecheck(env); toast(`Re-check approved for ${n} document${n === 1 ? '' : 's'}. Asha is on it.`); }}>Approve re-check</button></div>
        {cur.secs.map(s => <div key={s.h} className="sp-sec"><h5>{s.h}<span className="sp-pill bad" style={{ marginLeft: 8 }}>Built on earlier answers</span></h5><p>{s.b}</p></div>)}
      </>
    );
  }
  if (status === 'needs') {
    return (
      <>
        <div className="sp-row"><span className="sp-pill you">Needs you</span><b>Idea brief v{cur.v}</b><span className="t-small">{cur.note}</span></div>
        <Sections secs={cur.secs} prev={prev?.secs} />
        <div className="sp-field"><label htmlFor="wf-note">Note to Asha (needed to request changes)</label><textarea id="wf-note" value={note} onChange={e => setNote(e.target.value)} placeholder="What should change?" /></div>
        {error && <div className="sp-error" role="alert">{error}</div>}
        <div className="sp-row">
          <button type="button" className="btn btn-go" onClick={() => { const e = approve(env, 'brief'); if (e) setError(e); else toast('Idea brief confirmed.'); }}>Confirm brief</button>
          <button type="button" className="btn" onClick={() => { const e = sendBack(env, 'brief', note); if (e) setError(e); else { setNote(''); setError(null); toast('Sent back to Asha with your note.'); } }}>Request changes</button>
          <button type="button" className="btn" onClick={() => open({ kind: 'review', id: 'brief' })}>Open as a popup</button>
        </div>
      </>
    );
  }
  return (
    <>
      <div className="sp-row"><span className="sp-pill go">Confirmed</span><b>Idea brief v{cur.v}</b><span className="sp-pill go">Idea brief v{cur.v} locked</span></div>
      <Sections secs={cur.secs} prev={prev?.secs} />
      <div className="sp-tw">
        <table className="sp-table"><thead><tr><th>Version</th><th>By</th><th>Note</th><th>When</th></tr></thead>
          <tbody>{[...versions].reverse().map(v => <tr key={v.v}><td className="t-log">v{v.v}</td><td>{v.by}</td><td className="t-small">{v.note}</td><td className="t-log">{clock(v.at)}</td></tr>)}</tbody></table>
      </div>
    </>
  );
}
