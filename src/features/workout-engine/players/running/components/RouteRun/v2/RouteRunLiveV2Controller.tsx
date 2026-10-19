'use client';

/**
 * RouteRunLiveV2Controller — the one place a guided route run's v2 extras
 * are driven from (enable_home_v2; boards R3-prop-route-live / -off).
 *
 *   • per GPS fix: off-route detection (lib/off-route-detector — >40 m for
 *     >10 s to enter, <20 m to exit, only after the user joined the route),
 *     published to useRouteRunV2Store;
 *   • per session path: the route's elevation samples aligned to the
 *     session's own (possibly loop-rotated) path — null today, see
 *     lib/route-elevation-ahead;
 *   • renders the one-shot "the clock keeps running" toast.
 *
 * Mounted by MapShell beside TurnCarousel (same visibility guard). Renders
 * nothing and touches nothing for users without the flag. Never mutates the
 * session, the route, or the recording — "המשך חופשי" only drops guidance.
 */

import React, { useEffect, useRef } from 'react';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useUserStore } from '@/features/user';
import { crossTrackDistanceMeters, nearestPointOnPath } from '@/features/parks/core/services/geoUtils';
import { isFiniteLatLng } from '@/utils/geoValidation';
import { useSessionStore } from '@/features/workout-engine/core/store/useSessionStore';
import { useRunningPlayer } from '../../../store/useRunningPlayer';
import { useRouteRunV2Store } from '../../../store/useRouteRunV2Store';
import {
  INITIAL_OFF_ROUTE_STATE, isOffRoutePhase, pauseOffRoute, stepOffRoute, type OffRouteState,
} from '../../../lib/off-route-detector';
import {
  readElevationSamples, rotateElevationSamples, sessionStartOffsetM,
} from '../../../lib/route-elevation-ahead';
import OffRouteToast from './OffRouteToast';

export interface RouteRunLiveV2ControllerProps {
  /** The focused route object (its stored path + optional elevation profile). */
  route: { path?: unknown; elevationProfile?: unknown } | null | undefined;
  currentLocation: { lat: number; lng: number } | null | undefined;
  /** Detection on hold (e.g. a hybrid station is live) — treated like a pause. */
  suspended?: boolean;
}

export default function RouteRunLiveV2Controller({ route, currentLocation, suspended }: RouteRunLiveV2ControllerProps) {
  const isSuperAdmin = useUserStore((st) => !!(st.profile?.core as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin);
  const v2 = useFeatureFlags(isSuperAdmin).flags.enableHomeV2;
  if (!v2) return null;
  return <Controller route={route} currentLocation={currentLocation} suspended={!!suspended} />;
}

function Controller({ route, currentLocation, suspended }: RouteRunLiveV2ControllerProps) {
  const status = useSessionStore((s) => s.status);
  const sessionPath = useRunningPlayer((s) => s.activeRoutePath);
  const guidanceDropped = useRouteRunV2Store((s) => s.guidanceDropped);

  // New session path (workout start / direction flip) or session over → clean slate.
  const detectorRef = useRef<OffRouteState>(INITIAL_OFF_ROUTE_STATE);
  const sessionLive = status === 'active' || status === 'paused';
  useEffect(() => {
    detectorRef.current = INITIAL_OFF_ROUTE_STATE;
    useRouteRunV2Store.getState().reset();
  }, [sessionPath, sessionLive]);
  useEffect(() => () => {
    const store = useRouteRunV2Store.getState();
    store.reset();
    store.setElevation(null);
  }, []);

  // Elevation samples aligned to the session path (null when the route has none).
  const canonical = route?.path;
  const elevationProfile = route?.elevationProfile;
  useEffect(() => {
    const store = useRouteRunV2Store.getState();
    const samples = readElevationSamples({ elevationProfile });
    if (!samples || !Array.isArray(canonical) || !Array.isArray(sessionPath) || sessionPath.length < 2) {
      store.setElevation(null);
      return;
    }
    const offset = sessionStartOffsetM(canonical as number[][], sessionPath);
    store.setElevation(offset == null ? null : rotateElevationSamples(samples, offset));
  }, [canonical, elevationProfile, sessionPath]);

  // Off-route detection, one step per fix.
  const lat = currentLocation?.lat;
  const lng = currentLocation?.lng;
  useEffect(() => {
    if (guidanceDropped) return;
    if (status === 'paused' || suspended) {
      detectorRef.current = pauseOffRoute(detectorRef.current);
      return;
    }
    if (status !== 'active') return;
    if (!Array.isArray(sessionPath) || sessionPath.length < 2) return;
    const pos = { lat: lat as number, lng: lng as number };
    if (!isFiniteLatLng(pos)) return;
    const d = crossTrackDistanceMeters(pos, sessionPath);
    const next = stepOffRoute(detectorRef.current, d, Date.now());
    detectorRef.current = next;
    const off = isOffRoutePhase(next);
    const rejoin = off ? nearestPointOnPath(pos, sessionPath)?.point ?? null : null;
    useRouteRunV2Store.getState().setOffRoute(off, off ? d : null, rejoin);
  }, [lat, lng, status, sessionPath, guidanceDropped, suspended]);

  return <OffRouteToast />;
}
