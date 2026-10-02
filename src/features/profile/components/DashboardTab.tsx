'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { motion } from 'framer-motion';
import { Flame, Trophy, Settings2, Bookmark, Dumbbell, Target, BarChart3 } from 'lucide-react';
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
import { IS_XP_ENABLED } from '@/config/feature-flags';
import { StrengthWidgets, RunningWidgets } from './widgets/DashboardModeWidgets';
import FavoritesSheet from './FavoritesSheet';

// Carousels use Firestore + auth — keep them client-only via dynamic()
const GoalCarousel = dynamic(() => import('./widgets/GoalCarousel'), { ssr: false });
const ExerciseWishlistStrip = dynamic(() => import('./widgets/ExerciseWishlistStrip'), { ssr: false });
const ProgramsSection = dynamic(() => import('./widgets/ProgramsSection'), { ssr: false });
const PrioritiesSection = dynamic(() => import('./widgets/PrioritiesSection'), { ssr: false });
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

// IA shell (Phase a) — visual-only tab bar. Tapping only changes which tab
// looks selected; content wiring per tab is a later phase.
const PROFILE_TABS = [
  { id: 'workouts', label: 'אימונים', Icon: Dumbbell },
  { id: 'skills', label: 'סקילים', Icon: Target },
  { id: 'badges', label: 'הישגים', Icon: Trophy },
  { id: 'programs', label: 'תוכניות', Icon: BarChart3 },
] as const;

// Default no-photo avatar (IS_XP_ENABLED=false): initials on a per-user
// deterministic color, so two users without a photo don't look identical.
// Small brand-aligned palette — swap freely, nothing else depends on these
// exact hexes.
const AVATAR_PALETTE = ['#00ADEF', '#10B981', '#F59E0B', '#8B5CF6', '#F43F5E', '#0EA5E9'];
const AVATAR_FALLBACK_GRADIENT = 'linear-gradient(135deg, #00ADEF, #5BC2F2)';

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/** Deterministic background for a user's initials avatar — same uid/name
 * always lands on the same palette color. Falls back to the brand gradient
 * when neither uid nor name is available (truly unknown user). */
function avatarBackground(seed: string | null): string {
  if (!seed) return AVATAR_FALLBACK_GRADIENT;
  return AVATAR_PALETTE[hashString(seed) % AVATAR_PALETTE.length];
}

/** Grapheme-safe first letter — avoids splitting a surrogate pair (emoji,
 * non-BMP characters) in half. Hebrew/Latin names uppercase as expected;
 * .toUpperCase() is a harmless no-op on Hebrew (no case to begin with). */
function firstGrapheme(name: string | null): string {
  const trimmed = name?.trim();
  if (!trimmed) return '?';
  const SegmenterCtor = (Intl as unknown as { Segmenter?: new (locale?: string, opts?: { granularity: string }) => { segment(s: string): Iterable<{ segment: string }> } }).Segmenter;
  if (SegmenterCtor) {
    // Array.from (not spread/for-of) — this repo's tsconfig has no `target`
    // set, so spreading a non-array iterable hits TS2802; Array.from is a
    // plain function call, not a language construct the compiler needs to
    // downlevel, and still iterates the real runtime iterator correctly.
    const first = Array.from(new SegmenterCtor(undefined, { granularity: 'grapheme' }).segment(trimmed))[0];
    return first ? first.segment.toUpperCase() : '?';
  }
  return Array.from(trimmed)[0]?.toUpperCase() ?? '?';
}

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
  const photoURL = profile?.core?.photoURL || null;
  const userName = profile?.core?.name?.trim() || null;
  // referral.service.ts increments this on a real referral event — not a
  // dead field, but most accounts are still 0 until that happens.
  const partnerCount = profile?.social?.partnerCount ?? 0;
  const [activeTab, setActiveTab] = useState<typeof PROFILE_TABS[number]['id']>('workouts');

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
          BLOCK 1 — IG-style header (avatar + 3 stats; photo falls back to lemur)
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

        {/* ── IG-style header row: avatar (photo, fallback to lemur) + 3 stats ── */}
        <div className="flex items-center gap-4 pt-2">
          <div className="relative flex-shrink-0" style={{ width: 84, height: 84 }}>
            {/* Gradient ring (brand gradient, same tokens as the XP bar below) —
                padding reveals the gradient as a ring around the white inset. */}
            <div className="w-full h-full rounded-full p-[3px] bg-gradient-to-br from-[#00ADEF] to-[#5BC2F2] shadow-md">
              <div className="w-full h-full rounded-full overflow-hidden bg-white">
                {photoURL ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photoURL}
                    alt={userName || 'תמונת פרופיל'}
                    width={84}
                    height={84}
                    className="w-full h-full object-cover"
                  />
                ) : IS_XP_ENABLED ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={LEMUR_IMG}
                    alt="Lemur"
                    width={84}
                    height={84}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div
                    className="w-full h-full flex items-center justify-center text-white font-black text-2xl"
                    style={{ background: avatarBackground(userId || userName) }}
                  >
                    {firstGrapheme(userName)}
                  </div>
                )}
              </div>
            </div>
            {/* Streak badge — Flame + count */}
            <div className="absolute -bottom-1 -right-1 bg-white rounded-full px-1.5 py-0.5 shadow-md border border-gray-100 flex items-center gap-0.5">
              <Flame className="w-3.5 h-3.5 text-orange-500" fill="currentColor" />
              <span className="text-[11px] font-black text-gray-900 tabular-nums">
                {currentStreak}
              </span>
            </div>
          </div>

          {/* 3 stats — workouts / partners / streak (level dropped — see
              partnerCount note above) */}
          <div className="flex-1 grid grid-cols-3 gap-1">
            <button
              type="button"
              onClick={onNavigateToHistory}
              disabled={!onNavigateToHistory}
              aria-label="הצג היסטוריית אימונים"
              className="flex flex-col items-center active:scale-95 transition-transform disabled:cursor-default"
            >
              <span className="text-lg font-black text-gray-900 leading-none tabular-nums">
                {historyLoading ? '—' : totalWorkouts}
              </span>
              <span className="text-[10px] font-bold text-gray-500 mt-1">אימונים</span>
            </button>

            <div className="flex flex-col items-center">
              <span className="text-lg font-black text-gray-900 leading-none tabular-nums">
                {partnerCount}
              </span>
              <span className="text-[10px] font-bold text-gray-500 mt-1">שותפים</span>
            </div>

            <div className="flex flex-col items-center">
              <span className="text-lg font-black text-gray-900 leading-none tabular-nums">
                {currentStreak}
              </span>
              <span className="text-[10px] font-bold text-gray-500 mt-1">ימי רצף</span>
            </div>
          </div>
        </div>

        {/* Name + meta + bio — start-aligned (not centered), matching the
            mockup. levelName is a level-tier name (e.g. "המטפס") — part of
            the XP/character system, gated behind IS_XP_ENABLED like the
            rest of it (round 4 follow-up; previously kept unconditional).
            Bio has no backing field yet (no new Firestore fields this
            phase) — always the same empty-safe placeholder, never reads
            anything that could be missing. */}
        <div className="mt-4">
          {userName && (
            <p className="text-sm font-bold text-gray-900">{userName}</p>
          )}
          {IS_XP_ENABLED && (
            <p className="text-xs font-bold text-[#00ADEF] mt-0.5">{levelName}</p>
          )}
          <p className="text-xs font-medium text-gray-400 mt-1">עדיין אין תיאור אישי</p>
        </div>

        {/* XP progress bar — IS_XP_ENABLED gate. Hidden, not deleted: no
            accrual is stopped, only this display. */}
        {IS_XP_ENABLED && (
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
        )}
      </motion.div>

      {/* ════════════════════════════════════════════════════════════════════
          BLOCK 1.5 — IA tab bar
          Each tab now shows only its own panel (see the panels below) —
          same existing blocks as before, just partitioned instead of one
          continuous scroll.
         ════════════════════════════════════════════════════════════════════ */}
      <motion.div
        initial={{ y: 16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 22, delay: 0.03 }}
        className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden"
      >
        <div className="flex" role="tablist" aria-label="תצוגת פרופיל">
          {PROFILE_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex-1 flex flex-col items-center gap-1 py-3 transition-colors ${
                activeTab === tab.id ? 'text-gray-900' : 'text-gray-400'
              }`}
            >
              <tab.Icon className="w-5 h-5" />
              <span className="text-[10px] font-bold">{tab.label}</span>
              {activeTab === tab.id && (
                <span className="absolute bottom-0 h-0.5 w-8 rounded-full bg-gradient-to-l from-[#00ADEF] to-[#5BC2F2]" />
              )}
            </button>
          ))}
        </div>
      </motion.div>

      {/* ════════════════════════════════════════════════════════════════════
          Tab panels — every block that used to render in one continuous
          scroll is now routed into one of the 4 tabs above. All 4 panels
          stay mounted (toggled via the `hidden` utility, not conditional
          JSX) so switching tabs never remounts — and never re-fires the
          data fetch inside — any of these existing blocks.
         ════════════════════════════════════════════════════════════════════ */}

      {/* ── אימונים ── BLOCK 6 (recent activity; workout history is a later phase) */}
      <div className={activeTab === 'workouts' ? 'space-y-4' : 'hidden'}>
        <motion.div
          initial={{ y: 16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 22, delay: 0.06 }}
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
      </div>

      {/* ── סקילים ── BLOCK 5 (ProgramsSection — confirmed round 3: this is
          the per-skill progression rings/list, e.g. front lever 9/15 68%.
          Its own existing empty state ("עדיין לא בחרת תוכנית אימון" + "בחר
          תוכנית" → the real assessment questionnaire) carries over
          unchanged — this is a pure relocation, ProgramsSection.tsx itself
          is untouched.) */}
      <div className={activeTab === 'skills' ? 'space-y-4' : 'hidden'}>
        <motion.div
          initial={{ y: 16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 22, delay: 0.06 }}
        >
          <ProgramsSection />
        </motion.div>
      </div>

      {/* ── הישגים ── BLOCK 3 */}
      <div className={activeTab === 'badges' ? 'space-y-4' : 'hidden'}>
        <motion.div
          initial={{ y: 16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 22, delay: 0.06 }}
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
      </div>

      {/* ── תוכניות ── BLOCK 2 (goals) + BLOCK 2.5 (exercise wishlist — moved
          here since ProgramsSection took its old spot in סקילים; flagged
          in PR notes, redirect if you'd rather it live in סקילים instead)
          + BLOCK 4 (mode widgets — StrengthWidgets' 4 squares now
          consolidated into one weekly card, see DashboardModeWidgets.tsx)
          + BLOCK 5.5 (priority order) */}
      <div className={activeTab === 'programs' ? 'space-y-4' : 'hidden'}>
        <motion.div
          initial={{ y: 16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 22, delay: 0.06 }}
        >
          <GoalCarousel />
        </motion.div>

        <motion.div
          initial={{ y: 16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 22, delay: 0.1 }}
        >
          <ExerciseWishlistStrip />
        </motion.div>

        <motion.div
          initial={{ y: 16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 22, delay: 0.14 }}
        >
          {isRunningMode ? (
            <RunningWidgets workouts={workouts} />
          ) : (
            <StrengthWidgets workouts={workouts} />
          )}
        </motion.div>

        <motion.div
          initial={{ y: 16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 22, delay: 0.18 }}
        >
          <PrioritiesSection />
        </motion.div>
      </div>

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

import { Activity, Bike, PersonStanding, Moon } from 'lucide-react';
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
    case 'recovery':
      return { Icon: Moon, label: 'אימון התאוששות', iconBg: 'bg-slate-50', iconColor: 'text-slate-500' };
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
