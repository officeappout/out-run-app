'use client';

/**
 * useGroupPresence — listens to live partner positions.
 *
 * Two modes:
 *   1. Group session: queries `presence` where uid in group memberIds
 *   2. General: consumes the full `presence` collection (filtered client-side)
 *
 * Filters out ghost users and the current user.
 */

import { useState, useEffect, useRef } from 'react';
import { collection, query, where, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';

/**
 * Persona ID → public image path.
 * Uses the same IDs from DEFAULT_PERSONAS in persona.service.ts.
 * Fallback to king-lemur for unknown persona IDs.
 */
export const PERSONA_IMAGES: Record<string, string> = {
  athlete:       '/assets/lemur/smart-lemur.png',
  parent:        '/assets/lemur/lemur-avatar.png',
  office_worker: '/assets/lemur/king-lemur.png',
  student:       '/assets/lemur/smart-lemur.png',
  senior:        '/assets/lemur/lemur-avatar.png',
  reservist:     '/assets/lemur/king-lemur.png',
  soldier:       '/assets/lemur/king-lemur.png',
  pupil:         '/assets/lemur/smart-lemur.png',
  young_pro:     '/assets/lemur/smart-lemur.png',
  pro_athlete:   '/assets/lemur/smart-lemur.png',
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
}

// Muted, dusty palette — keeps partners identifiable without competing
// with the user's own bright cyan lemur marker.
const GROUP_COLORS = [
  '#8B9DC3', '#7BA898', '#C9A96E', '#A090B8', '#B08A9A',
  '#7EA88A', '#C49A7A', '#7E9DB0', '#B898A8', '#A4B87A',
  '#7AAEC0', '#B0AC84',
];

export function useGroupPresence(
  groupSessionId?: string | null,
  memberIds?: string[],
): PartnerPosition[] {
  const [positions, setPositions] = useState<PartnerPosition[]>([]);
  const unsubRef = useRef<Unsubscribe | null>(null);
  const colorMapRef = useRef(new Map<string, string>());

  function getColor(uid: string): string {
    if (!colorMapRef.current.has(uid)) {
      colorMapRef.current.set(uid, GROUP_COLORS[colorMapRef.current.size % GROUP_COLORS.length]);
    }
    return colorMapRef.current.get(uid)!;
  }

  useEffect(() => {
    unsubRef.current?.();
    const currentUid = auth.currentUser?.uid;

    // CRITICAL: must match the Firestore rule on /presence/{uid}.
    //
    // The rule allows cross-user reads only when the broadcaster's doc has
    // `mode == 'verified_global'` (public tier) or when the requester is
    // already in their `connections.followers` list (squad tier). Firestore
    // refuses any collection query whose results cannot be statically
    // proven readable, so a bare `collection(db, 'presence')` listener
    // fails with PERMISSION_DENIED — that's the error users were seeing
    // when they opened the partner finder.
    //
    // Two query shapes:
    //   • Group session   → `where('uid', 'in', memberIds)` — bounded set
    //                        (≤30) so the rule engine can evaluate the
    //                        squad/verified branches per-doc. Works for
    //                        squad-mode group members too, AS LONG AS the
    //                        requester is in their followers list (group
    //                        membership doesn't override Firestore rules).
    //   • Stranger discovery → `where('mode', '==', 'verified_global')`,
    //                        which is statically satisfiable against the
    //                        public-tier read rule. Squad-mode broadcasters
    //                        are intentionally excluded here; the
    //                        friends-only listener in `usePresenceLayer.ts`
    //                        is the channel that surfaces them to people
    //                        they've allowed.
    const memberIdsForQuery =
      groupSessionId && memberIds && memberIds.length > 0
        ? memberIds.slice(0, 30) // Firestore `in` cap = 30
        : null;
    const q = memberIdsForQuery
      ? query(collection(db, 'presence'), where('uid', 'in', memberIdsForQuery))
      : query(collection(db, 'presence'), where('mode', '==', 'verified_global'));

    unsubRef.current = onSnapshot(q, (snap) => {
      const results: PartnerPosition[] = [];
      snap.forEach((d) => {
        const data = d.data();
        if (data.mode === 'ghost') return;
        if (data.uid === currentUid) return;

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

        if (groupSessionId && memberIds) {
          if (!memberIds.includes(data.uid)) return;
        }

        // Drop docs with missing/non-finite coords. The previous `?? 0`
        // fallback rescued the React <Marker> tier from a crash but
        // pinned the partner to [0,0] (Gulf of Guinea) AND still leaked
        // the null down to AppMap's GeoJSON sources where Mapbox throws
        // "Expected value to be of type number, but found null instead".
        const rawLat = data.lat;
        const rawLng = data.lng;
        if (typeof rawLat !== 'number' || typeof rawLng !== 'number') return;
        if (!Number.isFinite(rawLat) || !Number.isFinite(rawLng)) return;

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
        });
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
        console.error(
          '[useGroupPresence] Firestore presence listener PERMISSION-DENIED. ' +
            'Check App Check (NEXT_PUBLIC_RECAPTCHA_SITE_KEY) and Firestore rules ' +
            'on the `presence` collection. Partners will NOT render until this is fixed.',
          err,
        );
      } else {
        console.warn('[useGroupPresence] Firestore presence listener error:', code, err);
      }
    });

    return () => unsubRef.current?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupSessionId, memberIds?.join(',')]);

  return positions;
}
