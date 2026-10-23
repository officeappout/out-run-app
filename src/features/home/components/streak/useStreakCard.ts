'use client';

/** Today's home v2 streak card (StreakNoticeCard) — shared by the card and the home page. */
import { useMemo, useSyncExternalStore } from 'react';
import { useActivityStore, getTodayString } from '@/features/activity/store/useActivityStore';
import { getSeenVersion, pickStreakCard, readSeenKeys, subscribeSeen, type StreakCardModel } from './streak-notice';
import { useT } from '@/hooks/useT';
import { home } from '@/messages/ns/home';

/** Today's streak card (or null). Safe to call from several places — they agree. */
export function useStreakCard(): StreakCardModel | null {
  const notice = useActivityStore((s) => s.streakNotice);
  const currentStreak = useActivityStore((s) => s.currentStreak);
  const lastStreakDate = useActivityStore((s) => s.lastStreakDate);
  const seenVersion = useSyncExternalStore(subscribeSeen, getSeenVersion, () => 0);
  const t = useT(home);
  return useMemo(
    () => pickStreakCard({ notice, currentStreak, lastStreakDate, todayKey: getTodayString(), seen: readSeenKeys() }, t),
    // seenVersion: re-read the device's seen keys after a dismiss.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [notice, currentStreak, lastStreakDate, seenVersion, t],
  );
}

export function useHasStreakCard(): boolean {
  return useStreakCard() !== null;
}

