'use client';

/**
 * useEntryRouter — the tutorial's 2-gate state machine (slice 1, 06.10.2026).
 *
 * Gate 1 (has this user ever trained): `entry-router-gate1.service.ts`'s
 * `hasEverTrained` — trusts `progression.workoutCount > 0` immediately,
 * falls back to a real `workouts` query only when that counter reads 0/absent.
 *
 * Gate 2 (geo — only reached for "never trained" users): `entry-router-geo
 * .service.ts`'s `hasNearbyGardens` / `hasNearbyPreparedRoutes`, same data
 * fetches + predicates home/map already trust post-#150/#153.
 *
 * Scope for this slice: both gates always resolve to a real classification
 * (never left stuck on "loading" forever — see the GPS-timeout note below),
 * but the caller (home/page.tsx's WelcomeDrawer mount) is expected to take
 * no VISIBLE action on 'inactive' — that covers both "flag off / dismissed"
 * AND "trained" users, since the in-program branches' treatment depends on
 * the not-yet-built hint/coachmark engine (a later slice).
 *
 * GPS timeout: this hook deliberately does NOT call
 * requestPermissionNow()/requestPermissionIfAllowed() itself — home/page.tsx
 * already owns that initialization elsewhere. It only reads the store
 * reactively. A brand-new user (exactly this feature's target audience) is
 * the COMMON case where coords are still unresolved on first mount, so a
 * bounded wait (GPS_WAIT_TIMEOUT_MS) falls through to the 'none' geo branch
 * (the free-cardio deep link — the one path that needs no geo data at all)
 * rather than holding the drawer back indefinitely on a permission prompt
 * the user may never answer. This is the same "never an empty screen"
 * principle applied to a missing SIGNAL, not just missing CONTENT.
 */

import { useEffect, useRef, useState } from 'react';
import { useUserStore } from '../../identity/store/useUserStore';
import { useGPSStore } from '@/features/parks/core/store/useGPSStore';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { getOnboardingPrefAsync, setOnboardingPref } from '@/lib/onboardingPrefs';
import { hasEverTrained } from '../services/entry-router-gate1.service';
import { hasNearbyGardens, hasNearbyPreparedRoutes } from '../services/entry-router-geo.service';

const DISMISSED_PREF_KEY = 'tutorial_welcome_drawer_dismissed';
const GPS_WAIT_TIMEOUT_MS = 3000;

export type EntryRouterGeoBranch = 'gardens' | 'routes' | 'none';

export type EntryRouterClassification =
  | { kind: 'loading' }
  | { kind: 'inactive' }
  | { kind: 'new'; geoBranch: EntryRouterGeoBranch };

export function useEntryRouter(): {
  classification: EntryRouterClassification;
  dismiss: () => void;
} {
  const profile = useUserStore((s) => s.profile);
  const gpsCoords = useGPSStore((s) => s.coords);
  const gpsPermissionState = useGPSStore((s) => s.permissionState);
  const isSuperAdmin = !!(profile?.core as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin;
  const { flags, loading: flagsLoading } = useFeatureFlags(isSuperAdmin);

  const [dismissed, setDismissed] = useState(false);
  const [classification, setClassification] = useState<EntryRouterClassification>({ kind: 'loading' });
  const gpsWaitStartedAt = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    getOnboardingPrefAsync(DISMISSED_PREF_KEY).then((v) => {
      if (!cancelled && v === '1') setDismissed(true);
    });
    return () => { cancelled = true; };
  }, []);

  const userId = profile?.id;
  const workoutCount = profile?.progression?.workoutCount;

  useEffect(() => {
    if (flagsLoading) return;
    if (!flags.enableOnboardingTutorialV1 || dismissed || !userId) {
      setClassification({ kind: 'inactive' });
      return;
    }

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    async function resolve(uid: string) {
      const trained = await hasEverTrained(uid, workoutCount);
      if (cancelled) return;
      if (trained) {
        setClassification({ kind: 'inactive' });
        return;
      }

      if (gpsCoords) {
        const [gardens, routes] = await Promise.all([
          hasNearbyGardens(gpsCoords),
          hasNearbyPreparedRoutes(gpsCoords),
        ]);
        if (cancelled) return;
        setClassification({ kind: 'new', geoBranch: gardens ? 'gardens' : routes ? 'routes' : 'none' });
        return;
      }

      if (gpsPermissionState === 'denied') {
        setClassification({ kind: 'new', geoBranch: 'none' });
        return;
      }

      // No fix yet and permission isn't denied — give the in-flight prompt/fix
      // a bounded window, then fall through to the geo-free 'none' branch.
      if (gpsWaitStartedAt.current === null) gpsWaitStartedAt.current = Date.now();
      const elapsed = Date.now() - gpsWaitStartedAt.current;
      if (elapsed >= GPS_WAIT_TIMEOUT_MS) {
        setClassification({ kind: 'new', geoBranch: 'none' });
        return;
      }

      setClassification({ kind: 'loading' });
      timeoutId = setTimeout(() => resolve(uid), GPS_WAIT_TIMEOUT_MS - elapsed);
    }

    resolve(userId);
    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [flagsLoading, flags.enableOnboardingTutorialV1, dismissed, userId, workoutCount, gpsCoords, gpsPermissionState]);

  function dismiss() {
    setDismissed(true);
    setOnboardingPref(DISMISSED_PREF_KEY, '1');
    setClassification({ kind: 'inactive' });
  }

  return { classification, dismiss };
}
