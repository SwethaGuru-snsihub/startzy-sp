import { AI_BADGE, type Provider } from '../provenance';

/** The label beside a document or result: who wrote it. Simulated stays "SIMULATED"; Claude's text says so. */
export default function Provenance({ provider, simulatedText = 'SIMULATED' }: { provider: Provider; simulatedText?: string }) {
  return provider === 'claude-cli'
    ? <span className="sp-pill go" title="Written by Claude through the local Claude Code CLI, then checked against a fixed format">{AI_BADGE}</span>
    : <span className="sp-sim">{simulatedText}</span>;
}
