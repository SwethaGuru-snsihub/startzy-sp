'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createProjectRecord, toProjectInit } from '@/services/projectStore';
import { getCoreRuntime } from '@/services/coreRuntime';

const CATEGORIES = [
  { id: 'venture', label: 'Venture-funded SaaS' },
  { id: 'bootstrapped', label: 'Bootstrapped B2B' },
  { id: 'enterprise', label: 'Enterprise software' },
  { id: 'custom', label: 'Something else' },
] as const;

/* Create Startup · /project/new. Creates the project record and its own, empty workflow instance
   (Startup Journey and Solution Planning start with nothing done). Saved in this browser only. */
export default function NewProject() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [pitch, setPitch] = useState('');
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]['id']>('custom');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const p = createProjectRecord({ name, pitch, category });
    getCoreRuntime().ensure(toProjectInit(p));   // creates this project's own workflow instance, empty
    router.push(`/project/${p.id}`);
  };

  return (
    <div className="min-h-screen px-4 sm:px-8 py-8" style={{ background: 'var(--subtle)' }}>
      <div className="max-w-xl mx-auto flex flex-col gap-5">
        <Link href="/dashboard" className="t-small" style={{ color: 'var(--muted)' }}>← Dashboard</Link>
        <form onSubmit={submit} className="panel p-6 flex flex-col gap-4">
          <div>
            <div className="t-caps">New startup</div>
            <h1 className="t-h2 font-extrabold">Create a startup project</h1>
            <p className="t-small mt-1" style={{ fontSize: 13 }}>
              Prototype: this saves the project in your browser only. It starts with an empty Startup Journey and
              an empty Solution Planning workflow; nothing is pre-filled.
            </p>
          </div>

          <label className="flex flex-col gap-1">
            <span className="t-caps">Startup name</span>
            <input value={name} onChange={e => setName(e.target.value)} required maxLength={80}
              className="px-3 py-2 rounded-xl" style={{ border: '1px solid var(--line)', background: 'var(--panel)', color: 'var(--ink)' }} />
          </label>

          <label className="flex flex-col gap-1">
            <span className="t-caps">One-line pitch</span>
            <textarea value={pitch} onChange={e => setPitch(e.target.value)} rows={3} maxLength={240}
              className="px-3 py-2 rounded-xl" style={{ border: '1px solid var(--line)', background: 'var(--panel)', color: 'var(--ink)' }} />
          </label>

          <label className="flex flex-col gap-1">
            <span className="t-caps">Type</span>
            <select value={category} onChange={e => setCategory(e.target.value as typeof category)}
              className="px-3 py-2 rounded-xl" style={{ border: '1px solid var(--line)', background: 'var(--panel)', color: 'var(--ink)' }}>
              {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </label>

          <div className="flex items-center gap-2.5">
            <button type="submit" className="btn btn-primary" disabled={!name.trim()}>Create project</button>
            <Link href="/dashboard" className="btn">Cancel</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
