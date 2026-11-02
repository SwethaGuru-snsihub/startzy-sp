'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useMockAuth } from '@/context/MockAuthContext';
import { createProjectRecord } from '@/services/projectStore';

export default function SignupPage() {
  const router = useRouter();
  const { signup } = useMockAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    signup(name, email);
    if (company.trim()) {
      createProjectRecord({
        name: company.trim(),
        pitch: `Startup founded by ${name || 'Founder'}.`,
        category: 'custom',
      });
    }
    router.push('/dashboard');
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12" style={{ background: 'var(--subtle)' }}>
      <div className="w-full max-w-md flex flex-col gap-6">
        <div className="p-3 rounded-xl flex items-center gap-2 t-small" style={{ background: 'var(--accent-soft)', border: '1px solid var(--accent)', color: 'var(--ink)' }}>
          <span className="pill t-micro px-2 py-0.5 font-bold" style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}>PROTOTYPE</span>
          <span>Mock registration · Instantly provisions a demo workspace</span>
        </div>

        <div className="panel p-8 flex flex-col gap-6">
          <div className="flex flex-col gap-2 text-center">
            <div className="flex items-center justify-center gap-2">
              <span className="w-8 h-8 rounded-lg grid place-items-center font-extrabold" style={{ background: 'var(--ink)', color: 'var(--panel)' }}>S</span>
              <span className="t-h2">Startzy</span>
            </div>
            <h1 className="t-title mt-1" style={{ fontSize: 24 }}>Create your account</h1>
            <p className="t-small">Start managing your startup journey with Atlas</p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="name" className="t-strong text-[13px]">Full name</label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Alex Chen"
                required
                className="w-full px-3 py-2.5 rounded-xl text-[14px]"
                style={{ background: 'var(--subtle)', border: '1px solid var(--line-strong)', color: 'var(--ink)' }}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="t-strong text-[13px]">Work email</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="alex@company.com"
                required
                className="w-full px-3 py-2.5 rounded-xl text-[14px]"
                style={{ background: 'var(--subtle)', border: '1px solid var(--line-strong)', color: 'var(--ink)' }}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="company" className="t-strong text-[13px]">First company name (optional)</label>
              <input
                id="company"
                type="text"
                value={company}
                onChange={e => setCompany(e.target.value)}
                placeholder="e.g. NovaHealth Systems"
                className="w-full px-3 py-2.5 rounded-xl text-[14px]"
                style={{ background: 'var(--subtle)', border: '1px solid var(--line-strong)', color: 'var(--ink)' }}
              />
            </div>

            <button type="submit" className="btn btn-primary justify-center mt-2" style={{ padding: '11px', fontSize: 14 }}>
              Create Prototype Account →
            </button>
          </form>

          <div className="flex justify-between items-center pt-2 t-small border-t" style={{ borderColor: 'var(--line)' }}>
            <span>Already have an account? <Link href="/auth/login" className="underline font-bold">Sign in</Link></span>
            <Link href="/demo" className="hover:underline text-[12px]">Legacy Standalone Demo</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
