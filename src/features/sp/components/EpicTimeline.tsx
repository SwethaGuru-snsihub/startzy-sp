// The sheet tasks of one feature, in the order they run: who does each, what it is and where it stands.
// A reusable piece for every epic: it takes rows and shows them, and keeps no state of its own.
import type { TimelineRow } from '../spec/epic1';
import { STATUS_LABEL, statusTone } from '../viewModel';

export default function EpicTimeline({ rows }: { rows: TimelineRow[] }) {
  if (!rows.length) return null;
  return (
    <ol className="sp-tl" aria-label="Tasks in this feature">
      {rows.map(r => (
        <li key={r.id} className={`sp-tl-row ${r.status}`}>
          <span className="sp-tl-id">{r.label}</span>
          <span className="sp-tl-body">
            <span className="sp-row"><b>{r.title}</b><span className={`sp-pill ${statusTone(r.status)}`}>{STATUS_LABEL[r.status]}</span>{r.byAgents && <span className="sp-sim">Simulated</span>}{r.simulatedStep && <span className="sp-pill" title="The engine has no task for this step yet">UI step</span>}</span>
            <span className="t-small sp-tl-meta">{r.responsible}</span>
            <span className="t-small sp-tl-meta">{r.process}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
