'use client';

/**
 * Kelly phase 2 — the first-open situation on the device (profile + weather), for the quick
 * replies and the rotating input hints. Weather only when the weather feature is on for this
 * user (isWeatherOnFor, live flags); useWeather does nothing otherwise.
 */
import { useEffect, useMemo, useState } from 'react';
import type { UserFullProfile } from '@/features/user/core/types/user.types';
import { useWeather } from '@/features/weather/hooks/useWeather';
import { getIsraelDayOfWeek, getIsraelHour } from '@/lib/israelTime';
import { coachGenderOf } from '@/lib/ai/coach/persona';
import { situationFromProfile } from '@/lib/ai/coach/suggestions/situation';
import type { ChipSituation } from '@/lib/ai/coach/suggestions/types';

export function useKellySituation(profile: UserFullProfile | null, opts: { enabled: boolean; weatherOn: boolean }): ChipSituation | null {
  const weather = useWeather(opts.enabled && opts.weatherOn);
  // Re-evaluate on the hour (morning → evening chips) without re-rendering every minute.
  const [hourTick, setHourTick] = useState(() => getIsraelHour(new Date()));
  useEffect(() => {
    if (!opts.enabled) return;
    const id = window.setInterval(() => setHourTick(getIsraelHour(new Date())), 5 * 60_000);
    return () => window.clearInterval(id);
  }, [opts.enabled]);
  const flag = weather?.classification.flag ?? null;
  return useMemo(() => {
    if (!opts.enabled || !profile) return null;
    const now = new Date();
    return situationFromProfile({
      profile: profile as unknown as Record<string, unknown>,
      gender: coachGenderOf(profile.core?.gender),
      hour: hourTick,
      dayOfWeek: getIsraelDayOfWeek(now),
      now,
      weather: flag,
    });
  }, [opts.enabled, profile, hourTick, flag]);
}
