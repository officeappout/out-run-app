/**
 * Cloud Function: onOsmAmenityWrite
 *
 * Amenities-approval-to-data roadmap, item 2 (docs/amenities-approval-to-
 * data-roadmap.md). Fires whenever a `fitness_station` osm_amenities doc
 * transitions to `status:'published'` (an admin approving it in the
 * Approval Center's amenities tab). Two outcomes, decided by proximity to
 * an existing `parks` doc:
 *
 *   - Within PARK_LINK_RADIUS_METERS of an existing park → that park is
 *     flagged `needsFacilityDetails:true` and the amenity id is recorded
 *     in its `linkedOsmAmenityIds` array. No new park, no pin duplicate.
 *     gymEquipment is deliberately NOT auto-populated — osm_amenities
 *     carries no equipment-type detail for fitness_station (category +
 *     location + name only), so guessing gear entries would be fabricated
 *     data. A human still translates "there's a fitness station here" into
 *     real gear.
 *   - Otherwise → a new `parks` doc is created, `published:true` +
 *     `contentStatus:'published'` IMMEDIATELY (roadmap's "no pending_review"
 *     decision, 22.09.2026 — approved data is live data, not gated behind
 *     manual review) — also flagged `needsFacilityDetails:true`, since
 *     facilityType is set but gymEquipment starts empty.
 *
 * Both branches write `linkedParkId` back onto the osm_amenities doc —
 * doubles as the idempotency guard (see below) and as the audit trail.
 *
 * IDEMPOTENCY: two independent guards, since this collection has no
 * "processed" marker until we write one.
 *   1. Status-TRANSITION guard: only reacts when `before.status !== 'published'
 *      && after.status === 'published'` — an unrelated later edit to an
 *      already-published doc (e.g. `reviewedBy` backfilled, a name fix) must
 *      not re-run this and try to create a second park.
 *   2. `linkedParkId` guard: belt-and-suspenders for the backfill script
 *      (scripts/backfill-fitness-station-parks.ts) processing a doc that was
 *      ALREADY published before this trigger existed — the script sets
 *      `linkedParkId` the same way, so if the trigger's transition guard
 *      somehow still fired for one of those (it won't — they're not
 *      transitioning, they're already published — but the guard costs
 *      nothing and closes the gap definitively), it no-ops instead of
 *      double-creating.
 *
 * Proximity check is a brute-force scan of ALL parks (~1,200 today) — same
 * accepted-at-this-scale precedent as garden-dedup.service.ts's own
 * ingestion-time duplicate check (GARDEN_DEDUP_RADIUS_METERS, 40m). This
 * trigger's own radius is wider (see PARK_LINK_RADIUS_METERS) — a
 * different question ("is this near enough to be the SAME campus") than
 * garden-dedup's ("is this literally the same POI").
 *
 * Cannot import from src/ — functions/src is a separate tsconfig root (see
 * onAuthorityWrite.ts's header for the same constraint). The haversine
 * helper and the minimal park-doc shape are hand-duplicated here from
 * geoUtils.ts / the admin LocationEditor's own handleSave payload
 * (src/features/admin/components/locations/LocationEditor.tsx:351-377) —
 * kept intentionally minimal, not a full port.
 */

import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

/** Meters between an approved fitness_station and an existing park's own
 *  location for the amenity to link to it instead of spawning a new park.
 *  Chosen from the roadmap doc's dry-run (docs/amenities-approval-to-data-
 *  roadmap.md, 22.09.2026): against the 46 fitness_station docs published
 *  at the time, 40m (GARDEN_DEDUP_RADIUS_METERS) linked 0/46; 100m and 200m
 *  both linked the same 2/46 — no additional real matches between 100 and
 *  200m, so there is no reason to risk the false-positive class a wider
 *  radius invites (attaching to a park that merely happens to be nearby,
 *  not the same facility). 100, not 200 — the tighter of the two
 *  identical-result options. */
export const PARK_LINK_RADIUS_METERS = 100;

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface NearestPark {
  id: string;
  distanceMeters: number;
}

/** Exported for the backfill script — same decision, same radius, one
 *  definition. Brute-force scan, see header comment for why that's fine
 *  at today's scale. */
export async function findNearestPark(
  firestore: admin.firestore.Firestore,
  lat: number,
  lng: number,
): Promise<NearestPark | null> {
  const parksSnap = await firestore.collection('parks').get();
  let nearest: NearestPark | null = null;
  for (const doc of parksSnap.docs) {
    const data = doc.data();
    const pLat = Number(data.location?.lat);
    const pLng = Number(data.location?.lng);
    if (!Number.isFinite(pLat) || !Number.isFinite(pLng)) continue;
    const distanceMeters = haversineMeters(lat, lng, pLat, pLng);
    if (!nearest || distanceMeters < nearest.distanceMeters) {
      nearest = { id: doc.id, distanceMeters };
    }
  }
  return nearest;
}

/**
 * Exported for the backfill script — the exact link/create side-effects,
 * minus the trigger's own PRE-transaction guards (status-transition check
 * etc. — the trigger checks those before ever calling this; the backfill
 * script has its own, scoped to "docs missing linkedParkId" — see that file).
 *
 * CONCURRENCY (found in review, 22.09.2026): Cloud Functions guarantees
 * at-least-once delivery — the SAME event can invoke this function twice
 * concurrently. The nearest-park lookup (`findNearestPark`, a plain read,
 * no consistency requirement — a moment-stale view of "what's nearby" is
 * fine) runs OUTSIDE the transaction below, but the ACTUAL decision gate —
 * "has this amenity already been linked?" — is a LIVE read of
 * `osm_amenities/{amenityId}` taken INSIDE a `runTransaction`, with the
 * write (new park, or the existing park's arrayUnion) committed in the
 * SAME transaction. Two concurrent calls both reading "not yet linked"
 * outside a transaction was exactly how the earlier version could create
 * two different park docs for one amenity (two fresh `.doc()` refs, no
 * document shared between the calls to arbitrate). Inside a transaction,
 * both invocations read `amenityId`'s doc as part of the SAME transaction;
 * Firestore detects the second transaction's read was invalidated by the
 * first one's commit and automatically retries it — the retry's live read
 * then sees `linkedParkId` already set and no-ops. This is the standard
 * Firestore "read the guard field inside the transaction that writes it"
 * pattern, not a manual lock.
 */
export async function applyFitnessStationToParkLink(
  firestore: admin.firestore.Firestore,
  amenityId: string,
  amenityData: FirebaseFirestore.DocumentData,
): Promise<{ action: 'linked' | 'created' | 'already-linked'; parkId: string }> {
  const lat = Number(amenityData.location?.lat);
  const lng = Number(amenityData.location?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error(`osm_amenities/${amenityId} has no usable location`);
  }

  const nearest = await findNearestPark(firestore, lat, lng);
  const amenityRef = firestore.collection('osm_amenities').doc(amenityId);

  return firestore.runTransaction(async (tx) => {
    // The guard read — MUST be inside the transaction (see header comment).
    const liveAmenitySnap = await tx.get(amenityRef);
    const existingLinkedParkId = liveAmenitySnap.data()?.linkedParkId;
    if (existingLinkedParkId) {
      return { action: 'already-linked' as const, parkId: existingLinkedParkId as string };
    }

    if (nearest && nearest.distanceMeters <= PARK_LINK_RADIUS_METERS) {
      const parkRef = firestore.collection('parks').doc(nearest.id);
      tx.update(parkRef, {
        needsFacilityDetails: true,
        linkedOsmAmenityIds: admin.firestore.FieldValue.arrayUnion(amenityId),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      tx.update(amenityRef, { linkedParkId: nearest.id });
      return { action: 'linked' as const, parkId: nearest.id };
    }

    // New park — minimal-but-real shape, mirrors LocationEditor.tsx's own
    // handleSave payload for a manually-created gym_park (see file header).
    // published/contentStatus are live immediately — no pending_review, per
    // the roadmap's explicit decision.
    const newParkRef = firestore.collection('parks').doc();
    tx.set(newParkRef, {
      name: amenityData.name || 'מתקן כושר (OSM)',
      description: '',
      location: { lat, lng },
      city: amenityData.city ?? undefined,
      facilityType: 'gym_park',
      featureTags: [],
      authorityId: amenityData.authorityId ?? undefined,
      contentStatus: 'published',
      published: true,
      status: 'open',
      gymEquipment: [],
      facilities: [],
      amenities: { hasShadow: false, hasLighting: false, hasToilets: false, hasWater: false },
      hasWaterFountain: false,
      isDogFriendly: false,
      hasLights: false,
      isShaded: false,
      origin: 'super_admin',
      externalSourceId: amenityData.osmId ?? undefined,
      needsFacilityDetails: true,
      linkedOsmAmenityIds: [amenityId],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    tx.update(amenityRef, { linkedParkId: newParkRef.id });
    return { action: 'created' as const, parkId: newParkRef.id };
  });
}

export const onOsmAmenityWrite = onDocumentWritten(
  'osm_amenities/{amenityId}',
  async (event) => {
    const { amenityId } = event.params;
    const after = event.data?.after;
    if (!after?.exists) return; // deleted — nothing to do

    const afterData = after.data()!;
    if (afterData.category !== 'fitness_station') return;

    const before = event.data?.before;
    const beforeStatus = before?.exists ? before.data()?.status : undefined;
    const isNewlyPublished = beforeStatus !== 'published' && afterData.status === 'published';
    if (!isNewlyPublished) return;

    // Idempotency guard 2 — see header. Should be unreachable given guard 1,
    // kept as a definitive belt-and-suspenders.
    if (afterData.linkedParkId) {
      logger.info(`[onOsmAmenityWrite] ${amenityId} already linked to ${afterData.linkedParkId} — skipping.`);
      return;
    }

    try {
      const result = await applyFitnessStationToParkLink(db, amenityId, afterData);
      logger.info(`[onOsmAmenityWrite] ${amenityId} → ${result.action} park ${result.parkId}`);
    } catch (err) {
      logger.error(`[onOsmAmenityWrite] failed for ${amenityId}`, err);
    }
  },
);
