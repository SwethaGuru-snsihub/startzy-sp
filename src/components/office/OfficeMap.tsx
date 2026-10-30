'use client';
import { motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { S, BUBBLES, LOC, engineState, inboxItems, placeOf, nm, type EngineStatus } from '@/engine/engine';
import { AGENTS, ENGINES, ROOMS, deskPos, DESK_W, type AgentId, type RoomId } from '@/engine/model';
import { Rich } from '@/components/ui/kit';

const W = 1000, H = 730;
type Layers = { idleFade: boolean; agents: boolean; names: boolean; bubbles: boolean; metrics: boolean; flows: boolean };
type Filter = 'all' | 'running' | 'you' | 'recheck';

const ST: Record<EngineStatus, { light: string; pill: string; stroke: string; glow?: string }> = {
  Idle: { light: 'var(--line-strong)', pill: 'var(--panel)', stroke: 'var(--line)' },
  Queued: { light: 'var(--sp)', pill: 'var(--panel)', stroke: 'var(--sp)' },
  Running: { light: 'var(--sp)', pill: 'var(--sp-soft)', stroke: 'var(--sp)', glow: 'var(--sp)' },
  Reviewing: { light: 'var(--ag-cro)', pill: 'var(--panel)', stroke: 'var(--ag-cro)' },
  'Waiting for you': { light: 'var(--accent)', pill: 'var(--accent-soft)', stroke: 'var(--accent)', glow: 'var(--accent)' },
  Ready: { light: 'var(--go)', pill: 'var(--panel)', stroke: 'var(--line)' },
  'Re-check': { light: 'var(--stop)', pill: 'var(--stop-soft)', stroke: 'var(--stop)' },
  Error: { light: 'var(--stop)', pill: 'var(--stop-soft)', stroke: 'var(--stop)', glow: 'var(--stop)' },
};

function agentXY(k: AgentId, idxAtPlace: number): { x: number; y: number } {
  const place = placeOf(k);
  if (place === 'office') { const r = ROOMS.office; return { x: r.x + 96 + idxAtPlace * 46, y: r.y + 112 }; }
  if (place === 'lounge') { const r = ROOMS.lounge; return { x: r.x + 20 + (idxAtPlace % 3) * 30, y: r.y + 70 + Math.floor(idxAtPlace / 3) * 40 }; }
  const p = deskPos(place);
  return { x: p.x + DESK_W / 2 - 13 + (idxAtPlace % 2 ? 16 : idxAtPlace ? -16 : 0) + (idxAtPlace > 1 ? (idxAtPlace - 1) * 10 : 0), y: p.y + 34 };
}

function Agent({ id, x, y, layers }: { id: AgentId; x: number; y: number; layers: Layers }) {
  const a = AGENTS[id]; const isActive = id === 'YOU' || !!LOC[id];
  // eslint-disable-next-line react-hooks/purity -- bubbles expire by wall clock; the engine emits again when they do
  const bub = BUBBLES[id]; const showBub = layers.bubbles && bub && bub.until > Date.now();
  const body = id === 'YOU' ? 'var(--persona)' : a.color;
  return (
    <motion.div className="absolute z-20" initial={false} animate={{ x, y }} transition={{ duration: 1.1, ease: [0.5, 0, 0.3, 1] }} style={{ left: 0, top: 0 }} title={`${nm(id)} · ${a.role}`}>
      <div className="relative flex flex-col items-center">
        {showBub && <div className="pop absolute bottom-full mb-1 left-1/2 -translate-x-1/2 whitespace-nowrap t-micro px-2 py-0.5 rounded-lg" style={{ background: 'var(--panel)', border: `1.5px solid ${body}`, fontSize: 11, boxShadow: 'var(--shadow)' }}>{bub!.text}</div>}
        <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden>
          {isActive && <circle cx="13" cy="13" r="13" fill="var(--panel)" stroke={id === 'CEO' ? 'var(--accent)' : body} strokeWidth="2" />}
          {!isActive && a.kind === 'atlas' && <circle cx="13" cy="13" r="12.5" fill="none" stroke="var(--accent)" strokeWidth="2" />}
          <ellipse cx="13" cy="17" rx="11" ry="7.5" fill={body} />
          <circle cx="13" cy="10" r="6.5" fill="var(--skin)" />
          <ellipse cx="13" cy="7.5" rx="6.5" ry="3.6" fill="var(--hair)" />
        </svg>
        {(isActive || layers.names) && <span className="t-micro px-1.5 rounded-full mt-0.5" style={{ background: isActive ? 'var(--ink)' : 'var(--panel)', color: isActive ? 'var(--panel)' : 'var(--ink)', border: isActive ? undefined : '1px solid var(--line)', fontSize: 9 }}>{nm(id)}</span>}
      </div>
    </motion.div>
  );
}

function Desk({ id, dim, selected, fade, onClick }: { id: string; dim: boolean; selected: boolean; fade: boolean; onClick: () => void }) {
  const e = ENGINES.find(x => x.id === id)!; const es = engineState(id); const s = ST[es.status]; const p = deskPos(id);
  const op = dim ? 0.25 : fade && es.status === 'Idle' ? 0.55 : 1;
  return (
    <button onClick={onClick} aria-label={`${e.id} ${e.full}: ${es.status}`} title={`${e.id} · ${e.full} · ${es.status}`} className="absolute flex flex-col items-center gap-[3px] z-10" style={{ left: p.x, top: p.y, width: DESK_W, opacity: op, transition: 'opacity .3s' }}>
      <span className={`pill t-micro px-1.5 py-[2px] ${es.status === 'Waiting for you' ? 'glow-amber' : ''}`} style={{ background: s.pill, border: `1px ${es.status === 'Queued' ? 'dashed' : 'solid'} ${s.stroke}`, fontSize: 9.5, boxShadow: selected ? '0 0 0 2px var(--ink)' : 'var(--shadow)' }}>
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.light }} />{e.name}
      </span>
      <span className="relative block w-[60px] h-6">
        <span className="absolute left-0 right-0 bottom-0 h-4 rounded" style={{ background: 'var(--desk)', boxShadow: s.glow ? `0 0 12px 1px color-mix(in srgb, ${s.glow} 55%, transparent)` : undefined }} />
        <span className="absolute left-[19px] top-[1px] w-[22px] h-[13px] rounded-sm" style={{ background: es.status === 'Running' ? 'var(--sp)' : 'var(--screen)' }} />
        {es.outputs > 0 && <span className="absolute -right-2 -top-1 t-micro px-1 rounded-full" style={{ background: 'var(--ink)', color: 'var(--panel)', fontSize: 8.5 }}>{es.outputs}</span>}
      </span>
      {e.seats > 0 && <span className="flex gap-[5px]">{Array.from({ length: Math.min(4, e.seats) }).map((_, i) => <span key={i} className="w-[9px] h-[9px] rounded-full" style={{ background: 'var(--chair)', opacity: 0.8 }} />)}</span>}
    </button>
  );
}

export default function OfficeMap({ selected, onSelect }: { selected: string | null; onSelect: (id: string | null) => void }) {
  const [layers, setLayers] = useState<Layers>({ idleFade: true, agents: true, names: false, bubbles: true, metrics: true, flows: true });
  const [filter, setFilter] = useState<Filter>('all');
  const [zoom, setZoom] = useState<RoomId | null>(null);
  const [showLayers, setShowLayers] = useState(false);
  const [, force] = useState(0);
  useEffect(() => { const t = setInterval(() => force(x => x + 1), 600); return () => clearInterval(t); }, []);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { setZoom(null); onSelect(null); } }; addEventListener('keydown', k); return () => removeEventListener('keydown', k); }, [onSelect]);
  const mapRef = useRef<HTMLDivElement>(null);

  const states = Object.fromEntries(ENGINES.map(e => [e.id, engineState(e.id)]));
  const counts = { running: ENGINES.filter(e => ['Running', 'Reviewing'].includes(states[e.id].status)).length, you: inboxItems().length, recheck: ENGINES.filter(e => states[e.id].status === 'Re-check').length };
  const match = (id: string) => filter === 'all' || (filter === 'running' && ['Running', 'Reviewing'].includes(states[id].status)) || (filter === 'you' && states[id].status === 'Waiting for you') || (filter === 'recheck' && states[id].status === 'Re-check');
  const roomActive = (rid: RoomId) => ENGINES.some(e => e.room === rid && ['Running', 'Reviewing', 'Waiting for you'].includes(states[e.id].status)) || (rid === 'office' && inboxItems().length > 0);

  const roomMeta = (rid: RoomId) => {
    const doing = ENGINES.filter(e => e.room === rid && ['Running', 'Reviewing'].includes(states[e.id].status)).length;
    const waiting = ENGINES.filter(e => e.room === rid && states[e.id].status === 'Waiting for you').length;
    const done = ENGINES.filter(e => e.room === rid).reduce((a, e) => a + states[e.id].outputs, 0);
    const pill = rid === 'office' ? (inboxItems().length ? `${inboxItems().length} need you` : null) : waiting ? `${waiting} waiting` : done && rid === 'research' ? `${done} ready` : null;
    return { line: rid === 'office' ? 'Your desk' : rid === 'lounge' ? `Switched off · ${S.off.length}` : rid === 'vault' ? `${states.E28.outputs} approved docs` : `Doing ${doing} · Waiting ${waiting} · Done ${done}`, pill, tone: rid === 'research' && !waiting ? 'go' : 'accent' };
  };

  // agent positions, grouped by place
  const byPlace: Record<string, AgentId[]> = {};
  (Object.keys(AGENTS) as AgentId[]).forEach(k => { const pl = placeOf(k); (byPlace[pl] ||= []).push(k); });
  const brain = ROOMS.brain; const bx = brain.x + brain.w / 2, by = brain.y + brain.h / 2;
  const z = zoom ? ROOMS[zoom] : null; const scale = z ? Math.min(2, Math.min(W / (z.w + 60), H / (z.h + 60))) : 1;
  const tx = z ? -(z.x + z.w / 2) * scale + W / 2 : 0, ty = z ? -(z.y + z.h / 2) * scale + H / 2 : 0;

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative">
          <button className="btn btn-sm" aria-expanded={showLayers} onClick={() => setShowLayers(!showLayers)}>Layers ▾</button>
          {showLayers && (
            <div className="panel absolute z-40 mt-2 w-[280px] p-3 flex flex-col gap-2">
              <div className="t-h3">Show on map</div>
              {([['idleFade', 'Fade idle engines', 'Idle at 55% so active work stands out'], ['agents', 'Agents', 'All 15 characters'], ['names', 'Name tags', 'Off = active agents only'], ['bubbles', 'Speech bubbles', 'Latest events'], ['metrics', 'Room metrics', 'Doing · Waiting · Done'], ['flows', 'Corridors and flows', 'Paths to the Command Centre']] as const).map(([k, l, d]) => (
                <label key={k} className="flex items-center gap-2 cursor-pointer"><span className="flex-1"><span className="t-strong block">{l}</span><span className="t-small" style={{ fontSize: 11 }}>{d}</span></span>
                  <input type="checkbox" checked={layers[k]} onChange={e => setLayers({ ...layers, [k]: e.target.checked })} className="w-4 h-4 accent-[var(--go)]" /></label>
              ))}
            </div>
          )}
        </div>
        {([['all', 'All'], ['running', `Running · ${counts.running}`], ['you', `Needs you · ${counts.you}`], ['recheck', `Re-check · ${counts.recheck}`]] as const).map(([k, l]) => <button key={k} className={`btn btn-sm ${filter === k ? 'btn-primary' : ''}`} onClick={() => setFilter(k)}>{l}</button>)}
        {zoom && <button className="btn btn-sm ml-auto" onClick={() => setZoom(null)}>◂ Overview</button>}
      </div>
      <div className="overflow-x-auto rounded-[20px]" style={{ border: '1px solid var(--line)' }}>
        <div ref={mapRef} className="relative overflow-hidden" style={{ width: W, height: H, background: 'var(--floor)' }}>
          <div className="absolute inset-0" style={{ transform: `translate(${tx}px, ${ty}px) scale(${scale})`, transformOrigin: '0 0', transition: 'transform .4s ease' }}>
            <svg width={W} height={H} className="absolute inset-0" aria-hidden>
              {(Object.keys(ROOMS) as RoomId[]).filter(r => r !== 'brain').map(r => { const R = ROOMS[r]; return <line key={r} x1={bx} y1={by} x2={R.x + R.w / 2} y2={R.y + R.h / 2} stroke="var(--panel)" strokeOpacity=".75" strokeWidth="18" strokeLinecap="round" />; })}
              {layers.flows && (Object.keys(ROOMS) as RoomId[]).filter(r => r !== 'brain' && roomActive(r)).map(r => { const R = ROOMS[r]; return <line key={r} className="flow" x1={bx} y1={by} x2={R.x + R.w / 2} y2={R.y + R.h / 2} stroke="var(--brain)" strokeWidth="2.5" strokeDasharray="2 7" strokeLinecap="round" />; })}
            </svg>
            {(Object.keys(ROOMS) as RoomId[]).filter(r => r !== 'brain').map(r => {
              const R = ROOMS[r]; const m = roomMeta(r);
              return (
                <div key={r} style={{ opacity: zoom && zoom !== r ? 0.4 : 1, transition: 'opacity .4s' }}>
                  <div className="absolute rounded-2xl" style={{ left: R.x, top: R.y + 6, width: R.w, height: R.h, background: 'var(--wall)', opacity: 0.55 }} />
                  <div onClick={() => setZoom(zoom === r ? null : r)} className="absolute rounded-2xl cursor-zoom-in" role="button" aria-label={`Zoom into ${R.full}`}
                    style={{ left: R.x, top: R.y, width: R.w, height: R.h, background: R.tint, boxShadow: '0 10px 20px -8px rgba(15,23,41,.10)', border: r === 'office' ? '2.5px solid var(--accent)' : undefined, animation: r === 'office' && inboxItems().length ? 'pulseGlow 2.4s ease-in-out infinite' : undefined }}>
                    <div className="flex items-start gap-2 px-3 pt-2.5">
                      <div className="flex-1 min-w-0"><div className="t-strong">{R.name}</div>{layers.metrics && <div className="t-micro" style={{ color: 'var(--muted)', fontSize: 10 }}>{m.line}</div>}</div>
                      {layers.metrics && m.pill && <span className="pill t-micro px-2 py-0.5" style={{ background: m.tone === 'go' ? 'var(--go-soft)' : 'var(--accent-soft)', color: m.tone === 'go' ? 'var(--go)' : 'var(--ink)', border: `1px solid ${m.tone === 'go' ? 'var(--go)' : 'var(--accent)'}`, fontSize: 10 }}>{m.pill}</span>}
                    </div>
                    {r === 'office' && <><span className="absolute rounded-md" style={{ left: 66, top: 104, width: 130, height: 26, background: 'var(--desk)' }} /><span className="absolute rounded" style={{ left: 114, top: 94, width: 34, height: 18, background: 'var(--screen)' }} /><span className="absolute rounded-full" style={{ left: 226, top: 150, width: 22, height: 22, background: 'var(--plant)' }} /></>}
                    {r === 'lounge' && <span className="absolute rounded-lg" style={{ left: 20, top: 146, width: 88, height: 22, background: 'var(--chair)', opacity: 0.45 }} />}
                  </div>
                </div>
              );
            })}
            <div className="absolute" style={{ left: brain.x, top: brain.y, width: brain.w, height: brain.h, opacity: zoom && zoom !== 'brain' ? 0.4 : 1 }}>
              <div key={S.brainPulse} className="breathe absolute rounded-full" style={{ left: (brain.w - 150) / 2, top: (brain.h - 150) / 2, width: 150, height: 150, background: 'var(--brain-soft)', border: '2px dashed color-mix(in srgb, var(--brain) 60%, transparent)', boxShadow: '0 0 30px 2px color-mix(in srgb, var(--brain) 25%, transparent)' }} />
              <div className="absolute panel px-2.5 py-1.5 flex flex-col items-center" style={{ left: '50%', top: '50%', transform: 'translate(-50%, -36%)', borderRadius: 10 }}>
                <span className="t-eyebrow" style={{ color: 'var(--brain)' }}>{ROOMS.brain.name}</span><span className="t-strong">Atlas · shared memory</span><span className="t-micro" style={{ color: 'var(--muted)' }}>{S.notes} notes · {states.E28.outputs} docs</span>
              </div>
            </div>
            {ENGINES.map(e => <Desk key={e.id} id={e.id} dim={!match(e.id)} selected={selected === e.id} fade={layers.idleFade} onClick={() => onSelect(selected === e.id ? null : e.id)} />)}
            {placeOf('CEO') !== 'E01' && states.E01.status === 'Running' && (() => { const p = deskPos('E01'); return <span className="absolute z-20 pill t-micro px-2 py-0.5" style={{ left: p.x + DESK_W - 8, top: p.y + 30, background: 'var(--panel)', border: '1px dashed var(--accent)', fontSize: 9.5 }}>Atlas · remote</span>; })()}
            {layers.agents && Object.entries(byPlace).flatMap(([, ks]) => ks.map((k, i) => { const { x, y } = agentXY(k, i); return <Agent key={k} id={k} x={x} y={y} layers={layers} />; }))}
          </div>
          <div className="absolute left-3.5 bottom-3 pill panel px-3 py-1.5 z-30 max-w-[560px]" style={{ borderRadius: 999 }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--accent)' }} />
            <span className="t-log">M{S.log[0]?.m}</span><span className="t-small truncate" style={{ color: 'var(--ink)' }}><Rich text={S.log[0]?.text || ''} /></span>
          </div>
          <div className="absolute right-3.5 bottom-3 flex gap-2 z-30">
            <div className="panel flex overflow-hidden" style={{ borderRadius: 12 }}>
              <button className="px-3 py-1.5 t-strong" aria-label="Zoom in" onClick={() => setZoom('office')}>+</button>
              <button className="px-3 py-1.5 t-strong" aria-label="Zoom out" onClick={() => setZoom(null)}>−</button>
              <button className="px-3 py-1.5 t-strong" aria-label="Reset view" onClick={() => setZoom(null)}>⌂</button>
            </div>
            <button className="btn btn-sm" onClick={() => setZoom(null)}>Overview</button>
          </div>
        </div>
      </div>
    </div>
  );
}
