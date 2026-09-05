/**
 * Client-side reads for unit-vs-unit leagues (Phase 6b). Both collections
 * this reads are public (`allow read: if true`) by design — see
 * firestore.rules's unit_league_aggregates comment and docs/research/
 * military-persona-unified-architecture.md §12: the aggregate doc never
 * contains a uid or a name, only counts, so there's no roster to protect.
 *
 * The actual ranking/filtering logic is pure and lives in
 * unit-league-selection.ts (unit-tested there) — this file is just the
 * Firestore I/O around it.
 */

import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  selectUnitLeagueEntries,
  type UnitLeagueRange,
  type UnitDirectoryEntry,
  type UnitAggregateDoc,
  type UnitLeagueResult,
} from './unit-league-selection';

export type { UnitLeagueRange, UnitLeagueEntry, UnitLeagueResult } from './unit-league-selection';

async function loadUnitDirectory(): Promise<UnitDirectoryEntry[]> {
  const snap = await getDocs(collection(db, 'unitDirectory'));
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      directoryId: d.id,
      name: data.name as string,
      level: data.level as UnitDirectoryEntry['level'],
      orgId: data.orgId as string,
      unitId: (data.unitId as string | null) ?? null,
      parentId: (data.parentId as string | null) ?? null,
      iconUrl: (data.iconUrl as string | null) ?? null,
    };
  });
}

async function loadUnitAggregates(): Promise<UnitAggregateDoc[]> {
  const snap = await getDocs(collection(db, 'unit_league_aggregates'));
  return snap.docs.map((d) => {
    const data = d.data();
    const updatedAt = data.updatedAt?.toDate ? (data.updatedAt.toDate() as Date) : null;
    return {
      directoryId: d.id,
      activeParticipantCount: (data.activeParticipantCount as number) ?? 0,
      avgSteps: (data.avgSteps as number | null) ?? null,
      updatedAt,
    };
  });
}

export async function getUnitLeagueLeaderboard(
  range: UnitLeagueRange,
  myOrgId: string | null,
  myUnitPathIds: string[],
): Promise<UnitLeagueResult> {
  const [units, aggregates] = await Promise.all([loadUnitDirectory(), loadUnitAggregates()]);
  return selectUnitLeagueEntries(range, units, aggregates, myOrgId, myUnitPathIds);
}

/** Single-unit lookup for the "my unit below floor" empty-state name/breadcrumb — used when the viewer's own unit isn't in `entries`. */
export async function getUnitDirectoryEntry(directoryId: string): Promise<{ name: string } | null> {
  const snap = await getDoc(doc(db, 'unitDirectory', directoryId));
  if (!snap.exists()) return null;
  return { name: snap.data().name as string };
}
