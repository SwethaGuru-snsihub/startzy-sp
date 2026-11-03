import type { CoreAgentId } from '@/engine/core/definitions';
import { agentLook } from '../model';

/** An agent's face: square for executives, round for crew, Atlas ringed, optional agents dashed. */
export function Face({ id, size = 32 }: { id: CoreAgentId; size?: number }) {
  const a = agentLook(id);
  return <span className="face" aria-hidden style={{ ['--c' as string]: a.color, width: size, height: size, borderRadius: a.crew ? '50%' : Math.round(size * 0.31), display: 'grid', placeItems: 'center', fontSize: Math.round(size * 0.31), fontWeight: 800, color: '#fff', background: a.color, flex: 'none' }}>{id === 'FOUNDER' ? 'YOU' : id}</span>;
}
