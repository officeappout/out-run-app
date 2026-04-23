'use client';

import React, { useEffect, useState, useMemo, useRef } from 'react';
import dynamic from 'next/dynamic';
import { motion } from 'framer-motion';
import { Flame, CalendarDays, Trophy } from 'lucide-react';
import { useProgressionStore } from '@/features/user/progression/store/useProgressionStore';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import LemurAvatar from '@/features/user/progression/components/LemurAvatar';
import { getLevelName } from '@/features/user/progression/config/lemur-stages';
import { useLevelConfig } from '@/features/user/progression/hooks/useLevelConfig';
import { auth } from '@/lib/firebase';
import { useWorkoutHistory } from '@/features/profile/hooks/useWorkoutHistory';

// Carousels use Firestore + auth — keep them client-only via dynamic()
const GoalCarousel = dynamic(() => import('./widgets/GoalCarousel'), { ssr: false });
const ActiveProgramsCarousel = dynamic(() => import('./widgets/ActiveProgramsCarousel'), { ssr: false });
// RecentActivityList is pure React (no window APIs) — import directly so it
// is always in the bundle and never silently disappears on slow hydration.
import RecentActivityList from './widgets/RecentActivityList';

export default function DashboardTab() {
  const {
    globalXP,
    globalLevel,
    currentStreak,
    daysActive,
    lemurStage,
    isHydrated,
    hydrateFromFirestore,
  } = useProgressionStore();
  const { profile } = useUserStore();
  const gender = profile?.core?.gender ?? 'male';

  // ── Shared workout history — feeds Block 2 (total count) and Block 4 (list) ──
  const { workouts, isLoading: historyLoading } = useWorkoutHistory(50);

  // ── Hydrate progression store on mount (idempotent — safe to call from multiple places) ──
  const hydrationAttemptedRef = useRef(false);
  useEffect(() => {
    if (hydrationAttemptedRef.current) return;
    const uid = profile?.id ?? auth.currentUser?.uid;
    if (!uid) return;
    hydrationAttemptedRef.current = true;
    hydrateFromFirestore(uid);
    // hydrateFromFirestore is a stable Zustand action — safe to omit from deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  // ── Level data from Firestore (admin panel), GLOBAL_LEVEL_THRESHOLDS as fallback ──
  const { getEntry, getNextThreshold, calcProgress } = useLevelConfig();
  const currentStageConfig = getEntry(globalLevel);
  const isMaxLevel = globalLevel >= 10;

  // getNextThreshold always returns a positive number — fixes "81 / 0 XP" when
  // only a subset of levels are configured in the admin panel.
  const nextLevelXP = isMaxLevel ? currentStageConfig.maxXP : getNextThreshold(globalLevel);

  const progress = useMemo(
    () => calcProgress(globalXP, globalLevel),
    [globalXP, globalLevel, calcProgress],
  );

  // ── Stable bar target: animate TO a value exactly once after hydration,
  //    then follow XP changes smoothly — prevents bar jumping to 0 on re-renders.
  const [barTarget, setBarTarget] = useState(0);
  const barSettledRef = useRef(false);
  useEffect(() => {
    if (!isHydrated) return;
    if (!barSettledRef.current || progress !== barTarget) {
      setBarTarget(progress);
      barSettledRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHydrated, progress]);

  // Hebrew level name always comes from lemur-stages.ts (admin stores English only)
  const levelName = getLevelName(globalLevel, gender);

  return (
    <div className="space-y-4 pb-24" dir="rtl">

      {/* ══════════════════════════════════════════════════════════════════
          BLOCK 1 — Lemur Hero Card (XP + Level + Progress Bar)
         ════════════════════════════════════════════════════════════════ */}
      <motion.div
        initial={{ y: 16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 22 }}
        className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex flex-col items-center"
      >
        {/* Lemur + Streak row */}
        <div className="flex items-start justify-between w-full mb-2">
          <div className="w-16" />

          {/* LemurAvatar driven by days-active lemurStage, not XP globalLevel */}
          <div className="flex flex-col items-center">
            <LemurAvatar
              level={lemurStage}
              size="large"
              className="!w-32 !h-32"
            />
          </div>

          {/* Streak badge */}
          <div className="flex flex-col items-center pt-1">
            <div className="relative">
              <Flame className="w-10 h-10 text-orange-500" fill="currentColor" />
              <span className="absolute inset-0 flex items-center justify-center text-white text-xs font-black pt-0.5">
                {currentStreak}
              </span>
            </div>
            <span className="text-[10px] font-bold text-gray-500 mt-0.5">רצף</span>
          </div>
        </div>

        {/* Level title (Hebrew, gendered) */}
        <h2 className="text-xl font-black text-gray-900 mt-2">{levelName}</h2>
        <span className="text-xs font-bold text-[#00ADEF] mt-0.5">שלב {globalLevel}</span>

        {/* ── XP Scale — skeleton until Firestore data is confirmed ── */}
        <div className="w-full mt-5">
          {!isHydrated ? (
            <div className="space-y-2 animate-pulse">
              <div className="h-5 bg-gray-100 rounded w-1/3 mx-auto" />
              <div className="h-3.5 bg-gray-100 rounded-full" />
              <div className="flex justify-between">
                <div className="h-3 bg-gray-100 rounded w-10" />
                <div className="h-3 bg-gray-100 rounded w-10" />
              </div>
            </div>
          ) : isMaxLevel ? (
            <div className="bg-gradient-to-l from-[#00ADEF] to-[#5BC2F2] rounded-full py-2 px-4 text-center">
              <span className="text-white text-xs font-black">הגעת לשיא!</span>
            </div>
          ) : (
            <>
              <div className="flex items-baseline justify-center gap-1 mb-2">
                <span className="text-2xl font-black text-gray-900 tabular-nums" dir="ltr">
                  {globalXP.toLocaleString()}
                </span>
                <span className="text-xs font-bold text-gray-400">
                  / {nextLevelXP.toLocaleString()} XP
                </span>
              </div>

              <div className="h-3.5 bg-gray-100 rounded-full overflow-hidden shadow-inner">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${barTarget}%` }}
                  transition={{ duration: 0.9, ease: 'easeOut' }}
                  className="h-full rounded-full bg-gradient-to-l from-[#00ADEF] to-[#5BC2F2] shadow-[0_0_8px_rgba(0,173,239,0.4)]"
                />
              </div>

              <div className="flex justify-between mt-1.5 px-0.5" dir="ltr">
                <span className="text-[10px] font-bold text-gray-400">שלב {globalLevel}</span>
                <span className="text-[10px] font-bold text-[#00ADEF]">שלב {globalLevel + 1}</span>
              </div>
            </>
          )}
        </div>
      </motion.div>

      {/* ══════════════════════════════════════════════════════════════════
          BLOCK 2 — Stats Row: Active Days + Total Workouts
         ════════════════════════════════════════════════════════════════ */}
      <motion.div
        initial={{ y: 16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 22, delay: 0.08 }}
        className="grid grid-cols-2 gap-3"
      >
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex flex-col items-center justify-center">
          <CalendarDays className="w-6 h-6 text-[#00ADEF] mb-1.5" />
          <span className="text-3xl font-black text-gray-900 leading-none tabular-nums">
            {daysActive}
          </span>
          <span className="text-xs font-bold text-gray-500 mt-1">ימים פעילים</span>
        </div>

        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex flex-col items-center justify-center">
          <Trophy className="w-6 h-6 text-amber-500 mb-1.5" />
          <span className="text-3xl font-black text-gray-900 leading-none tabular-nums">
            {historyLoading ? '—' : workouts.length}
          </span>
          <span className="text-xs font-bold text-gray-500 mt-1">אימונים כולל</span>
        </div>
      </motion.div>

      {/* ══════════════════════════════════════════════════════════════════
          BLOCK 3A — Goal Carousel (target exercises from active program)
         ════════════════════════════════════════════════════════════════ */}
      <motion.div
        initial={{ y: 16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 22, delay: 0.14 }}
      >
        <GoalCarousel />
      </motion.div>

      {/* ══════════════════════════════════════════════════════════════════
          BLOCK 3B — Active Programs Carousel
         ════════════════════════════════════════════════════════════════ */}
      <motion.div
        initial={{ y: 16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 22, delay: 0.20 }}
      >
        <ActiveProgramsCarousel />
      </motion.div>

      {/* ══════════════════════════════════════════════════════════════════
          BLOCK 4 — Recent Activity List (last 5 workouts)
         ════════════════════════════════════════════════════════════════ */}
      <motion.div
        initial={{ y: 16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 22, delay: 0.26 }}
      >
        <RecentActivityList workouts={workouts} isLoading={historyLoading} />
      </motion.div>

    </div>
  );
}
