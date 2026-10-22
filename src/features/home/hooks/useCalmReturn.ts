'use client';

/**
 * useCalmReturn — the home screen's view of calm return (CALM_RETURN_V1).
 *
 * Reads the LIVE panel flag, resolves the pure policy (src/lib/calm-return) once per app
 * open, and — only for the caller that passes `manageEpisode` (the home page, mounted once)
 * — starts a new return episode on the first open after a 7+ day gap: one Firestore write
 * (calm-return.write.ts) and the ONE fresh-week card for this open. Flag off → `on` false,
 * state null, nothing written, nothing shown.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import type { UserFullProfile } from '@/features/user';
import {
  getDaysAway,
  pickCalmSurface,
  resolveCalmReturn,
  type CalmReturnState,
  type CalmSurface,
} from '@/lib/calm-return';
import { startCalmReturnEpisode } from '@/lib/calm-return/calm-return.write';
import { useWeekBuilderV1 } from '@/features/schedule/week-builder/useWeekBuilderV1';

/** Episodes this JS session already started — a second hook instance never re-writes one. */
const startedEpisodes = new Set<string>();

export interface UseCalmReturnResult {
  on: boolean;
  state: CalmReturnState | null;
  surface: CalmSurface;
  /** The card title/subtitle swap for 4–6 days away. */
  welcomeBack: boolean;
  dismissFreshWeekCard: () => void;
}

export function useCalmReturn(
  profile: UserFullProfile | null | undefined,
  opts: { isGuest?: boolean; manageEpisode?: boolean } = {},
): UseCalmReturnResult {
  const { rawFlags } = useFeatureFlags();
  const on = rawFlags.enableCalmReturnV1 === true;
  // enable_week_builder_v1: the running plan's return is the catch-up's (useRunCatchUp — it asks
  // after a long break); the episode then leaves the running program alone.
  const runCatchUpOwnsPlan = useWeekBuilderV1();
  // "Now" for this open — read once at the edge, passed to the pure policy.
  const nowRef = useRef<Date>(new Date());

  const state = useMemo(() => {
    if (!on || !profile || opts.isGuest) return null;
    const now = nowRef.current;
    return resolveCalmReturn({ daysAway: getDaysAway(profile, now), episode: profile.calmReturn, now });
  }, [on, profile, opts.isGuest]);

  const [freshWeekCard, setFreshWeekCard] = useState<{ showLevelCheckLink: boolean } | null>(null);

  useEffect(() => {
    if (!opts.manageEpisode || !state?.shouldStartEpisode || !state.episode || !profile?.id) return;
    const key = `${profile.id}:${state.episode.startDate}`;
    if (startedEpisodes.has(key)) return;
    startedEpisodes.add(key);
    // The open that starts the episode is the one open that shows the card.
    setFreshWeekCard({ showLevelCheckLink: state.tier === 're_entry' });
    void startCalmReturnEpisode({
      uid: profile.id,
      episode: state.episode,
      runningProgram: runCatchUpOwnsPlan
        ? null
        : (profile.running?.activeProgram as Parameters<typeof startCalmReturnEpisode>[0]['runningProgram']),
      now: nowRef.current,
    });
  }, [opts.manageEpisode, state, profile?.id, profile?.running?.activeProgram, runCatchUpOwnsPlan]);

  const surface: CalmSurface = !state
    ? { kind: 'none' }
    : freshWeekCard
      ? { kind: 'fresh_week_card', showLevelCheckLink: freshWeekCard.showLevelCheckLink }
      : pickCalmSurface({ state: { ...state, shouldStartEpisode: false } });

  return {
    on,
    state,
    surface,
    welcomeBack: surface.kind === 'welcome_back_title',
    dismissFreshWeekCard: () => setFreshWeekCard(null),
  };
}
