'use client';
import { useSyncExternalStore } from 'react';
import { getVersion, subscribe } from './engine';

/** Re-render whenever the engine emits a change. Components read engine state directly. */
export function useEngine() {
  return useSyncExternalStore(subscribe, getVersion, getVersion);
}
