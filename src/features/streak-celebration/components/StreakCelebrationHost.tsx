'use client';

/**
 * Mount point for the streak celebration (enable_streak_celebrations_v1).
 *   surface "home":    a day closed in the background, the steps goal crossed while home is
 *                      open, a shield used, a return after a break — and the
 *                      `?celebrate=streak` deep link (overlay, then the steps screen).
 *   surface "workout": mounted with the post-workout summary, so the celebration sits after
 *                      the level-up screen and before the summary.
 * Flag off → renders nothing and touches nothing.
 */
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useActivityStore } from '@/features/activity/store/useActivityStore';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import type { AppGender } from '@/lib/utils/gendered-text';
import type { Celebration } from '../core/celebration.core';
import { CELEBRATE_NEXT_ROUTE, parseCelebrateParam, stripCelebrateParam } from '../core/deep-link';
import { useStreakCelebration, useTodayFlameTones } from '../hooks/useStreakCelebration';
import StreakCelebrationOverlay from './StreakCelebrationOverlay';

export default function StreakCelebrationHost({ surface }: { surface: 'home' | 'workout' }) {
  const router = useRouter();
  const { enabled, celebration, acknowledge } = useStreakCelebration();
  const tones = useTodayFlameTones();
  const lastStreakDate = useActivityStore((s) => s.lastStreakDate);
  const gender = useUserStore((s) => (s.profile?.core as { gender?: AppGender } | undefined)?.gender);
  const [shown, setShown] = useState<Celebration | null>(null);
  const deepLinkRef = useRef(false);
  const deepLinkResolvedRef = useRef(false);

  // Deep link: read once, strip it so a reload doesn't re-open the celebration.
  useEffect(() => {
    if (surface !== 'home' || typeof window === 'undefined') return;
    if (!parseCelebrateParam(window.location.search)) return;
    deepLinkRef.current = true;
    const { pathname, search, hash } = window.location;
    window.history.replaceState(window.history.state, '', stripCelebrateParam(pathname, search, hash));
  }, [surface]);

  useEffect(() => {
    if (!enabled || shown) return;
    if (celebration) {
      setShown(celebration);
      acknowledge(celebration);
      deepLinkResolvedRef.current = true;
      return;
    }
    // Deep link with nothing to celebrate (already shown today, or the day isn't closed
    // on this device yet) → straight to the steps screen.
    if (deepLinkRef.current && !deepLinkResolvedRef.current) {
      deepLinkResolvedRef.current = true;
      router.push(CELEBRATE_NEXT_ROUTE);
    }
  }, [enabled, celebration, shown, acknowledge, router]);

  if (!shown) return null;
  return (
    <StreakCelebrationOverlay
      celebration={shown}
      lastStreakDate={lastStreakDate}
      tones={tones}
      gender={gender}
      onClose={() => {
        setShown(null);
        if (deepLinkRef.current) {
          deepLinkRef.current = false;
          router.push(CELEBRATE_NEXT_ROUTE);
        }
      }}
    />
  );
}
