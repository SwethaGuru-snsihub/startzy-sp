'use client';
import React from 'react';
import { AGENTS, type AgentId } from '@/engine/model';
import { P, type Status } from '@/engine/engine';

/** Renders engine text that uses <b>…</b> for emphasis. */
export function Rich({ text }: { text: string }) {
  const parts = text.split(/(<b>.*?<\/b>)/g);
  return <>{parts.map((p, i) => p.startsWith('<b>') ? <strong key={i} style={{ fontWeight: 700 }}>{p.slice(3, -4)}</strong> : <React.Fragment key={i}>{p}</React.Fragment>)}</>;
}

export function Avatar({ id, size = 22 }: { id: AgentId; size?: number }) {
  const a = AGENTS[id];
  const round = a.kind === 'crew' || a.kind === 'founder';
  const bg = a.kind === 'founder' ? 'var(--persona)' : a.color;
  const code = id === 'YOU' ? P.initial : id;
  return (
    <span title={`${id === 'YOU' ? P.name : a.name} · ${a.role}`} style={{
      width: size, height: size, borderRadius: round ? '50%' : size * 0.3, background: bg, flex: 'none',
      color: a.kind === 'atlas' ? 'var(--panel)' : 'var(--on-color)', display: 'inline-grid', placeItems: 'center',
      fontSize: Math.max(7, size * 0.3), fontWeight: 800, boxShadow: a.kind === 'atlas' ? '0 0 0 2px var(--accent)' : undefined,
    }}>{code}</span>
  );
}

const CHIP: Record<string, [string, string, string?]> = {
  locked: ['var(--panel)', 'var(--muted)', 'var(--line-strong)'], ready: ['var(--panel)', 'var(--ink)', 'var(--ink)'],
  task: ['var(--accent)', 'var(--on-accent)'], building: ['var(--sp-soft)', 'var(--sp)'], review: ['var(--sp-soft)', 'var(--sp)'],
  approving: ['var(--sp-soft)', 'var(--sp)'], inbox: ['var(--accent-soft)', 'var(--ink)', 'var(--accent)'], approved: ['var(--go-soft)', 'var(--go)'],
  cracked: ['var(--stop-soft)', 'var(--stop)'], skipped: ['var(--subtle)', 'var(--muted)'], idle: ['var(--panel)', 'var(--muted)', 'var(--line-strong)'],
};
const LABEL: Record<string, string> = { locked: 'Waiting', ready: 'Ready', task: 'Your task', building: 'Drafting', review: 'Checking', approving: 'Approving', inbox: 'Needs you', approved: 'Approved', cracked: 'Re-check', skipped: 'Skipped', idle: 'Waiting' };
export function StatusChip({ s, label }: { s: Status | 'task'; label?: string }) {
  const [bg, fg, st] = CHIP[s] || CHIP.idle;
  return <span className="pill t-micro" style={{ background: bg, color: fg, border: st ? `1px ${s === 'locked' ? 'dashed' : 'solid'} ${st}` : '1px solid transparent', padding: '3px 9px', fontSize: 11 }}>{label || LABEL[s]}</span>;
}

export function Tag({ kind, children }: { kind: 'sp' | 'sz' | 'you' | 'plain'; children: React.ReactNode }) {
  const m = { sp: ['var(--sp-soft)', 'var(--sp)'], sz: ['var(--sz-soft)', 'var(--sz)'], you: ['var(--accent)', 'var(--on-accent)'], plain: ['var(--subtle)', 'var(--ink)'] }[kind];
  return <span className="pill t-micro" style={{ background: m[0], color: m[1], border: `1px solid ${kind === 'you' ? 'transparent' : m[1]}`, padding: '3px 9px', fontSize: 11 }}>{children}</span>;
}

export function PanelHead({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="t-h3">{title}</div>
      {right ?? (sub && <div className="t-small">{sub}</div>)}
    </div>
  );
}

export function ProductTag({ tag }: { tag: 'sp' | 'sz' }) {
  return <Tag kind={tag}>{tag === 'sp' ? 'Solution Planning' : 'Startzy'}</Tag>;
}
