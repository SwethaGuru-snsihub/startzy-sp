// The five slots of epic 1 with where each value came from, how sure the agents are, and the founder's own
// words where they were quoted. Everything here is simulated and says so.
import { PROVENANCE_LABEL, SLOT_LABEL, slotOwners, type Provenance, type SlotValue } from '../slots';

const TONE: Record<Provenance, string> = { explicit: 'go', confirmed: 'go', inferred: 'run', assumption: 'bad', empty: '' };
const CONFIDENCE = { high: 'High confidence', medium: 'Medium confidence', low: 'Low confidence' } as const;

export default function SlotsPanel({ slots }: { slots: SlotValue[] }) {
  return (
    <section className="sp-slots" aria-label="Slots">
      <div className="sp-row"><h4 style={{ margin: 0 }}>Slots</h4><span className="sp-sim">SIMULATED</span></div>
      {slots.map(s => {
        const o = slotOwners(s.slot);
        return (
          <div key={s.slot} className="sp-slot">
            <div className="sp-row"><b>{SLOT_LABEL[s.slot]}</b><span className={`sp-pill ${TONE[s.provenance]}`}>{PROVENANCE_LABEL[s.provenance]}</span>{s.confidence && <span className="t-small">{CONFIDENCE[s.confidence]}</span>}</div>
            <p>{s.value || '—'}</p>
            {s.evidence && s.evidence !== s.value && <blockquote className="sp-quote">{s.evidence}</blockquote>}
            {s.rationale && <span className="t-small">{s.rationale}</span>}
            <span className="t-small sp-tl-meta">Filled by {o.owner}{o.supporting ? `, with ${o.supporting}` : ''}</span>
          </div>
        );
      })}
    </section>
  );
}
