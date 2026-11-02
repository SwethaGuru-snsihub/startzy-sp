// Centralised route builders and route utilities for project workspace URLs.
// All project-scoped paths are constructed here so that renaming a segment
// requires one change in one place.

export type BuilderSection = 'package' | 'build' | 'quality' | 'release' | 'operate';
export type Layer = 'overview' | 'hq' | 'planning' | 'builder' | 'shared';

// ── Builder section metadata ────────────────────────────────────────────────

export const BUILDER_SECTIONS: { key: BuilderSection; label: string; stage: string }[] = [
  { key: 'package', label: 'Package review',        stage: 'Stage I' },
  { key: 'build',   label: 'Build workspace',        stage: 'Stage II' },
  { key: 'quality', label: 'Testing & quality',      stage: 'Stage III' },
  { key: 'release', label: 'Release & delivery',     stage: 'Stage IV' },
  { key: 'operate', label: 'Optimization & operations', stage: 'Stage V' },
];

// ── Route builders ───────────────────────────────────────────────────────────

function enc(id: string) { return encodeURIComponent(id); }

export const R = {
  overview:      (id: string)                          => `/project/${enc(id)}`,
  hq:            (id: string)                          => `/project/${enc(id)}/hq`,
  phase:         (id: string, phase: number)           => `/project/${enc(id)}/hq/phase/${phase}`,
  office:        (id: string)                          => `/project/${enc(id)}/hq/office`,
  agents:        (id: string)                          => `/project/${enc(id)}/hq/agents`,
  decisions:     (id: string)                          => `/project/${enc(id)}/hq/decisions`,
  planning:      (id: string)                          => `/project/${enc(id)}/planning`,
  step:          (id: string, step: number)            => `/project/${enc(id)}/planning/step/${step}`,
  builder:       (id: string)                          => `/project/${enc(id)}/builder`,
  builderSection:(id: string, section: BuilderSection) => `/project/${enc(id)}/builder/${section}`,
  inbox:         (id: string)                          => `/project/${enc(id)}/inbox`,
  context:       (id: string)                          => `/project/${enc(id)}/context`,
  settings:      (id: string)                          => `/project/${enc(id)}/settings`,
  task:          (id: string, taskId: string)          => `/project/${enc(id)}/task/${taskId}`,
  artifact:      (id: string, artifactId: string)      => `/project/${enc(id)}/artifact/${artifactId}`,
};

// ── Parameter parsers ────────────────────────────────────────────────────────

/** Returns the integer phase (1–18) or null if the string is invalid. */
export function parsePhase(s: string | undefined): number | null {
  if (s === undefined) return null;
  if (!/^\d+$/.test(s)) return null;          // rejects '1.5', '1e1', leading zeros for multi-digit, ' 2'
  if (s.length > 1 && s[0] === '0') return null; // rejects '01', '03', …
  const n = Number(s);
  if (!Number.isInteger(n) || n < 1 || n > 18) return null;
  return n;
}

/** Returns the integer step (1–16) or null if the string is invalid. */
export function parseStep(s: string | undefined): number | null {
  if (s === undefined) return null;
  if (!/^\d+$/.test(s)) return null;
  if (s.length > 1 && s[0] === '0') return null;
  const n = Number(s);
  if (!Number.isInteger(n) || n < 1 || n > 16) return null;
  return n;
}

/** Validates a Next.js dynamic param value — rejects arrays and undefined. */
export function parseIndex(raw: string | string[] | undefined, _max: number): string | null {
  if (raw === undefined || Array.isArray(raw)) return null;
  return raw;
}

// ── Path utilities ───────────────────────────────────────────────────────────

/**
 * Returns the portion of `path` after `/project/<id>`, normalised without a
 * trailing slash, or null if the path is not rooted at that project.
 */
export function restOf(path: string, id: string): string | null {
  const prefix = `/project/${enc(id)}`;
  if (path !== prefix && !path.startsWith(prefix + '/')) return null;
  return path.slice(prefix.length).replace(/\/$/, '');
}

/**
 * Determines which workspace layer a URL belongs to.
 * Uses exact-segment matching to avoid false positives from /hqx vs /hq.
 */
export function layerOf(path: string, id: string): Layer {
  const rest = restOf(path, id);
  if (rest === null) return 'shared';
  if (rest === '' || rest === '/') return 'overview';
  const segment = rest.split('/')[1]; // first segment after the leading ''
  if (segment === 'hq') return 'hq';
  if (segment === 'planning') return 'planning';
  if (segment === 'builder') return 'builder';
  return 'shared';
}

/**
 * Rewrites a project workspace URL to a different project, preserving the
 * sub-path when it is meaningful (hq, planning, builder layers).
 */
export function switchProjectPath(path: string, fromId: string, toId: string): string {
  const rest = restOf(path, fromId);
  if (rest === null) return R.overview(toId);
  const layer = layerOf(path, fromId);
  if (layer === 'shared') return R.overview(toId);
  return `/project/${enc(toId)}${rest}`.replace(/\/$/, '');
}

/** Returns true when `current` starts with `href` as a path segment prefix. */
export function isActive(current: string, href: string, exact = false): boolean {
  if (exact) return current === href;
  if (current === href) return true;
  return current.startsWith(href + '/');
}

// ── Breadcrumbs ──────────────────────────────────────────────────────────────

export type Crumb = { label: string; href: string };

export function crumbs(path: string, id: string, name: string): Crumb[] {
  const base: Crumb[] = [
    { label: 'Dashboard', href: '/dashboard' },
    { label: name,        href: R.overview(id) },
  ];

  const rest = restOf(path, id);
  if (!rest) return base;

  const segments = rest.split('/').filter(Boolean); // e.g. ['hq','phase','3']
  const layer = layerOf(path, id);

  if (layer === 'hq') {
    base.push({ label: 'Founder HQ', href: R.hq(id) });
    if (segments[1] === 'phase' && segments[2]) {
      base.push({ label: `Phase ${segments[2]}`, href: R.phase(id, Number(segments[2])) });
    } else if (segments[1] === 'office') {
      base.push({ label: 'Office map', href: R.office(id) });
    } else if (segments[1] === 'agents') {
      base.push({ label: 'Agents', href: R.agents(id) });
    } else if (segments[1] === 'decisions') {
      base.push({ label: 'Decisions', href: R.decisions(id) });
    }
    return base;
  }

  if (layer === 'planning') {
    base.push({ label: 'Solution Planning', href: R.planning(id) });
    if (segments[1] === 'step' && segments[2]) {
      base.push({ label: `Step ${segments[2]}`, href: R.step(id, Number(segments[2])) });
    }
    return base;
  }

  if (layer === 'builder') {
    base.push({ label: 'Solution Builder', href: R.builder(id) });
    const section = segments[1] as BuilderSection | undefined;
    if (section) {
      const meta = BUILDER_SECTIONS.find(s => s.key === section);
      const label = meta?.label ?? section;
      base.push({ label, href: R.builderSection(id, section as BuilderSection) });
    }
    return base;
  }

  // shared layer — inbox, context, settings, task, artifact
  const SHARED_LABELS: Record<string, string> = {
    inbox: 'Inbox', context: 'Context', settings: 'Settings',
    task: 'Task', artifact: 'Artifact',
  };
  const top = segments[0];
  if (top && SHARED_LABELS[top]) {
    base.push({ label: SHARED_LABELS[top], href: `${R.overview(id)}/${top}` });
  }
  return base;
}
