import { describe, it, expect } from 'vitest';
import { isPathAllowed, pathMatches, sectionOwnsPath, allowedPathsFor } from '../adminSections';

describe('pathMatches', () => {
  it('/admin and /admin/users are exact; others match the screen and its sub-pages', () => {
    expect(pathMatches('/admin', '/admin')).toBe(true);
    expect(pathMatches('/admin', '/admin/journey')).toBe(false);
    expect(pathMatches('/admin/users', '/admin/users')).toBe(true);
    expect(pathMatches('/admin/users', '/admin/users/all')).toBe(false);
    expect(pathMatches('/admin/users', '/admin/users/abc123')).toBe(false);
    expect(pathMatches('/admin/running', '/admin/running/pace-map')).toBe(true);
    expect(pathMatches('/admin/running', '/admin/running-legacy')).toBe(false);
  });
});

describe('platform-member allowlist', () => {
  it('a dev member no longer opens the product users screens through the /admin/users prefix', () => {
    expect(isPathAllowed(['dev'], '/admin/users')).toBe(true);
    expect(isPathAllowed(['dev'], '/admin/users/all')).toBe(false);
    expect(isPathAllowed(['dev'], '/admin/users/u1')).toBe(false);
    expect(isPathAllowed(['product'], '/admin/users/all')).toBe(true);
  });
  it('legacy section keys still resolve', () => {
    expect(isPathAllowed(['running'], '/admin/running/workouts')).toBe(true);
    expect(isPathAllowed(['system'], '/admin/journey')).toBe(true);
  });
  it('unknown keys grant nothing', () => {
    expect(allowedPathsFor(['nope'])).toEqual([]);
  });
  it('highlight-only screens are never granted', () => {
    expect(isPathAllowed(['product'], '/admin/community-groups-overview')).toBe(false);
    expect(isPathAllowed(['dev'], '/admin/agents')).toBe(false);
  });
});

describe('sidebar highlight', () => {
  it('owns its screens plus highlight-only ones; never a sibling section\'s', () => {
    expect(sectionOwnsPath('product', '/admin/users/all')).toBe(true);
    expect(sectionOwnsPath('dev', '/admin/users/all')).toBe(false);
    expect(sectionOwnsPath('product', '/admin/community-groups-overview')).toBe(true);
    expect(sectionOwnsPath('dev', '/admin/agents')).toBe(true);
    expect(sectionOwnsPath('strategy', '/admin')).toBe(true);
    expect(sectionOwnsPath('strategy', '/admin/journey')).toBe(false);
  });
});
