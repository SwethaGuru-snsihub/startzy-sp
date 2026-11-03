'use client';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { S } from '@/engine/engine';
import { useEngine } from '@/engine/useEngine';
import { opensSolutionPlanning, SP_HOME } from '@/features/sp/entry';
import LegacyChrome from './LegacyChrome';
import Landing from './Landing';

export default function Shell({ children }: { children: React.ReactNode }) {
  useEngine();
  const pathname = usePathname();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- client-only engine state; render after mount
  useEffect(() => setMounted(true), []);

  // Solution Planning is the front door: the root and the old Startzy account screens open it.
  const toSp = opensSolutionPlanning(pathname);
  useEffect(() => {
    if (mounted && toSp) router.replace(SP_HOME);
  }, [mounted, toSp, router]);

  if (!mounted) return null;

  if (toSp) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center" style={{ background: 'var(--subtle)' }}>
        <span className="t-small" style={{ fontSize: 13 }}>Opening Solution Planning…</span>
      </div>
    );
  }

  // The Startzy project routes and Solution Planning bring their own frame. A project route
  // (/project/<id>/...) wraps its pages in the Founder HQ frame once its own session loads.
  const isPlatformRoute = pathname?.startsWith('/project') || pathname?.startsWith('/sp');

  if (isPlatformRoute) {
    return <>{children}</>;
  }

  if (!S.started) return <Landing />;
  return <LegacyChrome>{children}</LegacyChrome>;
}
