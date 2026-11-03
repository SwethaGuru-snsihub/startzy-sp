'use client';
import OfficeMap from '@/features/sp/components/OfficeMap';
import { useSp } from '@/features/sp/SpContext';
import { agentSpots, nextStep, roomCards } from '@/features/sp/viewModel';

/* Agent Office tab: the rooms, the agents at their desks, and what they are doing right now. The line
   under the map always says what happens next, and the button opens the founder's next step. */
export default function OfficePage() {
  const { id, project, rows, phases, open, openTask } = useSp();
  const next = nextStep(rows);
  const task = next.task ? rows.find(r => r.id === next.task) : undefined;
  const docs = { count: rows.filter(r => r.status === 'done').length, waiting: rows.filter(r => r.status === 'needs').length };
  return (
    <>
      <OfficeMap rooms={roomCards(rows)} spots={agentSpots(rows, phases)} memory={project.events.filter(e => e.type === 'approved').length} docs={docs} docsHref={`/sp/${id}/documentation`} onAgent={a => open({ kind: 'agent', id: a })} onRoom={r => open({ kind: 'room', id: r })} />
      <div className="sp-note" role="status" aria-live="polite">
        <span className={`sp-pill ${next.tone === 'you' ? 'you' : next.tone === 'done' ? 'go' : 'run'}`}>{next.tone === 'you' ? 'Next for you' : next.tone === 'done' ? 'Done' : next.tone === 'run' ? 'In progress' : 'Waiting'}</span>
        <span style={{ flex: 1, minWidth: 200 }}>{next.text}</span>
        {task && <button type="button" className="btn btn-sm btn-primary" onClick={() => openTask(task)}>Open</button>}
      </div>
      <div className="sp-legend"><span>Square: executive</span><span>Circle: crew</span><span>Dashed: optional, joins when a task needs it</span><span>Click a room, an agent or a task for details. Rooms are skills; the phases only filter.</span></div>
    </>
  );
}
