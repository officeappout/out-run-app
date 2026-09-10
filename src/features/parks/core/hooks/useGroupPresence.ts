'use client';

/**
 * useGroupPresence — listens to live partner positions.
 *
 * Two modes:
 *   1. Group session: queries presence where mode=='group' AND
 *      audienceGroupIds array-contains groupSessionId. This is statically
 *      provable against the Firestore security rule (every returned doc has
 *      mode='group' and shares at least the session's groupId with the reader),
 *      so it never triggers an all-or-nothing PERMISSION-DENIED failure.
 *   2. General discovery: SPEC-04 Wave A — was
 *      `where('mode','==','verified_global'), limit(200)`: no radius bound
 *      (a Haifa user could get 200 arbitrary docs from anywhere), no age
 *      bound (a minor's map showed every adult's live GPS + name, filtered
 *      by nothing — `buildPartnerPositions` below never even read
 *      `ageGroup`). Now uses `subscribeToNearbyPresence`
 *      (nearbyPresence.service.ts) — geohash-radius + ageGroup are the SAME
 *      query condition, matching POLICY-01's framing exactly ("who's
 *      nearby AND matches my age" is one question, not two).
 *
 * The old `where('uid', 'in', memberIds)` query is intentionally removed.
 * It caused all-or-nothing batch failures when any single doc in the result
 * failed the security rule (e.g. inconsistent follow graph in squad mode).
 */

import { useState, useEffect, useRef } from 'react';
import { collection, query, where, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { useUserStore } from '@/features/user';
import { subscribeToNearbyPresence, type RawPresenceDoc } from '@/lib/nearbyPresence.service';

/** Matches usePresenceLayer.ts's own MAX_DISCOVERY_RADIUS_KM — one constant, not reinvented per caller. */
const DISCOVERY_RADIUS_KM = 15;

function deriveAgeGroup(birthDate: unknown): 'minor' | 'adult' {
  if (!birthDate) return 'minor';
  const bd =
    birthDate instanceof Date ? birthDate
    : typeof (birthDate as any)?.toDate === 'function' ? (birthDate as any).toDate()
    : new Date(birthDate as string);
  if (isNaN(bd.getTime())) return 'minor';
  const ageYears = (Date.now() - bd.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  return ageYears < 18 ? 'minor' : 'adult';
}

/**
 * Persona ID → public image path. Keyed by the canonical PersonaId values
 * (src/types/persona.types.ts) since 01.09.2026 — was previously keyed by
 * the now-deleted /admin/personas "Lemur" catalog's ids, a completely
 * separate, unrelated concept that happened to overlap in naming.
 * Fallback to king-lemur for unknown persona IDs.
 */
export const PERSONA_IMAGES: Record<string, string> = {
  parent:        '/assets/lemur/lemur-avatar.png',
  office_worker: '/assets/lemur/king-lemur.png',
  student:       '/assets/lemur/lemur-avatar.png',
  pupil:         '/assets/lemur/lemur-avatar.png',
  military:      '/assets/lemur/king-lemur.png',
  pro_athlete:   '/assets/lemur/lemur-avatar.png',
  vatikim:       '/assets/lemur/lemur-avatar.png',
};

export const DEFAULT_LEMUR_IMAGE = '/assets/lemur/king-lemur.png';

export function resolvePersonaImage(personaId?: string | null): string {
  if (!personaId) return DEFAULT_LEMUR_IMAGE;
  return PERSONA_IMAGES[personaId] ?? DEFAULT_LEMUR_IMAGE;
}

export interface PartnerPosition {
  uid: string;
  name: string;
  lat: number;
  lng: number;
  color: string;
  activityStatus: string;
  groupSessionId?: string;
  personaId?: string;
  personaImageUrl: string;
  lemurStage?: number;
  /** km — populated during running/walking workouts via the workout heartbeat */
  distance?: number;
}

// Muted, dusty palette — keeps partners identifiable without competing
// with the user's own bright cyan lemur marker.
const GROUP_COLORS = [
  '#8B9DC3', '#7BA898', '#C9A96E', '#A090B8', '#B08A9A',
  '#7EA88A', '#C49A7A', '#7E9DB0', '#B898A8', '#A4B87A',
  '#7AAEC0', '#B0AC84',
];

/**
 * Drop presence docs whose `updatedAt` is older than this threshold.
 *
 * The map heartbeat ticks every 2 minutes (`HEARTBEAT_INTERVAL_MS` in
 * `presence.service.ts`); the workout heartbeat is faster (30s moving,
 * 60s static). 5 minutes leaves room for one missed beat plus network
 * jitter without falsely hiding still-active users — but is short
 * enough to clean up after orphaned docs (closed tabs, crashed apps,
 * failed unmount cleanups in `ShareAsLiveToggle`) within the same
 * session.
 */
const STALE_PRESENCE_MS = 5 * 60 * 1000;

const MAX_PERMISSION_RETRIES = 3;

/**
 * Build renderable PartnerPosition[] (+ diagnostic counters) from raw
 * presence docs already scoped by subscribeToNearbyPresence (mode,
 * ageGroup, and radius already applied at the query level — this only
 * handles what a query can't: self-exclusion, staleness, coord validation).
 */
function buildPartnerPositions(
  docs: Array<Record<string, any>>,
  currentUid: string | undefined,
  getColor: (uid: string) => string,
): { results: PartnerPosition[]; dropReasons: Record<string, number>; modeBreakdown: Record<string, number> } {
  const results: PartnerPosition[] = [];
  const dropReasons = { ghost: 0, self: 0, nonFiniteCoords: 0, stale: 0 };
  const modeBreakdown: Record<string, number> = {};
  const now = Date.now();
  for (const data of docs) {
    modeBreakdown[String(data.mode ?? 'undefined')] =
      (modeBreakdown[String(data.mode ?? 'undefined')] ?? 0) + 1;
    if (data.mode === 'ghost') { dropReasons.ghost += 1; continue; }
    if (data.uid === currentUid) { dropReasons.self += 1; continue; }
    const updatedAt = data.updatedAt;
    const updatedMs =
      updatedAt && typeof updatedAt.toMillis === 'function'
        ? updatedAt.toMillis()
        : typeof updatedAt === 'number'
          ? updatedAt
          : 0;
    if (updatedMs > 0 && now - updatedMs > STALE_PRESENCE_MS) { dropReasons.stale += 1; continue; }
    const rawLat = data.lat;
    const rawLng = data.lng;
    if (typeof rawLat !== 'number' || typeof rawLng !== 'number') { dropReasons.nonFiniteCoords += 1; continue; }
    if (!Number.isFinite(rawLat) || !Number.isFinite(rawLng)) { dropReasons.nonFiniteCoords += 1; continue; }
    results.push({
      uid: data.uid,
      name: data.name ?? '',
      lat: rawLat,
      lng: rawLng,
      color: getColor(data.uid),
      activityStatus: data.activity?.status ?? '',
      groupSessionId: data.groupSessionId,
      personaId: data.personaId ?? undefined,
      personaImageUrl: resolvePersonaImage(data.personaId),
      lemurStage: typeof data.lemurStage === 'number' ? data.lemurStage : undefined,
      distance: typeof data.activity?.distance === 'number' ? data.activity.distance : undefined,
    });
  }
  return { results, dropReasons, modeBreakdown };
}

export function useGroupPresence(
  groupSessionId?: string | null,
  // memberIds is kept in the signature for compatibility with existing callers
  // but is no longer used in the query — group membership is now derived from
  // audienceGroupIds on the presence doc, which is server-validated.
  _memberIds?: string[],
  // SPEC-04 Wave A: required for the discovery-mode radius query. Optional
  // because the group-session branch (real groupSessionId) never needs it —
  // that query is already scoped by audienceGroupIds, not by distance.
  currentLocation?: { lat: number; lng: number } | null,
): PartnerPosition[] {
  const [positions, setPositions] = useState<PartnerPosition[]>([]);
  const profile = useUserStore((s) => s.profile);
  const ageGroup = profile?.core?.ageGroup ?? deriveAgeGroup(profile?.core?.birthDate);
  // Rounded to ~1.1km resolution (2 decimal places) purely as an effect
  // dependency — resubscribing (tearing down and rebuilding N geohash-range
  // listeners) on every GPS tick would be wasteful when the user has barely
  // moved. The effect body below still reads the FULL-PRECISION
  // currentLocation for the actual query center; only the re-subscribe
  // CADENCE is bucketed, not the query itself.
  const locationBucketKey = currentLocation
    ? `${currentLocation.lat.toFixed(2)},${currentLocation.lng.toFixed(2)}`
    : null;
  const unsubRef = useRef<Unsubscribe | null>(null);
  const colorMapRef = useRef(new Map<string, string>());
  // Retry counter — incremented when PERMISSION-DENIED fires (Firestore propagation
  // race: user_memberships was written but hasn't reached the read path yet).
  // Capped at MAX_PERMISSION_RETRIES to avoid infinite loops on genuine denials.
  const [permissionRetry, setPermissionRetry] = useState(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset retry counter whenever the session changes.
  useEffect(() => {
    setPermissionRetry(0);
  }, [groupSessionId]);

  function getColor(uid: string): string {
    if (!colorMapRef.current.has(uid)) {
      colorMapRef.current.set(uid, GROUP_COLORS[colorMapRef.current.size % GROUP_COLORS.length]);
    }
    return colorMapRef.current.get(uid)!;
  }

  useEffect(() => {
    unsubRef.current?.();
    if (retryTimerRef.current !== null) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    const currentUid = auth.currentUser?.uid;

    // [DIAG] Confirms the listener is being set up at all and shows
    // who the requester is. If `currentUid` is undefined when this fires,
    // either auth is still hydrating or the user is signed out — both
    // would let unfiltered docs through (since the self-filter
    // `data.uid === currentUid` becomes `data.uid === undefined`).
    console.log('[useGroupPresence] subscribe', {
      currentUid: currentUid ?? null,
      groupSessionId: groupSessionId ?? null,
    });

    const isDiscovery = !(groupSessionId && typeof groupSessionId === 'string');

    // ── Discovery mode — SPEC-04 Wave A ───────────────────────────────────────
    // Radius + age are the SAME condition, not two separate filters (POLICY-01:
    // "who's nearby AND matches my age" is one question). No shared/pooled
    // stream anymore — see nearbyPresence.service.ts's own header for why the
    // old "one unscoped stream shared by every consumer" design couldn't
    // survive becoming per-caller-scoped.
    if (isDiscovery) {
      if (!currentLocation) {
        setPositions([]);
        return;
      }
      const unsub = subscribeToNearbyPresence(
        { center: currentLocation, radiusKm: DISCOVERY_RADIUS_KM, ageGroup },
        (docs: RawPresenceDoc[]) => {
          const { results } = buildPartnerPositions(docs, currentUid, getColor);
          setPositions(results);
        },
        (err: any) => {
          const code = err?.code ?? '(no code)';
          if (code === 'permission-denied') {
            console.error(
              '[useGroupPresence] discovery PERMISSION-DENIED. Check App Check ' +
                '(NEXT_PUBLIC_RECAPTCHA_SITE_KEY), Firestore rules on `presence` ' +
                '(ageGroup must match getUserAgeGroup(request.auth.uid)), and the ' +
                'presence -> {mode, ageGroup, geohash} composite index.',
              err,
            );
          } else {
            console.warn('[useGroupPresence] discovery listener error:', code, err);
          }
        },
      );
      unsubRef.current = unsub;
      return () => {
        unsubRef.current?.();
        if (retryTimerRef.current !== null) {
          clearTimeout(retryTimerRef.current);
          retryTimerRef.current = null;
        }
      };
    }

    // Group session — where('mode','==','group') AND
    // where('audienceGroupIds','array-contains', groupSessionId). Every
    // returned doc has mode='group' and includes the session's groupId in
    // audienceGroupIds. The rule checks that the reader shares that groupId
    // (via server-managed social.groupIds) — provable for each doc
    // individually, so no all-or-nothing failure. Untouched by SPEC-04 —
    // this is already member-scoped, not the unscoped-discovery gap.
    const q = query(
      collection(db, 'presence'),
      where('mode', '==', 'group'),
      where('audienceGroupIds', 'array-contains', groupSessionId),
    );

    unsubRef.current = onSnapshot(q, (snap) => {
      const results: PartnerPosition[] = [];
      // [DIAG] Per-snapshot diagnostics. Aggregate counters explain why
      // a non-empty Firestore collection ends up rendering zero pins.
      const dropReasons = {
        ghost: 0,
        self: 0,
        nonFiniteCoords: 0,
        stale: 0,
      };
      const modeBreakdown: Record<string, number> = {};
      const now = Date.now();

      snap.forEach((d) => {
        const data = d.data();
        modeBreakdown[String(data.mode ?? 'undefined')] =
          (modeBreakdown[String(data.mode ?? 'undefined')] ?? 0) + 1;

        if (data.mode === 'ghost') {
          dropReasons.ghost += 1;
          return;
        }
        if (data.uid === currentUid) {
          dropReasons.self += 1;
          return;
        }

        // Drop stale presence docs whose heartbeat hasn't fired in
        // STALE_PRESENCE_MS. Without this, an orphaned doc (closed tab,
        // failed unmount cleanup in ShareAsLiveToggle, app crash) leaves
        // a "live" pin on the map indefinitely until another user
        // happens to overwrite it. We tolerate docs without `updatedAt`
        // (legacy data, in-flight writes that haven't materialised the
        // server timestamp yet) — those are passed through unchanged.
        const updatedAt = data.updatedAt;
        const updatedMs =
          updatedAt && typeof updatedAt.toMillis === 'function'
            ? updatedAt.toMillis()
            : typeof updatedAt === 'number'
              ? updatedAt
              : 0;
        if (updatedMs > 0 && now - updatedMs > STALE_PRESENCE_MS) {
          dropReasons.stale += 1;
          return;
        }

        // INTENTIONALLY no `if (!data.activity?.status) return;` here.
        // The map heartbeat in `usePresenceLayer.ts` writes presence
        // WITHOUT an `activity` block whenever the user just has the
        // map open and isn't running a workout. Filtering those out
        // made every idle user invisible to every other idle user —
        // i.e. "two logged-in users open the map and can't see each
        // other". Idle pins still render (with `activityStatus: ''`),
        // and the activity-based filter in AppMap (`partnerActivity
        // Filter`) correctly drops them only when the user has
        // explicitly narrowed the filter to a specific activity.

        // No client-side member filter needed — the server-side query
        // (audienceGroupIds array-contains groupSessionId) already restricts
        // results to broadcasters who explicitly included the session group.

        // Drop docs with missing/non-finite coords. The previous `?? 0`
        // fallback rescued the React <Marker> tier from a crash but
        // pinned the partner to [0,0] (Gulf of Guinea) AND still leaked
        // the null down to AppMap's GeoJSON sources where Mapbox throws
        // "Expected value to be of type number, but found null instead".
        const rawLat = data.lat;
        const rawLng = data.lng;
        if (typeof rawLat !== 'number' || typeof rawLng !== 'number') {
          dropReasons.nonFiniteCoords += 1;
          return;
        }
        if (!Number.isFinite(rawLat) || !Number.isFinite(rawLng)) {
          dropReasons.nonFiniteCoords += 1;
          return;
        }

        results.push({
          uid: data.uid,
          name: data.name ?? '',
          lat: rawLat,
          lng: rawLng,
          color: getColor(data.uid),
          activityStatus: data.activity?.status ?? '',
          groupSessionId: data.groupSessionId,
          personaId: data.personaId ?? undefined,
          personaImageUrl: resolvePersonaImage(data.personaId),
          lemurStage: typeof data.lemurStage === 'number' ? data.lemurStage : undefined,
          distance: typeof data.activity?.distance === 'number' ? data.activity.distance : undefined,
        });
      });

      // [DIAG] Single line per snapshot showing the full pipeline:
      //   total       — how many docs the rules+query returned
      //   modeBreakdown — by privacy mode (should be all 'verified_global'
      //                  given our query filter)
      //   dropReasons — why we filtered each one out client-side
      //   rendered    — what we hand to React
      //   fromCache   — true ⇒ Firestore is serving cached data, server
      //                 may not be reachable (App Check / network / rules)
      //   hasPendingWrites — local write hasn't reached server yet
      console.log('[useGroupPresence] snapshot', {
        total: snap.size,
        modeBreakdown,
        dropReasons,
        rendered: results.length,
        fromCache: snap.metadata.fromCache,
        hasPendingWrites: snap.metadata.hasPendingWrites,
        currentUid: currentUid ?? null,
      });

      setPositions(results);
    }, (err: any) => {
      // Surface listener errors instead of swallowing. The most common
      // cause in production is App Check rejecting the request when
      // NEXT_PUBLIC_RECAPTCHA_SITE_KEY is missing — silently failing
      // here is exactly why "Device B sees zero partners" was so hard
      // to diagnose. Distinguish permission errors so devs know to
      // check App Check / security rules first.
      const code = err?.code ?? '(no code)';
      if (code === 'permission-denied') {
        if (permissionRetry < MAX_PERMISSION_RETRIES) {
          // Transient race: user_memberships was written by join/confirm but
          // hasn't propagated to the Firestore read path yet. Re-subscribe
          // after 2 s to give the write time to become visible.
          console.warn(
            `[useGroupPresence] PERMISSION-DENIED — retry ${permissionRetry + 1}/${MAX_PERMISSION_RETRIES} in 2 s`,
          );
          retryTimerRef.current = setTimeout(
            () => setPermissionRetry((c) => c + 1),
            2000,
          );
        } else {
          console.error(
            '[useGroupPresence] PERMISSION-DENIED after max retries. ' +
              'Check App Check (NEXT_PUBLIC_RECAPTCHA_SITE_KEY), Firestore rules, ' +
              'and user_memberships doc. Partners will NOT render.',
            err,
          );
        }
      } else {
        console.warn('[useGroupPresence] Firestore presence listener error:', code, err);
      }
    });

    return () => {
      unsubRef.current?.();
      if (retryTimerRef.current !== null) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupSessionId, permissionRetry, locationBucketKey, ageGroup]);

  return positions;
}
