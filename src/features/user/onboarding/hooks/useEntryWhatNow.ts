'use client';

/**
 * useEntryWhatNow — state for the entry flow's step 2 drawer (enable_entry_whatnow_v1).
 *
 * Armed only on an entry-v2 landing (MapShell consumed the C1 signal) with the flag on. Reads the
 * once-per-user seen flag from onboardingPrefs (axioms §19 — survives a hard close on native),
 * resolves the nearest equipped park from the SAME cached park set the map uses (fetchRealParks,
 * dynamic import — no new fetch cost), then opens once the map is calm. `answer` records the
 * choice and closes; the caller performs the navigation.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getOnboardingPrefAsync, setOnboardingPref } from '@/lib/onboardingPrefs';
import {
  chooseWhatNowCards, shouldOpenWhatNow, whatNowRouteCopy, whatNowSeenKey,
  type WhatNowAnswer, type WhatNowLayout, type WhatNowPark, type WhatNowRouteCopy, type WhatNowRouteSuggestion,
} from '../services/entry-whatnow';

type LatLng = { lat: number; lng: number };

/** Give the park lookup this long before opening without it (plan + Kelly). */
const PARK_LOOKUP_TIMEOUT_MS = 3000;

export interface EntryWhatNowState {
  open: boolean;
  layout: WhatNowLayout;
  routeCopy: WhatNowRouteCopy | null;
  /** Midpoint between the user and the park (for the mini map), when known. */
  routeCenter: LatLng | null;
  answer: (a: WhatNowAnswer) => void;
}

export function useEntryWhatNow(input: {
  enabled: boolean;
  landing: boolean;
  uid: string | null | undefined;
  /** GPS position, else the saved home anchor. */
  position: LatLng | null;
  route: WhatNowRouteSuggestion | null;
  /** A workout / another flow owns the screen right now. */
  blocked: boolean;
}): EntryWhatNowState {
  const { enabled, landing, uid, position, route, blocked } = input;
  const armed = enabled && landing;

  // Seen flag: undefined = still reading.
  const [seen, setSeen] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    if (!armed) return;
    let alive = true;
    void getOnboardingPrefAsync(whatNowSeenKey(uid)).then((v) => { if (alive) setSeen(v); });
    return () => { alive = false; };
  }, [armed, uid]);

  // Nearest equipped park: undefined = still looking; null = none / failed / timed out.
  const [park, setPark] = useState<(WhatNowPark & LatLng) | null | undefined>(undefined);
  const hasPos = position != null;
  useEffect(() => {
    if (!armed || seen === undefined || seen) return;
    if (!position) return;
    let alive = true;
    const timer = setTimeout(() => { if (alive) setPark((p) => (p === undefined ? null : p)); }, PARK_LOOKUP_TIMEOUT_MS);
    Promise.all([
      import('@/features/parks/core/services/parks.service'),
      import('@/features/workout-engine/hybrid/park-out-and-back'),
      import('@/features/parks/core/services/geoUtils'),
    ]).then(async ([{ fetchRealParks }, { nearestEquippedPark }, { haversineMeters }]) => {
      try {
        const parks = await fetchRealParks();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- same cast as DiscoverLayer's own lookup
        const p = nearestEquippedPark(position, parks as any);
        if (!alive) return;
        const lat = p?.location?.lat;
        const lng = p?.location?.lng;
        setPark(p && lat != null && lng != null
          ? { name: p.name ?? null, distanceM: haversineMeters(position.lat, position.lng, lat, lng), lat, lng }
          : null);
      } catch {
        if (alive) setPark(null);
      }
    }).catch(() => { if (alive) setPark(null); });
    return () => { alive = false; clearTimeout(timer); };
    // Position is read once it exists — a GPS drift must not re-run the lookup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [armed, seen, hasPos]);

  // No position at all → don't wait for a park lookup that can't run.
  const parkResolved = park !== undefined || (armed && !hasPos);

  const [answered, setAnswered] = useState(false);
  const layout = useMemo(
    () => chooseWhatNowCards({ nearestPark: park ?? null, route }),
    [park, route],
  );
  const routeCopy = useMemo(
    () => (layout.near && route ? whatNowRouteCopy(route, park?.name ?? null) : null),
    [layout.near, route, park],
  );
  const routeCenter = useMemo(
    () => (park && position ? { lat: (park.lat + position.lat) / 2, lng: (park.lng + position.lng) / 2 } : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [park, hasPos],
  );

  // Latch: once open, it stays open until answered (a later "busy" signal must not yank it).
  const [latched, setLatched] = useState(false);
  const wantsOpen =
    !answered && parkResolved && seen !== undefined &&
    shouldOpenWhatNow({ enabled, landing, seenValue: seen, blocked });
  useEffect(() => { if (wantsOpen) setLatched(true); }, [wantsOpen]);

  const answer = useCallback((a: WhatNowAnswer) => {
    setOnboardingPref(whatNowSeenKey(uid), a); // dismiss / browse count as seen too
    setAnswered(true);
    setLatched(false);
  }, [uid]);

  return { open: latched && !answered, layout, routeCopy, routeCenter, answer };
}
