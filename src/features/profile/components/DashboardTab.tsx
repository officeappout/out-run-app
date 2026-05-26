'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { motion } from 'framer-motion';
import { Flame, Trophy, CalendarDays, Settings2, Bookmark } from 'lucide-react';
import { useProgressionStore } from '@/features/user/progression/store/useProgressionStore';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { getLevelName } from '@/features/user/progression/config/lemur-stages';
import { useLevelConfig } from '@/features/user/progression/hooks/useLevelConfig';
import { useDashboardMode } from '@/hooks/useDashboardMode';
import { auth } from '@/lib/firebase';
import { useWorkoutHistory } from '@/features/profile/hooks/useWorkoutHistory';
import { useAchievements } from '@/features/user/progression/hooks/useAchievements';
import { BadgeDisplay } from '@/features/user/progression/components/BadgeDisplay';
import { AchievementSheet } from '@/features/user/progression/components/AchievementSheet';
import { AchievementUnlockToast } from '@/features/user/progression/components/AchievementUnlockToast';
import { StrengthWidgets, RunningWidgets } from './widgets/DashboardModeWidgets';
import FavoritesSheet from './FavoritesSheet';

// Carousels use Firestore + auth — keep them client-only via dynamic()
const GoalCarousel = dynamic(() => import('./widgets/GoalCarousel'), { ssr: false });
const ProgramsSection = dynamic(() => import('./widgets/ProgramsSection'), { ssr: false });
// RecentActivityList is pure React (no window APIs) — import directly so it
// is always in the bundle and never silently disappears on slow hydration.
import RecentActivityList from './widgets/RecentActivityList';

interface DashboardTabProps {
  /** Opens the SettingsModal — wired by the gear icon in Block 1. */
  onOpenSettings?: () => void;
  /** Switches the parent profile page to its history tab — wired by Block 6 "הכל" link. */
  onNavigateToHistory?: () => void;
}

/** Single asset path; LemurAvatar uses the same file. */
const LEMUR_IMG = '/assets/lemur/king-lemur.png';

export default function DashboardTab({ onOpenSettings, onNavigateToHistory }: DashboardTabProps) {
  const {
    globalXP,
    globalLevel,
    currentStreak,
    isHydrated,
    hydrateFromFirestore,
  } = useProgressionStore();
  const { profile } = useUserStore();
  const gender = profile?.core?.gender ?? 'male';
  const userId = profile?.id ?? auth.currentUser?.uid ?? null;

  // ── Debug: log profile.progression whenever it changes ────────────────────
  useEffect(() => {
    console.group('[DashboardTab] profile.progression snapshot');
    console.log('userId:', userId);
    console.log('_hasHydrated (useUserStore):', useUserStore.getState()._hasHydrated);
    console.log('activePrograms:', JSON.stringify(profile?.progression?.activePrograms ?? null, null, 2));
    console.log('tracks:', JSON.stringify(profile?.progression?.tracks ?? null, null, 2));
    console.log('domains:', JSON.stringify(profile?.progression?.domains ?? null, null, 2));
    console.groupEnd();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.progression?.activePrograms, userId]);

  // ── Shared workout history — feeds Block 1 (count) and Blocks 4/6 ─────────
  const { workouts, isLoading: historyLoading } = useWorkoutHistory(50);

  // ── Dashboard mode → picks Block 4 widget variant ──────────────────────────
  const dashboardMode = useDashboardMode(profile);
  const isRunningMode = dashboardMode === 'RUNNING' || dashboardMode === 'HYBRID';

  // ── Achievements ───────────────────────────────────────────────────────────
  const { unlockedAchievements, toastQueue, dismissToast } = useAchievements(
    userId,
    workouts,
    historyLoading,
  );
  const [isAchievementSheetOpen, setIsAchievementSheetOpen] = useState(false);
  const [isFavoritesSheetOpen, setIsFavoritesSheetOpen] = useState(false);

  // ── Hydrate progression store on mount (idempotent) ────────────────────────
  const hydrationAttemptedRef = useRef(false);
  useEffect(() => {
    if (hydrationAttemptedRef.current) return;
    if (!userId) return;
    hydrationAttemptedRef.current = true;
    hydrateFromFirestore(userId);
    // hydrateFromFirestore is a stable Zustand action — safe to omit from deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  // ── Level config (Firestore admin panel, with code fallback) ──────────────
  const { getEntry, getNextThreshold, calcProgress } = useLevelConfig();
  const currentStageConfig = getEntry(globalLevel);
  const isMaxLevel = globalLevel >= 10;
  const nextLevelXP = isMaxLevel ? currentStageConfig.maxXP : getNextThreshold(globalLevel);

  const progress = useMemo(
    () => calcProgress(globalXP, globalLevel),
    [globalXP, globalLevel, calcProgress],
  );

  // Stable bar target — animates exactly once after hydration, then follows XP.
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

  const levelName = getLevelName(globalLevel, gender);
  const totalWorkouts = workouts.length;

  return (
    <div className="space-y-4 pb-24" dir="rtl">
      {/* ════════════════════════════════════════════════════════════════════
          BLOCK 1 — Lemur Hero Card
         ════════════════════════════════════════════════════════════════════ */}
      <motion.div
        initial={{ y: 16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 22 }}
        className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 relative"
      >
        {/* Top-left action cluster — gear (settings) + bookmark (saved workouts) */}
        <div className="absolute top-3 left-3 flex items-center gap-2">
          {onOpenSettings && (
            <button
              type="button"
              onClick={onOpenSettings}
              aria-label="הגדרות"
              className="w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center active:scale-95 transition-all"
            >
              <Settings2 className="w-5 h-5 text-gray-700" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsFavoritesSheetOpen(true)}
            aria-label="אימונים שמורים"
            className="w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center active:scale-95 transition-all"
          >
            <Bookmark className="w-5 h-5 text-gray-700" />
          </button>
        </div>

        {/* Lemur image — 88px circle, green border, streak badge bottom-right */}
        <div className="flex flex-col items-center pt-2">
          <div className="relative" style={{ width: 88, height: 88 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={LEMUR_IMG}
              alt="Lemur"
              width={88}
              height={88}
              className="w-full h-full rounded-full object-cover border-[3px] border-emerald-400 shadow-md bg-white"
            />
            {/* Streak badge — Flame + count */}
            <div className="absolute -bottom-1 -right-1 bg-white rounded-full px-1.5 py-0.5 shadow-md border border-gray-100 flex items-center gap-0.5">
              <Flame className="w-3.5 h-3.5 text-orange-500" fill="currentColor" />
              <span className="text-[11px] font-black text-gray-900 tabular-nums">
                {currentStreak}
              </span>
            </div>
          </div>

          {/* Level title (gendered) */}
          <h2 className="text-xl font-black text-gray-900 mt-3">{levelName}</h2>
          <span className="text-xs font-bold text-[#00ADEF] mt-0.5">שלב {globalLevel}</span>

          {/* XP progress bar */}
          <div className="w-full mt-4">
            {!isHydrated ? (
              <div className="space-y-2 animate-pulse">
                <div className="h-3.5 bg-gray-100 rounded-full" />
                <div className="h-3 bg-gray-100 rounded w-1/2 mx-auto" />
              </div>
            ) : isMaxLevel ? (
              <div className="bg-gradient-to-l from-[#00ADEF] to-[#5BC2F2] rounded-full py-2 px-4 text-center">
                <span className="text-white text-xs font-black">הגעת לשיא!</span>
              </div>
            ) : (
              <>
                <div className="h-3 bg-gray-100 rounded-full overflow-hidden shadow-inner">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${barTarget}%` }}
                    transition={{ duration: 0.9, ease: 'easeOut' }}
                    className="h-full rounded-full bg-gradient-to-l from-[#00ADEF] to-[#5BC2F2]"
                  />
                </div>
                <div className="flex items-center justify-between mt-1.5 px-0.5" dir="ltr">
                  <span className="text-[11px] font-bold text-gray-500 tabular-nums">
                    {globalXP.toLocaleString()} / {nextLevelXP.toLocaleString()} XP
                  </span>
                  <span className="text-[11px] font-bold text-[#00ADEF]">
                    שלב {globalLevel + 1} →
                  </span>
                </div>
              </>
            )}
          </div>

          {/* Stats row (2 columns w/ vertical divider) */}
          <div className="grid grid-cols-2 gap-1 mt-4 pt-4 border-t border-gray-100 w-full divide-x divide-x-reverse divide-gray-100">
            {/* Workouts count — tappable, navigates to history */}
            <button
              type="button"
              onClick={onNavigateToHistory}
              disabled={!onNavigateToHistory}
              aria-label="הצג היסטוריית אימונים"
              className="flex flex-col items-center px-2 active:scale-95 transition-transform disabled:cursor-default"
            >
              <div className="flex items-center gap-1.5 text-gray-500">
                <Trophy className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-[10px] font-bold">אימונים</span>
              </div>
              <span className="text-xl font-black text-gray-900 leading-none mt-1 tabular-nums">
                {historyLoading ? '—' : totalWorkouts}
              </span>
            </button>

            <div className="flex flex-col items-center px-2">
              <div className="flex items-center gap-1.5 text-gray-500">
                <CalendarDays className="w-3.5 h-3.5 text-orange-500" />
                <span className="text-[10px] font-bold">ימי רצף</span>
              </div>
              <span className="text-xl font-black text-gray-900 leading-none mt-1 tabular-nums">
                {currentStreak}
              </span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ════════════════════════════════════════════════════════════════════
          BLOCK 2 — יעדי תרגילים (GoalCarousel; +150 XP line lives in GoalCard)
         ════════════════════════════════════════════════════════════════════ */}
      <motion.div
        initial={{ y: 16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 22, delay: 0.06 }}
      >
        <GoalCarousel />
      </motion.div>

      {/* ════════════════════════════════════════════════════════════════════
          BLOCK 3 — הישגים (BadgeDisplay compact + sheet trigger)
         ════════════════════════════════════════════════════════════════════ */}
      <motion.div
        initial={{ y: 16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 22, delay: 0.12 }}
        className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100"
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-500" />
            <h3 className="text-sm font-bold text-gray-800">הישגים</h3>
          </div>
          <button
            type="button"
            onClick={() => setIsAchievementSheetOpen(true)}
            className="text-xs font-semibold text-[#00ADEF]"
          >
            כל ההישגים
          </button>
        </div>

        <BadgeDisplay
          unlockedAchievements={unlockedAchievements}
          onViewAll={() => setIsAchievementSheetOpen(true)}
          maxVisible={6}
        />
      </motion.div>

      {/* ════════════════════════════════════════════════════════════════════
          BLOCK 4 — Mode-based widgets (כוח / ריצה)
         ════════════════════════════════════════════════════════════════════ */}
      <motion.div
        initial={{ y: 16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 22, delay: 0.18 }}
      >
        {isRunningMode ? (
          <RunningWidgets workouts={workouts} />
        ) : (
          <StrengthWidgets workouts={workouts} />
        )}
      </motion.div>

      {/* ════════════════════════════════════════════════════════════════════
          BLOCK 5 — התוכניות שלי (master + child program cards)
         ════════════════════════════════════════════════════════════════════ */}
      <motion.div
        initial={{ y: 16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 22, delay: 0.24 }}
      >
        <ProgramsSection />
      </motion.div>

      {/* ════════════════════════════════════════════════════════════════════
          BLOCK 6 — פעילות אחרונה (last 5 workouts + "הכל" link)
         ════════════════════════════════════════════════════════════════════ */}
      <motion.div
        initial={{ y: 16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 22, delay: 0.30 }}
        className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100"
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-black text-gray-800">פעילות אחרונה</h3>
          {onNavigateToHistory && (
            <button
              type="button"
              onClick={onNavigateToHistory}
              className="text-xs font-semibold text-[#00ADEF]"
            >
              הכל
            </button>
          )}
        </div>

        {/* RecentActivityList renders its own card chrome — strip the wrapper
            by passing only the list portion. We re-implement the rows inline
            because we already render the section header above. */}
        <InlineRecentList workouts={workouts} isLoading={historyLoading} />
      </motion.div>

      {/* ── Achievement Sheet (full-screen) ── */}
      <AchievementSheet
        isOpen={isAchievementSheetOpen}
        onClose={() => setIsAchievementSheetOpen(false)}
        unlockedAchievements={unlockedAchievements}
      />

      {/* ── Favorites Sheet — opened by the bookmark icon ── */}
      <FavoritesSheet
        isOpen={isFavoritesSheetOpen}
        onClose={() => setIsFavoritesSheetOpen(false)}
      />

      {/* ── Unlock Toast (bottom overlay) ── */}
      <AchievementUnlockToast
        item={toastQueue[0] ?? null}
        onDismiss={dismissToast}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Inline list — same rows as RecentActivityList without the outer card chrome,
// because Block 6 already provides its own card + section header + "הכל" link.
// ─────────────────────────────────────────────────────────────────────────────

import { Activity, Bike, PersonStanding, Dumbbell } from 'lucide-react';
import type { WorkoutHistoryEntry } from '@/features/workout-engine/core/services/storage.service';

const DATE_FMT = new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'short' });

function getActivityMeta(workout: WorkoutHistoryEntry): {
  Icon: React.ElementType;
  label: string;
  iconBg: string;
  iconColor: string;
} {
  const type = (workout.workoutType ?? workout.activityType ?? 'running').toLowerCase();
  switch (type) {
    case 'strength':
      return { Icon: Dumbbell, label: 'אימון כוח', iconBg: 'bg-purple-50', iconColor: 'text-purple-500' };
    case 'walking':
      return { Icon: PersonStanding, label: 'הליכה', iconBg: 'bg-emerald-50', iconColor: 'text-emerald-500' };
    case 'cycling':
      return { Icon: Bike, label: 'רכיבה', iconBg: 'bg-amber-50', iconColor: 'text-amber-500' };
    case 'running':
    default:
      return { Icon: Activity, label: 'ריצה', iconBg: 'bg-cyan-50', iconColor: 'text-[#00ADEF]' };
  }
}

function InlineRecentList({
  workouts,
  isLoading,
}: {
  workouts: WorkoutHistoryEntry[];
  isLoading: boolean;
}) {
  const recent = workouts.slice(0, 5);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3 animate-pulse">
            <div className="w-10 h-10 rounded-xl bg-gray-100 flex-shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 bg-gray-100 rounded w-3/4" />
              <div className="h-2.5 bg-gray-100 rounded w-1/2" />
            </div>
            <div className="h-5 w-12 bg-gray-100 rounded-full" />
          </div>
        ))}
      </div>
    );
  }

  if (recent.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-6 gap-2">
        <span className="text-3xl">🏃</span>
        <p className="text-sm font-bold text-gray-500 text-center">
          עוד אין פעילויות.
          <br />
          תתחיל לזוז!
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {recent.map((workout, idx) => {
        const { Icon, label, iconBg, iconColor } = getActivityMeta(workout);
        const xp = workout.xpEarned ?? 0;
        const dateStr = workout.date
          ? DATE_FMT.format(workout.date instanceof Date ? workout.date : new Date(workout.date))
          : '';

        return (
          <div key={workout.id ?? idx} className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center flex-shrink-0`}>
              <Icon className={`w-5 h-5 ${iconColor}`} />
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-xs font-black text-gray-800 leading-snug">{label}</p>
              <p className="text-[10px] text-gray-400">{dateStr}</p>
            </div>

            <span
              className={`text-[10px] font-black px-2 py-0.5 rounded-full flex-shrink-0 ${
                xp > 0 ? 'bg-[#00ADEF]/10 text-[#00ADEF]' : 'bg-gray-100 text-gray-400'
              }`}
              dir="ltr"
            >
              {xp > 0 ? `+${xp} XP` : '— XP'}
            </span>
          </div>
        );
      })}
    </div>
  );
}
