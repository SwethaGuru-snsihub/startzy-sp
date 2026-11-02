'use client';
// The legacy Founder HQ screens (workspace, Office Map, stage, block, gate, inbox) link to each other
// with absolute paths such as /hq and /block/x. Inside a startup project those links must stay inside
// that project, so every legacy link goes through useHref(). With no project (the /demo experience)
// the base is empty and every path is returned unchanged.
import { createContext, useContext } from 'react';

const Base = createContext<string>('');
export const ProjectBaseProvider = Base.Provider;

/** '/project/<id>' inside a startup project, '' for the standalone demo. */
export const useProjectBase = () => useContext(Base);

/** Maps a legacy path (/hq, /block/x, ...) into the current project; unchanged outside a project. */
export function useHref(): (path: string) => string {
  const base = useContext(Base);
  return (path: string) => (!base || path.startsWith('#') || /^[a-z]+:/i.test(path) ? path : path === '/' ? base : base + path);
}
