// Caps how many Claude CLI processes run at once on this machine. Each one is a heavy child process using
// the developer's login, so a burst of requests must be turned away (429) rather than started. A slot is
// always handed back through its release function; releasing twice frees nothing extra.
export type Limiter = {
  /** Takes a slot, or returns null when all are in use. */
  tryAcquire(): (() => void) | null;
  readonly active: number;
  readonly max: number;
};

export function createLimiter(max: number): Limiter {
  if (!Number.isInteger(max) || max < 1) throw new Error('A limiter needs a whole number of slots, at least 1.');
  let active = 0;
  return {
    tryAcquire() {
      if (active >= max) return null;
      active++;
      let released = false;
      return () => { if (!released) { released = true; active--; } };
    },
    get active() { return active; },
    max,
  };
}

export const MAX_CLI_PROCESSES = 2;

const KEY = Symbol.for('founder-hq.cliLimiter');
/**
 * The one limiter every route shares. It lives on globalThis because Next can load a module once per route
 * (and again after a hot reload); a plain module variable would give each route its own count of processes.
 */
export function getCliLimiter(): Limiter {
  const g = globalThis as unknown as Record<symbol, Limiter | undefined>;
  return (g[KEY] ??= createLimiter(MAX_CLI_PROCESSES));
}
