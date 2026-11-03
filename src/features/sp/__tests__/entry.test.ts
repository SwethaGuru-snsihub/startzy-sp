import { describe, expect, it } from 'vitest';
import { opensSolutionPlanning, SP_HOME } from '../entry';

describe('Solution Planning as the front door', () => {
  it('opens from the root and the old Startzy account screens', () => {
    for (const p of ['/', '/auth/login', '/auth/signup', '/auth', '/dashboard']) expect(opensSolutionPlanning(p), p).toBe(true);
  });
  it('leaves Solution Planning itself, the Startzy project routes and the demo alone', () => {
    for (const p of ['/sp', '/sp/abc', '/sp/abc/documentation', '/project/proj-medpulse', '/project/new', '/demo', '/hq', '/stage/1', '/authors', '/dashboards-old']) expect(opensSolutionPlanning(p), p).toBe(false);
  });
  it('handles a missing path and points at /sp', () => {
    expect(opensSolutionPlanning(null)).toBe(false);
    expect(opensSolutionPlanning(undefined)).toBe(false);
    expect(SP_HOME).toBe('/sp');
  });
});
