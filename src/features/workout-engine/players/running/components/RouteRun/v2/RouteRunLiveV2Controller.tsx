'use client';

/**
 * RouteRunLiveV2Controller — publishes the focused route's elevation samples,
 * aligned to the session's own (possibly loop-rotated) path, to
 * useRouteRunV2Store for the elevation-ahead strip (enable_home_v2; board
 * R3-prop-route-live). Samples come only from the route doc
 * (`elevationProfile`) — never fetched at runtime.
 *
 * Mounted by MapShell during an active run with a focused route. Renders
 * nothing; does nothing for users without the flag.
 */

import { useEffect } from 'react';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useUserStore } from '@/features/user';
import { useRunningPlayer } from '../../../store/useRunningPlayer';
import { useRouteRunV2Store } from '../../../store/useRouteRunV2Store';
import {
  readElevationSamples, rotateElevationSamples, sessionStartOffsetM,
} from '../../../lib/route-elevation-ahead';

export interface RouteRunLiveV2ControllerProps {
  /** The focused route object (its stored path + optional elevation profile). */
  route: { path?: unknown; elevationProfile?: unknown } | null | undefined;
}

export default function RouteRunLiveV2Controller({ route }: RouteRunLiveV2ControllerProps) {
  const isSuperAdmin = useUserStore((st) => !!(st.profile?.core as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin);
  const v2 = useFeatureFlags(isSuperAdmin).flags.enableHomeV2;
  const sessionPath = useRunningPlayer((s) => s.activeRoutePath);
  const canonical = route?.path;
  const elevationProfile = route?.elevationProfile;

  useEffect(() => {
    const store = useRouteRunV2Store.getState();
    const samples = v2 ? readElevationSamples({ elevationProfile }) : null;
    if (!samples || !Array.isArray(canonical) || !Array.isArray(sessionPath) || sessionPath.length < 2) {
      store.setElevation(null);
      return;
    }
    const offset = sessionStartOffsetM(canonical as number[][], sessionPath);
    store.setElevation(offset == null ? null : rotateElevationSamples(samples, offset));
  }, [v2, canonical, elevationProfile, sessionPath]);

  useEffect(() => () => useRouteRunV2Store.getState().setElevation(null), []);

  return null;
}
