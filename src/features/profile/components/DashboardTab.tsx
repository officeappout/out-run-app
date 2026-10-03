'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
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
import EditProfileModal from './EditProfileModal';
import WorkoutGrid from './WorkoutGrid';
import ProfileHeader from './ProfileHeader';
import PartnersHighlightsRow from './PartnersHighlightsRow';

// Carousels use Firestore + auth — keep them client-only via dynamic()
const GoalCarousel = dynamic(() => import('./widgets/GoalCarousel'), { ssr: false });
const ExerciseWishlistStrip = dynamic(() => import('./widgets/ExerciseWishlistStrip'), { ssr: false });
const ProgramsSection = dynamic(() => import('./widgets/ProgramsSection'), { ssr: false });
const PrioritiesSection = dynamic(() => import('./widgets/PrioritiesSection'), { ssr: false });

interface DashboardTabProps {
  /** Opens the SettingsModal — wired by the gear icon in Block 1. */
  onOpenSettings?: () => void;
  /** Switches the parent profile page to its history tab — wired by Block 6 "הכל" link. */
  onNavigateToHistory?: () => void;
}

// IA shell (Phase a) — visual-only tab bar. Tapping only changes which tab
// looks selected; content wiring per tab is a later phase.
const PROFILE_TABS = [
  { id: 'workouts', label: 'אימונים', Icon: Dumbbell },
  { id: 'skills', label: 'סקילים', Icon: Target },
  { id: 'badges', label: 'הישגים', Icon: Trophy },
  { id: 'programs', label: 'תוכניות', Icon: BarChart3 },
] as const;

export default function DashboardTab({ onOpenSettings, onNavigateToHistory }: DashboardTabProps) {
  const router = useRouter();
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
  const trainingTags = profile?.core?.trainingTags ?? [];
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
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);

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
          BLOCK 1 — flat IG-style header (avatar + 3 stats; photo falls back
          to lemur). "פרופיל חלק" round: no card chrome (bg-white/rounded/
          shadow/border) — content flows directly on the page background,
          sections separated by generous spacing + a hairline divider only
          where one section ends and the next begins (partners row, tab bar).
         ════════════════════════════════════════════════════════════════════ */}
      <motion.div
        initial={{ y: 16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 22 }}
        className="relative"
      >
        {/* Top-left action cluster — gear (settings) + bookmark (saved workouts) */}
        <div className="absolute top-0 left-0 flex items-center gap-2 z-10">
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

        {/* pt-10 clears the absolutely-positioned icon cluster above (36px
            buttons + gap) now that there's no card padding to do it for us.
            ProfileHeader (avatar+stats+name+bio+tags+actions) extracted to
            features/profile/components/ProfileHeader.tsx ("public profile"
            slice 1) so the public-profile page renders the same building
            block for another user — same markup/behavior as before this
            extraction, just parameterized. */}
        <div className="pt-10">
          <ProfileHeader
            photoURL={photoURL}
            name={userName}
            cornerBadge={
              <>
                <Flame className="w-3.5 h-3.5 text-orange-500" fill="currentColor" />
                <span className="text-[11px] font-black text-gray-900 tabular-nums">
                  {currentStreak}
                </span>
              </>
            }
            stats={[
              {
                key: 'workouts',
                value: historyLoading ? '—' : totalWorkouts,
                label: 'אימונים',
                onClick: onNavigateToHistory,
              },
              { key: 'partners', value: partnerCount, label: 'שותפים' },
              { key: 'streak', value: currentStreak, label: 'ימי רצף' },
            ]}
            bio={profile?.core?.bio ?? null}
            bioPlaceholder="עדיין אין תיאור אישי"
            roleLine={
              IS_XP_ENABLED ? (
                <p className="text-xs font-bold text-[#00ADEF] mt-0.5">{levelName}</p>
              ) : undefined
            }
            tagIds={trainingTags}
            actions={
              /* עריכת פרופיל — opens the consolidated Edit Profile screen
                 (round 5). Flat, full-width (no pill/border chrome) — just
                 a plain brand-teal label on the page background. */
              <button
                type="button"
                onClick={() => setIsEditProfileOpen(true)}
                className="w-full mt-4 py-2.5 text-sm font-bold text-[#00ADEF] text-center active:bg-gray-50 transition-colors rounded-lg"
              >
                עריכת פרופיל
              </button>
            }
          />
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

        {/* Partners highlights (new, "פרופיל חלק" round) — see
            PartnersHighlightsRow.tsx's own comment for the DEPENDENCY GAP
            (no friends/partners list wired to the self-profile today) and
            why only the add-affordance renders here, same as before this
            extraction. Routes to /search?tab=people (existing
            people-discovery tab, "גלה" sub-mode by default). */}
        <div className="mt-5">
          <PartnersHighlightsRow
            partners={[]}
            onAddClick={() => router.push('/search?tab=people')}
          />
        </div>
      </motion.div>

      {/* ════════════════════════════════════════════════════════════════════
          BLOCK 1.5 — IA tab bar, flat (icon + underline-active only, no
          card chrome). Each tab shows only its own panel (see the panels
          below) — same existing blocks as before, just partitioned instead
          of one continuous scroll.
         ════════════════════════════════════════════════════════════════════ */}
      <motion.div
        initial={{ y: 16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 22, delay: 0.03 }}
        className="border-b border-gray-100"
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

      {/* ── אימונים ── flat 3-column grid of workout tiles (gradient + icon +
          one-line caption), each opening the existing unified workout-detail
          route (/workouts/[id]/history — confirmed live, used today by
          HistorySheet's own tap handler in profile/page.tsx). No new data:
          same useWorkoutHistory(50) call as before; InlineRecentList's text
          rows are gone, replaced by WorkoutGrid below. "הכל" preserved —
          same onNavigateToHistory link as before (opens the full HistorySheet). */}
      <div className={activeTab === 'workouts' ? 'space-y-4' : 'hidden'}>
        <motion.div
          initial={{ y: 16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 22, delay: 0.06 }}
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-black text-gray-800">האימונים שלי</h3>
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

          <WorkoutGrid
            workouts={workouts}
            isLoading={historyLoading}
            onOpen={(id) => router.push(`/workouts/${id}/history`)}
          />
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

      {/* ── הישגים ── BLOCK 3 — flat, no card wrapper ("פרופיל חלק" follow-up) */}
      <div className={activeTab === 'badges' ? 'space-y-4' : 'hidden'}>
        <motion.div
          initial={{ y: 16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 22, delay: 0.06 }}
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
      {/* Flattened ("פרופיל חלק" follow-up): each widget below no longer
          carries its own card border, so the hairline between blocks now
          lives here instead — a trailing border-b on each ALWAYS-rendering
          block (GoalCarousel/ExerciseWishlistStrip/mode-widgets). Deliberately
          NOT on PrioritiesSection's wrapper: it renders null for most users
          (single-item selections don't qualify), and a border attached to
          an empty block would show as a stray trailing line. */}
      <div className={activeTab === 'programs' ? '' : 'hidden'}>
        <motion.div
          initial={{ y: 16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 22, delay: 0.06 }}
          className="pb-5 border-b border-gray-100"
        >
          <GoalCarousel />
        </motion.div>

        <motion.div
          initial={{ y: 16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 22, delay: 0.1 }}
          className="pt-5 pb-5 border-b border-gray-100"
        >
          <ExerciseWishlistStrip />
        </motion.div>

        <motion.div
          initial={{ y: 16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 22, delay: 0.14 }}
          className="pt-5 pb-5 border-b border-gray-100"
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
          className="pt-5"
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

      {/* ── Edit Profile — opened by the "עריכת פרופיל" button (round 5) ── */}
      <EditProfileModal
        isOpen={isEditProfileOpen}
        onClose={() => setIsEditProfileOpen(false)}
      />

      {/* ── Unlock Toast (bottom overlay) ── */}
      <AchievementUnlockToast
        item={toastQueue[0] ?? null}
        onDismiss={dismissToast}
      />
    </div>
  );
}

