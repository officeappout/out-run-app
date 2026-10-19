import { useEffect, useRef, useState } from 'react';
import type { useArenaAccess } from '@/features/arena/hooks/useArenaAccess';

/**
 * The selected league (replaces the old segmented bar) and its bottom-sheet
 * selector.
 */
export function useLeagueSelection(access: ReturnType<typeof useArenaAccess>) {
  // ── Selected league (replaces the old segmented bar) ─────────────────────
  // The carousel surfaces every league the user belongs to; this state tracks
  // which card is currently highlighted and which segment renders below.
  // Type is `string` (not `ArenaTabKey`) because social group keys are dynamic:
  // 'league_<groupId>'.
  //
  // Initial value is 'city', not 'global' — city is the intended default
  // landing scope (18.08.2026). The effect below already re-asserts 'city'
  // once access.activeTabs loads (falling back to the first available tab
  // when the user has no city), so this doesn't change the final landing
  // state for anyone — it only removes the brief flash of the global scope
  // rendering/fetching before that effect corrects it on first paint.
  const [selectedLeague, setSelectedLeague] = useState<string>('city');
  const defaultLeagueApplied = useRef(false);

  // Bottom-sheet league selector — replaces the inline horizontal carousel.
  // The summary button shows the active league; tapping it opens this sheet.
  const [leagueSheetOpen, setLeagueSheetOpen] = useState(false);

  useEffect(() => {
    if (access.activeTabs.length === 0) return;

    if (!defaultLeagueApplied.current) {
      defaultLeagueApplied.current = true;
      const hasCity = access.activeTabs.some((t) => t.key === 'city');
      setSelectedLeague(hasCity ? 'city' : access.activeTabs[0].key);
    } else if (!access.activeTabs.find((t) => t.key === selectedLeague)) {
      setSelectedLeague(access.activeTabs[0].key);
    }
  }, [access.activeTabs, selectedLeague]);

  return { selectedLeague, setSelectedLeague, leagueSheetOpen, setLeagueSheetOpen };
}
