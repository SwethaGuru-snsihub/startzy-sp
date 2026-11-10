'use client';
import { useEffect, useState } from 'react';
import { TASK, TASKS, consumers, requiredInputs } from '@/engine/core/register';
import { saveDocEdit, restoreVersion } from '@/features/sp/actions';
import type { Section } from '@/features/sp/content';
import Provenance from '@/features/sp/components/Provenance';
import { agentLook, DISCOVER_TASKS } from '@/features/sp/model';
import { providerOf, versionProvider } from '@/features/sp/provenance';
import { useSp } from '@/features/sp/SpContext';
import { recheckScope, STATUS_LABEL, statusTone } from '@/features/sp/viewModel';
import { FEATURES_OF_TASK } from '@/features/sp/workflow';

type Tab = 'content' | 'versions' | 'feeds' | 'how';
const PHASE_OF = (n: number) => (n <= 5 ? 'Discover' : n <= 8 ? 'Define' : n <= 12 ? 'Design' : 'Delivery');
const stepNo = (home: string) => Number(home.replace(/\D/g, ''));
const discover = new Set<string>(DISCOVER_TASKS);
const planned = TASKS.filter(t => t.workflow === 'SP' && !discover.has(t.id));
const clock = (iso: string) => { const d = new Date(iso); return isNaN(+d) ? '' : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

/* Documentation tab. The documents are the workflow's artifacts: their content and versions, what each
   is built from (and which version), what depends on it, and how it is generated. Approved documents
   can be edited; saving shows what that changes downstream and nothing re-runs until the founder approves. */
export default function DocumentationPage() {
  const { id, rt, core, project, rows, docs, env, docTarget, clearDocTarget, open, toast } = useSp();
  const [sel, setSel] = useState<string>('brief');
  const [tab, setTab] = useState<Tab>('content');
  const [vsel, setVsel] = useState(0);              // 0 = the latest version
  const [draft, setDraft] = useState<string[] | null>(null);   // the section texts while editing
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const stateOf = (t: string) => core.state(project, t);
  const canEdit = (t: string) => discover.has(t) && !!docs.latest(t) && ['approved', 'needs-revalidation'].includes(stateOf(t));

  // Arriving from a popup ("Open in Documentation", "Edit interview notes"): show that document, maybe in edit mode.
  useEffect(() => {
    if (!docTarget) return;
    /* eslint-disable react-hooks/set-state-in-effect -- one-shot hand-off from a popup into this tab */
    setSel(docTarget.task); setTab('content'); setVsel(0); setError(null);
    setDraft(docTarget.edit && canEdit(docTarget.task) ? docs.latest(docTarget.task)!.secs.map(s => s.b) : null);
    /* eslint-enable react-hooks/set-state-in-effect */
    clearDocTarget();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docTarget]);

  const choose = (t: string) => { setSel(t); setTab('content'); setVsel(0); setDraft(null); setError(null); };
  const t = TASK[sel];
  const row = rows.find(r => r.id === sel);
  const isDiscover = !!row;
  const versions = docs.versions(sel);
  const latestV = versions.length;
  const shownV = vsel && vsel < latestV ? vsel : latestV;
  const cur = versions[shownV - 1], prev = versions[shownV - 2];
  const old = shownV !== latestV;
  const generated = rows.filter(r => r.status === 'done').length;
  const provider = cur ? versionProvider(cur) : providerOf(sel, env.idea());   // the version shown, or who will write it
  const owners = [t.owner, ...t.contributors].map(a => agentLook(a).name).join(', ');
  const name = (x: string) => TASK[x]?.artifact ?? x;
  const verOf = (x: string) => project.workflows[TASK[x].workflow].tasks[x].versions.length;

  const afterSave = (e: string | null, message: string) => {
    if (e) { setError(e); return; }
    setDraft(null); setNote(''); setVsel(0); setError(null); toast(message);
    const fresh = rt.getEntry(id);
    if (fresh && fresh.status === 'ready' && recheckScope(core, fresh.project).flagged.length) open({ kind: 'impact' });
  };
  const save = () => {
    if (!cur || !draft) return;
    const secs: Section[] = cur.secs.map((s, i) => ({ ...s, b: s.locked ? s.b : draft[i] ?? s.b }));
    afterSave(saveDocEdit(env, sel, secs, note), `${t.artifact} saved as v${latestV + 1}.`);
  };

  const body = () => {
    if (!isDiscover) {
      return (
        <>
          <div className="sp-banner"><span>Not generated yet. It is created when the workflow reaches {t.home}, after the documents it is built from are approved.</span></div>
          <div className="sp-sec"><h5>Built from</h5><p>{requiredInputs(sel).map(i => `• ${name(i)}`).join('\n') || 'Nothing: this starts from you.'}</p></div>
          <div className="sp-sec"><h5>How it will be generated</h5><p>The owner agent drafts it from the inputs above, a reviewer agent checks it, then it comes to you for approval. If an input changes later, it is re-checked and you approve again.</p></div>
        </>
      );
    }
    if (!cur && tab === 'content') return <div className="sp-banner"><span>Nothing generated yet. It appears here once the agents reach this step.</span></div>;
    if (tab === 'versions') {
      return <>{[...versions].reverse().map(v => (
        <div key={v.v} className="sp-vrow" aria-current={v.v === shownV}>
          <b className="t-log">v{v.v}</b><span><b style={{ fontSize: 13 }}>{v.by}</b><br /><span className="t-small" style={{ fontSize: 12 }}>{v.note} · {clock(v.at)}</span></span>
          <button type="button" className="btn btn-sm" onClick={() => { setVsel(v.v); setTab('content'); setDraft(null); }}>View</button>
        </div>
      ))}</>;
    }
    if (tab === 'feeds') {
      const used = project.workflows[t.workflow].tasks[sel].versions.at(-1)?.pins ?? {};
      const inputs = requiredInputs(sel);
      return (
        <>
          <div className="sp-sec"><h5>Built from</h5>
            {inputs.length ? inputs.map(i => (
              <div key={i} className="sp-row">{discover.has(i) ? <button type="button" className="sp-lnk" onClick={() => choose(i)}>{name(i)}</button> : <b style={{ fontSize: 13 }}>{name(i)}</b>}
                {used[i] ? <span className="sp-pill">used v{used[i]}</span> : null}
                {used[i] && verOf(i) > used[i] ? <span className="sp-pill bad">now v{verOf(i)}</span> : used[i] ? <span className="sp-pill go">up to date</span> : null}</div>
            )) : <p className="t-small">Nothing: this starts from you.</p>}
          </div>
          <div className="sp-sec"><h5>Feeds</h5>
            {consumers(sel).length ? consumers(sel).map(c => <div key={c} className="sp-row">{discover.has(c) ? <button type="button" className="sp-lnk" onClick={() => choose(c)}>{name(c)}</button> : <b style={{ fontSize: 13 }}>{name(c)}</b>}<span className="sp-pill">{discover.has(c) ? STATUS_LABEL[rows.find(r => r.id === c)!.status] : 'Planned'}</span></div>) : <p className="t-small">Nothing depends on this yet.</p>}
            {consumers(sel).length > 0 && <p className="t-small" style={{ fontSize: 12 }}>If you change this document, what was built on it is flagged for re-check and you approve the re-run.</p>}
          </div>
        </>
      );
    }
    if (tab === 'how') {
      const founder = t.owner === 'FOUNDER';
      const steps: [string, string][] = founder
        ? [['You provide it', 'Only you can enter this. Atlas asks for it in Notifications.'], ['Saved as a version', 'Every save is a new version with who made it and why.'], ['Documents built on it re-check', 'They are flagged and re-run after you approve the re-check.']]
        : [['Inputs gathered', requiredInputs(sel).length ? `From: ${requiredInputs(sel).map(name).join(', ')}.` : 'From your idea and answers.'], provider === 'claude-cli'
          ? [`Drafted by ${agentLook(t.owner).name}, written by Claude`, 'Your words went to Claude through the local Claude Code CLI. The answer was checked against a fixed format, and any quote that is not in your words was dropped.'] : [`Drafted by ${agentLook(t.owner).name}`, 'Simulated draft. In the real product a model writes this.'], ...(t.reviewer ? [[`${agentLook(t.reviewer).name}'s check`, provider === 'claude-cli' ? 'A placeholder that passes automatically. It does not read Claude\'s text; your approval is the real review.' : 'Simulated quality review before it reaches you.'] as [string, string]] : []), ['You approve', 'Approve, or send back with a note for a new version.'], ['Kept up to date', 'If an input changes, it is flagged and re-checked after you approve.']];
      return <div className="sp-sec"><h5>Generation steps</h5>{steps.map((s, i) => <div key={i} className="sp-flowrow"><i>{i + 1}</i><span><b>{s[0]}</b><br /><span className="t-small" style={{ fontSize: 12.5 }}>{s[1]}</span></span></div>)}</div>;
    }
    // content
    return (
      <>
        {row && (row.status === 'recheck' || row.status === 'reconfirm' || row.status === 'paused') && !old && (
          <div className="sp-banner bad"><span><b>{STATUS_LABEL[row.status]}.</b> {t.artifact} v{latestV} was built on an older version of what it depends on.</span><button type="button" className="btn btn-sm btn-primary" onClick={() => open({ kind: 'impact' })}>Review impact</button></div>
        )}
        {old && <div className="sp-banner"><span>You are viewing v{shownV}, an older version.</span><button type="button" className="btn btn-sm" onClick={() => setVsel(0)}>Back to latest (v{latestV})</button>{canEdit(sel) && <button type="button" className="btn btn-sm btn-primary" onClick={() => afterSave(restoreVersion(env, sel, shownV), `Restored v${shownV} as v${latestV + 1}.`)}>Restore as new version</button>}</div>}
        {cur.secs.map((s, i) => (
          <div key={s.h} className="sp-sec">
            <h5>{s.h}{s.edited && <span className="sp-pill you" style={{ marginLeft: 8 }}>Edited by you</span>}{prev && !draft && prev.secs.find(x => x.h === s.h)?.b !== s.b && <span className="sp-pill run" style={{ marginLeft: 8 }}>Changed</span>}{draft && s.locked && <span className="sp-pill" style={{ marginLeft: 8 }}>Not editable</span>}</h5>
            {s.hint && <div className="t-small" style={{ fontSize: 11.5 }}>{s.hint}</div>}
            {draft && !s.locked ? <textarea aria-label={s.h} value={draft[i] ?? ''} onChange={e => setDraft(d => (d ? d.map((x, j) => (j === i ? e.target.value : x)) : d))} /> : <p>{s.b}</p>}
          </div>
        ))}
        {draft && (
          <>
            <div className="sp-field"><label htmlFor="sp-chg">What did you change? (optional)</label><input id="sp-chg" type="text" value={note} onChange={e => setNote(e.target.value)} placeholder="For example: changed the target user" /></div>
            {error && <div className="sp-error" role="alert">{error}</div>}
            <div className="sp-foot"><button type="button" className="btn btn-primary" onClick={save}>Save as v{latestV + 1}</button><button type="button" className="btn" onClick={() => { setDraft(null); setError(null); }}>Cancel</button><span className="grow" /><span className="t-small" style={{ fontSize: 12 }}>Saving shows what depends on this before anything re-runs.</span></div>
          </>
        )}
        {!draft && error && <div className="sp-error" role="alert">{error}</div>}
      </>
    );
  };

  const status = row ? STATUS_LABEL[row.status] : 'Planned';
  return (
    <div className="sp-docs" aria-label="Documentation">
      <nav className="sp-card sp-dlist" aria-label="Documents">
        <div className="sp-dh">Generated in Discover · {generated} of {rows.length}</div>
        {rows.map(r => (
          <button key={r.id} type="button" className="sp-ditem" aria-current={sel === r.id} onClick={() => choose(r.id)}>
            <b>{r.artifact}</b><span className="m"><span>{r.step} · {agentLook(r.owner).name}{docs.versions(r.id).length ? ` · v${docs.versions(r.id).length}` : ''}</span><span className={`sp-pill ${statusTone(r.status)}`}>{STATUS_LABEL[r.status]}</span></span>
          </button>
        ))}
        {['Discover', 'Define', 'Design', 'Delivery'].map(g => {
          const list = planned.filter(p => PHASE_OF(stepNo(p.home)) === g);
          return list.length ? (
            <div key={g} style={{ display: 'grid', gap: 6 }}>
              <div className="sp-dh">Planned · {g}</div>
              {list.map(p => <button key={p.id} type="button" className="sp-ditem planned" aria-current={sel === p.id} onClick={() => choose(p.id)}><b>{p.artifact}</b><span className="m"><span>{p.home} · {agentLook(p.owner).name}</span><span className="sp-pill">Planned</span></span></button>)}
            </div>
          ) : null;
        })}
      </nav>
      <section className="sp-card sp-dview" aria-label={t.artifact}>
        <div>
          <div className="t-caps">{t.home} · {t.kind === 'gate' ? 'Gate decision' : 'Document'}</div>
          <div className="sp-row" style={{ justifyContent: 'space-between' }}>
            <h2 className="t-h2" style={{ margin: 0 }}>{t.artifact}</h2>
            <span className="sp-row"><span className={`sp-pill ${row ? statusTone(row.status) : ''}`}>{status}</span>{latestV > 0 && <span className="sp-pill">v{latestV}</span>}{isDiscover && <Provenance provider={provider} />}</span>
          </div>
          <div className="t-small" style={{ marginTop: 4 }}>Made by {owners}{t.reviewer ? ` · reviewed by ${agentLook(t.reviewer).name}` : ''} · approved by you</div>
          {FEATURES_OF_TASK[sel] && <div className="t-small" style={{ marginTop: 2 }}>Feature{FEATURES_OF_TASK[sel].length > 1 ? 's' : ''}: {FEATURES_OF_TASK[sel].join(', ')}</div>}
        </div>
        {isDiscover && (
          <div className="sp-row">
            {t.kind === 'gate' ? <span className="t-small" style={{ fontSize: 12 }}>Decision records change by deciding Gate 1 again.</span>
              : <button type="button" className="btn btn-sm btn-primary" disabled={!canEdit(sel) || old || draft !== null} title={canEdit(sel) ? undefined : 'Only approved documents can be edited'} onClick={() => { setDraft(cur.secs.map(s => s.b)); setTab('content'); setError(null); }}>Edit</button>}
            {row && row.status === 'recheck' && <button type="button" className="btn btn-sm" onClick={() => open({ kind: 'impact' })}>Review re-check</button>}
          </div>
        )}
        {isDiscover && (
          <div className="sp-vtabs" role="tablist">
            {([['content', 'Content'], ['versions', `Versions (${latestV})`], ['feeds', 'Built from & feeds'], ['how', "How it's generated"]] as [Tab, string][]).map(([k, label]) => <button key={k} role="tab" type="button" aria-selected={tab === k} onClick={() => { setTab(k); if (k !== 'content') setDraft(null); }}>{label}</button>)}
          </div>
        )}
        {body()}
      </section>
    </div>
  );
}
