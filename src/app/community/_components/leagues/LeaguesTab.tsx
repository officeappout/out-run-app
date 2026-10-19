'use client';

import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { LeagueSelectorButton } from '@/features/arena/components/LeaguesTabChrome';
import { buildLeagueCards } from '@/app/community/_lib/league-cards';
import { LeagueCarousel } from '@/app/community/CommunityWidgets';
import { leaderboardFilterLabel } from '@/app/community/_lib/community-logic';
import { GlobalSegment } from './segments/GlobalSegment';
import { ReserveSegment } from './segments/ReserveSegment';
import { CitySegment } from './segments/CitySegment';
import { OrgSegment } from './segments/OrgSegment';
import { ParkSegment } from './segments/ParkSegment';
import { LeagueSegment } from './segments/LeagueSegment';
import type { LeaguesVM } from './leagues-vm';

/** The league selector button + sheet and the selected league's segment. */
export function LeaguesTab({ vm }: { vm: LeaguesVM }) {
  const {
    access,
    authority,
    arenaLoading,
    selectedLeague,
    setSelectedLeague,
    leagueSheetOpen,
    setLeagueSheetOpen,
    socialGroups,
    leaderboardCategory,
    leaderboardTimeWindow,
    activeMyEntry,
  } = vm;
  const cards = buildLeagueCards({ access, authority, selectedLeague, activeMyEntry, socialGroups });
  const activeCard = cards.find((c) => c.key === selectedLeague);

  // Design v2 (David, 15.10.2026): the page-level sticky "my rank" bar is
  // gone — exactly one "you" surface besides the hero tile: the board's own
  // sticky row (NeighborhoodLeaderboardView), shown only when your real row
  // is off-screen. Share/invite live on the hero tile.

  return (
    <>
      {/* League selector — a single summary button showing the active league.
          Tapping it opens the bottom-sheet selector (replaces the old inline
          horizontal carousel). The "+" create CTA now lives inside the sheet. */}
      <LeagueSelectorButton
        isLoading={arenaLoading}
        activeCard={activeCard}
        filterLabel={leaderboardFilterLabel(leaderboardCategory, leaderboardTimeWindow)}
        rank={activeMyEntry?.rank}
        expanded={leagueSheetOpen}
        onOpen={() => setLeagueSheetOpen(true)}
      />

      {/* Bottom-sheet league selector */}
      <AnimatePresence>
        {leagueSheetOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[90] bg-black/40"
              onClick={() => setLeagueSheetOpen(false)}
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 340, damping: 30 }}
              className="fixed bottom-0 left-0 right-0 z-[91] bg-white rounded-t-3xl shadow-2xl max-w-md mx-auto"
              style={{ maxHeight: '85vh' }}
              dir="rtl"
            >
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 rounded-full bg-gray-200" />
              </div>
              <div
                className="px-5 pb-8 pt-2 overflow-y-auto"
                style={{ maxHeight: 'calc(85vh - 40px)' }}
              >
                <h3 className="text-[22px] font-black text-v2-ink tracking-v2-tight mb-4 text-right">
                  הליגות שלי
                </h3>
                <LeagueCarousel
                  mode="sheet"
                  leagues={cards}
                  selectedKey={selectedLeague}
                  onSelect={(key) => {
                    setSelectedLeague(key);
                    setLeagueSheetOpen(false);
                  }}
                  activeFilterLabel={leaderboardFilterLabel(leaderboardCategory, leaderboardTimeWindow)}
                  isLoading={arenaLoading}
                  createHref="/community?openCreate=true"
                />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        <motion.div
          key={selectedLeague}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.2 }}
        >
          {selectedLeague === 'global' && <GlobalSegment vm={vm} />}
          {selectedLeague === 'city' && <CitySegment vm={vm} />}
          {selectedLeague === 'org' && <OrgSegment vm={vm} />}
          {selectedLeague === 'park' && <ParkSegment vm={vm} />}
          {selectedLeague === 'reserve' && <ReserveSegment vm={vm} />}
          {selectedLeague.startsWith('league_') && <LeagueSegment vm={vm} groupId={selectedLeague.slice(7)} />}
        </motion.div>
      </AnimatePresence>

    </>
  );
}
