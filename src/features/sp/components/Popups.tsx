'use client';
// Every popup the founder meets over the Agent Office: the artifact review, the interview input, the
// gate decision, optional choices, re-check impact, and the details of a task, agent or room. Each
// button calls a real action (actions.ts) and shows the core's own message if it refuses.
import { useState } from 'react';
import { TASK } from '@/engine/core/register';
import { approve, approveRecheck, declineOptional, decideGate, gateChecksNow, reconfirm, saveInterviews, sendBack, takeUp } from '../actions';
import { parseInterviews, resultOf } from '../content';
import { agentLook, ROOM, type SpRoomId } from '../model';
import { versionProvider } from '../provenance';
import { useSp } from '../SpContext';
import { recheckScope, STATUS_LABEL, statusTone, type TaskRow } from '../viewModel';
import { FEATURES_OF_TASK } from '../workflow';
import { Face } from './Avatar';
import Modal from './Modal';
import Provenance from './Provenance';
import { Sections } from './Sections';

const Err = ({ text }: { text: string | null }) => (text ? <div className="sp-error" role="alert">{text}</div> : null);

export default function Popups() {
  const sp = useSp();
  const { modal, open, rows } = sp;
  if (!modal) return null;
  const row = 'id' in modal ? rows.find(r => r.id === modal.id) : undefined;
  switch (modal.kind) {
    case 'review': return row ? <ReviewPopup row={row} /> : null;
    case 'input': return <InputPopup />;
    case 'gate': return <GatePopup />;
    case 'choose': return row ? <ChoosePopup row={row} /> : null;
    case 'reconfirm': return row ? <ReconfirmPopup row={row} /> : null;
    case 'impact': return <ImpactPopup />;
    case 'finish': return <FinishPopup />;
    case 'task': return row ? <TaskPopup row={row} /> : null;
    case 'agent': return <AgentPopup id={modal.id} />;
    case 'room': return <RoomPopup id={modal.id as SpRoomId} />;
    default: return <Modal label="Details" onClose={() => open(null)}><div className="sp-foot"><button className="btn" onClick={() => open(null)}>Close</button></div></Modal>;
  }
}

function ReviewPopup({ row }: { row: TaskRow }) {
  const { env, docs, open, toast, goDoc } = useSp();
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [chat, setChat] = useState<string[]>([]);
  const versions = docs.versions(row.id), cur = versions.at(-1), prev = versions.at(-2);
  const maker = agentLook(row.owner), checker = row.reviewer ? agentLook(row.reviewer) : null;
  const provider = versionProvider(cur);
  // The review step is a timed placeholder in every case; for Claude's text it must not read as a review of it.
  const reviewNote = !checker ? '' : provider === 'claude-cli' ? ` · ${checker.name}'s check: placeholder, passed (it did not read this text)` : ` · reviewed by ${checker.name} (simulated, passed)`;
  if (!cur) return <Modal label="Review" onClose={() => open(null)}><p>The draft is not saved yet.</p><div className="sp-foot"><button className="btn" onClick={() => open(null)}>Close</button></div></Modal>;
  return (
    <Modal label={`Review ${row.artifact}`} onClose={() => open(null)}>
      <div className="sp-row"><span className="sp-pill you">Needs founder</span><span className="sp-pill sp">{row.step}</span><span className="sp-pill">Artifact review</span><Provenance provider={provider} simulatedText="SIMULATED OUTPUT" /></div>
      <div>
        <div className="t-caps">{row.step} · {TASK[row.id].artifact}</div>
        <h2>{row.artifact} v{cur.v}</h2>
        <div className="t-small" style={{ marginTop: 6 }}>Prepared by {maker.name}{provider === 'claude-cli' ? ' (Claude CLI)' : ''}{reviewNote} · {cur.note}</div>
      </div>
      <Sections secs={cur.secs} prev={prev?.secs} />
      <div className="sp-field"><label htmlFor="sp-note">Note for {maker.name} (needed to send back)</label><textarea id="sp-note" value={note} onChange={e => setNote(e.target.value)} placeholder="What should change?" /></div>
      {chat.map((c, i) => <div key={i} className="sp-say">{c}</div>)}
      <Err text={error} />
      <div className="sp-foot">
        <button className="btn btn-go" onClick={() => { const e = approve(env, row.id); if (e) setError(e); else { open(null); toast(`${row.artifact} approved.`); } }}>Approve</button>
        <button className="btn" onClick={() => { const e = sendBack(env, row.id, note); if (e) setError(e); else { open(null); toast(`Sent back to ${maker.name} with your note.`); } }}>Send back with note</button>
        <button className="btn" onClick={() => setChat([`You: ${note.trim() || 'What is the riskiest assumption here?'}`, `${maker.name} (simulated): The riskiest part is whether your audience will actually pay. If you disagree, send it back with a note and I will revise.`])}>Ask {maker.name}</button>
        <span className="grow" />
        <button className="btn" onClick={() => { open(null); goDoc(row.id); }}>Open in Documentation</button>
        <button className="btn" onClick={() => open(null)}>Later</button>
      </div>
    </Modal>
  );
}

function InputPopup() {
  const { env, open, toast } = useSp();
  const [n, setN] = useState('5'), [strong, setStrong] = useState('3'), [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal label="Interview notes" onClose={() => open(null)}>
      <div className="sp-row"><span className="sp-pill you">Your input</span><span className="sp-pill sp">SP2</span></div>
      <div><div className="t-caps">Only you can do this · Interview notes</div><h2>Who have you talked to?</h2></div>
      <div className="sp-say">Asha needs real conversations behind the Problem Statement. Enter what you have. Try 2 conversations to see Gate 1 stop you later.</div>
      <div className="sp-field"><label htmlFor="sp-n">People you spoke to</label><input id="sp-n" type="number" min={0} max={50} value={n} onChange={e => setN(e.target.value)} /></div>
      <div className="sp-field"><label htmlFor="sp-s">How many described the problem as painful (strong signals)?</label><input id="sp-s" type="number" min={0} max={50} value={strong} onChange={e => setStrong(e.target.value)} /></div>
      <div className="sp-field"><label htmlFor="sp-nt">Notes (optional)</label><textarea id="sp-nt" value={notes} onChange={e => setNotes(e.target.value)} /></div>
      <Err text={error} />
      <div className="sp-foot"><span className="grow" /><button className="btn" onClick={() => open(null)}>Later</button>
        <button className="btn btn-primary" onClick={() => { const e = saveInterviews(env, { n: Number(n), strong: Number(strong), notes: notes.trim() }); if (e) setError(e); else { open(null); toast('Interview notes saved. Asha continues.'); } }}>Save notes</button></div>
    </Modal>
  );
}

function GatePopup() {
  const { env, open, toast, goDoc, rows } = useSp();
  const [error, setError] = useState<string | null>(null);
  const checks = gateChecksNow(env), all = checks.every(c => c.ok);
  const again = rows.find(r => r.id === 'gate1')?.status === 'reconfirm';
  return (
    <Modal label="Gate 1 decision" onClose={() => open(null)}>
      <div className="sp-row"><span className="sp-pill you">Needs founder</span><span className="sp-pill sp">Gate 1</span><span className="sp-pill">{again ? 'Decide again' : 'Gate decision'}</span><span className="sp-sim">SIMULATED SIGNAL</span></div>
      <div>
        <div className="t-caps">{TASK.gate1.artifact}</div>
        <h2>Gate 1 · Is the problem worth solving?</h2>
        <div className="t-small" style={{ marginTop: 6 }}>Signal from the agents: <b>{all ? 'Go' : 'Not yet'}</b>. {all ? 'The evidence meets every check.' : 'At least one check is not met.'}{again ? ' Something this decision rests on changed, so it needs your decision again.' : ''}</div>
      </div>
      <div className="sp-sec">
        {checks.map(c => (
          <div key={c.label} style={{ display: 'grid', gridTemplateColumns: '22px minmax(0,1fr) auto', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--line)', fontSize: 13 }}>
            <span style={{ color: c.ok ? 'var(--go)' : 'var(--stop)', fontWeight: 800 }}>{c.ok ? '✓' : '✕'}</span><span>{c.label}</span><span className="t-log">{c.detail}</span>
          </div>
        ))}
      </div>
      <Err text={error} />
      <div className="sp-foot">
        <button className="btn btn-go" disabled={!all} onClick={() => { const e = decideGate(env, 'pass'); if (e) setError(e); else open({ kind: 'finish' }); }}>Pass the gate</button>
        {all ? <button className="btn" onClick={() => { const e = decideGate(env, 'not-yet'); if (e) setError(e); else { open(null); toast('Gate 1: not yet. Nothing was approved.'); } }}>Not yet</button>
          : <button className="btn btn-primary" onClick={() => { open(null); goDoc('interviews', true); }}>Edit interview notes</button>}
        <span className="grow" /><button className="btn" onClick={() => open(null)}>Close</button>
      </div>
      {!all && <p className="t-small" style={{ fontSize: 12, margin: 0 }}>Pass is locked until the checks are met. Update your interview notes in Documentation; the agents then re-check what depends on them, and you decide again.</p>}
    </Modal>
  );
}

function ChoosePopup({ row }: { row: TaskRow }) {
  const { env, open, toast } = useSp();
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal label={`Optional: ${row.artifact}`} onClose={() => open(null)}>
      <div className="sp-row"><span className="sp-pill you">Your choice</span><span className="sp-pill sp">{row.step}</span></div>
      <div><div className="t-caps">Optional for your goal</div><h2>{row.artifact}</h2></div>
      <div className="sp-say">For your goal this is optional. Take it up and {row.owner === 'FOUNDER' ? 'you provide it' : `${agentLook(row.owner).name} does it`}, or decline it and the workflow carries on without it.</div>
      <Err text={error} />
      <div className="sp-foot">
        <button className="btn btn-primary" onClick={() => { takeUp(env, row.id); open(null); toast(`${row.artifact} taken up.`); }}>Take it up</button>
        <button className="btn" onClick={() => { const e = declineOptional(env, row.id); if (e) setError(e); else { open(null); toast(`${row.artifact} declined.`); } }}>Decline</button>
        <span className="grow" /><button className="btn" onClick={() => open(null)}>Later</button>
      </div>
    </Modal>
  );
}

function ReconfirmPopup({ row }: { row: TaskRow }) {
  const { env, docs, open, toast, goDoc } = useSp();
  const [error, setError] = useState<string | null>(null);
  const cur = docs.latest(row.id);
  return (
    <Modal label={`Confirm ${row.artifact}`} onClose={() => open(null)}>
      <div className="sp-row"><span className="sp-pill bad">Re-check</span><span className="sp-pill sp">{row.step}</span></div>
      <div><div className="t-caps">Your own work</div><h2>Is your {row.artifact.toLowerCase()} still right?</h2></div>
      <div className="sp-say">Something this was built on has changed. Only you can say whether it still holds. Confirm it as it is, or edit it first.</div>
      {cur && <Sections secs={cur.secs} />}
      <Err text={error} />
      <div className="sp-foot">
        <button className="btn btn-go" onClick={() => { const e = reconfirm(env, row.id); if (e) setError(e); else { open(null); toast(`${row.artifact} confirmed.`); } }}>Confirm it still holds</button>
        <button className="btn" onClick={() => { open(null); goDoc(row.id, true); }}>Edit it</button>
        <span className="grow" /><button className="btn" onClick={() => open(null)}>Later</button>
      </div>
    </Modal>
  );
}

function ImpactPopup() {
  const { env, core, project, open, toast, rows } = useSp();
  const { flagged, later } = recheckScope(core, project);
  const name = (id: string) => TASK[id].artifact;
  const why = (id: string) => {
    const v = project.workflows[TASK[id].workflow].tasks[id].versions.at(-1);
    const changed = v && Object.entries(v.pins).find(([k, n]) => (project.workflows[TASK[k].workflow].tasks[k].versions.length) > n);
    return changed ? `Built on ${name(changed[0])} v${changed[1]}, now v${project.workflows[TASK[changed[0]].workflow].tasks[changed[0]].versions.length}` : 'An input it was built on changed';
  };
  if (!flagged.length && !later.length) return <Modal label="Re-check" onClose={() => open(null)}><h2>Nothing to re-check</h2><div className="sp-foot"><button className="btn" onClick={() => open(null)}>Close</button></div></Modal>;
  return (
    <Modal label="Re-check impact" onClose={() => open(null)}>
      <div className="sp-row"><span className="sp-pill bad">Re-check</span><span className="sp-sim">SIMULATED</span></div>
      <div><div className="t-caps">Change impact</div><h2>{flagged.length + later.length} document{flagged.length + later.length > 1 ? 's were' : ' was'} built on an older version</h2></div>
      <div className="sp-say">Agents will re-check these against the latest versions. Each one comes back to you for approval, so nothing is approved for you. Your own work is yours to confirm again.</div>
      {flagged.map(id => { const r = rows.find(x => x.id === id)!; return <div key={id} className="sp-sec"><h5>{name(id)} <span className={`sp-pill ${statusTone(r.status)}`}>{STATUS_LABEL[r.status]}</span></h5><p>{why(id)} · {TASK[id].owner === 'FOUNDER' ? 'you confirm it' : `${agentLook(TASK[id].owner).name} re-checks it`}</p></div>; })}
      {later.map(id => <div key={id} className="sp-sec"><h5>{name(id)} <span className="sp-pill">Later</span></h5><p>Flagged when the document before it is approved again.</p></div>)}
      <div className="sp-foot">
        <button className="btn btn-primary" onClick={() => { const n = approveRecheck(env); open(null); toast(`Re-check approved for ${n} document${n === 1 ? '' : 's'}. The agents are on it.`); }}>Approve re-check</button>
        <button className="btn" onClick={() => open(null)}>Not now</button>
        <span className="grow" /><span className="t-small" style={{ fontSize: 12 }}>&quot;Not now&quot; keeps them flagged. You can re-check any time from Notifications.</span>
      </div>
    </Modal>
  );
}

function FinishPopup() {
  const { record, rows, open, docs, goDoc, project } = useSp();
  return (
    <Modal label="Gate 1 passed" onClose={() => open(null)}>
      <div className="sp-who"><Face id="CEO" size={44} /><div><div className="t-caps">Atlas · Gate 1 passed</div><h2>Gate 1 passed.</h2></div></div>
      <div className="sp-say">Discover (SP1 to SP3 and Gate 1) is done for “{record.name}”. SP4 Solution Discovery comes next. It is outside this prototype.</div>
      <div className="sp-sec"><h5>Documents produced (simulated)</h5>{rows.map(r => <div key={r.id} className="sp-row"><b style={{ flex: 1, fontSize: 13 }}>{r.artifact}</b><span className="sp-pill">v{docs.versions(r.id).length || '–'}</span><span className={`sp-pill ${statusTone(r.status)}`}>{STATUS_LABEL[r.status]}</span></div>)}<p className="t-small">{project.events.length} events recorded. You can still open and edit any document.</p></div>
      <div className="sp-foot"><button className="btn btn-primary" onClick={() => { open(null); goDoc('brief'); }}>Open Documentation</button><span className="grow" /><button className="btn" onClick={() => open(null)}>Back to the office</button></div>
    </Modal>
  );
}

function TaskPopup({ row }: { row: TaskRow }) {
  const { open, openTask, docs, runner, goDoc } = useSp();
  const doc = docs.latest(row.id);
  const idea = useSp().env.idea();
  const ctx = idea ? { idea, interviews: parseInterviews(docs.latest('interviews')?.secs) } : null;
  const mine = row.status === 'needs' || row.status === 'optional' || row.status === 'recheck' || row.status === 'reconfirm';
  return (
    <Modal label={row.artifact} onClose={() => open(null)}>
      <div className="sp-row"><span className="sp-pill sp">{row.step}</span><span className={`sp-pill ${statusTone(row.status)}`}>{STATUS_LABEL[row.status]}</span></div>
      <div><div className="t-caps">{TASK[row.id].home} · {TASK[row.id].kind === 'gate' ? 'Gate decision' : 'Document'}</div><h2>{row.artifact}</h2></div>
      <div className="t-small">Made by {agentLook(row.owner).name}{row.support.length ? ` with ${row.support.map(a => agentLook(a).name).join(', ')}` : ''}{row.reviewer ? ` · reviewed by ${agentLook(row.reviewer).name}` : ''} · {ROOM[row.room].name}</div>
      {FEATURES_OF_TASK[row.id] && <div className="t-small">Feature{FEATURES_OF_TASK[row.id].length > 1 ? 's' : ''}: {FEATURES_OF_TASK[row.id].join(', ')}</div>}
      {(row.status === 'working' || row.status === 'review') && <div className="sp-bar blue" style={{ height: 8 }}><i style={{ width: `${runner.progress(row.id)}%` }} /></div>}
      {row.status === 'done' && ctx && <div className="sp-sec"><h5>Result <Provenance provider={versionProvider(doc)} /></h5><p>{resultOf(row.id, ctx)}</p></div>}
      <div className="sp-foot">
        {mine && <button className="btn btn-primary" onClick={() => openTask(row)}>Open</button>}
        {doc && <button className="btn" onClick={() => { open(null); goDoc(row.id); }}>Open document</button>}
        <span className="grow" /><button className="btn" onClick={() => open(null)}>Close</button>
      </div>
    </Modal>
  );
}

function AgentPopup({ id }: { id: string }) {
  const { open, rows } = useSp();
  const a = agentLook(id as never);
  const mine = rows.filter(r => r.owner === id || r.support.includes(id as never) || r.reviewer === id);
  const now = id === 'FOUNDER' ? rows.find(r => r.status === 'needs' || r.status === 'optional' || r.status === 'recheck' || r.status === 'reconfirm') : mine.find(r => r.status === 'working' || r.status === 'review' || r.status === 'needs');
  return (
    <Modal label={a.name} onClose={() => open(null)}>
      <div className="sp-who"><Face id={id as never} size={44} /><div><div className="t-caps">{a.role}</div><h2>{a.name}</h2></div></div>
      <div className="sp-sec"><h5>Now</h5><p>{now ? `${now.artifact} · ${STATUS_LABEL[now.status]}` : id === 'FOUNDER' ? 'Nothing waits for you right now.' : 'Idle at the desk'}</p></div>
      <div className="sp-sec"><h5>Tasks in Discover</h5>{mine.length ? mine.map(r => <div key={r.id} className="sp-row"><span style={{ flex: 1, fontSize: 13 }}>{r.artifact}</span><span className={`sp-pill ${statusTone(r.status)}`}>{STATUS_LABEL[r.status]}</span></div>) : <p>None yet.</p>}</div>
      {a.optional && <p className="t-small" style={{ fontSize: 12, margin: 0 }}>Optional agent: waits in the Agent Hub and joins when a task needs it.</p>}
      {!a.seated && <p className="t-small" style={{ fontSize: 12, margin: 0 }}>This agent exists in the workflow but has no seat in the Office registry yet.</p>}
      <div className="sp-foot"><span className="grow" /><button className="btn btn-primary" onClick={() => open(null)}>Close</button></div>
    </Modal>
  );
}

function RoomPopup({ id }: { id: SpRoomId }) {
  const { open, rows } = useSp();
  const r = ROOM[id];
  const tasks = rows.filter(x => x.room === id);
  return (
    <Modal label={r.name} onClose={() => open(null)}>
      <div><div className="t-caps">Room</div><h2>{r.name}</h2></div>
      <div className="sp-sec"><h5>Tasks worked here</h5>{tasks.length ? tasks.map(t => <div key={t.id} className="sp-row"><b style={{ flex: 1, fontSize: 13 }}>{t.artifact}</b><span className={`sp-pill ${statusTone(t.status)}`}>{STATUS_LABEL[t.status]}</span></div>) : <p>Idle. No Discover task is worked here.</p>}</div>
      <div className="sp-foot"><span className="grow" /><button className="btn btn-primary" onClick={() => open(null)}>Close</button></div>
    </Modal>
  );
}
