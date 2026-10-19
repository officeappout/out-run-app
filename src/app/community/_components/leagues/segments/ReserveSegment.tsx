'use client';

import React from 'react';
import { RESERVE_SCOPE_VALUE } from '@/lib/military-reserve-league';
import { NeighborhoodLeaderboard, UnitLeagueTable } from '@/app/community/CommunityWidgets';
import { CompetitionToggle } from '../CompetitionToggle';
import type { LeaguesVM } from '../leagues-vm';

/**
 * Phase 6a — reservist league (individual, "יחידים" tab) + Phase 6b —
 * unit-vs-unit competition (group, "קבוצות" tab), merged into one segment
 * 07.09.2026 per David: the two were wrongly split across separate league
 * cards; "תחרות יחידות" wasn't a league of its own, it was this league's
 * groups view. Reuses <CompetitionToggle> verbatim — the exact same
 * component GlobalSegment/CitySegment/OrgSegment already
 * use — rather than a second copy (that duplication is exactly what
 * created the 4-cards problem in the first place).
 *
 * The groups tab does NOT route through <GroupAxisChooser>/GroupAxis
 * — that mechanism (and every content component it currently drives —
 * GroupLeaderboard, ScopeBattleCard, ScopeCompetitionLeaderboard) is
 * hardwired to feed_posts/authorities-collection queries with no
 * unit/brigade concept at all (confirmed by reading each one — see
 * UnitLeagueTable's own header comment on why it's a purpose-built
 * component, not an extension of those). Forcing a 'unit' value through
 * it would also surface the מדד/טווח chips and פילטרים button
 * <GroupAxisChooser> always renders alongside every axis — controls
 * that reflect leaderboardCategory/leaderboardTimeWindow/leaderboardGender
 * state getUnitLeagueLeaderboard never reads, i.e. visible filters with
 * zero effect on what's below them. <UnitLeagueTable> already owns its
 * own internal chooser (RANGE_OPTIONS: my_battalion_companies /
 * my_brigade_battalions / all_companies / all_brigades) — this IS the
 * "בורר ציר: חטיבות/גדודים/פלוגות" David asked for; per his own words
 * ("הטבלה, הצבירה, הצירים... נשאר, רק המיקום משתנה") it moves location
 * unchanged, it isn't rebuilt through a different, incompatible chooser.
 *
 * Individual tab unchanged byte-for-byte from the pre-merge
 * ReserveSegment (still models GlobalSegment's
 * individual-mode branch: national in shape, scopeLabel is the only
 * visual distinguisher). Groups tab only appears when the viewer also has
 * access.hasUnitLeagueAccess (declared orgId) — a reservist who hasn't
 * declared a specific unit sees just "יחידים", no toggle, identical to
 * pre-merge behavior; see buildLeagueCards' (_lib/league-cards.ts) own comment on the population
 * that no longer gets a standalone entry point for this at all.
 */
export function ReserveSegment({ vm }: { vm: LeaguesVM }) {
  const {
    access,
    myDeclaration,
    leaderboardCategory,
    setLeaderboardCategory,
    leaderboardTimeWindow,
    setLeaderboardTimeWindow,
    leaderboardGender,
    setLeaderboardGender,
    setActiveMyEntry,
    handleMyModeChange,
    competitionMode,
  } = vm;
  const showGroupTab = access.hasUnitLeagueAccess;
  return (
    <div className="space-y-4" dir="rtl">
      {showGroupTab && <CompetitionToggle vm={vm} />}
      {(competitionMode === 'individual' || !showGroupTab) && (
        <NeighborhoodLeaderboard
          scope="reserve"
          scopeId={RESERVE_SCOPE_VALUE}
          scopeLabel="ליגת המילואים"
          isLeagueActive={true}
          isGlobal={true}
          bypassSocialGate={true}
          ageGroup={access.ageGroup}
          category={leaderboardCategory}
          setCategory={setLeaderboardCategory}
          timeWindow={leaderboardTimeWindow}
          setTimeWindow={setLeaderboardTimeWindow}
          genderFilter={leaderboardGender}
          setGenderFilter={setLeaderboardGender}
          onMyEntryChange={setActiveMyEntry}
          onMyModeChange={handleMyModeChange}
        />
      )}
      {competitionMode === 'group' && showGroupTab && (
        <>
          {/* Static, not a picker (David, 07.09.2026) — the underlying
              rollup (unitLeagueRollup, functions/src/unitLeagueRollup.ts)
              only ever computes ONE metric (avg daily steps); a real
              picker here would offer switches that do nothing. Same visual
              treatment as <GroupAxisChooser>'s own read-only מדד/טווח
              chips above (copied styling, not the same JSX call — that
              function's actual chooser doesn't apply here, see
              ReserveSegment's own header comment on why). Exists
              specifically so "יחידים" defaulting to streak and "קבוצות"
              showing steps doesn't look like the same screen silently
              ranking by two different things with no explanation.
              Revisit → <GroupAxisChooser>/GroupAxis extension once the
              rollup itself computes more than one metric — see §8 debt
              item for the exact revisit trigger (5 units past the
              3-participant floor). */}
          <div className="flex items-center gap-2 mb-3" dir="rtl">
            <span
              className="whitespace-nowrap rounded-full px-3 py-2 text-[12.5px] font-bold text-v2-muted bg-v2-surface ring-1 ring-inset ring-v2-hairline"
            >
              מדד: <b className="text-gray-900">ממוצע צעדים יומי</b>
            </span>
          </div>
          <UnitLeagueTable myOrgId={myDeclaration.orgId} myUnitPathIds={myDeclaration.unitPathIds} />
        </>
      )}
    </div>
  );
}
