import type { AiFallback } from '../ai/records';

/** Shown above a draft when the simulated provider stood in because Claude could not answer. Never silent. */
export default function FallbackBanner({ fallback }: { fallback: AiFallback }) {
  return (
    <div className="sp-banner bad" role="status">
      <span><b>Claude was unavailable.</b> This draft is simulated, not written by Claude. {fallback.reason}</span>
    </div>
  );
}
