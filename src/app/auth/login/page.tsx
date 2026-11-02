'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useMockAuth, DEMO_USERS } from '@/context/MockAuthContext';

export default function LoginPage() {
  const router = useRouter();
  const { login, loginAsDemo } = useMockAuth();
  const [email, setEmail] = useState('alex@startzy.ai');
  const [password, setPassword] = useState('demo1234');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    login(email);
    router.push('/dashboard');
  };

  const handleDemoClick = (id: string) => {
    loginAsDemo(id);
    router.push('/dashboard');
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12" style={{ background: 'var(--subtle)' }}>
      <div className="w-full max-w-md flex flex-col gap-6">
        {/* Prototype notice banner */}
        <div className="p-3 rounded-xl flex items-center gap-2 t-small" style={{ background: 'var(--accent-soft)', border: '1px solid var(--accent)', color: 'var(--ink)' }}>
          <span className="pill t-micro px-2 py-0.5 font-bold" style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}>PROTOTYPE</span>
          <span>Mock authentication · No real password required</span>
        </div>

        <div className="panel p-8 flex flex-col gap-6">
          <div className="flex flex-col gap-2 text-center">
            <div className="flex items-center justify-center gap-2">
              <span className="w-8 h-8 rounded-lg grid place-items-center font-extrabold" style={{ background: 'var(--ink)', color: 'var(--panel)' }}>S</span>
              <span className="t-h2">Startzy</span>
            </div>
            <h1 className="t-title mt-1" style={{ fontSize: 24 }}>Sign in to Founder HQ</h1>
            <p className="t-small">Access your startup portfolio and AI executive team</p>
          </div>

          {/* Quick 1-click Demo Accounts */}
          <div className="flex flex-col gap-2">
            <span className="t-caps">Quick Sign In (Demo Accounts)</span>
            <div className="grid grid-cols-2 gap-2">
              {DEMO_USERS.map(u => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => handleDemoClick(u.id)}
                  className="btn btn-sm flex items-center gap-2 text-left p-2.5 rounded-xl row-hover"
                  style={{ background: 'var(--subtle)', border: '1px solid var(--line)' }}
                >
                  <span className="w-6 h-6 rounded-full grid place-items-center font-bold text-[12px] flex-none" style={{ background: 'var(--ink)', color: 'var(--panel)' }}>
                    {u.avatarInitial}
                  </span>
                  <div className="min-w-0">
                    <span className="t-strong block truncate text-[13px]">{u.name}</span>
                    <span className="t-small block truncate text-[11px]">{u.role.split(' · ')[0]}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="flex-1 h-px" style={{ background: 'var(--line)' }} />
            <span className="t-caps" style={{ color: 'var(--muted)' }}>or enter email</span>
            <span className="flex-1 h-px" style={{ background: 'var(--line)' }} />
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="t-strong text-[13px]">Email address</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="w-full px-3 py-2.5 rounded-xl text-[14px]"
                style={{ background: 'var(--subtle)', border: '1px solid var(--line-strong)', color: 'var(--ink)' }}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between items-center">
                <label htmlFor="pass" className="t-strong text-[13px]">Password</label>
                <span className="t-small text-[11px]" style={{ color: 'var(--muted)' }}>any mock password</span>
              </div>
              <input
                id="pass"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className="w-full px-3 py-2.5 rounded-xl text-[14px]"
                style={{ background: 'var(--subtle)', border: '1px solid var(--line-strong)', color: 'var(--ink)' }}
              />
            </div>

            <button type="submit" className="btn btn-primary justify-center mt-2" style={{ padding: '11px', fontSize: 14 }}>
              Sign In to Account Dashboard →
            </button>
          </form>

          <div className="flex justify-between items-center pt-2 t-small border-t" style={{ borderColor: 'var(--line)' }}>
            <span>Need an account? <Link href="/auth/signup" className="underline font-bold">Sign up</Link></span>
            <Link href="/demo" className="hover:underline text-[12px]">Legacy Standalone Demo</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
