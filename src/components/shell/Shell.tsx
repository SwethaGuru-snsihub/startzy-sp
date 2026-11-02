'use client';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { S } from '@/engine/engine';
import { useEngine } from '@/engine/useEngine';
import { useMockAuth } from '@/context/MockAuthContext';
import LegacyChrome from './LegacyChrome';
import Landing from './Landing';

export default function Shell({ children }: { children: React.ReactNode }) {
  useEngine();
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useMockAuth();
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- client-only engine state; render after mount
  useEffect(() => setMounted(true), []);

  // Root entry point redirect:
  // 1. Unauthenticated users visiting / -> redirect to /auth/login
  // 2. Authenticated mock users visiting / -> redirect to /dashboard
  useEffect(() => {
    if (!mounted) return;
    if (pathname === '/') {
      if (user) {
        router.replace('/dashboard');
      } else {
        router.replace('/auth/login');
      }
    }
  }, [mounted, pathname, user, router]);

  if (!mounted) return null;

  if (pathname === '/') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center" style={{ background: 'var(--subtle)' }}>
        <div className="flex flex-col items-center gap-3">
          <span className="w-9 h-9 rounded-xl grid place-items-center font-extrabold text-[18px]" style={{ background: 'var(--ink)', color: 'var(--panel)' }}>S</span>
          <span className="t-small" style={{ fontSize: 13 }}>Redirecting to {user ? 'Account Dashboard' : 'Sign In'}…</span>
        </div>
      </div>
    );
  }

  // Sign-in, the account dashboard and the startup project routes bring their own frame. A project
  // route (/project/<id>/...) wraps its pages in the same Founder HQ frame once its own session loads.
  const isPlatformRoute =
    pathname?.startsWith('/auth') ||
    pathname?.startsWith('/dashboard') ||
    pathname?.startsWith('/project');

  if (isPlatformRoute) {
    return <>{children}</>;
  }

  if (!S.started) return <Landing />;
  return <LegacyChrome>{children}</LegacyChrome>;
}
