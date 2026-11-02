// The browser-wide Founder HQ session host, wired to the core bridge: every time the open project's
// Office state is saved, what the Office approved is recorded in that project's core instance.
import { B, S, active, def } from '@/engine/engine';
import { getCoreRuntime } from './coreRuntime';
import { syncOfficeToCore, type OfficeView } from './coreBridge';
import { createLegacySessionHost, getLegacyStore, type LegacySessionHost } from './legacySession';

/** Reads the open project's Office state (the engine's current state) in the bridge's terms. */
export function readOffice(): OfficeView {
  if (!S.started) return { approved: [], passedFloors: [] };
  const level = S.deleg === 0 || S.deleg === 1 || S.deleg === 2 ? S.deleg as 0 | 1 | 2 : undefined;
  return {
    approved: active().filter(b => B[b.id]?.st === 'approved').map(b => ({
      id: b.id,
      by: B[b.id].by === 'YOU' ? 'YOU' as const : B[b.id].by === 'CEO' ? 'CEO' as const : undefined,
      ...(typeof def(b.id).amount === 'function' ? { amount: Math.round(def(b.id).amount!() * 10) / 10 } : {}),
    })),
    ...(level != null ? { delegation: level } : {}),
    passedFloors: Object.keys(S.passed ?? {}).filter(k => S.passed[k]).map(Number),
  };
}

let host: LegacySessionHost | null = null;
const lastSig = new Map<string, string>();

/** Records the Office's approved work in the core, unless nothing changed since the last time (or `force`). */
export function syncNow(projectId: string, force = false): void {
  if (!host || host.owner() !== projectId) return;
  const office = readOffice();
  const sig = JSON.stringify(office);
  if (!force && lastSig.get(projectId) === sig) return;
  lastSig.set(projectId, sig);
  syncOfficeToCore(getCoreRuntime(), projectId, office);
}

export function getProjectSessions(): LegacySessionHost {
  if (!host) host = createLegacySessionHost({ store: getLegacyStore(), onSync: id => syncNow(id) });
  return host;
}
