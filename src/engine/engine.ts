/* eslint-disable @typescript-eslint/no-explicit-any */
// Founder HQ engine. A faithful TypeScript port of the v3 prototype engine
// (blocks, maker -> checker -> approver chain, delegation routing, gates, ripple re-check),
// extended with the approved room -> engine -> agent visualisation (docs/screen-plans/04, 06).
import { GOALS, PERSONAS, type Persona } from './personas';
import { AGENTS, ENGINES, STAGES, type AgentId } from './model';

export type Status = 'idle' | 'locked' | 'ready' | 'building' | 'review' | 'approving' | 'inbox' | 'approved' | 'cracked' | 'skipped';
type Block = {
  id: string; f: number; name: string; short: string; kind: 'auto' | 'task'; tag: 'sp' | 'sz'; mod: string;
  owner: AgentId; crew: AgentId[]; needs: string[]; engine: string; checker?: AgentId; ap?: 'doc' | 'money';
  amount?: () => number; issue?: { when: () => boolean; text: () => string }; lines?: () => string[];
  price?: boolean; opt?: boolean; path?: Persona['path']; cost?: number; chain?: boolean; say?: () => string; task?: string; place?: string;
};
type Runtime = { st: Status; ver: number; p: number; cm: { k: AgentId; t: string; tone?: 'warn' | 'ok' }[]; by?: AgentId; lines?: string[] | null; bounced?: boolean; changed?: boolean; doneAt?: number };

// ---------------------------------------------------------------- state
export let P: Persona = PERSONAS.veejay;
export const S: any = {};
export const B: Record<string, Runtime> = {};
export const LOC: Partial<Record<AgentId, string>> = {};
export const BUBBLES: Partial<Record<AgentId, { text: string; until: number }>> = {};
let speed = 1; let version = 0; let tick = 0;
const listeners = new Set<() => void>();
export const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export const getVersion = () => version;
const emit = () => { version++; listeners.forEach(l => l()); };
const wait = (ms: number) => new Promise(r => setTimeout(r, ms / speed));
export const setSpeed = (s: number) => { speed = s; emit(); };
export const getSpeed = () => speed;

const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');
export const lakh = (n: number) => '₹' + (Math.round(n * 10) / 10) + ' lakh';
export { inr };

// ---------------------------------------------------------------- derived helpers
export const strong = () => S.calls.filter((i: number) => P.contacts[i].sig === 'strong').length;
export const price = () => (S.pricing == null ? null : P.pricing[S.pricing]);
export const priceLabel = () => { const p = price(); if (!p) return 'not set'; return S.bump !== 1 ? p.label.replace(/₹[\d,]+/, m => inr(+m.replace(/[₹,]/g, '') * S.bump)) : p.label; };
export const priceVal = () => (price() ? price()!.val * S.bump : 0);
export const fit = () => (price() ? price()!.fit : 1);
export const coreCount = () => S.mvp.filter((n: string) => P.features.find(f => f.n === n)!.core).length;
export const isOk = (id: string) => B[id] && B[id].st === 'approved';
export function ev() {
  let e = 0;
  S.calls.forEach((i: number) => { const s = P.contacts[i].sig; e += s === 'strong' ? 12 : s === 'weak' ? 5 : 0; });
  if (isOk('research')) e += 8; if (isOk('brief')) e += 4; if (isOk('personas')) e += 4;
  if (S.pricing != null) e += [0, 4, 8][fit()];
  if (S.pmf != null) e += Math.round(S.pmf / 5);
  if (S.customers) e += Math.min(8, Math.round(S.customers / 8));
  return Math.min(100, e);
}
export const growth = () => { const f = fit(); const g = [0.8, 1.6, 3.2][f], ret = [38, 64, 88][f]; return { end: Math.round(S.customers * g), ret }; };

// ---------------------------------------------------------------- blocks (v3 recipes + engine)
const d = (o: Block) => o;
export const BLOCKS: Block[] = [
  d({ id: 'profile', f: 0, name: 'Founder profile', short: 'Profile', kind: 'task', tag: 'sz', mod: 'Startzy · Onboarding', owner: 'CEO', crew: [], needs: [], cost: 0, engine: 'E04', place: 'E04', task: 'profile',
    say: () => `Welcome, ${P.name}. I'm Atlas, your AI CEO. I'll run the office; you own it. Confirm who you are and choose which optional agents to switch on.` }),
  d({ id: 'goal', f: 0, name: 'Goal & idea context', short: 'Goal', kind: 'task', tag: 'sp', mod: 'SP1 Idea Definition', owner: 'CEO', crew: [], needs: ['profile'], cost: 0, engine: 'E04', place: 'E04', task: 'goal',
    say: () => 'Tell me what you want to build and why. This goal is the context every other block is built from.' }),
  d({ id: 'clarify', f: 0, name: 'Clarification', short: 'Clarify', kind: 'task', tag: 'sp', mod: 'Question engine', owner: 'CPO', crew: [], needs: ['goal'], cost: 0.1, engine: 'E05', place: 'E05', task: 'clarify',
    say: () => "The question engine found three gaps in your idea. Answer them so the crew doesn't guess." }),
  d({ id: 'brief', f: 0, name: 'Idea Brief', short: 'Idea Brief', kind: 'auto', tag: 'sp', mod: 'SP1 Idea Definition', owner: 'CSO', crew: ['BA'], needs: ['goal', 'clarify'], checker: 'CQRO', ap: 'doc', engine: 'E14',
    lines: () => [`<b>Idea:</b> ${S.idea}: ${S.pitch}`, `<b>Goal:</b> ${GOALS[S.goal]}`, `<b>Who has the problem:</b> ${S.answers[0] || P.customer}`, `<b>Today they:</b> ${(S.answers[1] || '').toLowerCase()}`, `<b>They would switch for:</b> ${(S.answers[2] || '').toLowerCase()}`, `<b>Problem:</b> ${P.problem}`] }),
  d({ id: 'research', f: 1, name: 'Desk research', short: 'Research', kind: 'auto', tag: 'sp', mod: 'SP2 Problem Discovery', owner: 'CSO', crew: [], needs: ['brief'], checker: 'BA', ap: 'doc', engine: 'E06', lines: () => P.research }),
  d({ id: 'interviews', f: 1, name: 'Customer interviews', short: 'Interviews', kind: 'task', tag: 'sp', mod: 'SP2 Problem Discovery', owner: 'CPO', crew: [], needs: ['brief'], cost: 1, engine: 'E11', place: 'E11', task: 'interviews',
    say: () => 'No agent can do this for you. Call at least 4 people. Ask about the last time it happened, not whether they like your idea.' }),
  d({ id: 'problem', f: 1, name: 'Problem statement', short: 'Problem', kind: 'auto', tag: 'sp', mod: 'SP2 Problem Discovery', owner: 'CSO', crew: ['BA'], needs: ['research', 'interviews'], checker: 'CQRO', ap: 'doc', engine: 'E14',
    issue: { when: () => S.calls.some((i: number) => P.contacts[i].sig === 'none'), text: () => 'One quote came from someone close to you. I removed it from the evidence.' },
    lines: () => [`<b>Problem:</b> ${P.problem}`, `<b>Evidence:</b> ${S.calls.length} interviews, ${strong()} strong signals`, `<b>Best quote:</b> "${(P.contacts[S.calls.find((i: number) => P.contacts[i].sig === 'strong')] || P.contacts[0]).q}"`, P.research[1]] }),
  d({ id: 'market', f: 2, name: 'Market sizing', short: 'Market', kind: 'auto', tag: 'sp', mod: 'SP3 Opportunity', owner: 'CMO', crew: [], needs: ['problem'], checker: 'CFO', ap: 'doc', engine: 'E08',
    issue: { when: () => true, text: () => 'The first draft counted the whole country. I narrowed it to the first city you can really reach.' }, lines: () => P.market }),
  d({ id: 'personas', f: 2, name: 'User personas', short: 'Personas', kind: 'auto', tag: 'sp', mod: 'SP3 User personas', owner: 'CPO', crew: ['BA'], needs: ['problem'], checker: 'CMO', ap: 'doc', engine: 'E15', lines: () => P.personas }),
  d({ id: 'competitors', f: 2, name: 'Competitor map', short: 'Competitors', kind: 'auto', tag: 'sp', mod: 'SP3 Opportunity', owner: 'CSO', crew: [], needs: ['problem'], checker: 'CTO', ap: 'doc', engine: 'E09', lines: () => P.competitors }),
  d({ id: 'model', f: 3, name: 'Pricing & business model', short: 'Pricing', kind: 'task', tag: 'sp', mod: 'SP5 Business Model', owner: 'CFO', crew: [], needs: ['market', 'personas'], cost: 0.3, engine: 'E25', place: 'office', task: 'model',
    say: () => 'I tested three ways to make money with the people you interviewed. The choice is yours.' }),
  d({ id: 'estimate', f: 3, name: 'Cost estimate', short: 'Estimate', kind: 'auto', tag: 'sp', mod: 'SP5 Business case', owner: 'CFO', crew: ['PM'], needs: ['model', 'competitors'], checker: 'CTO', ap: 'money', amount: () => P.estimate + 2, engine: 'E25',
    issue: { when: () => true, text: () => 'Integration effort is too low. I added 2 weeks of work (+₹2 lakh).' },
    lines: () => [`<b>Build cost to launch:</b> ${lakh(P.estimate + 2)}`, `<b>Includes:</b> team for ${P.path === 'bootstrap' ? '4' : '6'} months, cloud, messaging costs`, '<b>Checked by CTO:</b> integration effort raised by 2 weeks', `<b>Break-even:</b> about ${Math.max(20, Math.round((P.estimate + 2) * 100000 / Math.max(1, priceVal()) / 12))} ${P.unit} paying for a year`] }),
  d({ id: 'brd', f: 3, name: 'BRD', short: 'BRD', kind: 'auto', tag: 'sp', mod: 'SP7 Documents · BRD', owner: 'CSO', crew: ['BA', 'PM'], needs: ['model', 'estimate', 'problem'], checker: 'CQRO', ap: 'doc', price: true, engine: 'E14',
    lines: () => [`<b>Business problem:</b> ${P.problem}`, `<b>Evidence:</b> ${S.calls.length} interviews, ${strong()} strong signals`, `<b>Business model:</b> ${priceLabel()}`, P.market[0], `<b>Budget to launch:</b> ${lakh(P.estimate + 2)}`] }),
  d({ id: 'preseed', f: 3, path: 'funded', opt: true, name: 'Pre-seed decision', short: 'Pre-seed?', kind: 'task', tag: 'sz', mod: 'Startzy · Funding', owner: 'CFO', crew: [], needs: ['brd'], cost: 0.5, engine: 'E26', place: 'E26', task: 'preseed',
    say: () => "Optional. You can raise a small pre-seed round now, on the business case, or wait and raise later with real traction. Both are normal. Here's the trade-off." }),
  d({ id: 'presell', f: 3, path: 'bootstrap', opt: true, name: 'Pre-sell offer', short: 'Pre-sell', kind: 'task', tag: 'sz', mod: 'Startzy · Revenue-first funding', owner: 'CRO', crew: [], needs: ['brd'], cost: 0.5, engine: 'E12', place: 'E12', task: 'presell',
    say: () => 'Optional. No investors on your path, so early sales fund the build. Send the offer to people who said they had the problem.' }),
  d({ id: 'budget', f: 3, path: 'enterprise', name: 'Budget approval', short: 'Budget', kind: 'task', tag: 'sz', mod: 'Startzy · Budget approval', owner: 'CFO', crew: [], needs: ['brd'], cost: 0.5, engine: 'E26', place: 'E26', task: 'budget',
    say: () => 'Inside a company, the business case has to win a budget. I built the deck from your vault. You present it.' }),
  d({ id: 'mvp', f: 4, name: 'MVP scope', short: 'MVP scope', kind: 'task', tag: 'sp', mod: 'SP6 Product Definition', owner: 'CPO', crew: [], needs: ['brd', 'personas'], cost: 0.3, engine: 'E16', place: 'office', task: 'mvp',
    say: () => 'Pick up to 4 features. Green ones came from your interviews. Every extra feature adds a sprint.' }),
  d({ id: 'prd', f: 4, name: 'PRD', short: 'PRD', kind: 'auto', tag: 'sp', mod: 'SP7 Documents · PRD', owner: 'CPO', crew: ['BA', 'PM', 'TPM'], needs: ['mvp'], checker: 'CQRO', ap: 'doc', price: true, engine: 'E14',
    lines: () => [`<b>MVP:</b> ${S.mvp.join(', ')}`, `<b>Out of scope:</b> ${P.features.filter(f => !S.mvp.includes(f.n)).map(f => f.n).join(', ')}`, `<b>Story 1:</b> ${P.stories[0]}`, `<b>Story 2:</b> ${P.stories[1]}`, `<b>Plans & pricing screen:</b> ${priceLabel()}`] }),
  d({ id: 'roadmap', f: 4, name: 'Release roadmap', short: 'Roadmap', kind: 'auto', tag: 'sp', mod: 'SP6 Product Definition', owner: 'CTO', crew: ['TPM', 'PM'], needs: ['prd'], checker: 'CFO', ap: 'doc', engine: 'E16',
    issue: { when: () => coreCount() < S.mvp.length, text: () => `Features nobody asked for add ${S.mvp.length - coreCount()} sprint(s). Flagging the runway cost.` },
    lines: () => [`<b>Sprints to MVP:</b> ${3 + S.mvp.length - coreCount()}`, `<b>Release 1:</b> ${S.mvp.slice(0, 2).join(', ')}`, `<b>Release 2:</b> ${S.mvp.slice(2).join(', ') || 'polish'}`] }),
  d({ id: 'stories', f: 5, name: 'User stories & backlog', short: 'Backlog', kind: 'auto', tag: 'sp', mod: 'SP8 Stories & backlog', owner: 'CPO', crew: ['BA', 'PM'], needs: ['prd'], checker: 'CQRO', ap: 'doc', engine: 'E15',
    lines: () => [...P.stories.map(s => `<b>Story:</b> ${s}`), `<b>Backlog:</b> ${S.mvp.length * 3 + 4} items, sized and prioritised`] }),
  d({ id: 'wires', f: 5, name: 'Wireframes', short: 'Wireframes', kind: 'auto', tag: 'sp', mod: 'SP8 UX Foundation', owner: 'CPO', crew: ['UX'], needs: ['stories'], checker: 'BA', ap: 'doc', engine: 'E17', lines: () => S.mvp.map((f: string) => `<b>Screen:</b> ${f}`) }),
  d({ id: 'srs', f: 5, name: 'SRS', short: 'SRS', kind: 'auto', tag: 'sp', mod: 'SP7 Documents · SRS', owner: 'CTO', crew: ['BA'], needs: ['stories'], checker: 'CQRO', ap: 'doc', engine: 'E18',
    lines: () => [`<b>Functional:</b> ${S.mvp.length * 4} requirements, each linked to a story`, '<b>Quality:</b> works on low-cost Android phones; messages within 1 minute', '<b>Trace:</b> every requirement links back to the PRD'] }),
  d({ id: 'sad', f: 5, name: 'Architecture (SAD)', short: 'SAD', kind: 'auto', tag: 'sp', mod: 'SP9 Architecture', owner: 'CTO', crew: [], needs: ['srs', 'wires'], checker: 'CQRO', ap: 'doc', engine: 'E18',
    issue: { when: () => true, text: () => 'No data-retention rule for phone numbers. Added one before approval.' },
    lines: () => P.arch.map((a, i) => `<b>${['Integration', 'Data', 'Privacy'][i]}:</b> ${a}`) }),
  d({ id: 'company', f: 6, name: 'Company setup', short: 'Company', kind: 'task', tag: 'sz', mod: 'Startzy · Company setup', owner: 'COO', crew: [], needs: ['brd'], cost: 0.5, engine: 'E23', place: 'E23', task: 'company',
    say: () => 'Only you can sign these. I prepared each one.' }),
  d({ id: 'hiring', f: 6, name: 'Hiring plan', short: 'Hiring', kind: 'task', chain: true, tag: 'sz', mod: 'Startzy · Team & roles', owner: 'COO', crew: [], needs: ['roadmap'], checker: 'CFO', ap: 'money', engine: 'E24', place: 'E24', task: 'hiring', cost: 0.3,
    amount: () => S.hires.length * P.hireCost * 12 + S.hires.filter((h: any) => !h.fit).length * 4,
    say: () => 'Pick two people. After you choose, Farah checks the cost and it goes for approval like any other spend.',
    lines: () => [...S.hires.map((h: any) => `<b>${h.n}:</b> ${h.r}`), `<b>Cost for 12 months:</b> ${lakh(S.hires.length * P.hireCost * 12 + S.hires.filter((h: any) => !h.fit).length * 4)}`] }),
  d({ id: 'team', f: 6, name: 'Project & team setup', short: 'Team setup', kind: 'auto', tag: 'sz', mod: 'Startzy · Project setup', owner: 'COO', crew: ['TPM', 'PM'], needs: ['hiring'], checker: 'CTO', ap: 'doc', engine: 'E24',
    lines: () => [`<b>Team:</b> ${S.hires.map((h: any) => h.n).join(', ')} + AI crew`, '<b>Rituals:</b> 2-week sprints, weekly demo', '<b>Tools:</b> backlog, repo and test plan set up'] }),
  d({ id: 'sprints', f: 7, name: 'Build in sprints', short: 'Sprints', kind: 'task', tag: 'sp', mod: 'SP10 Tasks → Solution Builder', owner: 'CTO', crew: ['TPM', 'QA'], needs: ['team', 'sad', 'stories'], cost: 0, engine: 'E19', place: 'E19', task: 'sprints',
    say: () => "The backlog is broken into sprints. You're the product owner: run each sprint and handle what comes up." }),
  d({ id: 'testplan', f: 7, name: 'Test plan', short: 'Test plan', kind: 'auto', tag: 'sp', mod: 'SP10 Test plan (ISO/IEC/IEEE 29119)', owner: 'QA', crew: ['TPM'], needs: ['sprints'], checker: 'CQRO', ap: 'doc', engine: 'E19',
    lines: () => ['<b>Scope:</b> every MVP feature', ...S.mvp.map((f: string) => `<b>Test:</b> ${f}`), '<b>Devices:</b> 3 phone models', '<b>Result:</b> all core flows pass'] }),
  d({ id: 'handoff', f: 7, name: 'Handoff to Solution Builder', short: 'Handoff', kind: 'auto', tag: 'sp', mod: 'SP10 Release & handoff', owner: 'CTO', crew: ['QA', 'TPM'], needs: ['testplan'], checker: 'CQRO', ap: 'doc', engine: 'E19',
    lines: () => [`<b>Release notes:</b> ${S.mvp.length} features`, '<b>Package:</b> PRD, SRS, SAD, backlog, test plan', '<b>Handover:</b> Solution Planning ends here; the package moves to Solution Builder'] }),
  d({ id: 'beta', f: 8, name: 'Beta users', short: 'Beta', kind: 'task', tag: 'sz', mod: 'Validate · beta', owner: 'CPO', crew: [], needs: ['handoff', 'company'], cost: 1, engine: 'E12', place: 'E12', task: 'beta',
    say: () => 'Before launch, real users try it. Invite people. Start with the ones you interviewed.' }),
  d({ id: 'pmf', f: 8, name: 'PMF survey', short: 'PMF survey', kind: 'auto', tag: 'sz', mod: 'Validate · PMF survey', owner: 'CPO', crew: [], needs: ['beta'], checker: 'CQRO', ap: 'doc', cost: 0.3, engine: 'E13',
    lines: () => [`<b>Question:</b> How would you feel if you could no longer use ${S.idea}?`, `<b>Very disappointed:</b> ${S.pmf}% (benchmark: 40%)`, `<b>Asked:</b> ${S.beta} beta ${P.unit}`] }),
  d({ id: 'pricetest', f: 8, name: 'Pricing test', short: 'Price test', kind: 'task', tag: 'sz', mod: 'Validate · pricing test', owner: 'CFO', crew: [], needs: ['beta'], cost: 0.3, engine: 'E13', place: 'office', task: 'pricetest',
    say: () => "I showed beta users two prices. Here's what they did. If you change the price, every block that uses it needs re-inspection." }),
  d({ id: 'gtm', f: 9, name: 'GTM plan', short: 'GTM', kind: 'auto', tag: 'sz', mod: 'Startzy · Launch hub', owner: 'CMO', crew: [], needs: ['pmf'], checker: 'CRO', ap: 'doc', price: true, engine: 'E12',
    lines: () => [`<b>Who:</b> ${P.customer}`, `<b>Message:</b> ${S.pitch}`, `<b>Price:</b> ${priceLabel()}`, '<b>Channels:</b> where interviewees already spend time'] }),
  d({ id: 'support', f: 9, name: 'PR & support plan', short: 'PR & support', kind: 'auto', tag: 'sz', mod: 'Startzy · Launch hub', owner: 'COO', crew: [], needs: ['gtm'], checker: 'CMO', ap: 'doc', engine: 'E14',
    lines: () => ['<b>Support:</b> WhatsApp help line, 2-hour reply', '<b>PR:</b> 3 customer stories from the beta', '<b>Escalation:</b> bugs to the dev team within a day'] }),
  d({ id: 'launch', f: 9, name: 'Launch day', short: 'Launch', kind: 'task', tag: 'sz', mod: 'Startzy · Launch', owner: 'CMO', crew: ['CRO'], needs: ['gtm', 'support'], cost: 1, engine: 'E12', place: 'E12', task: 'launch',
    say: () => 'Pick two channels. The best ones are where your customers already are.' }),
  d({ id: 'metrics', f: 10, name: 'Metrics review', short: 'Metrics', kind: 'auto', tag: 'sz', mod: 'Startzy · Measure & grow', owner: 'CFO', crew: [], needs: ['launch'], checker: 'CRO', ap: 'doc', cost: 6, engine: 'E03',
    lines: () => { const g = growth(); return [`<b>${P.unit}:</b> ${g.end} after 6 months`, `<b>${P.revLabel}:</b> ${inr(g.end * priceVal())}`, `<b>Still active after 3 months:</b> ${g.ret}%`]; } }),
  d({ id: 'scale', f: 10, name: 'Scale & funding plan', short: 'Scale', kind: 'task', tag: 'sz', mod: 'Startzy · Scale & fund', owner: 'CFO', crew: ['CEO'], needs: ['metrics'], cost: 0, engine: 'E25', place: 'E25', task: 'scale',
    say: () => 'Six months of real numbers. This is the moment to decide how to grow, and how to fund it.' }),
];
export const active = () => BLOCKS.filter(b => !b.path || b.path === P.path);
export const def = (id: string) => BLOCKS.find(b => b.id === id)!;
const on = (id: string) => { const b = def(id); return !!b && (!b.path || b.path === P.path); };
export function st(id: string): Status {
  const b = def(id), r = B[id];
  if (r.st !== 'idle') return r.st;
  if (b.f > S.floor) return 'locked';
  return b.needs.every(n => !on(n) || ['approved', 'cracked', 'skipped'].includes(B[n].st)) ? 'ready' : 'locked';
}
export function approverFor(b: Block): AgentId {
  if (b.ap === 'money') { const a = b.amount!(); if (S.deleg === 2 && a <= 50) return 'CEO'; if (S.deleg === 1 && a <= 10) return 'CEO'; return 'YOU'; }
  return S.deleg >= 1 ? 'CEO' : 'YOU';
}
export type { Block };

// ---------------------------------------------------------------- agents, bubbles, activity
const home = (k: AgentId) => AGENTS[k].home;
export const placeOf = (k: AgentId) => (S.off?.includes(k) ? 'lounge' : LOC[k] || home(k));
function moveTo(keys: AgentId[], place: string, text?: string) { keys.forEach(k => { LOC[k] = place; S.off = S.off.filter((x: AgentId) => x !== k); }); if (text) bubble(keys[0], text); emit(); }
function goHome(keys: AgentId[]) { keys.forEach(k => { delete LOC[k]; }); emit(); }
export function bubble(k: AgentId, text: string, ms = 2600) { BUBBLES[k] = { text, until: Date.now() + ms / Math.sqrt(speed) }; emit(); setTimeout(emit, ms / Math.sqrt(speed) + 50); }
export function log(text: string, kind: 'start' | 'issue' | 'approve' | 'escalate' | 'gate' | 'ripple' | 'founder' = 'start') { S.log.unshift({ m: Math.floor(S.month) + 1, text, kind, id: ++tick }); emit(); }
export const nm = (k: AgentId) => (k === 'YOU' ? P.name : AGENTS[k].name);
const comment = (id: string, k: AgentId, t: string, tone?: 'warn' | 'ok') => { B[id].cm.push({ k, t, tone }); emit(); };
const spend = (m: number) => { S.month += m; S.runway = Math.max(0, S.runway - m); };
let toastTimer: any;
export function toast(t: string) { S.toast = t; emit(); clearTimeout(toastTimer); toastTimer = setTimeout(() => { S.toast = null; emit(); }, 3000); }

// ---------------------------------------------------------------- pipeline
const running = new Set<string>();
export async function run(id: string, opts: { rework?: boolean; fromReview?: boolean } = {}) {
  if (running.has(id)) return; running.add(id);
  const b = def(id), r = B[id];
  if (opts.rework) r.ver++;
  if (id === 'pmf' && S.pmf == null) S.pmf = Math.min(85, 18 + fit() * 10 + coreCount() * 5 + Math.min(strong(), 4) * 3);
  if (!opts.fromReview) {
    r.st = 'building'; r.p = 0;
    moveTo([b.owner, ...b.crew], b.engine, opts.rework ? 'Reworking it…' : `Drafting ${b.short}…`);
    if (!opts.rework) log(`${nm(b.owner)} started <b>${b.name}</b> at the ${ENGINES.find(e => e.id === b.engine)!.full}.`);
    comment(id, b.owner, opts.rework ? 'Reworking it now.' : `Drafting at the ${ENGINES.find(e => e.id === b.engine)!.name} engine.`);
    for (let p = 0; p <= 100; p += 10) { r.p = p; emit(); await wait(opts.rework ? 90 : 200); }
    goHome(b.crew);
  }
  r.st = 'review'; moveTo([b.checker!, b.owner], 'E20', 'Checking the work…'); await wait(1000);
  if (b.issue && !r.bounced && b.issue.when()) {
    r.bounced = true; S.bounces++;
    comment(id, b.checker!, b.issue.text(), 'warn'); bubble(b.checker!, 'Found a problem.', 2200); log(`${nm(b.checker!)} sent <b>${b.name}</b> back for a fix.`, 'issue');
    r.st = 'building'; r.ver++; moveTo([b.owner], b.engine); await wait(900);
    comment(id, b.owner, `Fixed. This is v${r.ver}.`); bubble(b.owner, 'Fixed it.'); r.st = 'review'; moveTo([b.owner], 'E20'); await wait(700);
  }
  comment(id, b.checker!, 'Checked. It rests on approved blocks and the facts match.', 'ok'); bubble(b.checker!, 'Looks right.'); goHome([b.checker!]);
  const ap = approverFor(b);
  if (ap === 'CEO') {
    r.st = 'approving'; moveTo(['CEO', b.owner], 'E22', 'Signing off…'); await wait(700);
    bubble('CEO', b.ap === 'money' ? 'Within limits.' : 'Approved.'); goHome(['CEO']);
    comment(id, 'CEO', b.ap === 'money' ? `Within your ${S.deleg === 1 ? '₹10' : '₹50'} lakh limit. Approved.` : 'Approved on your behalf.', 'ok');
    running.delete(id); approve(id, 'CEO');
  } else {
    r.st = 'inbox'; running.delete(id);
    bubble('CEO', b.ap === 'money' ? 'Over my limit.' : `For ${P.name}.`);
    moveTo([b.owner], 'office', 'Needs your OK');
    comment(id, 'CEO', b.ap === 'money' ? `${lakh(b.amount!())} is over my limit. I recommend approving. Sending to ${P.name}.` : `Sending to ${P.name} for approval.`);
    log(`<b>${b.name}</b> is waiting for your approval.`, 'escalate'); toast(`Needs you: ${b.name}`);
  }
}
export function approve(id: string, by: AgentId) {
  const b = def(id), r = B[id];
  r.st = 'approved'; r.by = by; r.lines = b.lines ? b.lines() : null; r.doneAt = Date.now(); S.by[by] = (S.by[by] || 0) + 1;
  goHome([b.owner, ...b.crew]); if (b.kind === 'task') goHome(['YOU']);
  spend(b.cost ?? 0.2);
  if (by === 'YOU' && b.kind === 'auto') log(`You approved <b>${b.name}</b>.`, 'approve');
  else if (by === 'CEO') log(`Atlas approved <b>${b.name}</b>.`, 'approve');
  if (b.lines) { S.brainPulse = Date.now(); S.notes += 6; }
  emit(); checkFloor(); kick();
}
export function sendBack(id: string, reason: string) { comment(id, 'YOU', `Sent back: ${reason.toLowerCase()}.`, 'warn'); S.bounces++; log(`You sent <b>${def(id).name}</b> back: ${reason.toLowerCase()}.`, 'founder'); run(id, { rework: true }); }
export function founderApprove(id: string) { comment(id, 'YOU', 'Approved.', 'ok'); approve(id, 'YOU'); }
export function startBlock(id: string) { run(id); }
export function kick() { for (const f of S.auto) active().filter(b => b.f === f && b.kind === 'auto' && st(b.id) === 'ready').forEach((b, i) => setTimeout(() => run(b.id), (i * 300) / speed)); }
export function autoRun(f: number) { S.auto.add(f); log(`You handed <b>${STAGES[f].name}</b> to Atlas.`, 'founder'); kick(); emit(); }
async function checkFloor() {
  const f = S.floor, F = STAGES[f]; if (!F || S.passed[f] || S.pending[f] || F.gate === 'none') return;
  const req = active().filter(b => b.f === f && !b.opt); if (!req.every(b => isOk(b.id))) return;
  if (F.gate === 'ceo') { S.pending[f] = 'ceo'; moveTo(['CEO'], 'E27', 'Stage check…'); await wait(800); goHome(['CEO']); delete S.pending[f]; passFloor(f, 'Atlas'); }
  else { S.pending[f] = true; log(`<b>${F.name}</b> is ready for your inspection in the Strategy & Finance Centre.`, 'gate'); toast(`Inspection ready: ${F.gateName}`); emit(); }
}
export function passFloor(f: number, who: string) {
  S.passed[f] = true; delete S.pending[f]; goHome(['YOU', ...(STAGES[f].board || [])]);
  active().filter(b => b.f === f && b.opt && !isOk(b.id)).forEach(b => { B[b.id].st = 'skipped'; if (b.id === 'preseed') S.deferred = true; });
  S.floor = f + 1;
  log(`${who} passed <b>${STAGES[f].name}</b>. Next stage: <b>${STAGES[f + 1].name}</b>.`, 'gate');
  if (STAGES[f].gate === 'you') S.confetti = Date.now();
  toast(`Next stage: ${STAGES[f + 1].name}`); emit(); kick();
}
// ripple
function dependents(id: string) { const out = new Set<string>(), q = [id]; while (q.length) { const x = q.shift()!; active().forEach(b => { if (b.needs.includes(x) && !out.has(b.id)) { out.add(b.id); q.push(b.id); } }); } return [...out]; }
export function crackFrom(id: string) {
  const deps = dependents(id).filter(x => def(x).kind === 'auto' && isOk(x));
  deps.forEach(x => { B[x].st = 'cracked'; comment(x, 'CQRO', `${def(id).name} changed. This block sits on it, so it needs re-inspection.`, 'warn'); });
  log(`<b>${def(id).name}</b> changed. ${deps.length} block${deps.length === 1 ? '' : 's'} built on it need re-inspection.`, 'ripple');
  if (deps.length) toast(`${deps.length} blocks need re-inspection`); emit();
}
export async function reinspect(id: string) {
  const b = def(id), r = B[id]; if (r.st !== 'cracked') return;
  r.st = 'review'; moveTo(['CQRO'], 'E21', `Re-checking ${b.short}…`); await wait(700); goHome(['CQRO']); S.cracksFixed++;
  if (b.price) { r.ver++; comment(id, 'CQRO', 'Affected: it mentions the price. Updating it.', 'warn'); r.bounced = true; running.delete(id); return run(id, { fromReview: true }); }
  comment(id, 'CQRO', 'Checked: not affected by the change. Re-approved.', 'ok'); r.st = 'approved'; emit(); checkFloor();
}
export async function reinspectAll() { const ids = active().filter(b => B[b.id].st === 'cracked').map(b => b.id); log(`Traceability is re-inspecting ${ids.length} blocks.`, 'ripple'); for (const id of ids) await reinspect(id); }
export function setDelegation(level: number) {
  S.deleg = level; log(`You changed Atlas's approval limit to level ${level}.`, 'founder');
  active().forEach(async x => { if (B[x.id].st === 'inbox' && approverFor(x) === 'CEO') { B[x.id].st = 'approving'; moveTo(['CEO'], 'E22'); await wait(600); goHome(['CEO']); comment(x.id, 'CEO', 'Within my new limit. Approved.', 'ok'); approve(x.id, 'CEO'); } });
  emit();
}

// ---------------------------------------------------------------- founder tasks
export function openTask(id: string) { const b = def(id); if (b.place) moveTo(['YOU', b.owner], b.place); bubble(b.owner, `Your turn, ${P.name}.`); }
export function mutate(fn: (s: any) => void) { fn(S); emit(); }
export function completeTask(id: string, after?: () => void) {
  const b = def(id);
  if (b.chain) { goHome(['YOU']); log(`You completed <b>${b.name}</b>. It goes for checking.`, 'founder'); run(id, { fromReview: true }); }
  else { log(`You completed <b>${b.name}</b>.`, 'founder'); comment(id, 'YOU', 'Done.', 'ok'); approve(id, 'YOU'); }
  after?.();
}
export function reopen(id: string) { B[id].st = 'idle'; B[id].changed = true; emit(); }
export const spendMonths = (m: number) => { spend(m); emit(); };

// ---------------------------------------------------------------- gates
export function gateChecks(g: number) {
  const f = ({ 1: 1, 2: 3, 3: 8 } as Record<number, number>)[g];
  const list: Record<number, { t: string; d?: string; ok: boolean }[]> = {
    1: [{ t: 'Desk research approved', ok: isOk('research') }, { t: 'Talked to at least 4 people', d: `${S.calls.length} interviews`, ok: S.calls.length >= 4 }, { t: 'At least 2 strong problem signals', d: `${strong()} strong`, ok: strong() >= 2 }, { t: 'Problem statement approved', ok: isOk('problem') }, { t: 'Evidence score 45 or more', d: `Score ${ev()}`, ok: ev() >= 45 }],
    3: [{ t: 'Customers said yes to the price', d: priceLabel(), ok: fit() > 0 }, { t: 'Cost estimate approved', d: lakh(P.estimate + 2), ok: isOk('estimate') }, { t: 'BRD approved', ok: isOk('brd') }, ...(P.path === 'enterprise' ? [{ t: 'Budget approved', ok: isOk('budget') }] : []), { t: `At least 3 months of ${P.runwayLabel.toLowerCase()}`, d: `${S.runway.toFixed(1)} months`, ok: S.runway >= 3 }],
    8: [{ t: `Beta with at least ${Math.round(P.betaN / 2)} ${P.unit}`, d: `${S.beta} joined`, ok: S.beta >= Math.round(P.betaN / 2) }, { t: '40%+ would be very disappointed without it', d: `PMF survey: ${S.pmf ?? '—'}%`, ok: (S.pmf ?? 0) >= 40 }, { t: 'Price confirmed by the pricing test', ok: S.priceOk }, { t: 'No blocks waiting for re-inspection', ok: !active().some(b => ['cracked', 'review', 'building', 'inbox', 'approving'].includes(B[b.id].st)) }, { t: `At least 2 months of ${P.runwayLabel.toLowerCase()}`, d: `${S.runway.toFixed(1)} months`, ok: S.runway >= 2 }],
  };
  return { f, checks: list[f] };
}
export function enterGate(g: number) { const f = ({ 1: 1, 2: 3, 3: 8 } as Record<number, number>)[g]; moveTo(['YOU', ...(STAGES[f].board || [])], 'E27'); bubble('CEO', 'Inspection time.'); }
export function topUp() { S.runway += 3; log(`You added 3 months of ${P.runwayLabel.toLowerCase()}.`, 'founder'); emit(); }

// ---------------------------------------------------------------- inbox & engines
export type InboxItem = { ty: 'gate' | 'money' | 'doc' | 'task' | 'crack'; t: string; n: string; s?: string; href: string };
export function inboxItems(): InboxItem[] {
  if (!S.started) return [];
  const it: InboxItem[] = [];
  STAGES.forEach((F, i) => { if (S.pending[i] === true) it.push({ ty: 'gate', t: 'Inspection', n: F.gateName!, href: `/gate/${({ 1: 1, 3: 2, 8: 3 } as Record<number, number>)[i]}` }); });
  active().forEach(b => {
    const s = st(b.id);
    if (s === 'inbox') it.push({ ty: b.ap === 'money' ? 'money' : 'doc', t: b.ap === 'money' ? 'Approve spend' : 'Approve', n: b.name, s: b.ap === 'money' ? `${lakh(b.amount!())} · over Atlas's limit` : `v${B[b.id].ver} · checked by ${b.checker}`, href: `/block/${b.id}` });
    else if (s === 'ready' && b.kind === 'task') it.push({ ty: 'task', t: 'Your task', n: b.name + (b.opt ? ' (optional)' : ''), s: b.mod, href: `/block/${b.id}` });
  });
  const cr = active().filter(b => B[b.id].st === 'cracked').length;
  if (cr) it.push({ ty: 'crack', t: 'Re-check', n: `${cr} block${cr > 1 ? 's' : ''} built on a changed block`, href: '/inbox' });
  const order = { gate: 0, money: 1, doc: 2, task: 3, crack: 4 };
  return it.sort((a, b) => order[a.ty] - order[b.ty]);
}
export type EngineStatus = 'Idle' | 'Queued' | 'Running' | 'Reviewing' | 'Waiting for you' | 'Ready' | 'Re-check' | 'Error';
export function engineState(eid: string): { status: EngineStatus; outputs: number; job?: Block } {
  const mine = active().filter(b => b.engine === eid);
  const outputs = mine.filter(b => isOk(b.id) && b.lines).length + (eid === 'E28' ? active().filter(b => isOk(b.id) && b.lines).length : 0);
  if (eid === 'E20' && active().some(b => B[b.id].st === 'review')) return { status: 'Reviewing', outputs };
  if (eid === 'E22' && active().some(b => B[b.id].st === 'approving')) return { status: 'Running', outputs };
  if (eid === 'E22' && active().some(b => B[b.id].st === 'inbox')) return { status: 'Waiting for you', outputs };
  if (eid === 'E01' && (active().some(b => ['building', 'review', 'approving'].includes(B[b.id].st)) || S.auto.size)) return { status: 'Running', outputs };
  if (eid === 'E02' && S.started) return { status: 'Running', outputs };
  const job = mine.find(b => ['building', 'review', 'approving', 'inbox', 'cracked'].includes(B[b.id].st)) || mine.find(b => b.kind === 'task' && st(b.id) === 'ready');
  if (job) { const s = B[job.id].st; const status: EngineStatus = s === 'building' ? 'Running' : s === 'inbox' ? 'Waiting for you' : s === 'cracked' ? 'Re-check' : s === 'review' ? 'Reviewing' : s === 'approving' ? 'Running' : job.kind === 'task' ? 'Waiting for you' : 'Queued'; return { status, outputs, job }; }
  if (outputs) return { status: 'Ready', outputs };
  return { status: 'Idle', outputs };
}

// ---------------------------------------------------------------- start
export function start(id: string) {
  P = PERSONAS[id];
  for (const k of Object.keys(S)) delete S[k];
  Object.assign(S, {
    started: true, floor: 0, passed: {}, pending: {}, auto: new Set<number>(), deleg: 1, runway: P.runway, month: 0,
    idea: P.idea, pitch: P.pitch, goal: P.goal, answers: [], calls: [], pricing: null, bump: 1, mvp: [], hires: [], stamped: 0, presold: 0, raised: null, deferred: false,
    sprints: 0, sprintsTotal: 0, bug: false, bugSeen: false, beta: 0, betaGroups: [], pmf: null, priceOk: false, customers: 0, by: { YOU: 0, CEO: 0 }, bounces: 0, cracksFixed: 0,
    ended: false, off: [], log: [], notes: 12, toast: null, confetti: 0, brainPulse: 0,
  });
  for (const k of Object.keys(B)) delete B[k];
  BLOCKS.forEach(b => { B[b.id] = { st: 'idle', ver: 1, p: 0, cm: [] }; });
  for (const k of Object.keys(LOC)) delete (LOC as any)[k];
  running.clear();
  log(`${P.name} opened Founder HQ. Atlas is in charge of the crew.`, 'founder');
  emit();
}
export function finish() { approve('scale', 'YOU'); S.ended = true; S.confetti = Date.now(); moveTo(['YOU', 'CEO', 'CFO', 'CSO'], 'E27', 'We made it.'); }
