/**
 * Combined workouts never collapse to push only (enable_home_v2, owner bug 20.10.2026).
 * station-balance.ts holds the root-cause notes.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { routeTargetDomainsOf, singleStationDomainMode } from '../station-balance';

const child = (id: string | undefined): string[] =>
  id === 'push' ? ['push'] : id === 'full_body' ? ['push', 'pull', 'legs', 'core'] : id === 'pull' ? ['pull'] : id === 'lower_body' ? ['legs', 'core'] : [];

describe('route + stops target domains', () => {
  it('flag OFF → only the first active program (today, unchanged)', () => {
    expect(routeTargetDomainsOf([{ templateId: 'push' }, { templateId: 'pull' }, { templateId: 'lower_body' }], child, false)).toEqual(['push']);
    expect(routeTargetDomainsOf(undefined, child, false)).toEqual([]);
  });
  it('BUG repro: a first "push" program made every station push → ON: every program counts', () => {
    expect(routeTargetDomainsOf([{ templateId: 'push' }, { templateId: 'pull' }, { templateId: 'lower_body' }], child, true))
      .toEqual(['push', 'pull', 'legs', 'core']);
  });
  it('ON: deduped, empty / missing programs skipped', () => {
    expect(routeTargetDomainsOf([{ templateId: 'full_body' }, null, { templateId: 'pull' }, {}], child, true)).toEqual(['push', 'pull', 'legs', 'core']);
  });
});

describe('single-station combined card', () => {
  it('ON → one full-body station ("multi"); OFF → unchanged', () => {
    expect(singleStationDomainMode(true)).toBe('multi');
    expect(singleStationDomainMode(true, 'per_station')).toBe('multi');
    expect(singleStationDomainMode(false)).toBeUndefined();
    expect(singleStationDomainMode(false, 'per_station')).toBe('per_station');
  });

  it('composeHybridPlan and route-stops are wired to the switch (flag off = byte-identical input)', () => {
    const src = readFileSync(join(__dirname, '..', 'start-hybrid-session.ts'), 'utf8');
    expect(src).toContain('composeHybridSession(v2 ? { ...input, stationDomainMode: singleStationDomainMode(v2, input.stationDomainMode) } : input)');
    expect(src).toContain('routeTargetDomainsOf(');
    expect(src).not.toMatch(/activePrograms\?\.\[0\]\?\.templateId;\s*\n\s*const targetDomains = resolveChildDomainsForParent/);
  });
});
