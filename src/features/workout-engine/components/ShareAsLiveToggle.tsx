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

/**
 * ShareAsLiveToggle — single-source-of-truth "Share that I'm working out" toggle.
 *
 * Replaces three inline copies that previously lived in:
 *   - WorkoutPreviewDrawer.tsx
 *   - WorkoutPreviewScreen.tsx (running)
 *   - RouteDetailSheet.tsx (new caller)
 *
 * Owns:
 *   • Local on/off state (always starts off — never persisted across opens)
 *   • updatePresence / clearPresence calls keyed by `auth.currentUser.uid`
 *   • Unmount safety net: if the user navigates away while live, clear presence
 *   • Gendered Hebrew copy keyed by activityType
 *
 * userLocation is taken as a prop so callers that already need GPS for
 * other reasons (partner finder, route details) don't double-fetch. When
 * not available (null/undefined), the toggle still toggles its own visual
 * state but skips the Firestore write — same fail-soft behaviour as the
 * original inline implementations.
 */

const ACTIVITY_LABELS: Record<WorkoutActivityStatus, { male: string; female: string }> = {
  strength: { male: 'שתף שאני יוצא לאימון', female: 'שתפי שאני יוצאת לאימון' },
  running: { male: 'שתף שאני יוצא לריצה', female: 'שתפי שאני יוצאת לריצה' },
  walking: { male: 'שתף שאני יוצא להליכה', female: 'שתפי שאני יוצאת להליכה' },
  cycling: { male: 'שתף שאני יוצא לרכיבה', female: 'שתפי שאני יוצאת לרכיבה' },
};

interface ShareAsLiveToggleProps {
  activityType: WorkoutActivityStatus;
  workoutTitle: string;
  /**
   * Current user GPS location. When null/undefined the toggle still flips
   * visually but no Firestore write happens (same behaviour as the
   * original inline implementations when GPS permission was denied).
   */
  userLocation?: { lat: number; lng: number } | null;
  /**
   * Optional override. When omitted the component reads the user's stored
   * gender from `useUserStore.profile.core.gender`.
   */
  gender?: AppGender;
  /** Optional outer className. */
  className?: string;
}

export default function ShareAsLiveToggle({
  activityType,
  workoutTitle,
  userLocation,
  gender,
  className = '',
}: ShareAsLiveToggleProps) {
  const profile = useUserStore((s) => s.profile);
  const storedGender = useUserStore((s) => s.profile?.core?.gender ?? 'male');
  const effectiveGender: AppGender = gender ?? storedGender;

  const [shareAsLive, setShareAsLive] = useState(false);

  // Ref mirror — lets the unmount cleanup read the latest value without
  // re-running the effect on every state change.
  const shareAsLiveRef = useRef(false);
  useEffect(() => {
    shareAsLiveRef.current = shareAsLive;
  }, [shareAsLive]);

  // Unmount safety net — clear presence if the user navigates away while live.
  useEffect(() => {
    return () => {
      if (shareAsLiveRef.current && auth.currentUser) {
        clearPresence(auth.currentUser.uid).catch(() => {});
      }
    };
  }, []);

  const handleToggle = useCallback(async () => {
    if (!auth.currentUser || !userLocation) {
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
          lat: userLocation.lat,
          lng: userLocation.lng,
          ageGroup: profile?.core?.ageGroup ?? 'adult',
          isVerified: false,
          schoolName: null,
          authorityId: null,
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
    </div>
  );
}
