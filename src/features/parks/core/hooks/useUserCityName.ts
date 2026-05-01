'use client';

/**
 * useUserCityName — resolves a city-name string for the current user, used
 * to query the `street_segments` collection in route generation.
 *
 * ─── Traveler-First Resolution Order ──────────────────────────────────────
 * Priority (first non-empty wins):
 *   1. **GPS reverse-geocode** of the supplied position — the *current*
 *      city the user is physically standing in. This is the truth the
 *      generator actually needs: a Tel-Aviv-affiliated user travelling to
 *      Sderot must get the Sderot `street_segments`, not their cached
 *      home affiliation.
 *   2. profile.core.affiliations[type='city'].name — fallback for offline
 *      / pending-GPS sessions, set by the onboarding GPS flow and refreshed
 *      every time path 1 succeeds (see persistResolvedCity).
 *   3. profile.core.authorityId → getAuthority().name — final fallback for
 *      users who finished onboarding by picking an authority directly
 *      (no GPS, no city affiliation).
 *
 * The previous ordering put affiliation FIRST and GPS LAST, which caused a
 * subtle but corrosive bug: a Tel-Aviv-affiliated user opening the app in
 * Sderot would generate routes against `street_segments.cityName == "תל אביב"`
 * — i.e. the wrong city — even with a perfectly good GPS fix in hand. The
 * city affiliation acted as a write-once "home city" lock that no amount of
 * travel could override.
 *
 * Returns `undefined` while pending or when no path resolves — the generator
 * treats `undefined` as "skip the street_segments query, fall back to random
 * waypoints", so the consumer is null-safe.
 *
 * The hook also normalises the city name so the result matches the spelling
 * used by the OSM importer (`--city "תל אביב"`). Mapbox's `place` feature
 * for Tel Aviv often returns `"תל אביב-יפו"`; we strip the `-יפו` suffix
 * here so a single OSM import covers both spellings.
 *
 * Self-healing: when path 1 succeeds for an authenticated user, we
 * fire-and-forget the resolved name into `core.affiliations[]` via
 * `addAffiliation()`. This means each user pays the Mapbox round-trip at
 * most once per CITY (the geo-cache + persistence guard handle dedup), and
 * the offline fallback (path 2) always reflects the LAST physically-visited
 * city — which is the closest thing to a "home city" we can derive without
 * an explicit user setting.
 *
 * Verbose debug logs are emitted on every resolution step. They are gated
 * by `DEBUG_RESOLUTION` and can be silenced once the flow is verified.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { getAuthority } from '@/features/admin/services/authority.service';
import { addAffiliation } from '@/features/user/identity/services/affiliation.service';
import {
  reverseGeocode,
  findAuthorityIdByCity,
} from '@/features/user/onboarding/components/steps/UnifiedLocation/location-utils';
import type { AccessTier } from '@/features/user/core/types/user.types';

const DEBUG_RESOLUTION = true;
const log = (...args: unknown[]) => {
  if (DEBUG_RESOLUTION) console.log('[useUserCityName]', ...args);
};

/**
 * Mapbox returns "תל אביב-יפו" / "תל אביב יפו" for the city centre, but
 * the OSM importer was run with the canonical "תל אביב". Normalise both
 * sides to the same string so Firestore matches.
 *
 * Implementation note: we deliberately DON'T use `\b` after "יפו". In
 * JavaScript regex (without the `u` flag, and even with it for Hebrew),
 * `\b` is defined against `[A-Za-z0-9_]` only — Hebrew letters are
 * non-word characters, so `\b` between a Hebrew letter and end-of-string
 * is NOT a boundary and the replace silently no-ops. We anchor to `$`
 * (end-of-string) plus an optional trailing whitespace catch instead.
 */
function normalizeCityName(raw: string): string {
  return raw
    // Strip invisible Unicode chars FIRST so suffix-detection sees the real
    // string. Mapbox geocoder responses commonly carry bidi marks (LRM/RLM,
    // U+200E/U+200F) at boundaries of Hebrew↔Latin context, which break
    // exact-match Firestore queries downstream — the visual string matches
    // but the byte length doesn't. Without this, `"\u200Fתל אביב-יפו"`
    // would survive `.replace(...יפו)` because `\u200F` doesn't end the
    // string in a way the regex anchors against, and even if it did, the
    // resulting `"\u200Fתל אביב"` would still mismatch Firestore docs
    // stored with a clean `"תל אביב"`.
    .replace(/[\u200B-\u200F\u202A-\u202E\uFEFF]/g, '')
    .replace(/[-\s]+יפו\s*$/u, '') // strip "-יפו" / " יפו" at end-of-string
    .trim();
}

/**
 * Persist a path-3 (GPS-resolved) city back to the user's profile so the
 * NEXT session resolves synchronously via path 1 — no Mapbox round-trip,
 * no race with the route generator.
 *
 * Mirrors the persistence logic in affiliation.service.detectCityFromGPS()
 * (which only runs once during gateway "explore"), but skips the GPS step
 * because our caller already has a resolved name in hand.
 *
 * Silently no-ops when:
 *   - The user is not authenticated (guests have no document to write to).
 *   - The city is empty / whitespace.
 *   - addAffiliation() returns false (most often: id collision — the user
 *     already has the affiliation, in which case persistence has already
 *     happened and we don't need to retry).
 *
 * Returns true only on a fresh successful write.
 */
async function persistResolvedCity(normalized: string): Promise<boolean> {
  if (!normalized) return false;
  const userId = auth.currentUser?.uid;
  if (!userId) {
    log('persist skip: no authenticated user');
    return false;
  }

  // Look up the matching authority (if one exists) so the affiliation gets
  // a real authorityId and tier instead of a synthetic slug. This keeps the
  // schema in lockstep with what detectCityFromGPS() writes during onboarding.
  const authorityId = await findAuthorityIdByCity(normalized);
  let tier: AccessTier = 2; // default municipal tier
  if (authorityId) {
    try {
      const authorityDoc = await getDoc(doc(db, 'authorities', authorityId));
      if (authorityDoc.exists()) {
        const data = authorityDoc.data();
        tier = (data.tier as AccessTier) || 2;
      }
    } catch (err) {
      log('persist: authority tier lookup failed, defaulting to 2', err);
    }
  }

  const wrote = await addAffiliation({
    type: 'city',
    id: authorityId || normalized.toLowerCase().replace(/\s+/g, '_'),
    tier,
    name: normalized,
    joinedAt: new Date(),
  });
  log(
    `persist ${wrote ? 'OK' : 'NO-OP'}: name="${normalized}", authorityId=${authorityId ?? 'none'}, tier=${tier}`,
  );
  return wrote;
}

export function useUserCityName(
  userPosition?: { lat: number; lng: number } | null,
): string | undefined {
  const profile = useUserStore((s) => s.profile);

  // ── Stabilise userPosition reference ──────────────────────────────────────
  // Callers (DiscoverLayer, useRouteGeneration) rebuild the position object
  // inline on every render — `(devSim?.effectiveLocation(...) ?? logic.currentUserPos) ?? null`
  // returns a fresh `{ lat, lng }` literal each time even when the underlying
  // GPS hasn't moved a millimetre. Without this memo every effect that lists
  // `userPosition` in its deps re-fires on every parent render, which (a)
  // spams the console summary log forever and (b) cascades into a re-render
  // of FreeRunRouteSelector that resets RadarAnimation's setTimeout, so the
  // radar's onComplete fires NEVER and the UI is stuck on the searching
  // overlay even after the generator has produced valid routes.
  const lat = userPosition?.lat ?? null;
  const lng = userPosition?.lng ?? null;
  const stablePosition = useMemo<{ lat: number; lng: number } | null>(
    () => (lat != null && lng != null ? { lat, lng } : null),
    [lat, lng],
  );

  // ── Path 2 (fallback): city affiliation ───────────────────────────────────
  // Set by the gateway/explore flow via affiliation.service.detectCityFromGPS()
  // and self-refreshed every time Path 1 succeeds. Synchronous read.
  const cityAffiliation = profile?.core?.affiliations?.find(
    (a) => a.type === 'city',
  )?.name;

  // ── Path 3 (final fallback): authority lookup (async) ────────────────────
  // Only consulted when Path 1 (GPS) AND Path 2 (affiliation) both miss.
  const [authorityCity, setAuthorityCity] = useState<string | undefined>(undefined);
  const authorityId = profile?.core?.authorityId;

  useEffect(() => {
    if (!authorityId) {
      setAuthorityCity(undefined);
      return;
    }
    // We always run this lookup — the picker below decides whether to use
    // it. Skipping based on `cityAffiliation` would create a stale-cache
    // hazard if affiliations change mid-session.
    let cancelled = false;
    log('Path 3 (authority): looking up', authorityId);
    getAuthority(authorityId)
      .then((auth) => {
        if (cancelled) return;
        if (auth?.name) {
          log('Path 3 hit: authority name =', auth.name);
          setAuthorityCity(auth.name);
        } else {
          log('Path 3 miss: no name on authority doc');
        }
      })
      .catch((err) => {
        log('Path 3 error:', err);
      });
    return () => {
      cancelled = true;
    };
  }, [authorityId]);

  // ── Path 1 (PRIMARY): GPS reverse-geocode ────────────────────────────────
  // Now fires UNCONDITIONALLY whenever a position is supplied — no longer
  // gated on the absence of affiliation/authority. This is the core of the
  // traveler-first refactor: GPS truth always trumps cached preferences.
  //
  // The lastGeoCallRef cache prevents re-fetching on every minor GPS jitter
  // (< 1km move) — Mapbox bills per request and the result is stable for the
  // user's current neighbourhood for the whole session. The 1km threshold is
  // chosen specifically to detect inter-city travel (e.g. driving from one
  // municipality to the next) without being so loose that intra-city walks
  // re-trigger the geocoder.
  const [gpsCity, setGpsCity] = useState<string | undefined>(undefined);
  const lastGeoCallRef = useRef<{ lat: number; lng: number } | null>(null);

  // Tracks the LAST persisted city name. Without this, a user crossing from
  // Tel Aviv into Sderot would trigger a single persistence attempt — fine —
  // but a user travelling Tel Aviv → Sderot → Tel Aviv in one session would
  // keep persisting the wrong way around. Tracking last-persisted lets us
  // re-persist whenever the resolved city CHANGES, not just once per mount.
  const lastPersistedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!stablePosition) {
      log('Path 1 skip: no GPS position supplied');
      return;
    }

    // Skip if we've already geocoded this position (within 1km).
    const last = lastGeoCallRef.current;
    if (last) {
      const dLat = (stablePosition.lat - last.lat) * 111;
      const midLat = (stablePosition.lat + last.lat) / 2;
      const dLng =
        (stablePosition.lng - last.lng) * 111 * Math.cos((midLat * Math.PI) / 180);
      const distKm = Math.sqrt(dLat * dLat + dLng * dLng);
      if (distKm < 1) {
        return;
      }
    }
    lastGeoCallRef.current = { lat: stablePosition.lat, lng: stablePosition.lng };

    let cancelled = false;
    log('Path 1: GPS reverse-geocode at', stablePosition);
    reverseGeocode(stablePosition.lat, stablePosition.lng)
      .then((geo) => {
        if (cancelled) return;
        if (!geo.city) {
          log('Path 1 miss: reverse-geocode returned no city', geo);
          return;
        }
        log('Path 1 hit: reverse-geocode city =', geo.city);
        setGpsCity(geo.city);

        // Persist whenever the city CHANGES — not just on first hit. This
        // keeps the affiliation fallback (Path 2) accurate as the user
        // travels between cities. We compare normalised values so the
        // persistence skip-check matches the picker's normalisation below
        // ("תל אביב-יפו" and "תל אביב" deduplicate to one persistence call).
        const normalized = normalizeCityName(geo.city);
        if (lastPersistedRef.current === normalized) return;
        lastPersistedRef.current = normalized;
        persistResolvedCity(normalized).catch((err) => {
          log('persist threw:', err);
        });
      })
      .catch((err) => {
        log('Path 1 error:', err);
      });

    return () => {
      cancelled = true;
    };
  }, [stablePosition]);

  // ── Pick best, normalise, log final summary ───────────────────────────────
  // Traveler-first ordering: GPS → affiliation → authority. Note that GPS
  // wins even over a stale affiliation, which is exactly what we want for
  // the Tel-Aviv-user-in-Sderot case.
  const rawResolved = gpsCity ?? cityAffiliation ?? authorityCity;
  const resolved = rawResolved ? normalizeCityName(rawResolved) : undefined;

  // Single summary line that fires only when the resolved value actually
  // changes. Earlier we listed every input here (including the rebuilt
  // userPosition object), which fired the log on every parent render and
  // re-rendered every consumer in turn — the source of the visible "infinite
  // loop" in the console. Keeping the dep list to the strictly-new
  // information means the log fires exactly twice in the typical Tel-Aviv
  // session: once with `undefined` on mount, once with `"תל אביב"` after
  // path 3 resolves.
  useEffect(() => {
    const source = gpsCity
      ? 'gps'
      : cityAffiliation
        ? 'affiliation'
        : authorityCity
          ? 'authority'
          : 'none';
    log(`Final resolved: raw="${rawResolved ?? ''}" → normalized="${resolved ?? ''}" (source=${source})`, {
      gps: gpsCity,
      affiliation: cityAffiliation,
      authority: authorityCity,
      hasUserId: !!profile?.id,
      hasAuthorityId: !!authorityId,
      hasUserPosition: !!stablePosition,
    });
    // Intentionally narrow deps — see comment above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolved]);

  return resolved;
}
