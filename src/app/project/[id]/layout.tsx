'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import LegacyChrome from '@/components/shell/LegacyChrome';
import { ProjectBaseProvider } from '@/components/shell/ProjectBase';
import { ProjectProvider } from '@/features/shell/ProjectProvider';
import { getProjectById, templateOf, toProjectInit, type ProjectRecord } from '@/services/projectStore';
import { getProjectSessions } from '@/services/projectSessions';
import { useCoreRuntime } from '@/services/useProjectCore';

type State = { status: 'loading' } | { status: 'ready'; record: ProjectRecord; notice?: string } | { status: 'error'; message: string };

/* Every startup project opens in the Founder HQ: the workspace, the Office Map with its agents, rooms,
   engines, work queue, inbox and activity. This layout loads that project's own saved Office state
   (never another project's), shows the same Founder HQ frame as the demo, and lets go of it on leave. */
export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const router = useRouter();
  const rt = useCoreRuntime();
  const id = typeof params?.id === 'string' ? params.id : Array.isArray(params?.id) ? params.id[0] : '';
  const [state, setState] = useState<State>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const record = getProjectById(id);
    if (!record) { router.replace('/dashboard'); return; }
    let cancelled = false;
    rt.ensure(toProjectInit(record));        // this project's own workflow instance (18 phases + 16 steps)
    const sessions = getProjectSessions();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- client-only storage; show the project once its session is loaded
    setState({ status: 'loading' });
    sessions.activate({ id: record.id, name: record.name, pitch: record.pitch, template: templateOf(record) }).then(r => {
      if (cancelled) return;
      setState(r.ok
        ? { status: 'ready', record, ...(r.recovered ? { notice: 'Saved Founder HQ data for this startup could not be read, so it was started again. The unreadable copy was kept aside.' } : {}) }
        : { status: 'error', message: r.message });
    });
    return () => { cancelled = true; void sessions.release(); };
  }, [id, rt, router, attempt]);

  if (state.status === 'loading') {
    return <div className="min-h-screen grid place-items-center t-small" style={{ background: 'var(--subtle)' }}>Opening your startup…</div>;
  }
  if (state.status === 'error') {
    return (
      <div className="min-h-screen grid place-items-center p-6" style={{ background: 'var(--subtle)' }}>
        <div className="panel p-6 flex flex-col gap-3 max-w-md" role="alert">
          <div className="t-h3">This startup could not be opened</div>
          <p className="t-small">{state.message}</p>
          <div className="flex gap-2"><button className="btn btn-primary" onClick={() => setAttempt(n => n + 1)}>Try again</button><Link className="btn" href="/dashboard">All startups</Link></div>
        </div>
      </div>
    );
  }
  const entry = rt.getEntry(state.record.id);
  return (
    <ProjectBaseProvider value={`/project/${state.record.id}`}>
      <ProjectProvider id={state.record.id} project={state.record}>
        <LegacyChrome>
          {state.notice && <div role="alert" className="p-3 rounded-xl t-small mb-3" style={{ background: 'var(--panel)', border: '1px solid var(--stop)', color: 'var(--stop)' }}>{state.notice}</div>}
          {entry?.status === 'ready' && entry.notice && <div role="alert" className="p-3 rounded-xl t-small mb-3" style={{ background: 'var(--panel)', border: '1px solid var(--stop)', color: 'var(--stop)' }}>{entry.notice}</div>}
          {children}
        </LegacyChrome>
      </ProjectProvider>
    </ProjectBaseProvider>
  );
}
