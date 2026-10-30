'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react';
import { S, P, B, def, mutate, completeTask, strong, fit, priceLabel, priceVal, coreCount, growth, lakh, inr, ev, crackFrom, isOk, spendMonths, log, finish, toast, type Block } from '@/engine/engine';
import { GOALS } from '@/engine/personas';
import { Avatar } from '@/components/ui/kit';
import { useRouter } from 'next/navigation';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
type TP = { b: Block; done: () => void };

function Actions({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return <div className="flex items-center gap-2 justify-end flex-wrap pt-1">{hint && <span className="t-small mr-auto">{hint}</span>}{children}</div>;
}
function Opt({ sel, disabled, onClick, children }: { sel?: boolean; disabled?: boolean; onClick?: () => void; children: React.ReactNode }) {
  return <button disabled={disabled} onClick={onClick} className={`opt ${sel ? 'sel' : ''}`}>{children}</button>;
}

function Profile({ done }: TP) {
  return (<>
    <dl className="grid gap-x-3 gap-y-1 text-[14px]" style={{ gridTemplateColumns: 'auto 1fr' }}>
      <dt className="t-caps pt-1">Founder</dt><dd>{P.name} · {P.role}</dd><dt className="t-caps pt-1">Path</dt><dd>{P.pathLabel}</dd><dt className="t-caps pt-1">{P.runwayLabel}</dt><dd>{P.runway} months</dd>
    </dl>
    <div className="flex flex-col gap-2"><div className="t-caps">AI team · optional agents</div>
      {(['CMO', 'COO', 'CRO'] as const).map(k => (
        <label key={k} className="flex items-center gap-2.5 p-2 rounded-xl" style={{ background: 'var(--subtle)' }}>
          <Avatar id={k} /><span className="flex-1 t-strong">{k} · {k === 'CMO' ? 'Maya · Marketing' : k === 'COO' ? 'Omar · Operations' : 'Ravi · Revenue'}</span>
          <input type="checkbox" className="w-4 h-4" checked={!S.off.includes(k)} onChange={e => mutate(s => { s.off = e.target.checked ? s.off.filter((x: string) => x !== k) : [...s.off, k]; })} />
        </label>))}
      <p className="t-small">Switched-off agents wait in the Agent Hub and join automatically when a block needs them.</p>
    </div>
    <Actions><button className="btn btn-primary" onClick={done}>Confirm profile</button></Actions>
  </>);
}
function Goal({ done }: TP) {
  const [idea, setIdea] = useState(S.idea); const [pitch, setPitch] = useState(S.pitch); const [goal, setGoal] = useState(S.goal);
  return (<>
    <label className="flex flex-col gap-1"><span className="t-caps">Idea name</span><input value={idea} maxLength={28} onChange={e => setIdea(e.target.value)} className="px-3 py-2 rounded-lg" style={{ background: 'var(--subtle)', border: '1px solid var(--line)' }} /></label>
    <label className="flex flex-col gap-1"><span className="t-caps">One-line pitch</span><input value={pitch} maxLength={70} onChange={e => setPitch(e.target.value)} className="px-3 py-2 rounded-lg" style={{ background: 'var(--subtle)', border: '1px solid var(--line)' }} /></label>
    <div className="flex flex-col gap-1"><span className="t-caps">Your goal</span><div className="flex flex-wrap gap-1.5">{GOALS.map((g, i) => <button key={g} onClick={() => setGoal(i)} className={`btn btn-sm ${goal === i ? 'btn-primary' : ''}`}>{g}</button>)}</div></div>
    <Actions><button className="btn btn-primary" disabled={!idea.trim()} onClick={() => { mutate(s => { s.idea = idea.trim(); s.pitch = pitch.trim() || P.pitch; s.goal = goal; }); done(); }}>Lock goal and context</button></Actions>
  </>);
}
function Clarify({ done }: TP) {
  const [ans, setAns] = useState<string[]>([]);
  return (<>
    {P.clarify.slice(0, ans.length + 1).map(([q, opts], i) => (
      <div key={q} className="flex flex-col gap-1.5 pop"><div className="t-strong flex items-center gap-2"><span className="pill t-micro px-1.5" style={{ background: 'var(--ag-crew)', color: 'var(--on-color)' }}>QE</span>{q}</div>
        <div className="flex flex-wrap gap-1.5">{opts.map(o => <button key={o} disabled={!!ans[i]} onClick={() => setAns([...ans.slice(0, i), o])} className={`btn btn-sm ${ans[i] === o ? 'btn-primary' : ''}`}>{o}</button>)}</div></div>))}
    <Actions hint={ans.length === 3 ? 'Context complete' : `${ans.length} of 3 answered`}><button className="btn btn-primary" disabled={ans.length < 3} onClick={() => { mutate(s => { s.answers = ans; s.notes += 6; }); done(); }}>Save answers</button></Actions>
  </>);
}
function Interviews({ done }: TP) {
  const [ringing, setRinging] = useState<number | null>(null);
  const call = async (i: number) => { setRinging(i); await sleep(700); setRinging(null); mutate(s => { s.calls.push(i); s.notes += 3; }); log(`You interviewed ${P.contacts[i].who.split(' · ')[0]}.`, 'founder'); };
  const again = isOk('interviews');
  return (<>
    <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
      {P.contacts.map((p, i) => { const c = S.calls.includes(i); return (
        <Opt key={p.who} sel={c} disabled={c || ringing !== null} onClick={() => call(i)}>
          <b className="t-strong">{p.who}</b>
          {c ? <><span className="t-small">“{p.q}”</span><span className="pill t-micro self-start px-2 py-0.5" style={{ background: p.sig === 'strong' ? 'var(--go-soft)' : p.sig === 'weak' ? 'var(--accent-soft)' : 'var(--stop-soft)', color: p.sig === 'strong' ? 'var(--go)' : p.sig === 'weak' ? 'var(--ink)' : 'var(--stop)' }}>{p.sig === 'strong' ? 'Strong signal' : p.sig === 'weak' ? 'Weak signal' : 'No signal: friendly bias'}</span></> : <span className="t-small">{ringing === i ? 'Ringing…' : 'Tap to call'}</span>}
        </Opt>); })}
    </div>
    {S.calls.some((i: number) => P.contacts[i].sig === 'none') && <p className="t-small p-2 rounded-lg" style={{ background: 'var(--stop-soft)', color: 'var(--stop)' }}>People close to you say yes to be kind. That call is not evidence.</p>}
    <Actions hint={`${S.calls.length} calls · ${strong()} strong signals · need 4+`}><button className="btn btn-primary" disabled={S.calls.length < 4} onClick={() => { if (again) { spendMonths(0.5); history.back(); } else done(); }}>Done talking</button></Actions>
  </>);
}
function Model({ b, done }: TP) {
  const [sel, setSel] = useState<number | null>(S.pricing);
  const wasOk = B[b.id].changed;
  return (<>
    <div className="flex flex-col gap-2">{P.pricing.map((o, i) => <Opt key={o.label} sel={sel === i} onClick={() => setSel(i)}><b className="t-strong">{o.label}</b>{sel === i && <span className="t-small" style={{ color: ['var(--stop)', 'var(--ink)', 'var(--go)'][o.fit], fontWeight: 700 }}>{o.note}</span>}</Opt>)}</div>
    <p className="t-small p-2 rounded-lg" style={{ background: 'var(--subtle)' }}><b style={{ color: 'var(--ink)' }}>Market:</b> {P.market[0].replace(/<[^>]+>/g, '')}. Affects: Cost estimate, BRD, PRD, GTM.</p>
    <Actions><button className="btn btn-primary" disabled={sel == null} onClick={() => { mutate(s => { s.pricing = sel; s.bump = 1; }); log(`Business model: ${priceLabel()}.`, 'founder'); done(); if (wasOk) crackFrom('model'); }}>Confirm business model</button></Actions>
  </>);
}
function Deck({ done, kind }: TP & { kind: 'preseed' | 'budget' }) {
  const [mode, setMode] = useState<'choose' | 'deck' | 'ask' | 'result'>(kind === 'budget' ? 'deck' : 'choose');
  const [slide, setSlide] = useState(-1); const [ask, setAsk] = useState<number | null>(null); const [res, setRes] = useState<any>(null);
  const slides: [string, string, string][] = [['Problem', 'Problem statement', P.problem], ['Evidence', `${S.calls.length} interviews`, `${strong()} strong signals`], ['Market', 'Market sizing', P.market[0].replace(/<[^>]+>/g, '')], ['Business model', 'Pricing', priceLabel()], ['Cost', 'Cost estimate', lakh(P.estimate + 2) + ' to launch'], ['Team', 'Founder profile', `${P.name}, ${P.role}, with an AI C-suite`]];
  const build = async () => { for (let i = 0; i < slides.length; i++) { setSlide(i); await sleep(500); } setMode('ask'); };
  const pitch = async () => { const e = ev(), got = e >= 70 ? ask! : e >= 55 ? Math.min(ask!, 1) : 0, yes = e >= 70 ? 3 : e >= 55 ? 2 : 1; const deal = P.fund.asks[got]; setRes({ got, yes, deal }); mutate(s => { s.runway += deal.r; s.raised = deal.l; }); log(`${kind === 'budget' ? 'Budget approved' : 'Pre-seed raised'}: ${deal.l}.`, 'founder'); setMode('result'); };
  if (mode === 'choose') return (<>
    <div className="grid gap-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
      <Opt onClick={() => setMode('deck')}><b className="t-strong">Raise pre-seed now</b><span className="t-small">More runway for the build. Less evidence, so a smaller cheque and more ownership given away.</span></Opt>
      <Opt onClick={() => { mutate(s => { s.deferred = true; }); log('You chose to wait and raise after launch.', 'founder'); done(); }}><b className="t-strong">Wait for traction</b><span className="t-small">Keep ownership. Build on savings, then raise after launch with better terms.</span></Opt>
    </div></>);
  return (<>
    <div className="rounded-xl p-4 flex flex-col justify-between" style={{ aspectRatio: '16/9', background: '#1F2937', color: '#EEF3F8', maxWidth: 560 }}>
      <div className="t-h2">{slide < 0 ? S.idea : slides[slide][0]}</div><div className="text-[14px] opacity-90">{slide < 0 ? S.pitch : slides[slide][2]}</div>
      <span className="t-micro self-start px-2 py-0.5 rounded" style={{ background: 'rgba(255,255,255,.14)' }}>{slide < 0 ? 'Cover' : 'From: ' + slides[slide][1]}</span>
    </div>
    {mode === 'deck' && <Actions><button className="btn btn-primary" onClick={build}>Build the deck from approved blocks</button></Actions>}
    {mode === 'ask' && <><div className="t-small">How much do you ask {P.fund.who} for?</div><div className="flex gap-1.5 flex-wrap">{P.fund.asks.map((a: any, i: number) => <button key={a.l} className={`btn btn-sm ${ask === i ? 'btn-primary' : ''}`} onClick={() => setAsk(i)}>{a.l}</button>)}</div><Actions><button className="btn btn-primary" disabled={ask == null} onClick={pitch}>Pitch to {P.fund.who}</button></Actions></>}
    {mode === 'result' && <><div className="flex gap-3">{P.fund.voters.map((v: string, i: number) => <span key={v} className="pop flex flex-col items-center gap-1 t-micro"><span className="w-8 h-8 rounded-lg grid place-items-center" style={{ background: 'var(--ag-crew)', color: 'var(--on-color)' }}>{v}</span><span style={{ color: i < res.yes ? 'var(--go)' : 'var(--stop)' }}>{i < res.yes ? 'Yes' : 'No'}</span></span>)}</div>
      <div className="p-3 rounded-xl t-strong" style={{ background: 'var(--go-soft)', color: 'var(--go)' }}>{res.got < ask! ? `They offered ${res.deal.l} instead of ${P.fund.asks[ask!].l}.` : `Approved: ${res.deal.l}.`} +{res.deal.r} months.</div>
      <Actions><button className="btn btn-go" onClick={done}>Continue</button></Actions></>}
  </>);
}
function Presell({ done }: TP) {
  const [sent, setSent] = useState<Record<string, boolean>>({});
  const k = [1, 3, 4][fit()]; const n = Object.keys(sent).length;
  const send = (name: string) => { const yes = S.presold < k && n + 1 <= k + 1; if (yes) mutate(s => { s.presold++; }); setSent({ ...sent, [name]: yes }); };
  return (<>
    <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>{P.fund.leads.map((l: string) => <Opt key={l} sel={l in sent} disabled={l in sent} onClick={() => send(l)}><b className="t-strong">{l}</b><span className="t-small">{l in sent ? (sent[l] ? 'Paid in advance' : 'Not now') : 'Send offer: 3 months up front'}</span></Opt>)}</div>
    <Actions hint={`${S.presold} paid · send at least 3`}><button className="btn btn-primary" disabled={n < 3} onClick={() => { const add = +(S.presold * 1.2).toFixed(1); mutate(s => { s.runway += add; }); done(); }}>Use pre-sales to fund the build</button></Actions>
  </>);
}
function Mvp({ done }: TP) {
  const [sel, setSel] = useState<string[]>(S.mvp); const [msg, setMsg] = useState('');
  const core = sel.filter(n => P.features.find(f => f.n === n)!.core).length;
  return (<>
    <div className="flex flex-wrap gap-1.5">{P.features.map(f => { const on = sel.includes(f.n); return <button key={f.n} onClick={() => { if (on) setSel(sel.filter(x => x !== f.n)); else if (sel.length < 4) setSel([...sel, f.n]); else setMsg('Four is the limit. Drop one first. That limit keeps an MVP small.'); }} className="btn btn-sm" style={on ? { background: f.core ? 'var(--go)' : 'var(--ink)', color: 'var(--on-color)', borderColor: 'transparent' } : f.core ? { borderColor: 'var(--go)' } : undefined}>{f.n}</button>; })}</div>
    {msg && <p className="t-small" style={{ color: 'var(--stop)' }}>{msg}</p>}
    <p className="t-small p-2 rounded-lg" style={{ background: 'var(--subtle)' }}><b style={{ color: 'var(--ink)' }}>{sel.length}/4 picked.</b> {core} from interviews, {sel.length - core} extra. Estimate: <b style={{ color: 'var(--ink)' }}>{3 + sel.length - core} sprints</b>. Affects: PRD, Roadmap, Sprints.</p>
    <Actions><button className="btn btn-primary" disabled={sel.length < 2} onClick={() => { mutate(s => { s.mvp = sel; }); log(`MVP scope: ${sel.join(', ')}.`, 'founder'); done(); }}>Lock MVP scope</button></Actions>
  </>);
}
function Company({ done }: TP) {
  const [signed, setSigned] = useState<number[]>([]);
  return (<>
    <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))' }}>{P.company.map((c, i) => <div key={c.t} className="relative p-3 rounded-xl flex flex-col gap-1.5 min-h-[120px]" style={{ background: 'var(--paper)', border: '1px solid var(--line)' }}><b className="t-strong">{c.t}</b><span className="t-small">{c.d}</span>
      {signed.includes(i) ? <span className="pop absolute right-3 bottom-3 px-2 py-0.5 rounded-md t-strong" style={{ border: '3px solid var(--go)', color: 'var(--go)', transform: 'rotate(-12deg)' }}>{P.stampWord}</span> : <button className="btn btn-sm self-start mt-auto" onClick={() => { setSigned([...signed, i]); mutate(s => { s.stamped = signed.length + 1; }); log(`You signed: ${c.t}.`, 'founder'); }}>Sign</button>}</div>)}</div>
    <Actions hint={`${signed.length} of 3 signed`}><button className="btn btn-go" disabled={signed.length < 3} onClick={done}>All signed</button></Actions>
  </>);
}
function Hiring({ done }: TP) {
  const [sel, setSel] = useState<number[]>([]);
  return (<>
    <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>{P.hires.map((h, i) => <Opt key={h.n} sel={sel.includes(i)} onClick={() => setSel(sel.includes(i) ? sel.filter(x => x !== i) : sel.length < 2 ? [...sel, i] : sel)}><b className="t-strong">{h.n}</b><span className="t-small">{h.r}</span><span className="t-small">{h.note}</span><span className="t-micro">{lakh(P.hireCost)} / month</span></Opt>)}</div>
    <Actions><button className="btn btn-primary" disabled={sel.length !== 2} onClick={() => { mutate(s => { s.hires = sel.map(i => P.hires[i]); }); log(`You proposed hiring ${sel.map(i => P.hires[i].n).join(' and ')}.`, 'founder'); done(); }}>Propose these two</button></Actions>
  </>);
}
function Sprints({ done }: TP) {
  const extra = S.mvp.length - coreCount(); const total = 3 + extra;
  const tasks = [...S.mvp.map((f: string) => 'Build: ' + f), 'Set up hosting', 'Test on real phones', ...S.mvp.slice(0, 2).map((f: string) => 'Test: ' + f)];
  const [n, setN] = useState(0); const [bug, setBug] = useState(false); const [seen, setSeen] = useState(false); const [busy, setBusy] = useState(false);
  const per = Math.ceil(tasks.length / total); const doneCount = n >= total ? tasks.length : Math.min(tasks.length, n * per);
  const runOne = async () => { setBusy(true); await sleep(800); setBusy(false); const next = n + 1; setN(next); spendMonths(0.75); log(`Sprint ${next} of ${total} done.`, 'founder'); if (next === 2 && !seen) { setBug(true); setSeen(true); toast('QA found a bug: reminder sent twice'); } };
  return (<>
    <div className="h-2 rounded" style={{ background: 'var(--subtle)' }}><div className="h-2 rounded" style={{ width: `${(n / total) * 100}%`, background: 'var(--go)', transition: 'width .4s' }} /></div>
    <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(3, minmax(0,1fr))' }}>
      {[['To do', tasks.slice(doneCount)], ['Doing', busy ? tasks.slice(doneCount, doneCount + per) : []], ['Done', tasks.slice(0, doneCount)]].map(([t, list]) => (
        <div key={t as string} className="p-2 rounded-xl flex flex-col gap-1.5 min-h-[140px]" style={{ background: 'var(--subtle)' }}><div className="t-caps">{t as string} · {(list as string[]).length}</div>
          {(list as string[]).map(x => <div key={x} className="pop p-1.5 rounded-lg text-[12px]" style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}>{x}</div>)}
          {t === 'Doing' && bug && <div className="p-2 rounded-lg text-[12px] font-bold flex flex-col gap-1" style={{ background: 'var(--stop-soft)', color: 'var(--stop)', border: '1px solid var(--stop)' }}>Bug: reminder sent twice<button className="btn btn-sm self-start" onClick={() => { setBug(false); log('You fixed a duplicate-reminder bug.', 'founder'); }}>Fix it</button></div>}
        </div>))}
    </div>
    <Actions hint={bug ? 'Fix the bug first' : `${total} sprints planned`}>{n >= total ? <button className="btn btn-go" onClick={done}>MVP built</button> : <button className="btn btn-primary" disabled={bug || busy} onClick={runOne}>Run sprint {n + 1} of {total}</button>}</Actions>
  </>);
}
function Beta({ done }: TP) {
  const more = isOk('beta');
  const groups = [{ n: 'People you interviewed', v: Math.max(2, strong() * 2) }, { n: 'Their referrals', v: Math.round(P.betaN / 2) }, { n: 'A cold list', v: Math.round(P.betaN / 4) }];
  const [sel, setSel] = useState<number[]>(more ? [] : [0, 1]); const [count, setCount] = useState<number | null>(null);
  const go = async () => { const add = sel.reduce((a, i) => a + groups[i].v, 0); for (let i = 1; i <= add; i++) { setCount(S.beta + i); await sleep(70); } mutate(s => { s.beta += add; s.betaGroups = [...s.betaGroups, ...sel]; }); log(`${more ? 'More beta users joined' : 'Beta started'}: ${S.beta} ${P.unit} in total.`, 'founder'); if (more) { history.back(); } else done(); };
  return (<>
    <div className="flex flex-col gap-2">{groups.map((g, i) => { const used = S.betaGroups.includes(i); return <Opt key={g.n} sel={sel.includes(i)} disabled={used} onClick={() => setSel(sel.includes(i) ? sel.filter(x => x !== i) : [...sel, i])}><b className="t-strong">{g.n}</b><span className="t-small">{used ? 'Already invited' : `About ${g.v} ${P.unit} likely to join`}</span></Opt>; })}</div>
    {count !== null && <div className="p-3 rounded-xl" style={{ background: 'var(--subtle)' }}><div className="t-caps">Beta {P.unit}</div><div className="t-metric" style={{ fontSize: 22 }}>{count}</div></div>}
    <Actions hint={`Gate 3 needs ${Math.round(P.betaN / 2)}; you have ${S.beta}`}><button className="btn btn-primary" disabled={!sel.length || count !== null} onClick={go}>{more ? 'Invite them' : 'Start a 2-week beta'}</button></Actions>
  </>);
}
function PriceTest({ done }: TP) {
  const best = P.pricing.findIndex(p => p.fit === 2); const p = P.pricing[S.pricing];
  const isBest = S.pricing === best;
  return (<>
    <div className="grid gap-2" style={{ gridTemplateColumns: '1fr 1fr' }}><div className="p-3 rounded-xl" style={{ background: 'var(--subtle)' }}><div className="t-caps">Current price</div><div className="t-strong">{priceLabel()}</div></div><div className="p-3 rounded-xl" style={{ background: 'var(--subtle)' }}><div className="t-caps">Test result</div><div className="t-strong">{isBest ? '+20% accepted' : 'Price too far off'}</div></div></div>
    <p className="t-small p-2 rounded-lg" style={{ background: 'var(--subtle)' }}><b style={{ color: 'var(--ink)' }}>Finding:</b> {isBest ? 'Beta users accepted a 20% higher price with almost no drop-off.' : `Beta users mostly chose "${P.pricing[best].label}".`} Changing the price re-checks every block built on it.</p>
    <Actions>
      <button className="btn" onClick={() => { mutate(s => { s.priceOk = true; }); log('You kept the current price after the test.', 'founder'); done(); }}>Keep the current price</button>
      <button className="btn btn-primary" onClick={() => { mutate(s => { if (isBest) s.bump = 1.2; else { s.pricing = best; s.bump = 1; } s.priceOk = true; }); B.model.ver++; B.model.changed = true; log(`You changed the price to <b>${priceLabel()}</b>.`, 'founder'); done(); crackFrom('model'); }}>{isBest ? `Raise to ${inr(p.val * 1.2)}` : `Switch to ${P.pricing[best].label}`}</button>
    </Actions>
  </>);
}
function Launch({ done }: TP) {
  const [sel, setSel] = useState<number[]>([]); const [cnt, setCnt] = useState<number | null>(null); const [doneRun, setDoneRun] = useState(false);
  const go = async () => { const score = sel.reduce((a, i) => a + P.channels[i].v, 0); const target = Math.max(4, Math.round(score * 10 * [0.3, 0.6, 1][fit()] * (0.6 + ev() / 250))); for (let d = 1; d <= 30; d++) { setCnt(Math.round(target * d / 30)); await sleep(45); } mutate(s => { s.customers = target; }); log(`Launch: ${target} ${P.unit} in 30 days.`, 'founder'); setDoneRun(true); };
  return (<>
    <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>{P.channels.map((c, i) => <Opt key={c.n} sel={sel.includes(i)} disabled={cnt !== null} onClick={() => setSel(sel.includes(i) ? sel.filter(x => x !== i) : sel.length < 2 ? [...sel, i] : sel)}><b className="t-strong">{c.n}</b></Opt>)}</div>
    {cnt !== null && <div className="grid gap-2" style={{ gridTemplateColumns: '1fr 1fr' }}><div className="p-3 rounded-xl" style={{ background: 'var(--subtle)' }}><div className="t-caps">New {P.unit}</div><div className="t-metric" style={{ fontSize: 22 }}>{cnt}</div></div><div className="p-3 rounded-xl" style={{ background: 'var(--subtle)' }}><div className="t-caps">{P.revLabel}</div><div className="t-metric" style={{ fontSize: 22 }}>{inr(cnt * priceVal())}</div></div></div>}
    <Actions>{doneRun ? <button className="btn btn-go" onClick={done}>Open the roof</button> : <button className="btn btn-primary" disabled={sel.length !== 2 || cnt !== null} onClick={go}>Launch: first 30 days</button>}</Actions>
  </>);
}
function Scale() {
  const router = useRouter(); const g = growth(); const funded = P.path === 'funded';
  const note = funded ? (S.deferred ? `You waited. With ${g.end} ${P.unit} and ${g.ret}% retention, investors offer better terms than at the business case.` : `You raised ${S.raised || 'pre-seed'} earlier. Your updated deck now has real traction.`) : P.scaleNote;
  const end = (m: string) => { log(m, 'founder'); finish(); router.push('/'); };
  return (<>
    <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
      <div className="p-3 rounded-xl" style={{ background: 'var(--subtle)' }}><div className="t-caps">{P.unit}</div><div className="t-metric" style={{ fontSize: 22 }}>{g.end}</div></div>
      <div className="p-3 rounded-xl" style={{ background: 'var(--subtle)' }}><div className="t-caps">{P.revLabel}</div><div className="t-metric" style={{ fontSize: 22 }}>{inr(g.end * priceVal())}</div></div>
      <div className="p-3 rounded-xl" style={{ background: 'var(--subtle)' }}><div className="t-caps">Retention</div><div className="t-metric" style={{ fontSize: 22, color: g.ret > 60 ? 'var(--go)' : 'var(--stop)' }}>{g.ret}%</div></div>
    </div>
    <p className="t-small p-2 rounded-lg" style={{ background: 'var(--subtle)' }}><b style={{ color: 'var(--ink)' }}>Funding:</b> {note}</p>
    <Actions><button className="btn" onClick={() => end('You chose to keep going and improve retention.')}>Keep going as is</button><button className="btn btn-go" onClick={() => end(`You chose to <b>${P.scale.toLowerCase()}</b>.`)}>{P.scale}</button></Actions>
  </>);
}

const MAP: Record<string, (p: TP) => React.ReactNode> = {
  profile: Profile, goal: Goal, clarify: Clarify, interviews: Interviews, model: Model, preseed: p => <Deck {...p} kind="preseed" />, budget: p => <Deck {...p} kind="budget" />,
  presell: Presell, mvp: Mvp, company: Company, hiring: Hiring, sprints: Sprints, beta: Beta, pricetest: PriceTest, launch: Launch, scale: () => <Scale />,
};
export default function TaskBody({ id }: { id: string }) {
  const b = def(id); const router = useRouter();
  const done = () => { completeTask(id); router.push(b.chain ? `/block/${id}` : '/hq'); };
  const C = MAP[b.task!];
  return <div className="flex flex-col gap-3">{C({ b, done })}</div>;
}
