'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Users } from 'lucide-react';
import {
  updatePresence,
  clearPresence,
  type WorkoutActivityStatus,
} from '@/features/safecity/services/presence.service';
import { usePrivacyStore } from '@/features/safecity/store/usePrivacyStore';
import { useUserStore } from '@/features/user';
import { auth } from '@/lib/firebase';
import { g, type AppGender } from '@/lib/utils/gendered-text';
import { SOCIAL_COMPOSE_UI_ENABLED } from '@/config/feature-flags';
import PlannedActivityComposeSheet, {
  type ComposeActivityType,
} from '@/features/parks/client/components/planned-activity/PlannedActivityComposeSheet';

/**
 * ShareAsLiveToggle — single-source-of-truth "Share that I'm working out" toggle.
 *
 * Used at 3 call sites: strength preview (DrawerFooter.tsx), planned-run
 * preview (WorkoutPreviewScreen.tsx), and free-run/route preview
 * (RunShareBar.tsx, RouteDetailSheet.tsx).
 *
 * Two distinct behaviors depending on SOCIAL_COMPOSE_UI_ENABLED (Phase 2 of
 * the social-activities build plan — see
 * .claude/plans/new-chat-investigation-stateful-fern.md):
 *
 *   FLAG OFF (byte-identical to pre-Phase-2): owns local on/off state,
 *   updatePresence/clearPresence calls keyed by auth.currentUser.uid, and
 *   an unmount safety net that clears presence if the user navigates away
 *   while "live". This was investigated and found broken in both
 *   directions — strength: decorative (no onChange, the real active-workout
 *   heartbeat ignores this toggle entirely); running: writes presence then
 *   the preview screen's unmount immediately deletes it, nothing
 *   recreates it during the actual run. Kept verbatim behind the flag
 *   rather than fixed, since fixing presence semantics is a separate,
 *   out-of-scope infra task (explicitly not this task — see Phase 1 plan).
 *
 *   FLAG ON: turning the toggle on opens the Phase 1 PlannedActivityComposeSheet
 *   instead — context-prefilled (type from `activityType`, "now", and the
 *   caller's own place via `contextPark`/`contextRoute` when it has one in
 *   scope), leaving visibility to the user. No presence write/delete of any
 *   kind happens through this component anymore; the unmount safety net is
 *   skipped entirely (there is nothing for it to clean up, and firing it
 *   could otherwise clobber an unrelated real presence doc written by
 *   useWorkoutPresence on the strength active screen). Turning the toggle
 *   back off is purely visual — there is no "un-announce" primitive wired
 *   here, matching the plan's explicit "no new compose logic" scope.
 */

const ACTIVITY_LABELS: Record<WorkoutActivityStatus, { male: string; female: string }> = {
  strength: { male: 'שתף שאני יוצא לאימון', female: 'שתפי שאני יוצאת לאימון' },
  running: { male: 'שתף שאני יוצא לריצה', female: 'שתפי שאני יוצאת לריצה' },
  walking: { male: 'שתף שאני יוצא להליכה', female: 'שתפי שאני יוצאת להליכה' },
  cycling: { male: 'שתף שאני יוצא לרכיבה', female: 'שתפי שאני יוצאת לרכיבה' },
};

/** Minimal place shape a caller can pass when it already has a specific
 *  park/route in scope (e.g. RouteDetailSheet knows its own route). */
interface PlaceContext {
  id: string;
  name: string;
  lat?: number | null;
  lng?: number | null;
}

// WorkoutActivityStatus (4 values, presence-domain) → ComposeActivityType (3
// values, planned_sessions-domain — v1 scope is aerobic+strength only, per
// the north-star doc). 'cycling' has no compose-sheet equivalent; falls
// back to 'running' as the closest self-propelled-route bucket rather than
// blocking the sheet from opening. No call site passes 'cycling' today
// (confirmed: DrawerFooter=strength, WorkoutPreviewScreen=running,
// RunShareBar=running|walking, RouteDetailSheet can in principle for a
// cycling route) — flagged here so it's a deliberate, visible choice if
// that ever changes, not a silent gap.
function toComposeActivityType(activityType: WorkoutActivityStatus): ComposeActivityType {
  if (activityType === 'strength') return 'workout';
  if (activityType === 'walking') return 'walking';
  return 'running'; // running, and cycling as fallback
}

interface ShareAsLiveToggleProps {
  activityType: WorkoutActivityStatus;
  workoutTitle: string;
  /**
   * Current user GPS location. When null/undefined the toggle still flips
   * visually but no Firestore write happens (same behaviour as the
   * original inline implementations when GPS permission was denied).
   * Unused when SOCIAL_COMPOSE_UI_ENABLED is true (the compose sheet
   * sources its own place data instead of the user's live GPS).
   */
  userLocation?: { lat: number; lng: number } | null;
  /**
   * Optional override. When omitted the component reads the user's stored
   * gender from `useUserStore.profile.core.gender`.
   */
  gender?: AppGender;
  /** Optional outer className. */
  className?: string;
  /** Context prefill (flag-on path only) — a specific park already in scope. */
  contextPark?: PlaceContext;
  /** Context prefill (flag-on path only) — a specific route already in scope. */
  contextRoute?: PlaceContext;
}

export default function ShareAsLiveToggle({
  activityType,
  workoutTitle,
  userLocation,
  gender,
  className = '',
  contextPark,
  contextRoute,
}: ShareAsLiveToggleProps) {
  const profile = useUserStore((s) => s.profile);
  const storedGender = useUserStore((s) => s.profile?.core?.gender ?? 'male');
  const effectiveGender: AppGender = gender ?? storedGender;

  const [shareAsLive, setShareAsLive] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);

  // Ref mirror — lets the unmount cleanup read the latest value without
  // re-running the effect on every state change.
  const shareAsLiveRef = useRef(false);
  useEffect(() => {
    shareAsLiveRef.current = shareAsLive;
  }, [shareAsLive]);

  // Unmount safety net (flag-off path only — see file header for why this
  // is skipped entirely when SOCIAL_COMPOSE_UI_ENABLED is true).
  useEffect(() => {
    if (SOCIAL_COMPOSE_UI_ENABLED) return;
    return () => {
      if (shareAsLiveRef.current && auth.currentUser) {
        // Surface the failure rather than swallowing it. A
        // permission-denied here means the user's "live" pin lingers
        // on every other client's map until something else overwrites
        // it; without a log, that bug is invisible. We use console.warn
        // (not throw) because effect cleanups can't surface errors any
        // other way and we don't want to crash an unmount path.
        clearPresence(auth.currentUser.uid).catch((err) => {
          console.warn(
            '[ShareAsLiveToggle] unmount clearPresence failed — ' +
              'presence/{uid} may linger until next heartbeat:',
            err,
          );
        });
      }
    };
  }, []);

  const handleToggle = useCallback(async () => {
    if (SOCIAL_COMPOSE_UI_ENABLED) {
      if (!shareAsLive) {
        setComposeOpen(true);
      } else {
        setShareAsLive(false);
      }
      return;
    }

    // Tightened guard. The previous `!userLocation` check passed any
    // truthy object, including `{ lat: null, lng: null }` produced by
    // upstream callers that hadn't resolved GPS yet — which then wrote
    // literal nulls into Firestore and triggered the Mapbox "Expected
    // value to be of type number, but found null instead" assertion on
    // every other client subscribed to the `presence` collection.
    const lat = userLocation?.lat;
    const lng = userLocation?.lng;
    const hasValidLocation =
      typeof lat === 'number' &&
      typeof lng === 'number' &&
      Number.isFinite(lat) &&
      Number.isFinite(lng);

    if (!auth.currentUser || !hasValidLocation) {
      // Still flip the visual state — preserves the existing fail-soft UX.
      setShareAsLive((v) => !v);
      return;
    }

    const next = !shareAsLive;
    setShareAsLive(next);

    try {
      if (next) {
        await updatePresence({
          uid: auth.currentUser.uid,
          name: auth.currentUser.displayName ?? '',
          mode: usePrivacyStore.getState().mode,
          lat,
          lng,
          ageGroup: profile?.core?.ageGroup ?? 'adult',
          isVerified: false,
          schoolName: null,
          // Read the user's actual authority from their profile rather
          // than hardcoding null. Previously this clobbered any real
          // authorityId already merged onto the doc by the map / workout
          // heartbeat layers, briefly removing the user from city-scoped
          // heatmap and partner-finder filters until the next heartbeat
          // tick re-wrote it.
          authorityId: profile?.core?.authorityId ?? null,
          activity: {
            status: activityType,
            workoutTitle,
            startedAt: Date.now(),
          },
        });
      } else {
        await clearPresence(auth.currentUser.uid);
      }
    } catch (err) {
      console.error('[ShareAsLiveToggle] presence toggle failed:', err);
    }
  }, [shareAsLive, userLocation, profile, activityType, workoutTitle]);

  const labels = ACTIVITY_LABELS[activityType];
  const headline = g(effectiveGender, labels.male, labels.female);
  const subheadline = g(
    effectiveGender,
    'תופיע לאחרים שמחפשים שותף',
    'תופיעי לאחרים שמחפשות שותפה',
  );

  const initialPlace = contextRoute
    ? { kind: 'route' as const, id: contextRoute.id, name: contextRoute.name, lat: contextRoute.lat ?? null, lng: contextRoute.lng ?? null }
    : contextPark
    ? { kind: 'park' as const, id: contextPark.id, name: contextPark.name, lat: contextPark.lat ?? null, lng: contextPark.lng ?? null }
    : undefined;

  return (
    <div className={`flex items-center gap-3 ${className}`} dir="rtl">
      <Users size={16} color="#00ADEF" className="flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-xs font-bold text-gray-900 dark:text-white leading-tight">
          {headline}
        </div>
        <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5 leading-tight">
          {subheadline}
        </div>
      </div>
      <button
        type="button"
        onClick={handleToggle}
        aria-pressed={shareAsLive}
        className={`flex-shrink-0 w-9 h-5 rounded-full transition-colors relative ${
          shareAsLive ? 'bg-[#0CF2E3]' : 'bg-gray-300 dark:bg-gray-600'
        }`}
      >
        <div
          className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${
            shareAsLive ? 'left-0.5' : 'left-[18px]'
          }`}
        />
      </button>
      {SOCIAL_COMPOSE_UI_ENABLED && (
        <PlannedActivityComposeSheet
          isOpen={composeOpen}
          onClose={() => setComposeOpen(false)}
          initialType={toComposeActivityType(activityType)}
          initialPlace={initialPlace}
          onCreated={() => setShareAsLive(true)}
        />
      )}
    </div>
  );
}
