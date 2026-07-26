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
 *   2. General discovery: queries presence where mode=='verified_global'
 *      (statically safe — same as before).
 *
 * The old `where('uid', 'in', memberIds)` query is intentionally removed.
 * It caused all-or-nothing batch failures when any single doc in the result
 * failed the security rule (e.g. inconsistent follow graph in squad mode).
 */

import { useState, useEffect, useRef } from 'react';
import { collection, query, where, onSnapshot, limit, type Unsubscribe } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { IS_PERF_BATCH2_PRESENCE_ENABLED } from '@/config/feature-flags';
import { usePresenceStore, acquirePresenceStream, PRESENCE_STREAM_MAX } from '../store/usePresenceStore';

/**
 * Persona ID → public image path.
 * Uses the same IDs from DEFAULT_PERSONAS in persona.service.ts.
 * Fallback to king-lemur for unknown persona IDs.
 */
export const PERSONA_IMAGES: Record<string, string> = {
  athlete:       '/assets/lemur/lemur-avatar.png',
  parent:        '/assets/lemur/lemur-avatar.png',
  office_worker: '/assets/lemur/king-lemur.png',
  student:       '/assets/lemur/lemur-avatar.png',
  senior:        '/assets/lemur/lemur-avatar.png',
  reservist:     '/assets/lemur/king-lemur.png',
  soldier:       '/assets/lemur/king-lemur.png',
  pupil:         '/assets/lemur/lemur-avatar.png',
  young_pro:     '/assets/lemur/lemur-avatar.png',
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
 * Build renderable PartnerPosition[] (+ diagnostic counters) from raw flattened
 * verified_global presence docs. Used by the P4 shared-stream path only.
 *
 * NOTE: this MIRRORS the inline transform in the discovery onSnapshot callback
 * below. It is kept as a separate function on purpose so the flag-OFF onSnapshot
 * path stays byte-identical and untouched. Once IS_PERF_BATCH2_PRESENCE_ENABLED is
 * permanent, delete the inline copy and route the onSnapshot through here too.
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
): PartnerPosition[] {
  const [positions, setPositions] = useState<PartnerPosition[]>([]);
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

    // ── P4 shared presence stream (perf/batch2, flag-gated) ──────────────────
    // In DISCOVERY mode, read the single shared verified_global presence stream
    // (one onSnapshot serves this hook AND usePartnerData's live listener)
    // instead of opening a second unbounded listener. The GROUP-session path
    // below keeps its dedicated mode=='group', member-scoped query (a different
    // shape that must stay separate). Query shape preserved → rules-safe. When
    // the flag is off this branch is skipped and the original onSnapshot below
    // runs unchanged (byte-identical).
    if (IS_PERF_BATCH2_PRESENCE_ENABLED && isDiscovery) {
      const applyShared = () => {
        const { results } = buildPartnerPositions(
          usePresenceStore.getState().docs,
          currentUid,
          getColor,
        );
        setPositions(results);
      };
      const release = acquirePresenceStream();
      applyShared();
      const unsubStore = usePresenceStore.subscribe(applyShared);
      unsubRef.current = () => { unsubStore(); release(); };
      return () => {
        unsubRef.current?.();
        if (retryTimerRef.current !== null) {
          clearTimeout(retryTimerRef.current);
          retryTimerRef.current = null;
        }
      };
    }

    // Query design — must be statically provable against the Firestore rules
    // so that every doc the query returns is guaranteed readable:
    //
    //   Group session  → where('mode','==','group')
    //                    AND where('audienceGroupIds','array-contains', groupSessionId)
    //                    Every returned doc has mode='group' and includes the
    //                    session's groupId in audienceGroupIds. The rule checks
    //                    that the reader shares that groupId (via server-managed
    //                    social.groupIds) — provable for each doc individually,
    //                    so no all-or-nothing failure.
    //
    //   Discovery      → where('mode','==','verified_global')
    //                    Statically satisfiable — unchanged from before.
    const q = (groupSessionId && typeof groupSessionId === 'string')
      ? query(
          collection(db, 'presence'),
          where('mode', '==', 'group'),
          where('audienceGroupIds', 'array-contains', groupSessionId),
        )
      : query(collection(db, 'presence'), where('mode', '==', 'verified_global'), limit(PRESENCE_STREAM_MAX));

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
  }, [groupSessionId, permissionRetry]);

  return positions;
}
