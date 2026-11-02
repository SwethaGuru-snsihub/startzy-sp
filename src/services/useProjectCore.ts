'use client';
import { useEffect, useSyncExternalStore } from 'react';
import { CORE_KEY_PREFIX } from './coreStorage';
import { getCoreRuntime, type CoreRuntime } from './coreRuntime';

/**
 * Subscribes the component to the core runtime (re-renders when any project's workflow state changes)
 * and keeps it in step with other tabs. Read entries with runtime.getEntry(id) and derive with viewOf().
 */
export function useCoreRuntime(): CoreRuntime {
  const rt = getCoreRuntime();
  useSyncExternalStore(rt.subscribe, rt.getVersion, rt.getVersion);
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (!e.key || !e.key.startsWith(CORE_KEY_PREFIX) || e.key.startsWith(`${CORE_KEY_PREFIX}corrupt:`)) return;
      const id = e.key.slice(CORE_KEY_PREFIX.length);
      if (rt.getEntry(id)) rt.reload(id);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [rt]);
  return rt;
}
