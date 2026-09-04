/**
 * Pure aggregation logic for unit-vs-unit leagues (Phase 6b), split out of
 * unitLeagueRollup.ts so it's testable without Admin SDK/Firestore. Given
 * the full set of declared reservists (with their own already-computed
 * activity) and the real unit hierarchy (from unitDirectory), computes one
 * aggregate per unit — company, battalion, and brigade each independently,
 * not derived from the level below (see the module doc on unitLeagueRollup.ts
 * for why: an "average of company averages" is a different, less meaningful
 * statistic than "average across every reservist under this battalion").
 *
 * Zero personal identifiers appear in the output — no uid, no name, ever.
 * That's the whole point of this design (docs/research/
 * military-persona-unified-architecture.md §12): the client only ever reads
 * the aggregate, never a per-user document scoped by unit.
 */

export interface UnitDirectoryEntry {
  directoryId: string;
  level: 'brigade' | 'battalion' | 'company' | 'platoon';
  orgId: string;
  /** null for brigade-level entries (directoryId === orgId there). */
  unitId: string | null;
}

export interface ReservistActivity {
  orgId: string;
  /** Raw ancestor unit IDs (not directoryIds) — see persona.types.ts's MilitaryPersonaAnswers. */
  unitPathIds: string[];
  /** >=1 day with steps>0 in the trailing window — see getStepsLeaderboard's own definition, reused here. */
  isActive: boolean;
  /** Same formula as getStepsLeaderboard: totalSteps over the window / window length (not per-active-day). */
  avgSteps: number;
}

export interface UnitAggregate {
  directoryId: string;
  activeParticipantCount: number;
  /** null when activeParticipantCount is below the floor — unit still gets a doc (for the "X more needed" UI), just no comparable score yet. */
  avgSteps: number | null;
}

/** Company/battalion/brigade only — platoon is out of scope (David, 05.09.2026: only these 3 tiers were approved). */
const AGGREGATE_LEVELS = new Set(['brigade', 'battalion', 'company']);

function belongsToUnit(reservist: ReservistActivity, unit: UnitDirectoryEntry): boolean {
  if (reservist.orgId !== unit.orgId) return false;
  if (unit.level === 'brigade') return true;
  return unit.unitId !== null && reservist.unitPathIds.includes(unit.unitId);
}

export function computeUnitAggregates(
  units: UnitDirectoryEntry[],
  reservists: ReservistActivity[],
  floor: number,
): UnitAggregate[] {
  const aggregates: UnitAggregate[] = [];

  for (const unit of units) {
    if (!AGGREGATE_LEVELS.has(unit.level)) continue;

    const members = reservists.filter((r) => belongsToUnit(r, unit));
    if (members.length === 0) continue; // no declared reservist at all — no doc, unit doesn't exist for this purpose

    const activeMembers = members.filter((m) => m.isActive);
    const activeParticipantCount = activeMembers.length;
    const avgSteps = activeParticipantCount >= floor
      ? Math.round(activeMembers.reduce((sum, m) => sum + m.avgSteps, 0) / activeParticipantCount)
      : null;

    aggregates.push({ directoryId: unit.directoryId, activeParticipantCount, avgSteps });
  }

  return aggregates;
}
