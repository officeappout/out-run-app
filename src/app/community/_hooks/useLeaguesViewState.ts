import { useEffect, useState } from 'react';
import type { CompetitionMode, GroupAxis, LeagueTabV2 } from '../_lib/community-constants';

/**
 * UI state of the leagues tab: individual vs group mode, the v2 top tabs,
 * the group-axis choosers and the sheets they open. Resets to individual
 * whenever the selected league changes.
 */
export function useLeaguesViewState(selectedLeague: string) {
  // ── Individual vs group competition toggle ────────────────────────────────
  const [competitionMode, setCompetitionMode] = useState<CompetitionMode>('individual');
  // Home v2 leagues: see LeagueTabV2 — the tab decides individual vs groups.
  const [leagueTabV2, setLeagueTabV2] = useState<LeagueTabV2>('people');
  // Home v2 leagues: the scope "how points work" sheet and the battle card's
  // "group walk" → the existing planned-activity compose sheet (walking).
  const [scopePointsOpen, setScopePointsOpen] = useState(false);
  const [groupWalkOpen, setGroupWalkOpen] = useState(false);
  const [hoodScopeV2, setHoodScopeV2] = useState<'city' | 'national'>('city');

  // Groups-tab axis choosers — see GroupAxis for why City and Global keep
  // separate state.
  const [cityGroupAxis, setCityGroupAxis] = useState<GroupAxis>('group');
  const [globalGroupAxis, setGlobalGroupAxis] = useState<GroupAxis>('city');
  const [axisMenuOpen, setAxisMenuOpen] = useState(false);
  const [leagueFilterSheetOpen, setLeagueFilterSheetOpen] = useState(false);

  // Reset to individual whenever the active league card changes.
  useEffect(() => {
    setCompetitionMode('individual');
    setCityGroupAxis('group');
    setGlobalGroupAxis('city');
  }, [selectedLeague]);

  return {
    competitionMode,
    setCompetitionMode,
    leagueTabV2,
    setLeagueTabV2,
    scopePointsOpen,
    setScopePointsOpen,
    groupWalkOpen,
    setGroupWalkOpen,
    hoodScopeV2,
    setHoodScopeV2,
    cityGroupAxis,
    setCityGroupAxis,
    globalGroupAxis,
    setGlobalGroupAxis,
    axisMenuOpen,
    setAxisMenuOpen,
    leagueFilterSheetOpen,
    setLeagueFilterSheetOpen,
  };
}

export type LeaguesViewState = ReturnType<typeof useLeaguesViewState>;
