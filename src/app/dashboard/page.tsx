'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useMockAuth } from '@/context/MockAuthContext';
import { getStoredProjects, toProjectInit, type ProjectRecord } from '@/services/projectStore';
import { formatDate, selectPortfolioMetrics, viewOf, type ProjectView } from '@/services/projectSelectors';
import { useCoreRuntime } from '@/services/useProjectCore';

export default function AccountDashboard() {
  const router = useRouter();
  const { user, logout } = useMockAuth();
  const rt = useCoreRuntime();
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [filter, setFilter] = useState<'all' | 'venture' | 'bootstrapped' | 'enterprise'>('all');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const records = getStoredProjects();
    // Loads each project's own core instance (or creates it once); never touches the legacy engine.
    rt.ensureMany(records.map(toProjectInit));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- client-only storage; render after mount
    setMounted(true);
    setProjects(records);
  }, [rt]);

  if (!mounted) return null;

  const entries = projects.map(p => ({ p, entry: rt.getEntry(p.id) }));
  const viewFor = (id: string): ProjectView | null => {
    const e = rt.getEntry(id);
    return e?.status === 'ready' ? viewOf(rt.core, e.project) : null;
  };
  const views = projects.map(p => viewFor(p.id)).filter((v): v is ProjectView => v != null);
  const { plannedSpendLakh, pending, acceptedPackages } = selectPortfolioMetrics(views);
  const filtered = filter === 'all' ? entries : entries.filter(x => x.p.category === filter);

  // Opening a project only navigates. It never touches the legacy engine (that lives under /demo).
  const handleOpenWorkspace = (p: ProjectRecord) => router.push(`/project/${p.id}`);

  return (
    <div className="min-h-screen px-4 sm:px-8 py-8" style={{ background: 'var(--subtle)' }}>
      <div className="max-w-7xl mx-auto flex flex-col gap-6">

        {/* Prototype Environment Notice */}
        <div className="p-3.5 rounded-xl flex items-center justify-between flex-wrap gap-2" style={{ background: 'var(--panel)', border: '1px solid var(--accent)', boxShadow: 'var(--shadow)' }}>
          <div className="flex items-center gap-2.5">
            <span className="pill t-micro px-2.5 py-1 font-bold" style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}>PROTOTYPE ENVIRONMENT</span>
            <span className="t-small">Mock Authentication · Sample Projects · Workflow State Saved In This Browser · Simulated AI Activity</span>
          </div>
          <span className="t-small text-[11px]" style={{ color: 'var(--muted)' }}>Startzy × Solution Planning Platform v0.9</span>
        </div>
        {!rt.durable && (
          <div role="alert" className="p-3 rounded-xl t-small" style={{ background: 'var(--panel)', border: '1px solid var(--stop)', color: 'var(--stop)' }}>
            Browser storage is unavailable. Workflow state is kept only until this page closes.
          </div>
        )}

        {/* Top Navigation & Profile Bar */}
        <header className="panel px-6 py-4 flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-xl grid place-items-center font-extrabold text-[18px]" style={{ background: 'var(--ink)', color: 'var(--panel)' }}>S</span>
            <div>
              <div className="t-caps">Portfolio Management</div>
              <h1 className="t-h2 font-extrabold">Account Dashboard</h1>
            </div>
          </div>

          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl" style={{ background: 'var(--subtle)', border: '1px solid var(--line)' }}>
              <span className="w-7 h-7 rounded-full grid place-items-center font-bold text-[13px]" style={{ background: 'var(--ink)', color: 'var(--panel)' }}>
                {user?.avatarInitial || 'A'}
              </span>
              <div className="text-left">
                <span className="t-strong block text-[13px] leading-tight">{user?.name || 'Alex Chen'}</span>
                <span className="t-small block text-[11px] leading-tight">{user?.role || 'Lead Founder'}</span>
              </div>
            </div>

            <Link href="/demo" className="btn btn-sm" title="Explore legacy standalone demo">
              Legacy Demo
            </Link>

            <button
              onClick={() => { logout(); router.push('/auth/login'); }}
              className="btn btn-sm"
              style={{ color: 'var(--stop)' }}
            >
              Sign out
            </button>
          </div>
        </header>

        {/* Portfolio metrics, derived from each project's workflow state */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" aria-label="Portfolio Summary">
          <div className="panel p-5 flex flex-col gap-1">
            <span className="t-caps">Active Startups</span>
            <div className="flex items-baseline gap-2">
              <span className="t-metric text-[26px]">{projects.length}</span>
              <span className="t-small">portfolio companies</span>
            </div>
            <span className="t-small text-[11px]" style={{ color: 'var(--muted)' }}>Each has its own workflow state</span>
          </div>

          <div className="panel p-5 flex flex-col gap-1">
            <span className="t-caps">Planned Spend &amp; Runway</span>
            <div className="flex items-baseline gap-2">
              <span className="t-metric text-[26px]">₹{plannedSpendLakh}L</span>
              <span className="t-small">planned · runway not tracked</span>
            </div>
            <span className="t-small text-[11px]" style={{ color: 'var(--muted)' }}>From approved cost and hiring plans</span>
          </div>

          <div className="panel p-5 flex flex-col gap-1">
            <span className="t-caps">Solution Builder Status</span>
            <div className="flex items-baseline gap-2">
              <span className="t-metric text-[26px]" style={{ color: 'var(--go)' }}>{acceptedPackages}</span>
              <span className="t-small">handoffs accepted ({views.length - acceptedPackages} not yet)</span>
            </div>
            <span className="t-small text-[11px]" style={{ color: 'var(--muted)' }}>SP16 package pipeline</span>
          </div>

          <div className="panel p-5 flex flex-col gap-1">
            <span className="t-caps">Pending Founder Actions</span>
            <div className="flex items-baseline gap-2">
              <span className="t-metric text-[26px]" style={{ color: pending ? 'var(--accent)' : 'var(--go)' }}>{pending}</span>
              <span className="t-small">approvals, tasks &amp; decisions waiting</span>
            </div>
            <span className="t-small text-[11px]" style={{ color: 'var(--muted)' }}>Requires founder action</span>
          </div>
        </section>

        {/* Startups Portfolio Header & Filter Controls */}
        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <h2 className="t-h2">Your Startup Projects</h2>
              <span className="pill t-micro px-2.5 py-0.5" style={{ background: 'var(--line)', color: 'var(--ink)' }}>{filtered.length}</span>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center p-1 rounded-xl gap-1" style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}>
                {(['all', 'venture', 'bootstrapped', 'enterprise'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setFilter(tab)}
                    className="pill px-3 py-1 t-small capitalize transition-colors"
                    style={{
                      background: filter === tab ? 'var(--ink)' : 'transparent',
                      color: filter === tab ? 'var(--panel)' : 'var(--ink)',
                      fontWeight: filter === tab ? 700 : 500,
                    }}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              <Link
                href="/project/new"
                className="btn btn-primary"
                style={{ padding: '8px 16px', fontSize: 13 }}
              >
                + Create Startup
              </Link>
            </div>
          </div>

          {/* Startups Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map(({ p, entry }) => {
              const v = entry?.status === 'ready' ? viewOf(rt.core, entry.project) : null;
              return (
                <div
                  key={p.id}
                  className="panel p-6 flex flex-col justify-between gap-5 transition-all row-hover"
                  style={{ border: '1px solid var(--line)' }}
                >
                  <div className="flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="pill t-micro px-2 py-0.5 mb-1 inline-block" style={{ background: 'var(--subtle)', border: '1px solid var(--line)', color: 'var(--ink)', fontSize: 10 }}>
                          {p.categoryLabel}{p.presetId ? ' · sample' : ''}
                        </span>
                        <h3 className="t-h3 text-[18px] leading-tight">{p.name}</h3>
                      </div>
                      {v && v.pending.length > 0 && (
                        <span className="pill t-micro px-2 py-0.5 flex-none" style={{ background: 'var(--accent-soft)', color: 'var(--accent)', border: '1px solid var(--accent)', fontWeight: 700 }}>
                          {v.pending.length} action{v.pending.length > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>

                    <p className="t-small text-[13px] line-clamp-2" style={{ lineHeight: 1.5 }}>
                      {p.pitch}
                    </p>

                    {entry?.status === 'error' && (
                      <p role="alert" className="t-small text-[12px] p-3 rounded-xl" style={{ border: '1px solid var(--stop)', color: 'var(--stop)' }}>{entry.message}</p>
                    )}

                    {v && (
                      <>
                        {/* Two independent workflows, each derived from its own state */}
                        <div className="p-3 rounded-xl flex flex-col gap-2.5 mt-1" style={{ background: 'var(--subtle)', border: '1px solid var(--line)' }}>
                          <div className="flex flex-col gap-1">
                            <div className="flex justify-between items-center text-[11px]">
                              <span className="t-caps" style={{ color: 'var(--ink)' }}>Startup Journey</span>
                              <span className="t-strong">{v.sj.completeCount}/{v.sj.total} phases complete</span>
                            </div>
                            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--line)' }}>
                              <div className="h-full rounded-full transition-all" style={{ width: `${(v.sj.completeCount / v.sj.total) * 100}%`, background: 'var(--go)' }} />
                            </div>
                            <span className="t-small text-[11px] truncate" style={{ color: 'var(--muted)' }}>
                              {v.sj.current ? `Phase ${v.sj.current.n} · ${v.sj.current.name} (${v.sj.current.status === 'in-progress' ? 'in progress' : 'not started'})` : 'All phases complete'}
                            </span>
                          </div>

                          <div className="flex flex-col gap-1 pt-1 border-t" style={{ borderColor: 'var(--line)' }}>
                            <div className="flex justify-between items-center text-[11px]">
                              <span className="t-caps" style={{ color: 'var(--ink)' }}>Solution Planning</span>
                              <span className="t-strong">{v.sp.completeCount}/{v.sp.total} steps complete</span>
                            </div>
                            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--line)' }}>
                              <div className="h-full rounded-full transition-all" style={{ width: `${(v.sp.completeCount / v.sp.total) * 100}%`, background: 'var(--sp)' }} />
                            </div>
                            <span className="t-small text-[11px] truncate" style={{ color: 'var(--muted)' }}>
                              {v.sp.current ? `Step ${v.sp.current.n} · ${v.sp.current.name} (${v.sp.current.status === 'in-progress' ? 'in progress' : 'not started'})` : 'All steps complete'}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 pt-1 border-t text-[11px]" style={{ borderColor: 'var(--line)' }}>
                            <span className="t-caps" style={{ color: 'var(--muted)' }}>Handoff:</span>
                            <span className="t-strong truncate" style={{ color: v.handoff.current ? 'var(--go)' : 'var(--muted)' }}>
                              {v.handoff.label}
                            </span>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2 pt-1 text-center">
                          <div className="p-2 rounded-lg" style={{ background: 'var(--subtle)' }}>
                            <div className="t-caps text-[10px]">Planned spend</div>
                            <div className="t-strong text-[13px]">₹{v.plannedSpendLakh}L</div>
                          </div>
                          <div className="p-2 rounded-lg" style={{ background: 'var(--subtle)' }}>
                            <div className="t-caps text-[10px]">Runway</div>
                            <div className="t-strong text-[13px]">Not tracked</div>
                          </div>
                          <div className="p-2 rounded-lg" style={{ background: 'var(--subtle)' }}>
                            <div className="t-caps text-[10px]">Evidence</div>
                            <div className="t-strong text-[13px]">{v.evidence.total} items · {v.evidence.current} current</div>
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t" style={{ borderColor: 'var(--line)' }}>
                    <span className="t-small text-[11px]" style={{ color: 'var(--muted)' }}>
                      {v?.lastActivityAt ? `Last activity ${formatDate(v.lastActivityAt)}` : 'No activity yet'}
                    </span>
                    <button
                      onClick={() => handleOpenWorkspace(p)}
                      className="btn btn-sm btn-primary"
                      style={{ padding: '7px 14px', fontSize: 13 }}
                    >
                      Open Workspace →
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

      </div>
    </div>
  );
}
