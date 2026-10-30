'use client';

/* Shown after a founder submits an idea. Atlas's summary and clarification questions need the
   idea-understanding service, which is not connected yet, so this screen shows the founder's own
   words and says so. It never summarises, guesses or fills in missing details. */
export default function IdeaIntake({ idea, persisted, onEdit, onBack }: { idea: string; persisted: boolean; onEdit: () => void; onBack: () => void }) {
  const steps = [
    ['Atlas summarises your idea', 'In your own words, so you can correct anything it got wrong.'],
    ['Atlas asks what it needs to know', 'A few clarifying questions, one at a time. Nothing is assumed for you.'],
    ['Your workspace is created', 'Your company, your documents and your AI team, ready to work.'],
  ];
  return (
    <div className="flex flex-col gap-6">
      <section className="panel p-6 sm:p-9 flex flex-col gap-5" aria-labelledby="intake-title">
        <div className="flex flex-col gap-2">
          <div className="t-eyebrow">Your idea</div>
          <h1 id="intake-title" className="t-title" style={{ fontSize: 'clamp(24px, 3.4vw, 30px)' }}>Atlas has your idea</h1>
        </div>
        <figure className="m-0 p-4 sm:p-5 rounded-xl" style={{ background: 'var(--subtle)', border: '1px solid var(--line)' }}>
          <figcaption className="t-caps mb-2">What you told Atlas</figcaption>
          <blockquote className="m-0 whitespace-pre-wrap break-words" style={{ fontSize: 15, lineHeight: 1.6 }}>{idea}</blockquote>
        </figure>
        <div className="flex gap-2 flex-wrap">
          <button className="btn btn-primary" onClick={onEdit}>Edit your idea</button>
          <button className="btn" onClick={onBack}>Back</button>
        </div>
      </section>

      <section className="panel p-6 sm:p-7 flex flex-col gap-4" aria-labelledby="next-title">
        <h2 id="next-title" className="t-h2">What happens next</h2>
        <ol className="m-0 p-0 list-none flex flex-col gap-3">
          {steps.map(([t, d], i) => (
            <li key={t} className="flex gap-3 items-start">
              <span aria-hidden className="w-7 h-7 rounded-full grid place-items-center t-metric flex-none" style={{ background: 'var(--subtle)', border: '1px solid var(--line)', fontSize: 13 }}>{i + 1}</span>
              <span><span className="t-strong block">{t}</span><span className="t-small">{d}</span></span>
            </li>
          ))}
        </ol>
        <p role="status" className="m-0 p-3 rounded-xl t-strong" style={{ background: 'var(--accent-soft)', border: '1px solid var(--accent)', fontWeight: 600 }}>
          These steps are not switched on yet. Atlas&apos;s idea understanding is not connected in this build, so nothing has been summarised or assumed from your text.
          {persisted ? ' Your idea is kept in this browser tab only.' : ' Your browser blocked local storage, so your idea is kept only until you leave this page.'}
        </p>
        <p className="t-small m-0">Want to see how a company runs on Startzy in the meantime? <button className="underline font-bold" onClick={onBack}>Explore a demo company</button>.</p>
      </section>
    </div>
  );
}
