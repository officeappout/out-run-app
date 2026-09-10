/**
 * nearbyPresence.service.ts — SPEC-04 Wave A
 *
 * Lives in src/lib/ (not a feature domain) because it's genuinely
 * cross-domain: consumed by parks/core (useGroupPresence, usePartnerData —
 * the live map/partner-finder paths) and safecity (usePresenceLayer) alike.
 * Per this repo's domain-agnostic rule, a utility more than one domain
 * needs belongs here, not "owned" by whichever domain happened to need it
 * first (axioms.md rule 7).
 *
 * The unifying fix POLICY-01/SPEC-04 asks for: "who's nearby AND matches my
 * age" is ONE query, not two separate filters. This replaces the
 * independent copies of `where('mode','==','verified_global'), limit(200)`
 * that used to live in usePresenceStore.ts, useGroupPresence.ts,
 * usePartnerData.ts, and usePresenceLayer.ts — none of which had a radius
 * bound (a Haifa user could get 200 arbitrary docs from anywhere) or an
 * age bound (a minor's query returned every adult's live GPS location +
 * name, filtered only by a client-side check that could be skipped or
 * simply never ran downstream).
 *
 * What changed and why the old "shared singleton stream" (usePresenceStore)
 * had to go, not just get a new where() clause
 * ─────────────────────────────────────────────────────────────────────────
 * usePresenceStore's whole design was ONE ref-counted onSnapshot shared by
 * every consumer, justified because the old query was global anyway (every
 * consumer wanted the same unbounded stream, so sharing one avoided N
 * duplicate unbounded listeners). Once the query needs the CALLER's own
 * location and age, that premise breaks — two different users no longer
 * want the same data at all. This function does the opposite trade: each
 * caller gets its own listener, but that listener is scoped to a small
 * geohash-bounded radius instead of "everyone" — the same cost problem the
 * shared stream was built to solve, solved a different way (bound the
 * data, not the subscription count).
 *
 * Age enforcement is real here, not cosmetic — see the matching firestore.rules
 * change (presence/{userId}'s verified_global read clause now requires
 * resource.data.ageGroup == getUserAgeGroup(request.auth.uid)). This query's
 * own where('ageGroup','==', callerAgeGroup) is what makes that rule provable
 * for a list operation — remove it here and the rule change alone would
 * reject every list query with PERMISSION_DENIED, not just filter it.
 */

import {
  collection,
  query,
  where,
  orderBy,
  startAt,
  endAt,
  limit,
  onSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import { geohashQueryBounds, distanceBetween } from 'geofire-common';
import { db } from './firebase';

export type RawPresenceDoc = Record<string, any> & { uid: string };

export interface NearbyPresenceParams {
  center: { lat: number; lng: number };
  /** Search radius in kilometers. */
  radiusKm: number;
  ageGroup: 'minor' | 'adult';
  /** Optional extra scope, e.g. authorityId — applied as an additional equality filter. */
  extraEqualityFilters?: Record<string, string>;
  /** Cap per geohash range (not a total cap) — mirrors PRESENCE_STREAM_MAX's original intent at a per-box granularity. */
  maxPerRange?: number;
}

const DEFAULT_MAX_PER_RANGE = 50;

/**
 * Subscribes to `presence` docs in `mode == 'verified_global'`, within
 * `radiusKm` of `center`, matching `ageGroup` exactly — real-time, merged
 * across the (usually 1, sometimes a handful) geohash ranges
 * `geohashQueryBounds` returns for the given radius, deduped by doc id, and
 * precisely trimmed to the true circle (geohash boxes over-cover at the
 * corners by construction — this only ever REMOVES false positives, never
 * lets through something outside the radius).
 *
 * Returns an unsubscribe function that tears down every underlying listener.
 */
export function subscribeToNearbyPresence(
  params: NearbyPresenceParams,
  onUpdate: (docs: RawPresenceDoc[]) => void,
  onError?: (err: unknown) => void,
): Unsubscribe {
  const { center, radiusKm, ageGroup, extraEqualityFilters, maxPerRange = DEFAULT_MAX_PER_RANGE } = params;

  // SPEC-04 Wave A test #3 — "a query without a distance condition must be
  // rejected or bounded, never returning the whole world." This is the
  // enforcement point: every caller MUST go through this function to reach
  // `presence`, and it refuses to build a query at all without a finite,
  // positive radius and a real center — there is no code path here that
  // falls through to an unbounded `where('mode','==','verified_global')`
  // scan of the whole collection.
  if (!center || !Number.isFinite(center.lat) || !Number.isFinite(center.lng)) {
    throw new Error('subscribeToNearbyPresence: a real center {lat,lng} is required — refusing an unbounded query');
  }
  if (!Number.isFinite(radiusKm) || radiusKm <= 0) {
    throw new Error('subscribeToNearbyPresence: radiusKm must be a positive finite number — refusing an unbounded query');
  }
  if (!ageGroup) {
    throw new Error('subscribeToNearbyPresence: ageGroup is required — refusing a query with no age boundary');
  }

  const bounds = geohashQueryBounds([center.lat, center.lng], radiusKm * 1000);
  const resultsByRange = new Map<number, RawPresenceDoc[]>();

  const emit = () => {
    const merged = new Map<string, RawPresenceDoc>();
    resultsByRange.forEach((docs) => {
      for (const d of docs) merged.set(d.uid, d);
    });
    const trimmed = Array.from(merged.values()).filter((d) => {
      if (typeof d.lat !== 'number' || typeof d.lng !== 'number') return false;
      if (!Number.isFinite(d.lat) || !Number.isFinite(d.lng)) return false;
      return distanceBetween([center.lat, center.lng], [d.lat, d.lng]) <= radiusKm;
    });
    onUpdate(trimmed);
  };

  const unsubs = bounds.map(([rangeStart, rangeEnd], idx) => {
    const constraints = [
      where('mode', '==', 'verified_global'),
      where('ageGroup', '==', ageGroup),
      ...Object.entries(extraEqualityFilters ?? {}).map(([field, value]) => where(field, '==', value)),
      orderBy('geohash'),
      startAt(rangeStart),
      endAt(rangeEnd),
      limit(maxPerRange),
    ];
    const q = query(collection(db, 'presence'), ...constraints);
    return onSnapshot(
      q,
      (snap) => {
        resultsByRange.set(idx, snap.docs.map((d) => ({ uid: d.id, ...d.data() })));
        emit();
      },
      (err) => {
        resultsByRange.delete(idx);
        onError?.(err);
      },
    );
  });

  return () => unsubs.forEach((u) => u());
}
