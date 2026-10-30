'use client';
import { useId, useRef, useState } from 'react';
import { start } from '@/engine/engine';
import { PERSONAS } from '@/engine/personas';
import { IDEA_ERROR_TEXT, IDEA_MAX, loadDraft, saveDraft, submitIdea, validateIdea, type IdeaError } from '@/onboarding/ideaDraft';
import IdeaIntake from './IdeaIntake';

type View = 'home' | 'intake';
type Phase = 'idle' | 'submitting' | 'failed';

/* Entry experience. Primary: start a new company. Secondary: demo companies (unchanged journeys).
   `returning` is the slot for a future "Continue your workspace" card; nothing renders until the
   app has real sign-in and saved workspaces. */
export default function Landing({ returning }: { returning?: React.ReactNode }) {
  const [view, setView] = useState<View>('home');
  const [text, setText] = useState(() => loadDraft());
  const [touched, setTouched] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [persisted, setPersisted] = useState(true);
  const area = useRef<HTMLTextAreaElement>(null);
  const demos = useRef<HTMLElement>(null);
  const id = useId();

  const invalid: IdeaError | null = validateIdea(text);
  const showError: IdeaError | null = invalid && (touched || invalid === 'too_long') ? invalid : null;

  const change = (v: string) => { setText(v); saveDraft(v); if (phase === 'failed') setPhase('idle'); };

  const submit = async () => {
    setTouched(true);
    if (invalid) { area.current?.focus(); return; }
    setPhase('submitting');
    try {
      const r = await submitIdea(text);
      if (!r.ok) { setPhase('idle'); area.current?.focus(); return; }
      setPersisted(r.persisted); setPhase('idle'); setView('intake'); window.scrollTo({ top: 0 });
    } catch { setPhase('failed'); }
  };

  const toDemos = () => { setView('home'); setTimeout(() => demos.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0); };

  return (
    <div className="min-h-screen px-4 sm:px-6 py-6 sm:py-10">
      <div className="mx-auto w-full max-w-5xl flex flex-col gap-8">
        <header className="flex items-center gap-2">
          <span aria-hidden className="w-8 h-8 rounded-lg grid place-items-center font-extrabold" style={{ background: 'var(--ink)', color: 'var(--panel)' }}>S</span>
          <span className="t-h2">Startzy</span>
        </header>

        {view === 'intake' ? (
          <IdeaIntake idea={text.trim()} persisted={persisted} onEdit={() => { setView('home'); setTimeout(() => area.current?.focus(), 0); }} onBack={toDemos} />
        ) : (
          <>
            <section className="panel p-6 sm:p-10 flex flex-col gap-6" aria-labelledby="hero-title">
              <div className="flex flex-col gap-3 max-w-2xl">
                <h1 id="hero-title" className="t-title" style={{ fontSize: 'clamp(28px, 4.4vw, 38px)' }}>Build your company with Startzy</h1>
                <p className="m-0" style={{ fontSize: 16, color: 'var(--muted)', lineHeight: 1.6 }}>Tell Atlas about your idea. We&apos;ll help you turn it into a real, structured business.</p>
              </div>
              <form className="flex flex-col gap-3" noValidate onSubmit={e => { e.preventDefault(); submit(); }}>
                <label htmlFor={`${id}-idea`} className="t-strong">Your idea</label>
                <textarea
                  id={`${id}-idea`} ref={area} value={text} rows={6} maxLength={IDEA_MAX + 500}
                  onChange={e => change(e.target.value)} onBlur={() => setTouched(true)}
                  onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); submit(); } }}
                  placeholder="Describe your business idea, the problem you want to solve, or what you're planning to build..."
                  aria-invalid={!!showError} aria-describedby={`${id}-hint ${id}-err`}
                  className="w-full px-4 py-3 rounded-xl resize-y"
                  style={{ minHeight: 150, fontSize: 15, lineHeight: 1.6, background: 'var(--subtle)', border: `1.5px solid ${showError ? 'var(--stop)' : 'var(--line-strong)'}`, color: 'var(--ink)' }}
                />
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex flex-col gap-1 min-w-0">
                    <span id={`${id}-hint`} className="t-small">An unfinished idea is fine. You don&apos;t need a business plan.</span>
                    <span id={`${id}-err`} role="alert" className="t-strong" style={{ color: 'var(--stop)', minHeight: 0 }}>
                      {phase === 'failed' ? 'Something went wrong on our side. Your text is still here, so please try again.' : showError ? IDEA_ERROR_TEXT[showError] : ''}
                    </span>
                  </div>
                  <span className="t-small" aria-live="polite" style={text.trim().length > IDEA_MAX ? { color: 'var(--stop)', fontWeight: 700 } : undefined}>{text.trim().length.toLocaleString('en-IN')} / {IDEA_MAX.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex items-center gap-3 flex-wrap pt-1">
                  <button type="submit" disabled={phase === 'submitting'} className="btn btn-primary" style={{ padding: '12px 22px', fontSize: 15, borderRadius: 11 }}>
                    {phase === 'submitting' ? 'Sending to Atlas…' : phase === 'failed' ? 'Try again' : 'Start building with Atlas'}
                  </button>
                  <span className="t-small hidden sm:inline">Ctrl + Enter to send</span>
                </div>
              </form>
            </section>

            {returning}

            <section ref={demos} className="flex flex-col gap-4" aria-labelledby="demo-title" style={{ scrollMarginTop: 16 }}>
              <div className="flex flex-col gap-1">
                <h2 id="demo-title" className="t-h2">Explore a demo company</h2>
                <p className="t-small m-0">See a full journey with a sample founder. These are demo companies with sample data, not your own workspace.</p>
              </div>
              <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
                {Object.values(PERSONAS).map(p => (
                  <div key={p.id} className="flex flex-col gap-2 p-4 rounded-2xl" style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}>
                    <div className="flex items-center gap-3">
                      <span aria-hidden className="w-11 h-11 rounded-full grid place-items-center font-extrabold flex-none" style={{ background: `var(${p.color})`, color: 'var(--on-color)' }}>{p.initial}</span>
                      <div className="min-w-0"><div className="t-h3" style={{ fontSize: 17 }}>{p.name}</div><div className="t-small">{p.role}</div></div>
                    </div>
                    <div className="t-strong">{p.idea}: {p.pitch}</div>
                    <span className="pill t-micro self-start" style={{ border: `1px solid var(${p.color})`, color: `var(${p.color})`, padding: '3px 9px', fontSize: 11 }}>{p.pathLabel}</span>
                    <ul className="t-small list-disc pl-5 m-0">{p.blurb.map(b => <li key={b}>{b}</li>)}</ul>
                    <button className="btn mt-auto justify-center" style={{ borderColor: 'var(--line-strong)' }} onClick={() => start(p.id)}>Play as {p.name}</button>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
