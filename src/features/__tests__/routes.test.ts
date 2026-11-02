import { describe, expect, it } from 'vitest';
import { BUILDER_SECTIONS, R, crumbs, isActive, layerOf, parseIndex, parsePhase, parseStep, restOf, switchProjectPath } from '../shell/routes';

describe('route builders', () => {
  it('builds every project URL from one place', () => {
    expect(R.overview('p1')).toBe('/project/p1');
    expect(R.hq('p1')).toBe('/project/p1/hq');
    expect(R.phase('p1', 14)).toBe('/project/p1/hq/phase/14');
    expect(R.step('p1', 16)).toBe('/project/p1/planning/step/16');
    expect(R.builderSection('p1', 'quality')).toBe('/project/p1/builder/quality');
    expect(R.task('p1', 'gate1')).toBe('/project/p1/task/gate1');
    expect(R.artifact('p1', 'sad')).toBe('/project/p1/artifact/sad');
    expect([R.inbox('p1'), R.context('p1'), R.settings('p1'), R.office('p1'), R.agents('p1'), R.decisions('p1'), R.planning('p1'), R.builder('p1')]).toEqual([
      '/project/p1/inbox', '/project/p1/context', '/project/p1/settings', '/project/p1/hq/office', '/project/p1/hq/agents', '/project/p1/hq/decisions', '/project/p1/planning', '/project/p1/builder']);
  });
  it('encodes unusual ids', () => { expect(R.hq('a b/c')).toBe('/project/a%20b%2Fc/hq'); });
  it('has the five Builder sections', () => { expect(BUILDER_SECTIONS.map(s => s.key)).toEqual(['package', 'build', 'quality', 'release', 'operate']); });
});

describe('route parameters', () => {
  it('accepts only whole numbers inside the range', () => {
    expect([1, 9, 18].map(n => parsePhase(String(n)))).toEqual([1, 9, 18]);
    expect([1, 16].map(n => parseStep(String(n)))).toEqual([1, 16]);
    for (const bad of ['0', '19', '-1', '1.5', '03', 'abc', '', ' 2', '1e1', '999']) expect(parsePhase(bad)).toBeNull();
    expect(parseStep('17')).toBeNull();
    expect(parseIndex(undefined, 5)).toBeNull();
    expect(parseIndex(['1'], 5)).toBeNull();
  });
});

describe('layers, switching and breadcrumbs', () => {
  it('detects the layer from the path', () => {
    expect(layerOf('/project/p1', 'p1')).toBe('overview');
    expect(layerOf('/project/p1/', 'p1')).toBe('overview');
    expect(layerOf('/project/p1/hq', 'p1')).toBe('hq');
    expect(layerOf('/project/p1/hq/phase/3', 'p1')).toBe('hq');
    expect(layerOf('/project/p1/planning/step/2', 'p1')).toBe('planning');
    expect(layerOf('/project/p1/builder/quality', 'p1')).toBe('builder');
    expect(layerOf('/project/p1/inbox', 'p1')).toBe('shared');
    expect(layerOf('/project/p1/task/sad', 'p1')).toBe('shared');
    expect(layerOf('/project/p1/hqx', 'p1')).toBe('shared');          // not confused by a prefix
  });
  it('keeps the same page when switching project', () => {
    expect(switchProjectPath('/project/a/hq/phase/4', 'a', 'b')).toBe('/project/b/hq/phase/4');
    expect(switchProjectPath('/project/a/planning', 'a', 'b')).toBe('/project/b/planning');
    expect(switchProjectPath('/project/a', 'a', 'b')).toBe('/project/b');
    expect(switchProjectPath('/project/a/builder/release/', 'a', 'b')).toBe('/project/b/builder/release');
  });
  it('restOf ignores other projects and trailing slashes', () => {
    expect(restOf('/project/a/hq/', 'a')).toBe('/hq');
    expect(restOf('/project/ab/hq', 'a')).toBeNull();
    expect(restOf('/project/a', 'a')).toBe('');
    expect(layerOf('/project/ab/hq', 'a')).toBe('shared');
    expect(switchProjectPath('/project/ab/hq', 'a', 'b')).toBe('/project/b');
  });
  it('builds breadcrumbs for each layer', () => {
    expect(crumbs('/project/p1/hq/phase/3', 'p1', 'Acme').map(c => c.label)).toEqual(['Dashboard', 'Acme', 'Founder HQ', 'Phase 3']);
    expect(crumbs('/project/p1/planning/step/9', 'p1', 'Acme').map(c => c.label)).toEqual(['Dashboard', 'Acme', 'Solution Planning', 'Step 9']);
    expect(crumbs('/project/p1/builder/quality', 'p1', 'Acme').map(c => c.label)).toEqual(['Dashboard', 'Acme', 'Solution Builder', 'Testing & quality']);
    expect(crumbs('/project/p1', 'p1', 'Acme').map(c => c.label)).toEqual(['Dashboard', 'Acme']);
    expect(crumbs('/project/p1/inbox', 'p1', 'Acme').at(-1)!.label).toBe('Inbox');
  });
  it('marks the active link', () => {
    expect(isActive('/project/a/hq/phase/2', '/project/a/hq')).toBe(true);
    expect(isActive('/project/a/hq/phase/2', '/project/a/hq', true)).toBe(false);
    expect(isActive('/project/a/hqx', '/project/a/hq')).toBe(false);
  });
});
