'use client';
import Link from 'next/link';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useReducer, useState, useSyncExternalStore } from 'react';
import { useMockAuth } from '@/context/MockAuthContext';
import { startProject, type Env } from '@/features/sp/actions';
import Popups from '@/features/sp/components/Popups';
import Rail from '@/features/sp/components/Rail';
import StartPopup from '@/features/sp/components/StartPopup';
import { getDocStore } from '@/features/sp/docStore';
import type { IdeaInput } from '@/features/sp/idea';
import { PHASES } from '@/features/sp/model';
import { providerOf } from '@/features/sp/provenance';
import { createRunner } from '@/features/sp/runner';
import { SpContext, type ModalSpec, type SpValue } from '@/features/sp/SpContext';
import { isStarted } from '@/features/sp/startIdea';
import { getSpStore, type SpProject } from '@/features/sp/spStore';
import { actionFor, activity, discoverRows, discoverSteps, type TaskRow } from '@/features/sp/viewModel';
import { useCoreRuntime } from '@/services/useProjectCore';

/* One frame for every Solution Planning tab: header with the phase, the tabs, and the right rail
   (notifications, work queue, activity), which stays the same on every tab. The start popup sits over
   whatever tab is open until the founder has given the idea. All state is read from the project's core
   instance; the runner moves the agents' work forward, and the popups act on the core. */
export default function SpProjectLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const id = typeof params?.id === 'string' ? params.id : '';
  return <SpProjectFrame key={id} id={id}>{children}</SpProjectFrame>;   // a new project gets a fresh runner and popup state
}

const initialSpeed = () => (typeof window === 'undefined' ? 1 : Number(new URLSearchParams(window.location.search).get('speed')) || 1);

function SpProjectFrame({ id, children }: { id: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useMockAuth();
  const rt = useCoreRuntime();
  const userId = user?.id ?? '';
  const docs = getDocStore(id);
  useSyncExternalStore(docs.subscribe, docs.getVersion, docs.getVersion);   // re-render when a document changes
  const [record, setRecord] = useState<SpProject | null>(null);
  const [modal, setModal] = useState<ModalSpec | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [speed, setSpeed] = useState(initialSpeed);
  const [docTarget, setDocTarget] = useState<SpValue['docTarget']>(null);
  const [, bump] = useReducer((n: number) => n + 1, 0);

  const ideaNow = useCallback((): IdeaInput | null => getSpStore(userId).byId(id)?.idea ?? null, [userId, id]);
  const [runner] = useState(() => createRunner({ rt, id, docs, idea: ideaNow }));

  useEffect(() => {
    if (!user) { router.replace('/sp'); return; }
    const found = getSpStore(user.id).byId(id);
    if (!found) { router.replace('/sp'); return; }
    rt.ensure({ id: found.id, name: found.name, pitch: found.idea?.text ?? '' });   // this project's own workflow instance
    // eslint-disable-next-line react-hooks/set-state-in-effect -- client-only storage; show the project once it is loaded
    setRecord(found);
  }, [id, user, rt, router]);

  // The live office: advance the agents' work in real time (scaled by the speed toggle).
  useEffect(() => {
    if (!record) return;
    let last = performance.now();
    const h = setInterval(() => {
      const now = performance.now();
      runner.tick(Math.min(500, now - last) * speed);
      last = now;
      if (runner.busy()) bump();   // progress bars and walking
    }, 250);
    return () => clearInterval(h);
  }, [runner, record, speed]);

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 3400);
    return () => clearTimeout(t);
  }, [message]);

  const entry = record ? rt.getEntry(id) : null;
  if (!user || !record || !entry) return <div className="sp-login t-small">Opening your office…</div>;
  if (entry.status === 'error') {
    return (
      <div className="sp-login"><div className="sp-lcard" role="alert"><h1>This project could not be opened</h1><p className="t-small">{entry.message}</p><Link className="btn" href="/sp">Back to Solution Planning</Link></div></div>
    );
  }

  const core = rt.core, project = entry.project;
  const store = getSpStore(user.id);
  const rows = discoverRows(core, project, { takenUp: docs.takenUp(), rechecks: docs.rechecks() });
  const started = isStarted(core, project);
  const steps = discoverSteps(core, project);
  const done = rows.filter(r => r.status === 'done').length;
  const stepsDone = steps.filter(s => s.status === 'complete').length;
  const base = `/sp/${id}`;

  const env: Env = {
    rt, id, docs, idea: ideaNow,
    setIdea: idea => { const saved = store.saveIdea(id, idea); if (saved) setRecord(saved); },
  };
  const openTask = (r: TaskRow) => {
    const a = actionFor(r);
    if (!a) { setModal({ kind: 'task', id: r.id }); return; }
    setModal(a === 'impact' ? { kind: 'impact' } : { kind: a, id: r.id });
  };
  const value: SpValue = {
    id, record, rt, core, project, rows, docs, env, runner, phases: runner.phases(), speed, setSpeed, modal, open: setModal, openTask, toast: setMessage,
    goDoc: (task, edit = false) => { setDocTarget({ task, edit }); router.push(`${base}/documentation`); },
    docTarget, clearDocTarget: () => setDocTarget(null),
    start: idea => startProject(env, idea),
  };
  const tab = (href: string, label: string, extra?: React.ReactNode) => <Link href={href} aria-current={pathname === href ? 'page' : undefined}>{label}{extra}</Link>;

  return (
    <SpContext.Provider value={value}>
      <div className="sp-wrap">
        <header className="sp-head">
          <div className="sp-row">
            <span className="sp-logo">Solution Planning</span>
            <span className="sp-chip" title="The project you are planning"><span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--persona, var(--accent))' }} />{record.name}</span>
            <div className="sp-phases" aria-label="Phases">{PHASES.map(ph => <span key={ph.name} className={ph.open ? 'cur' : 'lock'}>{ph.name}</span>)}</div>
            <div className="sp-row" aria-label="Discover steps">{steps.map(s => <span key={s.id} className={`sp-step ${s.status === 'complete' ? 'done' : s.status === 'in-progress' ? 'on' : ''}`}>{s.label}</span>)}</div>
            <div className="sp-meter"><span>Discover · {stepsDone} of {steps.length} steps done</span><span className="sp-bar"><i style={{ width: `${(stepsDone / steps.length) * 100}%` }} /></span></div>
            <span style={{ flex: 1 }} />
            {providerOf('brief', record.idea) === 'claude-cli'
              ? <span className="sp-sim" title="The Idea Brief is written by Claude through the local CLI. Every other output is still simulated.">CLAUDE BRIEF · OTHER OUTPUTS SIMULATED</span>
              : <span className="sp-sim">SIMULATED OUTPUTS</span>}
            <div className="sp-filter" role="group" aria-label="Office speed">{[1, 3].map(n => <button key={n} type="button" aria-pressed={speed === n} onClick={() => setSpeed(n)}>{n}×</button>)}</div>
            <button type="button" className="btn btn-sm" onClick={() => router.push(`/sp/${store.create().id}`)}>New idea</button>
            <button type="button" className="btn btn-sm" onClick={() => { logout(); router.replace('/sp'); }} title={`Signed in as ${user.name}`}>Sign out</button>
          </div>
        </header>
        <nav className="sp-tabs" aria-label="Sections">
          {tab(base, 'Agent Office')}
          {tab(`${base}/workflow`, 'Workflow')}
          {tab(`${base}/documentation`, 'Documentation', <span className="sp-pill">{done}</span>)}
        </nav>
        <div className="sp-main">
          <div style={{ minWidth: 0 }}>{children}</div>
          <Rail rows={rows} feed={activity(project)} started={started} progress={tid => runner.progress(tid)} onOpen={openTask} onTask={r => setModal({ kind: 'task', id: r.id })} />
        </div>
      </div>
      {!started && <StartPopup userName={user.name} onStart={value.start} />}
      {started && <Popups />}
      {message && <div className="sp-toast" role="status">{message}</div>}
    </SpContext.Provider>
  );
}
