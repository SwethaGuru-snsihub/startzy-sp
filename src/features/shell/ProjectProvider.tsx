'use client';
// ProjectProvider — makes the current project's id (and summary) available to
// any component inside the /project/[id] subtree without prop-drilling.
import React, { createContext, useContext } from 'react';
import type { ProjectRecord } from '@/services/projectStore';

// ── Context ──────────────────────────────────────────────────────────────────

type ProjectContextValue = {
  /** The url-safe project id, e.g. 'proj-medpulse'. */
  id: string;
  /** Full project summary from the store (may be null during SSR before hydration). */
  project: ProjectRecord | null;
};

const ProjectContext = createContext<ProjectContextValue | null>(null);

// ── Provider ─────────────────────────────────────────────────────────────────

export function ProjectProvider({
  id,
  project,
  children,
}: {
  id: string;
  project: ProjectRecord | null;
  children: React.ReactNode;
}) {
  return (
    <ProjectContext.Provider value={{ id, project }}>
      {children}
    </ProjectContext.Provider>
  );
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

/**
 * Returns the current project context. Throws if used outside a
 * `<ProjectProvider>` — this is intentional to surface misconfiguration early.
 */
export function useProject(): ProjectContextValue {
  const ctx = useContext(ProjectContext);
  if (!ctx) {
    throw new Error('useProject must be used inside a <ProjectProvider>. Make sure the /project/[id] layout wraps its children with ProjectProvider.');
  }
  return ctx;
}

/**
 * Like `useProject`, but asserts `id` is non-empty. Use this in components
 * that require an initialised project context to render meaningful content.
 */
export function useReadyProject(): { id: string; project: ProjectRecord | null } {
  const { id, project } = useProject();
  if (!id) {
    throw new Error('useReadyProject: project id is empty. The ProjectProvider may not have been initialised yet.');
  }
  return { id, project };
}
