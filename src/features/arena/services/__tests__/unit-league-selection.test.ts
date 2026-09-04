import { describe, it, expect } from 'vitest';
import { selectUnitLeagueEntries, type UnitDirectoryEntry, type UnitAggregateDoc } from '../unit-league-selection';

// Fixture: חטיבה 810 > גדוד 9307 > {פלוגה א, פלוגה ב}, plus a second brigade
// חטיבה 11 for the "all X nationally" ranges.
const UNITS: UnitDirectoryEntry[] = [
  { directoryId: 'brigade810', name: 'חטיבה 810', level: 'brigade', orgId: 'brigade810', unitId: null, parentId: null },
  { directoryId: 'brigade810__bat9307', name: 'גדוד 9307', level: 'battalion', orgId: 'brigade810', unitId: 'bat9307', parentId: 'brigade810' },
  { directoryId: 'brigade810__coA', name: 'פלוגה א', level: 'company', orgId: 'brigade810', unitId: 'coA', parentId: 'brigade810__bat9307' },
  { directoryId: 'brigade810__coB', name: 'פלוגה ב', level: 'company', orgId: 'brigade810', unitId: 'coB', parentId: 'brigade810__bat9307' },
  { directoryId: 'brigade11', name: 'חטיבה 11', level: 'brigade', orgId: 'brigade11', unitId: null, parentId: null },
  { directoryId: 'brigade11__bat202', name: 'גדוד 202', level: 'battalion', orgId: 'brigade11', unitId: 'bat202', parentId: 'brigade11' },
];

function agg(directoryId: string, activeParticipantCount: number, avgSteps: number | null): UnitAggregateDoc {
  return { directoryId, activeParticipantCount, avgSteps, updatedAt: new Date('2026-09-05T10:00:00Z') };
}

describe('selectUnitLeagueEntries — ranges', () => {
  it('my_battalion_companies: only companies under MY battalion, sorted by avgSteps desc', () => {
    const aggregates = [agg('brigade810__coA', 4, 7000), agg('brigade810__coB', 3, 9000)];
    const result = selectUnitLeagueEntries('my_battalion_companies', UNITS, aggregates, 'brigade810', ['bat9307']);
    expect(result.entries.map((e) => e.directoryId)).toEqual(['brigade810__coB', 'brigade810__coA']);
  });

  it('my_brigade_battalions: only battalions directly under MY brigade', () => {
    const aggregates = [agg('brigade810__bat9307', 5, 8000), agg('brigade11__bat202', 5, 8000)];
    const result = selectUnitLeagueEntries('my_brigade_battalions', UNITS, aggregates, 'brigade810', []);
    expect(result.entries.map((e) => e.directoryId)).toEqual(['brigade810__bat9307']);
  });

  it('all_companies: every company nationally, regardless of viewer brigade', () => {
    const aggregates = [agg('brigade810__coA', 4, 7000), agg('brigade810__coB', 3, 9000)];
    const result = selectUnitLeagueEntries('all_companies', UNITS, aggregates, 'brigade11', []);
    expect(result.entries.map((e) => e.directoryId).sort()).toEqual(['brigade810__coA', 'brigade810__coB']);
  });

  it('all_brigades: every brigade nationally', () => {
    const aggregates = [agg('brigade810', 5, 6000), agg('brigade11', 4, 9000)];
    const result = selectUnitLeagueEntries('all_brigades', UNITS, aggregates, 'brigade810', []);
    expect(result.entries.map((e) => e.directoryId)).toEqual(['brigade11', 'brigade810']);
  });
});

describe('selectUnitLeagueEntries — breadcrumb', () => {
  it('company breadcrumb is "battalion · brigade", nearest first', () => {
    const aggregates = [agg('brigade810__coA', 3, 8000)];
    const result = selectUnitLeagueEntries('all_companies', UNITS, aggregates, null, []);
    expect(result.entries[0].parentBreadcrumb).toBe('גדוד 9307 · חטיבה 810');
  });

  it('brigade breadcrumb is null — no parent', () => {
    const aggregates = [agg('brigade810', 3, 8000)];
    const result = selectUnitLeagueEntries('all_brigades', UNITS, aggregates, null, []);
    expect(result.entries[0].parentBreadcrumb).toBeNull();
  });
});

describe('selectUnitLeagueEntries — floor + below-floor CTA (the core product requirement)', () => {
  it('a unit below the floor is omitted from entries entirely when it is not the viewer\'s own unit', () => {
    const aggregates = [agg('brigade810__coA', 1, null)];
    const result = selectUnitLeagueEntries('all_companies', UNITS, aggregates, 'brigade11', []);
    expect(result.entries).toHaveLength(0);
    expect(result.myUnitBelowFloor).toBeNull();
  });

  it('when the below-floor unit IS the viewer\'s own, myUnitBelowFloor reports exactly how many more are needed', () => {
    const aggregates = [agg('brigade810__coA', 1, null)];
    const result = selectUnitLeagueEntries('my_battalion_companies', UNITS, aggregates, 'brigade810', ['bat9307', 'coA']);
    expect(result.entries).toHaveLength(0);
    expect(result.myUnitBelowFloor).toEqual({ name: 'פלוגה א', activeParticipantCount: 1, needed: 2 });
  });

  it('a unit with zero declared reservists (no aggregate doc at all) is simply absent, not a below-floor CTA', () => {
    const result = selectUnitLeagueEntries('my_battalion_companies', UNITS, [], 'brigade810', ['bat9307']);
    expect(result.entries).toHaveLength(0);
    expect(result.myUnitBelowFloor).toBeNull();
  });
});

describe('selectUnitLeagueEntries — isMyUnit + updatedAt', () => {
  it('marks the viewer\'s own unit in the ranked list', () => {
    const aggregates = [agg('brigade810__coA', 4, 7000), agg('brigade810__coB', 3, 9000)];
    const result = selectUnitLeagueEntries('my_battalion_companies', UNITS, aggregates, 'brigade810', ['bat9307', 'coA']);
    const mine = result.entries.find((e) => e.directoryId === 'brigade810__coA');
    const other = result.entries.find((e) => e.directoryId === 'brigade810__coB');
    expect(mine?.isMyUnit).toBe(true);
    expect(other?.isMyUnit).toBe(false);
  });

  it('updatedAt is the most recent among the units actually shown', () => {
    const older = { directoryId: 'brigade810__coA', activeParticipantCount: 4, avgSteps: 7000, updatedAt: new Date('2026-09-05T08:00:00Z') };
    const newer = { directoryId: 'brigade810__coB', activeParticipantCount: 3, avgSteps: 9000, updatedAt: new Date('2026-09-05T10:00:00Z') };
    const result = selectUnitLeagueEntries('my_battalion_companies', UNITS, [older, newer], 'brigade810', ['bat9307']);
    expect(result.updatedAt).toEqual(newer.updatedAt);
  });
});
