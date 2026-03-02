'use client';

export const dynamic = 'force-dynamic';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Swords, Plus } from 'lucide-react';
import Link from 'next/link';
import { useUserStore } from '@/features/user';
import { useArenaAccess, ArenaTabKey } from '@/features/arena/hooks/useArenaAccess';
import { useArenaData } from '@/features/arena/hooks/useArenaData';
import LockedArenaCard from '@/features/arena/components/LockedArenaCard';
import CityArenaView from '@/features/arena/components/CityArenaView';
import NeighborhoodLeaderboard from '@/features/arena/components/NeighborhoodLeaderboard';
import MunicipalPressureCard from '@/features/arena/components/MunicipalPressureCard';
import SchoolOutreachCard from '@/features/arena/components/SchoolOutreachCard';
import GroupCard from '@/features/arena/components/GroupCard';

export default function ArenaPage() {
  const { _hasHydrated, profile } = useUserStore();
  const access = useArenaAccess();
  const cityData = useArenaData(access.cityAuthorityId);

  const [segment, setSegment] = useState<ArenaTabKey>('global');
  const defaultApplied = useRef(false);

  useEffect(() => {
    if (access.activeTabs.length === 0) return;

    if (!defaultApplied.current) {
      defaultApplied.current = true;
      const hasCity = access.activeTabs.some((t) => t.key === 'city');
      setSegment(hasCity ? 'city' : access.activeTabs[0].key);
    } else if (!access.activeTabs.find((t) => t.key === segment)) {
      setSegment(access.activeTabs[0].key);
    }
  }, [access.activeTabs, segment]);

  if (!_hasHydrated || access.isLoading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-[#F8FAFC]">
        <p className="text-sm text-gray-500 animate-pulse">טוען הליגה...</p>
      </div>
    );
  }

  const leagueTitle = access.cityName ? `הליגה של ${access.cityName}` : 'הליגה';

  return (
    <div
      className="min-h-[100dvh] bg-[#F8FAFC]"
      style={{ paddingBottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))' }}
    >
      {/* Sticky header */}
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-md mx-auto px-5 py-3 flex items-center justify-between" dir="rtl">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-cyan-500/10 flex items-center justify-center">
              <Swords className="w-4 h-4 text-cyan-600" />
            </div>
            <h1 className="text-lg font-black text-gray-900">{leagueTitle}</h1>
          </div>

          {/* Create group FAB */}
          <Link
            href="/arena/create"
            className="w-8 h-8 rounded-full bg-cyan-500 flex items-center justify-center shadow-sm active:scale-90 transition-transform"
          >
            <Plus className="w-4 h-4 text-white" />
          </Link>
        </div>

        {/* Dynamic segmented picker */}
        {access.activeTabs.length > 1 && (
          <div className="max-w-md mx-auto px-5 pb-3">
            <div className="flex bg-gray-100 dark:bg-gray-800 rounded-xl p-1 gap-1">
              {access.activeTabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setSegment(tab.key)}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
                    segment === tab.key
                      ? 'bg-white dark:bg-gray-700 text-cyan-600 dark:text-cyan-400 shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-800'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </header>

      {/* Content */}
      <div className="max-w-md mx-auto px-4 pt-4">
        <AnimatePresence mode="wait">
          <motion.div
            key={segment}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
          >
            {segment === 'global' && renderGlobalSegment()}
            {segment === 'city' && renderCitySegment()}
            {segment === 'org' && renderOrgSegment()}
            {segment === 'park' && renderParkSegment()}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );

  // ─── Global tab — always unlocked ────────────────────────────────────────

  function renderGlobalSegment() {
    return (
      <div className="space-y-4" dir="rtl">
        <NeighborhoodLeaderboard
          scope="city"
          scopeId={null}
          scopeLabel="ארצי"
          isLeagueActive={true}
          isGlobal={true}
          ageGroup={access.ageGroup}
        />
      </div>
    );
  }

  // ─── City tab ─────────────────────────────────────────────────────────────

  function renderCitySegment() {
    if (!access.hasCityAccess) {
      return <LockedArenaCard type="city" />;
    }

    if (cityData.isLoading) {
      return (
        <div className="flex items-center justify-center py-16">
          <p className="text-sm text-gray-500 animate-pulse">טוען נתוני עיר...</p>
        </div>
      );
    }

    return (
      <div className="space-y-4" dir="rtl">
        {/* Municipal Pressure card when NOT active_client */}
        {!cityData.isLeagueActive && (
          <MunicipalPressureCard
            cityName={access.cityName ?? 'העיר שלך'}
            authority={cityData.authority}
          />
        )}

        {/* Leaderboard — blurred 4+ when league not active */}
        <NeighborhoodLeaderboard
          scope="city"
          scopeId={access.cityAuthorityId}
          scopeLabel={access.cityName ?? 'עיר'}
          isLeagueActive={cityData.isLeagueActive}
        />

        {/* City Arena View (groups + events) only when active */}
        {cityData.isLeagueActive && cityData.authority && (
          <CityArenaView
            authority={cityData.authority}
            groups={cityData.groups}
            events={cityData.events}
          />
        )}
      </div>
    );
  }

  // ─── Org tab ──────────────────────────────────────────────────────────────

  function renderOrgSegment() {
    if (!access.hasSchoolAccess) {
      return <LockedArenaCard type="school" />;
    }

    const orgGroups = cityData.groups.filter(
      (g) => g.category === 'calisthenics' || g.category === 'other',
    );

    const orgIcon = access.orgType === 'work' ? '🏢' : access.orgType === 'university' ? '🎓' : '🏫';

    return (
      <div className="space-y-6" dir="rtl">
        <div className="flex items-center gap-3 px-1">
          <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center text-lg font-black text-purple-700 dark:text-purple-300">
            {orgIcon}
          </div>
          <div>
            <h3 className="text-base font-black text-gray-900 dark:text-gray-100">
              {access.orgName ?? 'הארגון שלך'}
            </h3>
            <span className="text-xs text-gray-600 dark:text-gray-400">
              קוד: {access.schoolCode}
            </span>
          </div>
        </div>

        {/* School Outreach card — only for school-type orgs */}
        {access.orgType === 'school' && (
          <SchoolOutreachCard schoolName={access.orgName ?? 'בית הספר'} />
        )}

        <NeighborhoodLeaderboard
          scope="school"
          scopeId={access.orgId}
          scopeLabel={access.orgName ?? 'הארגון שלך'}
          isLeagueActive={true}
        />

        {orgGroups.length > 0 && (
          <div className="space-y-2.5">
            {orgGroups.map((g) => (
              <GroupCard key={g.id} group={g} />
            ))}
          </div>
        )}
      </div>
    );
  }

  // ─── Park tab ─────────────────────────────────────────────────────────────

  function renderParkSegment() {
    if (!access.preferredParkId) {
      return (
        <div className="flex flex-col items-center justify-center py-16 text-center" dir="rtl">
          <span className="text-3xl mb-3">🌳</span>
          <p className="text-sm font-bold text-gray-900 dark:text-gray-100">
            עוד לא התאמנת בפארק
          </p>
          <p className="text-xs text-gray-500 mt-1 max-w-[240px]">
            כשתתאמנו ליד פארק, הדירוג שלו יופיע כאן אוטומטית
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-4" dir="rtl">
        <div className="flex items-center gap-3 px-1">
          <div className="w-10 h-10 rounded-xl bg-green-100 dark:bg-green-900/40 flex items-center justify-center text-lg">
            🌳
          </div>
          <div>
            <h3 className="text-base font-black text-gray-900 dark:text-gray-100">
              {access.preferredParkName ?? 'הפארק שלך'}
            </h3>
          </div>
        </div>

        <NeighborhoodLeaderboard
          scope="park"
          scopeId={access.preferredParkId}
          scopeLabel={access.preferredParkName ?? 'הפארק שלך'}
          isLeagueActive={true}
        />
      </div>
    );
  }
}
