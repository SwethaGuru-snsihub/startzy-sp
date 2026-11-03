import Link from 'next/link';
import { agentLook, DESK_SLOTS, ROOMS, type SpRoomId } from '../model';
import type { AgentSpot, RoomCard } from '../viewModel';

/* The Agent Office. Rooms are skills (not phases); an agent sits at a desk, walks to the room where its
   task is worked, and is shown working or reviewing when the core says so. Positions and states come
   from the view model. Rooms and agents open their details; the Repository opens Documentation. */
export default function OfficeMap({ rooms, spots, memory, docs, docsHref, onAgent, onRoom }: {
  rooms: RoomCard[]; spots: AgentSpot[]; memory: number; docs: { count: number; waiting: number }; docsHref: string;
  onAgent: (id: string) => void; onRoom: (id: SpRoomId) => void;
}) {
  const card = (id: string) => rooms.find(r => r.id === id)!;
  return (
    <div className="sp-mapwrap">
      <div className="sp-map" aria-label="Agent Office">
        {ROOMS.map(r => {
          const c = card(r.id);
          const style = { left: `${r.x}%`, top: `${r.y}%`, width: `${r.w}%`, height: `${r.h}%`, ['--rt' as string]: `var(${r.tint})` };
          if (r.id === 'repo') {
            return (
              <Link key={r.id} href={docsHref} className={`sp-room sp-repo ${docs.waiting ? 'on' : 'idle'}`} style={style} aria-label={`Repository: ${docs.count} documents`}>
                <h4>{r.name}</h4><div className="big">{docs.count}</div><small>documents</small><small>{docs.waiting ? `${docs.waiting} need you` : 'all clear'}</small>
              </Link>
            );
          }
          return (
            <div key={r.id} className={`sp-room clickable ${c.active ? 'on' : 'idle'}`} style={style} role="button" tabIndex={0} aria-label={`${r.name} room`} onClick={() => onRoom(r.id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRoom(r.id); } }}>
              <h4>{r.name}</h4>
              <div className="rs">{r.id === 'hub' ? 'Optional agents' : `Doing ${c.doing} · Waiting ${c.waiting} · Done ${c.done}`}</div>
              {r.id !== 'hub' && <span className="tag">{c.active ? 'Active' : 'Idle'}</span>}
              {DESK_SLOTS.slice(0, r.desks).map((s, i) => <i key={i} className="sp-desk" style={{ left: `${s[0] * 100}%`, top: `${s[1] * 100}%` }} />)}
            </div>
          );
        })}
        <div className="sp-hub"><div><div className="cap">Command centre</div><b>Atlas · shared memory</b><span>{memory} notes</span></div></div>
        <svg className="sp-flows" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          {rooms.filter(c => c.doing > 0).map(c => { const r = ROOMS.find(x => x.id === c.id)!; return <line key={c.id} x1="50" y1="50" x2={r.x + r.w / 2} y2={r.y + r.h / 2} />; })}
        </svg>
        {spots.map(s => {
          const a = agentLook(s.id);
          return (
            <button key={s.id} type="button" className={['sp-ag', a.crew ? 'crew' : '', s.id === 'CEO' ? 'ceo' : '', a.optional ? 'optional' : '', s.state].join(' ')} style={{ left: `${s.x}%`, top: `${s.y}%`, ['--c' as string]: a.color }} title={`${a.name} · ${a.role}`} aria-label={`${a.name}, ${a.role}${s.bubble ? `, ${s.bubble}` : ''}`} onClick={() => onAgent(s.id)}>
              {s.bubble && <span className="bub">{s.bubble}</span>}
              <span className="face">{s.id === 'FOUNDER' ? 'YOU' : s.id}</span>
              <span className="nm">{a.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
