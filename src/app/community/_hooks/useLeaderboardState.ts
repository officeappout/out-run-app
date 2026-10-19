import { useEffect, useState } from 'react';
import type {
  LeaderboardCategory,
  LeaderboardTimeWindow,
  LeaderboardGenderFilter,
  LeaderboardEntry,
  ScopeCompetitionEntry,
} from '@/features/arena/services/ranking.service';
import type { LeaderboardMode } from '@/features/arena/components/format-leaderboard-score';

/**
 * Leaderboard filters shared by every league segment, plus the values the
 * active board bubbles up (your rank / metric mode / your scope's entry).
 */
export function useLeaderboardState(selectedLeague: string) {
  // ── Leaderboard filter state — lifted out of NeighborhoodLeaderboard ─────
  // Lifted because the carousel needs to read `category` + `timeWindow` to
  // render the small filter label on the active card ("ריצה • שבועי" etc.).
  const [leaderboardCategory, setLeaderboardCategory] =
    useState<LeaderboardCategory>('overall');
  const [leaderboardTimeWindow, setLeaderboardTimeWindow] =
    useState<LeaderboardTimeWindow>('weekly');
  const [leaderboardGender, setLeaderboardGender] =
    useState<LeaderboardGenderFilter>('all');

  // Bubbled from the active NeighborhoodLeaderboard. Used to display the
  // user's rank on the active league card without firing a duplicate query.
  const [activeMyEntry, setActiveMyEntry] = useState<LeaderboardEntry | null>(
    null,
  );
  // Bubbled alongside activeMyEntry (Stage B) — the currently-selected
  // metric mode, so the sticky "your rank" hero can format the score with
  // formatLeaderboardScore instead of a hardcoded generic label.
  const [activeMyMode, setActiveMyMode] = useState<LeaderboardMode>('general');
  const [activeMyIsSegment, setActiveMyIsSegment] = useState(false);
  const handleMyModeChange = (mode: LeaderboardMode, isSegmentMode: boolean) => {
    setActiveMyMode(mode);
    setActiveMyIsSegment(isSegmentMode);
  };
  // Bubbled from the active ScopeBattleCard's own getScopeCompetitionLeaderboard
  // fetch — the current user's SCOPE's own rank/name/totalScore (e.g. "your
  // city, rank #1"), for the Groups-tab "your contribution" hero card. No
  // duplicate fetch — ScopeBattleCard already computes this internally.
  const [activeScopeEntry, setActiveScopeEntry] = useState<ScopeCompetitionEntry | null>(null);

  // Reset the bubbled rank whenever the user selects a different league —
  // the new leaderboard hasn't fetched yet, so showing the previous rank
  // would be stale. The new value will arrive on the next bubble.
  useEffect(() => {
    setActiveMyEntry(null);
  }, [selectedLeague]);

  return {
    leaderboardCategory,
    setLeaderboardCategory,
    leaderboardTimeWindow,
    setLeaderboardTimeWindow,
    leaderboardGender,
    setLeaderboardGender,
    activeMyEntry,
    setActiveMyEntry,
    activeMyMode,
    activeMyIsSegment,
    handleMyModeChange,
    activeScopeEntry,
    setActiveScopeEntry,
  };
}

export type LeaderboardState = ReturnType<typeof useLeaderboardState>;
