import { describe, expect, it } from 'vitest';
import { IMPORTANT_TASKS, evaluate, legalRule, type ApplicabilityMap } from '../applicability';
import { fact, type Context } from '../context';
import { statedFacts } from '../presets';
import { TASKS, isDecision } from '../register';
import { ACK_ALL, CONTEXTS, CONTEXT_NAMES, F } from './fixtures';

const all: Record<string, ApplicabilityMap> = Object.fromEntries(CONTEXT_NAMES.map(k => [k, evaluate(CONTEXTS[k], ACK_ALL)]));
const itemsOf = (k: string) => all[k].legal.items!.map(i => i.item).join(' | ');

describe('applicability for every goal', () => {
  it.each(CONTEXT_NAMES)('%s: every task has an applicability status (none removed or hidden)', k => {
    expect(Object.keys(all[k])).toHaveLength(TASKS.length);
  });
  it.each(CONTEXT_NAMES)('%s: gates, SJ8, handoff and acceptance are always required', k => {
    const always = TASKS.filter(t => isDecision(t.id) || t.kind === 'package' || t.kind === 'external');
    expect(always.map(t => all[k][t.id].status)).toEqual(always.map(() => 'required'));
  });
});

describe('legal applicability, health classification and jurisdiction', () => {
  it('demo founders (after the demo answers): legal required for Veejay, Meera and Rahul', () => {
    expect([all.veejay.legal.status, all.meera.legal.status, all.rahul.legal.status]).toEqual(['required', 'required', 'required']);
  });
  it('Veejay: the dental-clinic industry only raises a flag; legal waits for the regulated-activity answer', () => {
    expect(evaluate(statedFacts('veejay')).legal.why).toMatch(/regulated healthcare activity/);
  });
  it('Veejay: funding approach = investors gives only a conditional note; no investment agreement before a decision to raise', () => {
    expect(itemsOf('veejay')).not.toMatch(/investment/);
    expect(all.veejay.legal.conditional!.some(x => /investment/.test(x))).toBe(true);
  });
  it('Veejay: "Wait for traction" adds nothing; "Raise pre-seed now" adds investment agreements with that rationale', () => {
    const defer = evaluate({ ...CONTEXTS.veejay, raise: F('deferred') }), raise = evaluate({ ...CONTEXTS.veejay, raise: F('committed') });
    expect(defer.legal.items!.some(i => /investment/.test(i.item))).toBe(false);
    expect(raise.legal.items!.some(i => /investment/.test(i.item) && /decision to raise/.test(i.why))).toBe(true);
  });
  it('Veejay (demo answer: 1 founder): no co-founder agreement; IP assignment to the planned company; contact-only data adds no sector or sensitive item', () => {
    expect(itemsOf('veejay')).not.toMatch(/co-founder/);
    expect(itemsOf('veejay')).toMatch(/assign founder-held IP/);
    expect(itemsOf('veejay')).not.toMatch(/sector|sensitive/);
  });
  it('Veejay: answering "2+ founders" would add the co-founder agreement', () => {
    expect(evaluate({ ...CONTEXTS.veejay, founders: F('2+') }).legal.items!.some(i => /co-founder/.test(i.item))).toBe(true);
  });
  it('Meera (stated solo founder; demo answer sole proprietor): privacy and terms only', () => {
    expect(itemsOf('meera')).not.toMatch(/co-founder|assign founder/);
    expect(itemsOf('meera')).toMatch(/privacy/);
    expect(itemsOf('meera')).toMatch(/terms/);
  });
  it('Meera: an approved hiring plan with a contract designer adds the contributor-IP item', () => {
    expect(evaluate({ ...CONTEXTS.meera, collaborators: fact('contributors', 'artifact') }).legal.items!.some(i => /contributors/.test(i.item))).toBe(true);
  });
  it('Rahul: internal compliance and privacy; invited partners need no public terms', () => {
    expect(itemsOf('rahul')).toMatch(/internal compliance/);
    expect(itemsOf('rahul')).toMatch(/privacy/);
    expect(itemsOf('rahul')).not.toMatch(/terms|co-founder|employer IP/);
  });
  it('unregistered learning project with 2 founders and contributors still gets co-founder and contributor-IP items', () => {
    expect(all.learnPair.legal.status).toBe('required');
    expect(itemsOf('learnPair')).toMatch(/co-founder/);
    expect(itemsOf('learnPair')).toMatch(/contributors/);
  });
  it('bootstrapped project with no trigger: legal N/A only after founder acknowledgement', () => {
    expect(all.bootQuiet.legal.status).toBe('na');
    expect(evaluate(CONTEXTS.bootQuiet).legal.why).toBe('founder acknowledgement of N/A');
  });
  it('learning: N/A without triggers, required with public users or personal data', () => {
    expect([all.learnSolo.legal.status, all.learnPublic.legal.status]).toEqual(['na', 'required']);
  });
  it('every legal item records its rationale and jurisdiction', () => {
    expect(CONTEXT_NAMES.every(k => (all[k].legal.items ?? []).every(i => i.why && i.jurisdiction))).toBe(true);
  });
  it('industry "healthcare" (even AI-inferred) only flags: legal waits for the founder to confirm the health facts', () => {
    const r = evaluate({ ...CONTEXTS.bootQuiet, industry: fact('healthcare', 'ai'), healthData: undefined });
    expect(r.legal.status).toBe('awaiting');
    expect(r.legal.why).toMatch(/health/);
  });
  it('an AI-inferred "no health data" cannot settle a healthcare flag', () => {
    expect(evaluate({ ...CONTEXTS.bootQuiet, industry: F('healthcare'), healthData: fact('none', 'ai') }).legal.status).toBe('awaiting');
  });
  it('sensitive health data without a confirmed regulated-activity answer leads to clarification', () => {
    const r = evaluate({ ...CONTEXTS.bootQuiet, personalData: F('yes'), healthData: F('sensitive'), regulatedActivity: undefined });
    expect(r.legal.status).toBe('awaiting');
    expect(r.legal.why).toMatch(/regulatedActivity/);
  });
  it('health data with "no personal data" is a conflict that needs clarification, never N/A', () => {
    const r = evaluate({ ...CONTEXTS.bootQuiet, healthData: F('contact'), personalData: F('no') });
    expect(r.legal.status).toBe('awaiting');
    expect(r.legal.why).toMatch(/conflicting/);
  });
  it('confirmed contact-and-appointment data only: privacy items, no sector or sensitive-health items', () => {
    const r = evaluate({ ...CONTEXTS.bootQuiet, industry: F('healthcare'), personalData: F('yes'), healthData: F('contact') });
    expect(r.legal.status).toBe('required');
    expect(r.legal.items!.some(i => /sector|sensitive/.test(i.item))).toBe(false);
  });
  it('confirmed sensitive data and a confirmed regulated activity: sensitive-data and sector-compliance items', () => {
    const r = evaluate({ ...CONTEXTS.bootQuiet, personalData: F('yes'), healthData: F('sensitive'), regulatedActivity: F('yes') });
    expect(r.legal.items!.some(i => /sensitive/.test(i.item))).toBe(true);
    expect(r.legal.items!.some(i => /sector/.test(i.item))).toBe(true);
  });
  it('any legal item without a jurisdiction leads to clarification', () => {
    const r = evaluate({ ...CONTEXTS.bootQuiet, personalData: F('yes'), jurisdiction: undefined });
    expect(r.legal.status).toBe('awaiting');
    expect(r.legal.why).toMatch(/jurisdiction/);
  });

  it('legal rule over every combination of legal facts', () => {
    const V: Record<string, string[]> = { raise: ['none', 'committed'], org: ['independent', 'company'], registration: ['none', 'sole', 'company'], founders: ['1', '2+'], collaborators: ['none', 'contributors'], ipOwner: ['founders', 'company', 'employer'], funding: ['investor', 'revenue', 'budget', 'none'], personalData: ['yes', 'no'], healthData: ['none', 'contact', 'sensitive'], regulatedActivity: ['yes', 'no'], audience: ['me', 'invited', 'public'] };
    const keys = Object.keys(V); const bad: string[] = []; let combos = 0;
    const walk = (i: number, c: Record<string, string>) => {
      if (i === keys.length) {
        combos++;
        const ctx = { ...Object.fromEntries(Object.entries(c).map(([k, v]) => [k, F(v)])), jurisdiction: F('IN'), goal: F('venture') } as Context;
        const r = legalRule(ctx);
        if (r.conflict) { if (r.status === 'na') bad.push('conflict resolved to N/A'); return; }
        const trig = c.personalData === 'yes' || c.healthData === 'sensitive' || c.regulatedActivity === 'yes' || c.audience === 'public' || c.org === 'company' || (c.org === 'independent' && (c.founders === '2+' || c.collaborators === 'contributors' || c.ipOwner === 'employer')) || c.raise === 'committed' || (c.registration === 'company' && c.ipOwner === 'founders' && c.org === 'independent');
        if (trig !== (r.status === 'required')) bad.push('trigger mismatch ' + JSON.stringify(c));
        if (r.items.some(it => !it.why || !it.jurisdiction)) bad.push('item without rationale or jurisdiction');
        if (c.org === 'independent' && c.founders === '2+' && !r.items.some(it => /co-founder/.test(it.item))) bad.push('co-founder agreement missing');
        if (c.ipOwner !== 'founders' || c.org === 'company') {
          const other = legalRule({ ...ctx, registration: F(c.registration === 'company' ? 'none' : 'company') }).items.map(x => x.item).join();
          if (other !== r.items.map(x => x.item).join()) bad.push('registration alone changed items');
        }
        if (c.healthData === 'contact' && c.regulatedActivity === 'no' && r.items.some(it => /sector|sensitive/.test(it.item))) bad.push('contact data inferred as regulated');
        return;
      }
      for (const v of V[keys[i]]) walk(i + 1, { ...c, [keys[i]]: v });
    };
    walk(0, {});
    expect(combos).toBe(20736);
    expect(bad.slice(0, 3)).toEqual([]);
  });
});

describe('funding routes, learning, and N/A guards', () => {
  it('one funding route per demo path: pre-seed and pre-sell optional, budget required', () => {
    expect([all.veejay.preseed.status, all.meera.presell.status, all.rahul.budget.status, all.veejay.presell.status, all.meera.budget.status]).toEqual(['optional', 'optional', 'required', 'na', 'na']);
  });
  it('demo founders: learning evaluation N/A, metrics and scale required', () => {
    expect(['veejay', 'meera', 'rahul'].every(k => all[k].learneval.status === 'na' && all[k].metrics.status === 'required' && all[k].scale.status === 'required')).toBe(true);
  });
  it('learning without commercial intent: learning evaluation required, metrics N/A', () => {
    expect([all.learnSolo.learneval.status, all.learnSolo.metrics.status]).toEqual(['required', 'na']);
  });
  it('learning with commercial intent later: learning evaluation and metrics coexist', () => {
    expect([all.learnPublic.learneval.status, all.learnPublic.metrics.status]).toEqual(['required', 'optional']);
  });
  it('learning: technical, security and quality tasks stay required', () => {
    expect(['sad', 'tech', 'designreview', 'testplan', 'qa', 'reqs', 'srs', 'sprints'].map(i => all.learnSolo[i].status)).toEqual(Array(8).fill('required'));
  });
  it('learning with public users and personal data: legal and support required', () => {
    expect([all.learnPublic.legal.status, all.learnPublic.support.status]).toEqual(['required', 'required']);
  });
  it('important N/A (company, legal) waits for founder acknowledgement', () => {
    const r = evaluate(CONTEXTS.learnSolo);
    expect(['company', 'legal'].map(i => [r[i].status, /acknowledgement/.test(r[i].why ?? '')])).toEqual([['awaiting', true], ['awaiting', true]]);
  });
  it('non-important N/A (scale) applies without acknowledgement', () => {
    const r = evaluate(CONTEXTS.learnSolo);
    expect([r.scale.status, r.learneval.status]).toEqual(['na', 'required']);
  });
  it('AI-inferred funding never produces N/A; legal does not read funding approach and its N/A still needs acknowledgement', () => {
    const ctx = { ...CONTEXTS.bootQuiet, funding: fact('revenue', 'ai') };
    const r = evaluate(ctx, ACK_ALL);
    expect(r.preseed.status).toBe('awaiting');
    expect(r.legal.uses).not.toContain('funding');
    expect(evaluate(ctx).legal.why).toBe('founder acknowledgement of N/A');
  });
  it('budget stays N/A because it reads only the founder-confirmed organisation type', () => {
    expect(evaluate({ ...CONTEXTS.bootQuiet, funding: fact('revenue', 'ai') }, ACK_ALL).budget.status).toBe('na');
  });
  it('AI-inferred facts may still make a task optional or required', () => {
    expect(evaluate({ ...CONTEXTS.bootQuiet, funding: fact('revenue', 'ai') }, ACK_ALL).presell.status).toBe('optional');
  });
  it('missing facts produce awaiting clarification', () => {
    const r = evaluate({ goal: F('learning') });
    expect([r.company.status, r.legal.status]).toEqual(['awaiting', 'awaiting']);
  });
  it('the important set covers decisions, the package, legal, company, funding and every decision or package input', () => {
    expect(['company', 'legal', 'preseed', 'presell', 'budget', 'hiring', 'testplan', 'qa', 'sbaccept', 'gate1', 'sj8', 'handoff', 'goal', 'validation'].every(i => IMPORTANT_TASKS.has(i))).toBe(true);
    expect(IMPORTANT_TASKS.has('scale')).toBe(false);
  });
});
