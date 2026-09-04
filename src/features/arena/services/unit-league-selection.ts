/**
 * Pure selection/ranking logic for unit-vs-unit leagues (Phase 6b), split
 * out of unit-league.service.ts so it's unit-testable without Firestore
 * (matching derive-arena-access.ts's own pattern in this same feature).
 * Takes already-fetched unit_league_aggregates + unitDirectory data and
 * the viewer's own declaration, and produces exactly what one of the four
 * approved ranges (docs/research/military-persona-unified-architecture.md
 * §12) should show.
 */

export type UnitLeagueRange =
  | 'my_battalion_companies'
  | 'my_brigade_battalions'
  | 'all_companies'
  | 'all_brigades';

export interface UnitDirectoryEntry {
  directoryId: string;
  name: string;
  level: 'brigade' | 'battalion' | 'company' | 'platoon';
  orgId: string;
  unitId: string | null;
  parentId: string | null;
}

export interface UnitAggregateDoc {
  directoryId: string;
  activeParticipantCount: number;
  avgSteps: number | null;
  updatedAt: Date | null;
}

export interface UnitLeagueEntry {
  directoryId: string;
  name: string;
  /** e.g. "גדוד 9307 · חטיבה 810" — ancestor names, nearest first. Null for brigades (no parent). */
  parentBreadcrumb: string | null;
  avgSteps: number;
  activeParticipantCount: number;
  isMyUnit: boolean;
}

export interface UnitLeagueResult {
  /** Sorted descending by avgSteps — only units that met the participant floor. */
  entries: UnitLeagueEntry[];
  /** Populated when the viewer's own unit for this range exists but hasn't met the floor yet. */
  myUnitBelowFloor: { name: string; activeParticipantCount: number; needed: number } | null;
  /** Most recent updatedAt among the units in this range — null if none. */
  updatedAt: Date | null;
}

function buildBreadcrumb(unit: UnitDirectoryEntry, byId: Map<string, UnitDirectoryEntry>): string | null {
  const names: string[] = [];
  let parentId = unit.parentId;
  // Walk up: a battalion's parentId is the brigade's directoryId directly
  // (no intermediate node); a company's parentId is its battalion's
  // directoryId. The loop naturally stops once parentId points at a
  // directoryId not present as its own unitDirectory doc (the brigade
  // itself IS present, so brigade names DO get included for a company's
  // breadcrumb, matching the approved "גדוד 9307 · חטיבה 810" example).
  let guard = 0;
  while (parentId && guard < 10) {
    const parent = byId.get(parentId);
    if (!parent) break;
    names.push(parent.name);
    parentId = parent.parentId;
    guard++;
  }
  return names.length > 0 ? names.join(' · ') : null;
}

/** Resolves the viewer's own directoryId at a given level, from their raw declaration fields. */
function resolveMyUnitId(
  level: 'battalion' | 'company',
  myOrgId: string | null,
  myUnitPathIds: string[],
  allUnits: UnitDirectoryEntry[],
): string | null {
  if (!myOrgId) return null;
  const match = allUnits.find(
    (u) => u.level === level && u.orgId === myOrgId && u.unitId !== null && myUnitPathIds.includes(u.unitId),
  );
  return match?.directoryId ?? null;
}

const FLOOR = 3;

export function selectUnitLeagueEntries(
  range: UnitLeagueRange,
  allUnits: UnitDirectoryEntry[],
  aggregates: UnitAggregateDoc[],
  myOrgId: string | null,
  myUnitPathIds: string[],
): UnitLeagueResult {
  const unitsById = new Map(allUnits.map((u) => [u.directoryId, u]));
  const aggById = new Map(aggregates.map((a) => [a.directoryId, a]));

  const myBattalionId = resolveMyUnitId('battalion', myOrgId, myUnitPathIds, allUnits);

  let candidateUnits: UnitDirectoryEntry[];
  let myScopedUnitId: string | null;

  switch (range) {
    case 'my_battalion_companies':
      candidateUnits = myBattalionId
        ? allUnits.filter((u) => u.level === 'company' && u.parentId === myBattalionId)
        : [];
      myScopedUnitId = resolveMyUnitId('company', myOrgId, myUnitPathIds, allUnits);
      break;
    case 'my_brigade_battalions':
      candidateUnits = myOrgId
        ? allUnits.filter((u) => u.level === 'battalion' && u.parentId === myOrgId)
        : [];
      myScopedUnitId = myBattalionId;
      break;
    case 'all_companies':
      candidateUnits = allUnits.filter((u) => u.level === 'company');
      myScopedUnitId = resolveMyUnitId('company', myOrgId, myUnitPathIds, allUnits);
      break;
    case 'all_brigades':
      candidateUnits = allUnits.filter((u) => u.level === 'brigade');
      myScopedUnitId = myOrgId;
      break;
  }

  const entries: UnitLeagueEntry[] = [];
  let latestUpdatedAt: Date | null = null;
  let myUnitBelowFloor: UnitLeagueResult['myUnitBelowFloor'] = null;

  for (const unit of candidateUnits) {
    const agg = aggById.get(unit.directoryId);
    if (!agg) continue; // no declared reservist at all under this unit

    if (agg.updatedAt && (!latestUpdatedAt || agg.updatedAt > latestUpdatedAt)) {
      latestUpdatedAt = agg.updatedAt;
    }

    if (agg.avgSteps !== null && agg.activeParticipantCount >= FLOOR) {
      entries.push({
        directoryId: unit.directoryId,
        name: unit.name,
        parentBreadcrumb: buildBreadcrumb(unit, unitsById),
        avgSteps: agg.avgSteps,
        activeParticipantCount: agg.activeParticipantCount,
        isMyUnit: unit.directoryId === myScopedUnitId,
      });
    } else if (unit.directoryId === myScopedUnitId) {
      // Below-floor units are otherwise omitted entirely (§ research doc —
      // no reason to show an anonymous "X more needed" row for a unit the
      // viewer isn't in); the viewer's OWN unit gets the CTA instead.
      myUnitBelowFloor = {
        name: unit.name,
        activeParticipantCount: agg.activeParticipantCount,
        needed: Math.max(0, FLOOR - agg.activeParticipantCount),
      };
    }
  }

  entries.sort((a, b) => b.avgSteps - a.avgSteps);

  return { entries, myUnitBelowFloor, updatedAt: latestUpdatedAt };
}
