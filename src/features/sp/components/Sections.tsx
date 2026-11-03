import type { Section } from '../content';

/** The sections of a document version, marking the ones the founder edited and the ones that changed since the version before. */
export function Sections({ secs, prev }: { secs: Section[]; prev?: Section[] }) {
  return (
    <>
      {secs.map(s => {
        const changed = prev && prev.find(x => x.h === s.h)?.b !== s.b;
        return (
          <div key={s.h} className="sp-sec">
            <h5>{s.h}{s.edited && <span className="sp-pill you" style={{ marginLeft: 8 }}>Edited by you</span>}{changed && <span className="sp-pill run" style={{ marginLeft: 8 }}>Changed</span>}</h5>
            {s.hint && <div className="t-small" style={{ fontSize: 11.5 }}>{s.hint}</div>}
            <p>{s.b}</p>
          </div>
        );
      })}
    </>
  );
}
