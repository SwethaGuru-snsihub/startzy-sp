'use client';
import { useState } from 'react';
import { EXAMPLE_IDEA, ideaContext, isIdeaReady, START_OPTIONS, type AnswerKey, type IdeaInput, type StartOption } from '../idea';
import { Face } from './Avatar';
import Modal from './Modal';

/* The first step of Solution Planning, over the Agent Office: Atlas asks where the founder is starting
   from, then Asha asks three questions shaped by what they wrote. It cannot be dismissed: the project
   has nothing to work on until the founder answers. Submitting records the founder's own tasks. */
export default function StartPopup({ userName, onStart }: { userName: string; onStart: (idea: IdeaInput) => string | null }) {
  const [step, setStep] = useState<1 | 2>(1);
  const [option, setOption] = useState<StartOption | ''>('');
  const [text, setText] = useState('');
  const [name, setName] = useState('');
  const [answers, setAnswers] = useState<Partial<Record<AnswerKey, string>>>({});
  const [error, setError] = useState<string | null>(null);

  const ctx = ideaContext(text, option || 'idea');
  const chosen = START_OPTIONS.find(o => o.id === option);
  const ready = !!answers.a1 && !!answers.a2 && !!answers.a3;

  const submit = () => {
    if (!option || !ready) return;
    const q2 = ctx.questions[1].q;
    const problem = onStart({ option, text: text.trim(), name: (name || ctx.name).trim(), q2, answers: { a1: answers.a1!, a2: answers.a2!, a3: answers.a3! } });
    setError(problem);
  };

  if (step === 1) {
    return (
      <Modal locked label="Start your idea">
        <div className="sp-who"><Face id="CEO" size={44} /><div><div className="t-caps">Atlas · CEO · Step 1 of 2</div><h2>Let&apos;s start building your idea.</h2></div></div>
        <div className="sp-say">Welcome, {userName}. Tell me where you are and I will put the right agents on it. The Discovery room opens as soon as you submit.</div>
        <div className="sp-opts" role="group" aria-label="Where are you starting from">
          {START_OPTIONS.map(o => (
            <button key={o.id} type="button" className={`opt ${option === o.id ? 'sel' : ''}`} aria-pressed={option === o.id} onClick={() => setOption(o.id)}>
              <span className="t-strong">{o.title}</span><span className="t-small">{o.hint}</span>
            </button>
          ))}
        </div>
        <div className="sp-field">
          <label htmlFor="sp-idea">{chosen ? chosen.placeholder : 'Choose an option, then describe it in your own words'}</label>
          <textarea id="sp-idea" value={text} onChange={e => setText(e.target.value)} placeholder={chosen?.placeholder ?? 'Your idea or problem'} />
          <div className="sp-row"><button type="button" className="btn btn-sm" onClick={() => { setText(EXAMPLE_IDEA); if (!option) setOption('idea'); }}>Use an example</button><span className="t-small" style={{ fontSize: 12 }}>At least a sentence, so the agents have something to work with.</span></div>
        </div>
        <div className="sp-foot"><span className="sp-sim">SIMULATED OUTPUTS</span><span className="grow" /><button type="button" className="btn btn-primary" disabled={!isIdeaReady(option, text)} onClick={() => setStep(2)}>Continue</button></div>
      </Modal>
    );
  }

  return (
    <Modal locked label="Three questions">
      <div className="sp-who"><Face id="CSO" size={44} /><div><div className="t-caps">Asha · Strategy · Step 2 of 2</div><h2>Three quick questions</h2></div></div>
      <div className="sp-say">Thanks. I read “{text.trim().length > 110 ? text.trim().slice(0, 109) + '…' : text.trim()}”. These answers shape your Idea Brief, so pick the closest fit.</div>
      <div className="sp-field"><label htmlFor="sp-name">What shall we call it for now?</label><input id="sp-name" type="text" value={name || ctx.name} maxLength={60} onChange={e => setName(e.target.value)} /></div>
      {ctx.questions.map(q => (
        <div key={q.key} className="sp-field" role="group" aria-label={q.q}>
          <span className="lbl">{q.q}</span>
          <div className="sp-chips">{q.options.map(o => <button key={o} type="button" aria-pressed={answers[q.key] === o} onClick={() => setAnswers(a => ({ ...a, [q.key]: o }))}>{o}</button>)}</div>
        </div>
      ))}
      <p className="t-small" style={{ fontSize: 12, margin: 0 }}>Starting records your founder profile, your idea and these answers as your own work. Every approval from here comes to you.</p>
      {error && <div className="sp-error" role="alert">{error}</div>}
      <div className="sp-foot"><button type="button" className="btn" onClick={() => setStep(1)}>Back</button><span className="grow" /><button type="button" className="btn btn-primary" disabled={!ready} onClick={submit}>Start planning</button></div>
    </Modal>
  );
}
