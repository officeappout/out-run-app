/**
 * Cloud Function: unitLeagueRollup
 *
 * Phase 6b (docs/research/military-persona-unified-architecture.md §12) —
 * unit-vs-unit competition (company/battalion/brigade), never individual
 * ranking inside a unit. Scheduled hourly (David, 05.09.2026 — real
 * soldiers arriving this week, needs to be live before they do).
 *
 * Writes ONE aggregate doc per real unit to `unit_league_aggregates`:
 * `{ activeParticipantCount, avgSteps, avgDistanceMeters, updatedAt }`. NO uid, NO
 * displayName, no personal identifier of any kind — that's the entire
 * point of this design (see the research doc's §12א): the client never
 * reads a per-user document scoped by unit, so the community_groups/
 * feed_posts/streaks rules fight from the last three rounds doesn't apply
 * here at all. `unit_league_aggregates` is publicly readable, same as
 * `unitDirectory` — the client cross-references that collection for
 * name/level/parentId rather than this one duplicating it.
 *
 * Aggregation shape, per computeUnitAggregates() (unit-league-aggregation.ts,
 * the pure, unit-tested-by-hand logic this function is a thin Firestore
 * wrapper around):
 *   - Company, battalion, and brigade are each computed independently as
 *     "average steps across every ACTIVE reservist whose declaration places
 *     them under this node" (via orgId for brigade, orgId + unitPathIds
 *     array-contains for battalion/company) — NOT an average of the level
 *     below, which would be a different, less meaningful statistic given
 *     uneven sub-unit sizes.
 *   - "Active" = at least one dailyActivity doc in the trailing 7 days with
 *     steps > 0 (David, 05.09.2026 — someone who never granted the health
 *     permission must not silently drag the average to zero; this excludes
 *     them from the denominator entirely, not just contributes a zero).
 *   - avgSteps per reservist = total steps over the 7-day window / 7,
 *     matching getStepsLeaderboard's own formula exactly (ranking.service.ts)
 *     — same metric definition as the individual reserve league, so the two
 *     numbers stay comparable.
 *   - Floor: 3 active participants (David, 05.09.2026, citing
 *     cpo-analytics.service.ts's totalSample<3 precedent). A unit below the
 *     floor STILL gets a doc (activeParticipantCount, avgSteps: null) — the
 *     UI needs that count to show "X more needed to unlock", not just
 *     silence. A unit with literally zero declared reservists gets no doc
 *     at all — and any doc left over from a unit that DROPPED to zero
 *     members is deleted (see the cleanup pass below), so a departed
 *     reservist doesn't leave a ghost aggregate behind forever.
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';
import { computeUnitAggregates, type UnitDirectoryEntry, type ReservistActivity } from './unit-league-aggregation';
import { distanceMetersOfDay } from './lib/league-scope-stats';
import { mapWithConcurrency } from './lib/paginate';
import { isDemoTenant, isDemoTenantId, isDemoUid } from './lib/demo';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

const ACTIVE_PARTICIPANT_FLOOR = 3;
const WINDOW_DAYS = 7; // matches getStepsLeaderboard's own rolling window exactly
/** Parallel per-reservist 7-day getAll()s (was: all of them at once). */
const LOAD_CONCURRENCY = 20;
/** Firestore batch limit is 500 ops — commit in chunks (was one batch for everything). */
const MAX_BATCH = 450;

function dateStringDaysAgo(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD, matches dailyActivity's docId date segment
}

async function loadUnitDirectory(): Promise<UnitDirectoryEntry[]> {
  const snap = await db.collection('unitDirectory').get();
  // Demo world guard: a demo unit never gets a public aggregate (onUnitWrite /
  // onAuthorityWrite already keep demo out of unitDirectory — belt and braces).
  const realDocs = snap.docs.filter((d) => !isDemoTenant(d.data(), d.data().orgId));
  return realDocs.map((d) => {
    const data = d.data();
    return {
      directoryId: d.id,
      level: data.level as UnitDirectoryEntry['level'],
      orgId: data.orgId as string,
      unitId: (data.unitId as string | null) ?? null,
    };
  });
}

async function loadReservistActivity(): Promise<ReservistActivity[]> {
  const declSnap = await db.collection('military_declarations').where('status', '==', 'reserve').get();
  if (declSnap.empty) return [];

  const dates = Array.from({ length: WINDOW_DAYS }, (_, i) => dateStringDaysAgo(i));

  // Bounded (19.10.2026): was Promise.all over every reservist at once.
  // Demo world guard: demo soldiers / demo-org declarations never count
  // toward a real unit's aggregate.
  const realDecls = declSnap.docs.filter((d) => !isDemoUid(d.id) && !isDemoTenantId(d.data().orgId));

  return mapWithConcurrency(realDecls, LOAD_CONCURRENCY, async (declDoc) => {
    const uid = declDoc.id;
    const data = declDoc.data();
    const orgId = (data.orgId as string) ?? '';
    const unitPathIds = Array.isArray(data.unitPathIds) ? (data.unitPathIds as string[]) : [];

    // Exact docId batch-get (uid_date) — no query, no composite index
    // needed at all; dailyActivity docIds are already {userId}_{date}.
    const refs = dates.map((date) => db.doc(`dailyActivity/${uid}_${date}`));
    const snaps = refs.length > 0 ? await db.getAll(...refs) : [];

    let totalSteps = 0;
    let totalMeters = 0;
    let isActive = false;
    for (const snap of snaps) {
      if (!snap.exists) continue;
      const data = snap.data();
      const steps = (data?.steps as number) || 0;
      totalSteps += steps;
      // The leagues' km: synced distance, or the steps estimate.
      totalMeters += distanceMetersOfDay(data?.steps, data?.distanceMeters);
      if (steps > 0) isActive = true;
    }

    return {
      orgId,
      unitPathIds,
      isActive,
      avgSteps: Math.round(totalSteps / WINDOW_DAYS),
      avgDistanceMeters: Math.round(totalMeters / WINDOW_DAYS),
    };
  });
}

export const unitLeagueRollup = onSchedule(
  { schedule: '0 * * * *', timeZone: 'Asia/Jerusalem', timeoutSeconds: 300, memory: '512MiB' },
  async () => {
    const [units, reservists, existingSnap] = await Promise.all([
      loadUnitDirectory(),
      loadReservistActivity(),
      db.collection('unit_league_aggregates').get(),
    ]);

    const aggregates = computeUnitAggregates(units, reservists, ACTIVE_PARTICIPANT_FLOOR);
    const nextIds = new Set(aggregates.map((a) => a.directoryId));

    // Chunked commits (19.10.2026): one batch for every unit + every stale
    // delete would fail outright past 500 ops.
    let batch = db.batch();
    let ops = 0;
    const flushIfFull = async () => {
      if (++ops >= MAX_BATCH) {
        await batch.commit();
        batch = db.batch();
        ops = 0;
      }
    };
    for (const agg of aggregates) {
      batch.set(db.doc(`unit_league_aggregates/${agg.directoryId}`), {
        activeParticipantCount: agg.activeParticipantCount,
        avgSteps: agg.avgSteps,
        // km next to the steps (18.10.2026) — display only, never the ranking.
        avgDistanceMeters: agg.avgDistanceMeters,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      await flushIfFull();
    }
    // Clean up units that dropped to zero declared reservists since the
    // last run — otherwise a departed reservist's old unit keeps showing a
    // stale aggregate forever.
    for (const staleDoc of existingSnap.docs) {
      if (!nextIds.has(staleDoc.id)) {
        batch.delete(staleDoc.ref);
        await flushIfFull();
      }
    }
    if (ops > 0) await batch.commit();

    logger.info(`[unitLeagueRollup] wrote ${aggregates.length} unit aggregate(s), removed ${existingSnap.docs.filter((d) => !nextIds.has(d.id)).length} stale doc(s)`);
  },
);
