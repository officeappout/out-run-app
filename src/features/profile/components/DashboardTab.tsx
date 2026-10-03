'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Flame, Trophy, Settings2, Bookmark, Dumbbell, Target, BarChart3, Plus } from 'lucide-react';
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
import { TRAINING_TAG_OPTIONS } from '@/features/profile/hooks/usePersonalInfoEditor';

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

        {/* ── IG-style header row: avatar (photo, fallback to lemur) + 3 stats ──
            pt-10 clears the absolutely-positioned icon cluster above (36px
            buttons + gap) now that there's no card padding to do it for us. */}
        <div className="flex items-center gap-4 pt-10">
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

        {/* Name + role line + bio — flowing plain text, start-aligned
            (not centered), matching the mockup. levelName (e.g. "המטפס")
            serves as the role line here — it's part of the XP/character
            system, gated behind IS_XP_ENABLED like the rest of it (round 4
            follow-up; previously kept unconditional). Bio (round 5):
            core.bio is a real field now, set via EditProfileModal — shows
            the real value when set, same empty-safe placeholder as before
            when not. */}
        <div className="mt-4">
          {userName && (
            <p className="text-base font-bold text-gray-900">{userName}</p>
          )}
          {IS_XP_ENABLED && (
            <p className="text-xs font-bold text-[#00ADEF] mt-0.5">{levelName}</p>
          )}
          <p className="text-sm font-medium text-gray-400 mt-1 leading-relaxed">
            {profile?.core?.bio?.trim() || 'עדיין אין תיאור אישי'}
          </p>

          {/* Training tags (round 6 bug fix) — core.trainingTags saves
              correctly via usePersonalInfoEditor; this display was simply
              never added here, only on the public profile page. Hidden
              entirely when empty — no "add tags" placeholder clutter. */}
          {trainingTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {trainingTags.map((tagId) => {
                const tag = TRAINING_TAG_OPTIONS.find((t) => t.id === tagId);
                return (
                  <span
                    key={tagId}
                    className="text-[11px] font-semibold text-gray-600 bg-gray-50 border border-gray-200 rounded-full px-2.5 py-1"
                  >
                    {tag?.label ?? tagId}
                  </span>
                );
              })}
            </div>
          )}
        </div>

        {/* עריכת פרופיל — opens the consolidated Edit Profile screen (round
            5). Flat, full-width (no pill/border chrome) — just a plain
            brand-teal label on the page background. Additive: the
            gear/bookmark corner icons above keep their existing jobs
            (settings / saved workouts) unchanged. */}
        <button
          type="button"
          onClick={() => setIsEditProfileOpen(true)}
          className="w-full mt-4 py-2.5 text-sm font-bold text-[#00ADEF] text-center active:bg-gray-50 transition-colors rounded-lg"
        >
          עריכת פרופיל
        </button>

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

        {/* Partners highlights (new, "פרופיל חלק" round) — horizontal row of
            circular avatars of the user's workout partners, leading "+
            הוסף". DEPENDENCY GAP, confirmed during investigation: no
            friends/partners list is wired to the self-profile today. A real
            mutual-follow graph DOES exist (connections/{uid}.following ∩
            .followers via useSocialStore, resolvable via the existing
            getUsersByUids in user-search.service.ts) — but David explicitly
            chose to defer wiring it this round (visual-only scope) rather
            than have this row show a different number than the "שותפים"
            stat above it (which is a referral count, not a follow count).
            So: render ONLY the add-affordance, per his fallback
            instruction — no invented avatars. Routes to /search?tab=people
            (the existing people-discovery tab, "גלה" sub-mode by default)
            — not a new destination, just a deep-linked existing one. */}
        <div className="mt-5 pb-5 border-b border-gray-100">
          <div className="flex items-center gap-3 overflow-x-auto scrollbar-hide" dir="rtl">
            <button
              type="button"
              onClick={() => router.push('/search?tab=people')}
              aria-label="הוסף שותפי אימון"
              className="flex flex-col items-center gap-1 flex-shrink-0 active:scale-95 transition-transform"
            >
              <div className="w-14 h-14 rounded-full border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400">
                <Plus className="w-5 h-5" />
              </div>
              <span className="text-[10px] font-semibold text-gray-500">הוסף</span>
            </button>
          </div>
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

// ─────────────────────────────────────────────────────────────────────────────
// WorkoutGrid — 3-column flat grid of workout tiles for the אימונים tab
// ("פרופיל חלק" round). Each tile is a type-colored gradient (no real
// thumbnail exists on WorkoutHistoryEntry) + icon + one-line caption
// (type label + one stat: distance for cardio, duration for strength/
// hybrid/recovery — same headline stat each type's own existing history
// card already leads with). Opens the real unified workout-detail route.
// ─────────────────────────────────────────────────────────────────────────────

import { Activity, Bike, PersonStanding, Moon } from 'lucide-react';
import type { WorkoutHistoryEntry } from '@/features/workout-engine/core/services/storage.service';

function getActivityMeta(workout: WorkoutHistoryEntry): {
  Icon: React.ElementType;
  label: string;
  tileGradient: string;
} {
  const type = (workout.workoutType ?? workout.activityType ?? 'running').toLowerCase();
  switch (type) {
    case 'strength':
      return { Icon: Dumbbell, label: 'אימון כוח', tileGradient: 'from-purple-500 to-purple-400' };
    case 'walking':
      return { Icon: PersonStanding, label: 'הליכה', tileGradient: 'from-emerald-500 to-emerald-400' };
    case 'cycling':
      return { Icon: Bike, label: 'רכיבה', tileGradient: 'from-amber-500 to-amber-400' };
    case 'recovery':
      return { Icon: Moon, label: 'אימון התאוששות', tileGradient: 'from-slate-500 to-slate-400' };
    case 'running':
    default:
      return { Icon: Activity, label: 'ריצה', tileGradient: 'from-[#00ADEF] to-[#5BC2F2]' };
  }
}

/** One-line tile stat — distance for cardio types, duration (minutes) for
 * strength/hybrid/recovery, matching each type's existing history card. */
function tileStat(workout: WorkoutHistoryEntry): string {
  const type = (workout.workoutType ?? workout.activityType ?? 'running').toLowerCase();
  if (type === 'strength' || type === 'hybrid' || type === 'recovery') {
    const mins = Math.round((workout.duration ?? 0) / 60);
    return `${mins} דק'`;
  }
  const km = workout.distance ?? 0;
  return `${km.toFixed(1)} ק״מ`;
}

function WorkoutGrid({
  workouts,
  isLoading,
  onOpen,
}: {
  workouts: WorkoutHistoryEntry[];
  isLoading: boolean;
  onOpen: (workoutId: string) => void;
}) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-3 gap-2">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="aspect-square rounded-xl bg-gray-100 animate-pulse" />
        ))}
      </div>
    );
  }

  if (workouts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-2">
        <span className="text-3xl">🏃</span>
        <p className="text-sm font-bold text-gray-500 text-center">
          עוד אין אימונים.
          <br />
          תתחיל לזוז!
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      {workouts.map((workout, idx) => {
        const { Icon, label, tileGradient } = getActivityMeta(workout);
        const workoutId = workout.id;

        return (
          <button
            key={workoutId ?? idx}
            type="button"
            onClick={() => workoutId && onOpen(workoutId)}
            disabled={!workoutId}
            className={`relative aspect-square rounded-xl overflow-hidden bg-gradient-to-br ${tileGradient} flex flex-col items-center justify-center gap-1.5 active:scale-95 transition-transform disabled:cursor-default disabled:opacity-60`}
          >
            <Icon className="w-6 h-6 text-white/90" />
            <span className="text-[10px] font-black text-white leading-tight">{label}</span>
            <span className="text-[10px] font-bold text-white/80 tabular-nums">{tileStat(workout)}</span>
          </button>
        );
      })}
    </div>
  );
}
