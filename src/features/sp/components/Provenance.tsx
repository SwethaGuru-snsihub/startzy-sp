import type { AiFallback } from '../ai/records';
import { AI_BADGE, type Provider } from '../provenance';

/**
 * The label beside a document or result: who wrote it. Simulated stays "SIMULATED"; Claude's text says so;
 * and a simulated answer that is standing in for Claude says that too, with the reason on hover.
 */
export default function Provenance({ provider, simulatedText = 'SIMULATED', fallback }: { provider: Provider; simulatedText?: string; fallback?: AiFallback }) {
  if (provider === 'claude-cli') return <span className="sp-pill go" title="Written by Claude through the local Claude Code CLI, then checked against a fixed format">{AI_BADGE}</span>;
  if (fallback) return <span className="sp-sim" title={`Claude was unavailable: ${fallback.reason} This is the simulated answer.`}>SIMULATED · CLAUDE UNAVAILABLE</span>;
  return <span className="sp-sim">{simulatedText}</span>;
}
