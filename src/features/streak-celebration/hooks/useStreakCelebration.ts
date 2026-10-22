'use client';

/**
 * The streak celebration for this surface, if one is due — store + flag + the once-a-day
 * guard. The celebration is marked as shown the moment it is returned to a mounted host
 * (`acknowledge`), so a crash or a second host can never show it twice the same day.
 */
import { useCallback, useMemo, useState } from 'react';
import { useActivityStore, getTodayString } from '@/features/activity/store/useActivityStore';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { isStreakMilestone } from '@/features/activity/lib/streak-day.core';
import { addSeenKey } from '@/features/home/components/streak/streak-notice';
import { pickCelebration, todayTones, type Celebration } from '../core/celebration.core';
import { markCelebratedDay, readCelebratedDay } from '../core/celebrated-day';

export interface StreakCelebrationState {
  /** False while the flag is off or unknown — the host renders nothing. */
  enabled: boolean;
  celebration: Celebration | null;
  /** Mark today as celebrated (+ the matching home card as seen). Call once, on show. */
  acknowledge: (c: Celebration) => void;
}

export function useStreakCelebration(): StreakCelebrationState {
  const isSuperAdmin = useUserStore((s) => !!(s.profile?.core as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin);
  const { flags, ready } = useFeatureFlags(isSuperAdmin);
  const enabled = ready && flags.enableStreakCelebrationsV1;

  const hydrated = useActivityStore((s) => s._hasHydrated);
  const currentStreak = useActivityStore((s) => s.currentStreak);
  const longestStreak = useActivityStore((s) => s.longestStreak);
  const lastStreakDate = useActivityStore((s) => s.lastStreakDate);
  const notice = useActivityStore((s) => s.streakNotice);
  const shieldsLeft = useActivityStore((s) => s.streakShields ?? 0);

  // Bumped on acknowledge so the memo re-reads the guard.
  const [ackVersion, setAckVersion] = useState(0);

  const celebration = useMemo(() => {
    if (!enabled || !hydrated) return null;
    return pickCelebration({
      todayKey: getTodayString(),
      currentStreak,
      longestStreak,
      lastStreakDate,
      notice,
      shieldsLeft,
      lastCelebratedDay: readCelebratedDay(),
    });
    // ackVersion: re-read the device guard after a show.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, hydrated, currentStreak, longestStreak, lastStreakDate, notice, shieldsLeft, ackVersion]);

  const acknowledge = useCallback((c: Celebration) => {
    const today = getTodayString();
    markCelebratedDay(today);
    // The home card would repeat the same news — mark it seen.
    if (c.variant === 'shield' && notice?.kind === 'shield_used') addSeenKey(`shield_used:${notice.days.join(',')}`);
    if (c.variant === 'back' && notice?.kind === 'broken') addSeenKey(`broken:${notice.on}`);
    if (c.variant !== 'shield' && isStreakMilestone(c.streak)) {
      addSeenKey(`milestone:${c.streak}:${today}`);
      // Same stamp the home card writes, so the 20:00 milestone push skips it.
      void useActivityStore.getState().markStreakMilestoneSeen(c.streak);
    }
    setAckVersion((v) => v + 1);
  }, [notice]);

  return { enabled, celebration, acknowledge };
}

/** Today's flame tones for the hero (the home strip's language). */
export function useTodayFlameTones() {
  const today = useActivityStore((s) => s.today);
  return useMemo(() => todayTones(today), [today]);
}
