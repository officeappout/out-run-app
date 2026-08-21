'use client';

import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useEffect, useState, useMemo, type ReactNode } from 'react';
import { Save, Share2, Coins, Flag, Clock, Navigation as NavIcon, Sparkles, Maximize2, X, Trash2 } from 'lucide-react';
import LapPaceChart from '@/features/workout-engine/summary/components/shared/LapPaceChart';
import { useSessionStore } from '@/features/workout-engine/core/store/useSessionStore';
import { useRunningPlayer } from '@/features/workout-engine/players/running/store/useRunningPlayer';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { useProgressionStore } from '@/features/user/progression/store/useProgressionStore';
import { formatPace } from '@/features/workout-engine/core/utils/formatPace';
import RunLapsList from './RunLapsList';
import { IS_COIN_SYSTEM_ENABLED } from '@/config/feature-flags';
import RunMapBlock from '@/features/workout-engine/summary/components/running/RunMapBlock';
import DopamineStreakBlock from '@/features/workout-engine/summary/components/shared/DopamineStreakBlock';
import CircularProgress from '@/components/CircularProgress';
import { createContribution } from '@/features/parks/core/services/contribution.service';
import { XP_REWARDS } from '@/types/contribution.types';
import type { WorkoutHistoryEntry } from '@/features/workout-engine/core/services/storage.service';
import type { Lap } from '@/features/workout-engine/core/types/session.types';

interface FreeRunSummaryProps {
  /**
   * Delete trigger. This component does NOT own the confirm/delete flow
   * itself — it only surfaces a trash icon (next to the close button) when
   * `isReadOnly && onDelete` are both truthy, and calls `onDelete()` on tap.
   * The caller owns opening its own confirmation UI (e.g.
   * DeleteWorkoutConfirmModal) and performing the actual delete — same
   * caller-owns-the-flow split used by `onSave`/`onClose` below.
   *
   * Only wired for the read-only (historical) path today — the live
   * just-finished-session flow (FreeRun/index.tsx, PlannedRun/index.tsx)
   * also passes an `onDelete` (its own "discard the just-finished session"
   * handler), but that path never sets `isReadOnly`, so the trigger added
   * here intentionally never renders for it — see FreeRunSummary's read of
   * `isReadOnly && onDelete` below before changing this gate.
   */
  onDelete?: () => void;
  onSave?: () => void;
  // Read-only mode for historical workouts
  workout?: WorkoutHistoryEntry;
  isReadOnly?: boolean;
  onClose?: () => void;
}

export default function FreeRunSummary({ 
  onDelete, 
  onSave,
  workout,
  isReadOnly = false,
  onClose
}: FreeRunSummaryProps) {
  const router = useRouter();
  const { totalDistance: sessionDistance, totalDuration: sessionDuration } = useSessionStore();
  const { laps: sessionLaps, routeCoords: sessionRouteCoords, currentPace: sessionPace, totalCalories: sessionCalories, activityType: sessionActivityType, clearRunningData, savedWorkoutSnapshot } = useRunningPlayer();
  const [showConfetti, setShowConfetti] = useState(false);
  const [routeQuality, setRouteQuality] = useState(0);
  const [routeDifficulty, setRouteDifficulty] = useState<'easy' | 'medium' | 'hard' | null>(null);
  const [ratingSubmitted, setRatingSubmitted] = useState(false);
  // Expanded-map overlay state. Tapping the framed hero map flips this
  // to `true` and mounts a z-50 full-screen preview of the same route.
  // The X button in the overlay sets it back to `false`.
  const [expandedMap, setExpandedMap] = useState(false);
  // Tab state — 'summary' shows streak/XP/stats/coin/rating, 'laps' shows
  // the pace chart + lap list. The tab row itself is only rendered when
  // there is at least one completed lap (see `completedLaps` below), so
  // workouts without auto-lap never see a tab UI at all.
  const [activeTab, setActiveTab] = useState<'summary' | 'laps'>('summary');
  const { profile } = useUserStore();
  const currentStreak = useProgressionStore((s) => s.currentStreak);

  // Data source priority:
  //   1. isReadOnly + workout prop  → historical view from profile
  //   2. savedWorkoutSnapshot        → live session confirmed snapshot from finishWorkout
  //   3. session store / player       → fallback (e.g. snapshot not yet available)
  const confirmedSource = !isReadOnly ? savedWorkoutSnapshot : null;
  const historySource  = isReadOnly && workout ? workout : null;

  const totalDistance = historySource?.distance ?? confirmedSource?.distance ?? sessionDistance;
  const totalDuration = historySource?.duration ?? confirmedSource?.duration ?? sessionDuration;
  // Follow the same priority chain used for every other metric so a
  // re-opened history workout actually shows its stored laps. The old
  // code forced `[]` for history, which silently hid lap data for any
  // run that had saved `laps` (a regression once `laps` was added to
  // WorkoutHistoryEntry).
  const laps: Lap[] = historySource?.laps ?? confirmedSource?.laps ?? sessionLaps;
  // The still-active lap (the one currently accumulating) is excluded
  // from the pace chart / lap list on the summary screen — it's noise
  // until it's been closed out.
  const completedLaps = useMemo(() => laps.filter((l) => !l.isActive), [laps]);
  
  // Convert routePath to number[][] format for RunMapBlock
  // Handle both formats: [{lat, lng}] (new) or [[lat, lng]] (old)
  const routeCoords: number[][] = (() => {
    if (isReadOnly && workout?.routePath) {
      try {
        if (!Array.isArray(workout.routePath) || workout.routePath.length === 0) {
          return [];
        }
        
        return workout.routePath
          .map((coord: any) => {
            // New format: {lat, lng}
            if (coord && typeof coord === 'object' && 'lat' in coord && 'lng' in coord) {
              return [Number(coord.lng), Number(coord.lat)]; // Mapbox expects [lng, lat]
            }
            // Old format: [lat, lng] or [lng, lat]
            if (Array.isArray(coord) && coord.length >= 2) {
              return [Number(coord[0]), Number(coord[1])];
            }
            return null;
          })
          .filter((coord: number[] | null): coord is number[] => 
            coord !== null && !isNaN(coord[0]) && !isNaN(coord[1])
          );
      } catch (error) {
        console.error('[FreeRunSummary] Error parsing routePath:', error);
        return [];
      }
    }
    // Active session - already in correct format
    return sessionRouteCoords;
  })();
  
  const currentPace = historySource?.pace ?? confirmedSource?.pace ?? sessionPace;
  const totalCalories = historySource?.calories ?? confirmedSource?.calories ?? sessionCalories;

  // Use calculated calories from store (real-time calculation)
  const calories = totalCalories || 0;

  // Commute summary detection. Both `confirmedSource` (live finish) and
  // `historySource` (re-opening from profile history) carry the
  // `sessionKind` tag the workout engine wrote at save time. Anything
  // missing the tag is treated as a regular workout — back-compat with
  // every workout doc that pre-dated commute mode.
  const sessionKind = (historySource as WorkoutHistoryEntry | null)?.sessionKind
    ?? confirmedSource?.sessionKind
    ?? 'workout';
  const isCommute = sessionKind === 'commute';
  const xpEarned = (historySource as WorkoutHistoryEntry | null)?.xpEarned
    ?? confirmedSource?.xpEarned
    ?? 0;
  const commuteLabel = (historySource as WorkoutHistoryEntry | null)?.commuteLabel
    ?? confirmedSource?.commuteLabel
    ?? null;

  // Trigger confetti effect on mount (only for new workouts, not
  // historical, and never for commutes — daily commutes are calm,
  // not celebratory).
  useEffect(() => {
    if (!isReadOnly && !isCommute) {
      setShowConfetti(true);
      // Simple confetti effect using framer-motion
      const timer = setTimeout(() => setShowConfetti(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [isReadOnly, isCommute]);

  // Format time
  const formatTime = (seconds: number): string => {
    if (!seconds || seconds < 0 || !isFinite(seconds)) return '00:00';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Calculate average pace from total distance and duration
  const avgPace = totalDistance > 0 && totalDuration > 0
    ? (totalDuration / 60) / totalDistance
    : currentPace || 0;

  // Share workout results
  const handleShare = async () => {
    const shareText = `🏃 סיימתי אימון ריצה חופשית!\n\n📏 מרחק: ${totalDistance.toFixed(2)} ק"מ\n⏱️ זמן: ${formatTime(totalDuration)}\n⚡ קצב ממוצע: ${formatPace(avgPace)}\n🔥 קלוריות: ${calories}\n\n#OutRun #ריצה`;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'אימון הושלם!',
          text: shareText,
        });
      } catch (error) {
        // User cancelled or error occurred
        console.log('[FreeRunSummary] Share cancelled or failed');
      }
    } else {
      // Fallback: Copy to clipboard
      try {
        await navigator.clipboard.writeText(shareText);
        alert('הטקסט הועתק ללוח!');
      } catch (error) {
        console.error('[FreeRunSummary] Failed to copy to clipboard:', error);
      }
    }
  };

  // Workout data is already saved by finishWorkout in useRunningPlayer.
  // This handler only needs to clear state and navigate.
  const handleSaveAndClose = () => {
    if (isReadOnly && onClose) {
      onClose();
      return;
    }

    if (onSave) {
      onSave();
    } else {
      const { clearSession } = useSessionStore.getState();
      clearRunningData();
      clearSession();
      router.push('/home');
    }
  };

  // ── Commute slim summary ────────────────────────────────────────────────
  // Daily-commute sessions are intentionally NOT celebrated like
  // workouts. The product brief calls for an "arrival confirmation"
  // surface — total time, total distance, +XP chip, dismiss — and
  // nothing else. No confetti, no coin badge, no laps table, no
  // route-rating CTA. Strength flows live in their own summary route
  // and never reach this component, so the early return is safe.
  if (isCommute) {
    return (
      <CommuteSlimSummary
        totalDistance={totalDistance}
        totalDuration={totalDuration}
        xpEarned={xpEarned}
        commuteLabel={commuteLabel}
        routeCoords={routeCoords}
        isReadOnly={isReadOnly}
        onDismiss={handleSaveAndClose}
      />
    );
  }

  return (
    <div
      className="fixed inset-0 z-20 flex flex-col h-screen bg-gray-50 font-sans pointer-events-auto"
      style={{ fontFamily: 'var(--font-simpler)' }}
      dir="rtl"
    >
      {/* Confetti Effect */}
      {showConfetti && typeof window !== 'undefined' && (
        <div className="fixed inset-0 pointer-events-none z-50">
          {[...Array(30)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-2 h-2 rounded-full"
              style={{
                left: `${Math.random() * 100}%`,
                top: '-10px',
                backgroundColor: ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A'][Math.floor(Math.random() * 5)],
              }}
              initial={{ y: 0, opacity: 1, rotate: 0 }}
              animate={{
                y: (typeof window !== 'undefined' ? window.innerHeight : 800) + 100,
                opacity: 0,
                rotate: 360,
                x: (Math.random() - 0.5) * 200,
              }}
              transition={{
                duration: 2 + Math.random(),
                delay: Math.random() * 0.5,
                ease: 'easeOut',
              }}
            />
          ))}
        </div>
      )}

      {/* Map Hero — framed card, fixed 180 px tall.
          Previously 40 vh, which on a 900 px device ate ~360 px of
          vertical space and pushed the stats rings below the fold
          on first paint. 180 px is a glance-sized thumbnail that
          still reads as a map; the full-screen expand button is how
          users drill in when they want detail. Inner
          `rounded-2xl border border-slate-200 overflow-hidden` is
          the shared "card" visual language used elsewhere in the
          app. Horizontal padding gives the card breathing room from
          the screen edges so the border reads clearly against the
          gray-50 backdrop. A small Maximize2 chip in the top-left
          corner hints that the card is tappable; the entire card is
          the hit target. */}
      <div
        className="relative w-full px-4 pt-4 pb-2"
        style={{ height: '180px', minHeight: '180px', maxHeight: '180px' }}
      >
        {routeCoords.length > 1 ? (
          <button
            type="button"
            onClick={() => setExpandedMap(true)}
            aria-label="הרחב מפה"
            className="relative block w-full h-full rounded-2xl border border-slate-200 overflow-hidden bg-white shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00ADEF]"
          >
            {/* pointer-events-none on the map keeps the parent button
                as the single click target — otherwise the underlying
                Mapbox canvas swallows taps and the expand never
                fires. Users still get a proper interactive map once
                the overlay opens. */}
            <div className="w-full h-full pointer-events-none">
              <RunMapBlock
                routeCoords={routeCoords}
                startCoord={routeCoords[0]}
                endCoord={routeCoords[routeCoords.length - 1]}
              />
            </div>
            <span
              className="absolute top-3 left-3 w-9 h-9 rounded-full bg-white/90 backdrop-blur-sm shadow-md flex items-center justify-center"
              aria-hidden
            >
              <Maximize2 size={16} className="text-gray-700" />
            </span>
          </button>
        ) : (
          <div className="w-full h-full rounded-2xl border border-slate-200 overflow-hidden bg-gray-100 flex items-center justify-center">
            <p className="text-gray-400">אין נתוני מסלול</p>
          </div>
        )}
      </div>

      {/* Expanded-map overlay — z-50 sits above the summary sheet
          (z-20) and the turn-carousel that lives inside MapShell
          (z-30). Only mounts while the user has tapped the hero;
          tapping the X collapses back to the framed preview. */}
      {expandedMap && routeCoords.length > 0 && (
        <div
          className="fixed inset-0 z-50 bg-black/95 flex flex-col"
          role="dialog"
          aria-modal="true"
          aria-label="תצוגת מפה מוגדלת"
        >
          <div className="flex-1 relative">
            <RunMapBlock
              routeCoords={routeCoords}
              startCoord={routeCoords[0]}
              endCoord={routeCoords[routeCoords.length - 1]}
            />
            <button
              type="button"
              onClick={() => setExpandedMap(false)}
              aria-label="סגור מפה"
              className="absolute top-4 left-4 w-11 h-11 rounded-full bg-white/95 shadow-lg flex items-center justify-center hover:bg-white transition-colors"
              style={{ top: 'calc(1rem + env(safe-area-inset-top, 0px))' }}
            >
              <X size={20} className="text-gray-800" />
            </button>
          </div>
        </div>
      )}

      {/* Scrollable Details Card - Starts below map, covers rest of screen */}
      <div className="flex-1 overflow-y-auto pointer-events-auto relative z-[30]">
        <div className="bg-white rounded-t-[32px] shadow-2xl min-h-full">
          <div className="px-6 pt-6 pb-24 space-y-6">
            {/* XP pill — same visual language as CommuteSlimSummary's XP
                chip, promoted to the workout summary so finishers see a
                quiet acknowledgement of their earned XP near the top.
                Hidden for historical workouts where xpEarned was never
                persisted (old docs) and for sessions with 0 XP. */}
            {xpEarned > 0 && (
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.15, type: 'spring', stiffness: 280, damping: 22 }}
                className="flex items-center justify-center"
              >
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-cyan-50 ring-1 ring-cyan-100">
                  <Sparkles size={14} className="text-[#00ADEF]" />
                  <span className="text-sm font-black text-[#0284C7] tabular-nums">
                    +{xpEarned} XP
                  </span>
                </div>
              </motion.div>
            )}

            {/* Tab row — only shown when there are completed laps to
                tab into. Workouts without auto-lap keep the classic
                single-column summary (streak → stats → coin → rating).
                The tabs and their contents are both guarded against
                commute mode higher up via the `isCommute` early-return,
                so this block never runs for commute sessions.

                Style-wise this matches the exercise-swap modal tabs
                (ExerciseReplacementModal.tsx) exactly: underlined
                segments, no pill chrome, no background fill — each
                tab is just text + a 2 px bottom accent on the active
                item, with a hairline separator running full-width
                below the row. */}
            {completedLaps.length > 0 && (
              <div
                className="flex border-b border-slate-100 dark:border-slate-800"
                role="tablist"
                aria-label="סיכום אימון"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'summary'}
                  onClick={() => setActiveTab('summary')}
                  className={`flex-1 py-3 text-center font-bold border-b-2 transition-colors ${
                    activeTab === 'summary'
                      ? 'text-[#00ADEF] border-[#00ADEF]'
                      : 'text-slate-400 dark:text-slate-500 border-transparent'
                  }`}
                >
                  סיכום
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'laps'}
                  onClick={() => setActiveTab('laps')}
                  className={`flex-1 py-3 text-center font-bold border-b-2 transition-colors ${
                    activeTab === 'laps'
                      ? 'text-[#00ADEF] border-[#00ADEF]'
                      : 'text-slate-400 dark:text-slate-500 border-transparent'
                  }`}
                >
                  הקפות
                </button>
              </div>
            )}

            {/* ── SUMMARY TAB ────────────────────────────────────────── */}
            {(completedLaps.length === 0 || activeTab === 'summary') && (
              <>
                {/* Streak block — shared DopamineStreakBlock (orange flame
                    card). Guarded on currentStreak > 1 so a first-time
                    finisher (streak === 0 or 1) doesn't get a confusing
                    "day streak: 1" block on their very first workout. */}
                {currentStreak > 1 && (
                  <DopamineStreakBlock streakDays={currentStreak} />
                )}

                {/* ── Ring stats ─────────────────────────────────────
                    Replaces the previous SummaryStatsGrid row of large
                    stat tiles with a hero-plus-two-smaller ring layout
                    (same pattern as ProgramProgressCard on the home
                    dashboard). Each ring is driven to 100% — the
                    workout is complete, so the ring reads as
                    achievement chrome, and the actual value lives in
                    the ring's center via `children`.

                    Colours track the existing SummaryStatsGrid palette
                    so finishers keep the same visual language:
                      distance → brand cyan, time → orange, pace → blue.
                    Calories moved out of this block entirely; they are
                    still surfaced in the coin badge below when the
                    coin system is enabled. Elevation gain is no
                    longer shown on this screen. */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.1 }}
                  className="bg-white rounded-xl shadow-sm p-6"
                  style={{ fontFamily: 'var(--font-simpler)' }}
                >
                  <div className="flex flex-col items-center gap-6">
                    {/* Hero — distance. Largest ring, centre-stage so
                        the finisher's eye lands on the km number
                        first. */}
                    <CircularProgress
                      percentage={100}
                      size={168}
                      strokeWidth={10}
                      colorClass="text-[#00ADEF]"
                      trackClass="text-gray-100"
                    >
                      <div className="flex flex-col items-center leading-none">
                        <span className="text-4xl font-black text-gray-900 tabular-nums">
                          {totalDistance.toFixed(2)}
                        </span>
                        <span className="text-[11px] font-bold text-gray-500 mt-2 tracking-wider uppercase">
                          ק״מ
                        </span>
                      </div>
                    </CircularProgress>

                    {/* Secondary rings — time + average pace.
                        Same diameter so neither reads as more
                        important than the other; they're a pair of
                        supporting stats beneath the hero. */}
                    <div className="flex items-center justify-center gap-8">
                      <CircularProgress
                        percentage={100}
                        size={100}
                        strokeWidth={7}
                        colorClass="text-[#FF8C00]"
                        trackClass="text-gray-100"
                      >
                        <div className="flex flex-col items-center leading-none">
                          <span className="text-lg font-black text-gray-900 tabular-nums" dir="ltr">
                            {formatTime(totalDuration)}
                          </span>
                          <span className="text-[10px] font-bold text-gray-500 mt-1.5 tracking-wider uppercase">
                            זמן
                          </span>
                        </div>
                      </CircularProgress>
                      <CircularProgress
                        percentage={100}
                        size={100}
                        strokeWidth={7}
                        colorClass="text-blue-600"
                        trackClass="text-gray-100"
                      >
                        <div className="flex flex-col items-center leading-none">
                          <span className="text-lg font-black text-gray-900 tabular-nums" dir="ltr">
                            {formatPace(avgPace > 0 ? avgPace : currentPace)}
                          </span>
                          <span className="text-[10px] font-bold text-gray-500 mt-1.5 tracking-wider uppercase">
                            קצב
                          </span>
                        </div>
                      </CircularProgress>
                    </div>
                  </div>
                </motion.div>

                {/* Coin Badge */}
                {/* COIN_SYSTEM_PAUSED: Re-enable in April */}
                {IS_COIN_SYSTEM_ENABLED && calories > 0 && (
                  <motion.div
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{
                      type: 'spring',
                      stiffness: 300,
                      damping: 20,
                      delay: 0.2,
                    }}
                    className="bg-gradient-to-r from-yellow-400 to-yellow-500 rounded-xl shadow-lg p-4 flex items-center justify-center gap-3"
                  >
                    <motion.div
                      animate={{ rotate: [0, 10, -10, 10, 0] }}
                      transition={{ duration: 0.5, delay: 0.5 }}
                    >
                      <Coins size={32} className="text-yellow-800" fill="currentColor" />
                    </motion.div>
                    <div className="text-center">
                      <div className="text-3xl font-black text-yellow-900">
                        +{calories}
                      </div>
                      <div className="text-sm font-bold text-yellow-800">מטבעות</div>
                    </div>
                  </motion.div>
                )}

                {/* Route Rating */}
                {!isReadOnly && (
                  <motion.div
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.4 }}
                    className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl p-5 shadow-sm"
                    dir="rtl"
                  >
                    {ratingSubmitted ? (
                      <div className="flex items-center justify-center gap-2 py-2">
                        <span className="text-emerald-600 text-sm font-bold">תודה על הדירוג! +{XP_REWARDS.review} XP</span>
                      </div>
                    ) : (
                      <>
                        <h4 className="text-gray-800 text-sm font-bold mb-3">דרגו את המסלול</h4>
                        <div className="flex gap-2 mb-3">
                          {([['easy', 'קל'] as const, ['medium', 'בינוני'] as const, ['hard', 'קשה'] as const]).map(([val, label]) => (
                            <button
                              key={val}
                              onClick={() => setRouteDifficulty(val)}
                              className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
                                routeDifficulty === val
                                  ? 'bg-blue-500 text-white shadow-sm'
                                  : 'bg-white text-gray-500 border border-gray-200'
                              }`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                        <div className="flex justify-center mb-3">
                          <div className="flex gap-1">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <button
                                key={star}
                                onClick={() => setRouteQuality(star)}
                                className="p-0.5 transition-transform active:scale-90"
                              >
                                <svg width="28" height="28" viewBox="0 0 24 24" fill={star <= routeQuality ? '#FBBF24' : 'none'} stroke={star <= routeQuality ? '#FBBF24' : '#D1D5DB'} strokeWidth="2">
                                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                                </svg>
                              </button>
                            ))}
                          </div>
                        </div>
                        {routeQuality > 0 && (
                          <button
                            onClick={async () => {
                              if (!profile?.id) return;
                              try {
                                const loc = routeCoords.length > 0
                                  ? { lat: routeCoords[0][0], lng: routeCoords[0][1] }
                                  : { lat: 0, lng: 0 };
                                await createContribution({
                                  userId: profile.id,
                                  type: 'review',
                                  status: 'pending',
                                  location: loc,
                                  routeQuality,
                                  routeDifficulty: routeDifficulty ?? undefined,
                                });
                                setRatingSubmitted(true);
                              } catch (err) {
                                console.error('[FreeRunSummary] Rating failed:', err);
                              }
                            }}
                            className="w-full py-2.5 rounded-xl bg-blue-500 text-white text-xs font-bold active:scale-[0.98] transition-transform"
                          >
                            שלח דירוג ⭐
                          </button>
                        )}
                      </>
                    )}
                  </motion.div>
                )}
              </>
            )}

            {/* ── LAPS TAB ───────────────────────────────────────────── */}
            {completedLaps.length > 0 && activeTab === 'laps' && (
              <motion.div
                initial={{ y: 12, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.25 }}
                className="space-y-4"
              >
                {/* Per-lap pace chart — inline SVG, no chart library. */}
                <LapPaceChart laps={completedLaps} />

                {/* Lap list — passed as prop so the summary uses a static
                    snapshot and skips the 1 Hz force-update interval the
                    live-workout HUD relies on. */}
                <div
                  className="bg-gray-50 rounded-xl shadow-sm overflow-hidden"
                  style={{ height: '300px' }}
                >
                  <div className="px-6 py-4 border-b border-gray-200">
                    <h2 className="text-lg font-bold text-gray-900">פירוט הקפות</h2>
                  </div>
                  <div className="h-[calc(300px-4rem)] overflow-y-auto">
                    <RunLapsList laps={laps} />
                  </div>
                </div>
              </motion.div>
            )}

            {/* Action Buttons - Fixed at bottom of scrollable card */}
            <div
              className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4 flex gap-3 shadow-lg -mx-6 -mb-6 mt-6"
              style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
            >
              <button
                onClick={handleShare}
                className="px-4 py-4 rounded-xl font-bold bg-gray-100 text-gray-700 hover:bg-gray-200 transition-all shadow-sm min-h-[44px] flex items-center justify-center gap-2 pointer-events-auto"
              >
                <Share2 size={20} />
                שתף
              </button>
              {/* Delete trigger — only for the read-only (historical) view,
                  and only when the caller actually wired an onDelete (i.e.
                  WORKOUT_DELETE_EXPANDED_ENABLED at the call site). This
                  component doesn't own the confirm/delete flow — tapping
                  just calls the caller's onDelete(), same contract as the
                  prop's doc comment above. */}
              {isReadOnly && onDelete && (
                <button
                  type="button"
                  onClick={onDelete}
                  aria-label="מחק אימון"
                  className="px-4 py-4 rounded-xl font-bold bg-red-50 text-red-500 hover:bg-red-100 transition-all shadow-sm min-h-[44px] flex items-center justify-center gap-2 pointer-events-auto"
                >
                  <Trash2 size={20} />
                </button>
              )}
              <button
                onClick={handleSaveAndClose}
                className="flex-1 py-4 rounded-xl font-bold bg-[#00ADEF] text-white hover:bg-[#00D4EE] transition-all shadow-md hover:shadow-lg min-h-[44px] flex items-center justify-center gap-2 pointer-events-auto"
              >
                {isReadOnly ? (
                  <>
                    <span>סגור</span>
                  </>
                ) : (
                  <>
                    <Save size={20} />
                    שמור וסגור
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// LapPaceChart and MeasuredChartBox extracted to shared components
// (src/features/workout-engine/summary/components/shared/)

/**
 * CommuteSlimSummary
 * ──────────────────
 * The minimal "you arrived" surface rendered when a session was a
 * commute. Three pieces of information, one CTA, no celebration:
 *   • Hero: a Flag check-in icon + "הגעת ליעד" + the destination label
 *     (when known).
 *   • Stats row: total time + total distance.
 *   • XP chip: "+{xp} XP" — quiet acknowledgment that the streak still
 *     ticked. Skipped silently when the session XP rounded to zero.
 *   • Single primary CTA: "סיום" / "סגור" → handleSaveAndClose.
 *
 * The map block at the top is intentionally smaller (28vh vs 40vh in
 * the workout summary) — a commute summary is glance-sized, not
 * scroll-sized.
 */
function CommuteSlimSummary({
  totalDistance,
  totalDuration,
  xpEarned,
  commuteLabel,
  routeCoords,
  isReadOnly,
  onDismiss,
}: {
  totalDistance: number;
  totalDuration: number;
  xpEarned: number;
  commuteLabel: string | null;
  routeCoords: number[][];
  isReadOnly: boolean;
  onDismiss: () => void;
}) {
  const formatTime = (seconds: number): string => {
    if (!seconds || seconds < 0 || !Number.isFinite(seconds)) return '00:00';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const distanceText =
    totalDistance < 1
      ? `${Math.round(totalDistance * 1000)} מ׳`
      : `${totalDistance.toFixed(2)} ק״מ`;

  return (
    <div
      className="fixed inset-0 z-20 flex flex-col h-screen bg-gray-50 font-sans pointer-events-auto"
      style={{ fontFamily: 'var(--font-simpler)' }}
      dir="rtl"
    >
      {/* Compact map hero — 28vh keeps the focus on the arrival
          confirmation card below rather than on the route shape. */}
      <div className="relative w-full" style={{ height: '28vh' }}>
        {routeCoords.length > 0 ? (
          <RunMapBlock
            routeCoords={routeCoords}
            startCoord={routeCoords[0]}
            endCoord={routeCoords[routeCoords.length - 1]}
          />
        ) : (
          <div className="w-full h-full bg-gray-100" />
        )}
      </div>

      <div className="flex-1 overflow-y-auto pointer-events-auto relative z-[30]">
        <div className="bg-white rounded-t-[32px] shadow-2xl min-h-full">
          <div className="px-6 pt-8 pb-24">
            {/* Hero — arrival confirmation. Uses cyan (commute accent)
                rather than the workout green-checkmark, so the visual
                language stays consistent with the destination pin. */}
            <motion.div
              initial={{ y: 12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 220, damping: 22 }}
              className="flex flex-col items-center text-center mb-6"
            >
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center text-white mb-3"
                style={{
                  background: 'linear-gradient(135deg, #00E5FF 0%, #00ADEF 100%)',
                  boxShadow: '0 8px 22px rgba(0, 173, 239, 0.35)',
                }}
              >
                <Flag size={28} fill="white" strokeWidth={2.4} />
              </div>
              <h1 className="text-2xl font-black tracking-wide text-gray-900">הגעת ליעד</h1>
              {commuteLabel && (
                <p className="mt-1 text-sm font-semibold text-gray-500 max-w-[280px] truncate">
                  {commuteLabel}
                </p>
              )}
            </motion.div>

            {/* Compact stats row — time + distance only. */}
            <motion.div
              initial={{ y: 12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.08 }}
              className="grid grid-cols-2 rounded-2xl ring-1 ring-black/5 overflow-hidden bg-gray-50"
            >
              <SlimStat
                icon={<Clock size={16} className="text-[#0284C7]" />}
                label="זמן"
                value={formatTime(totalDuration)}
              />
              <div className="border-r border-black/5">
                <SlimStat
                  icon={<NavIcon size={16} className="text-[#0284C7]" />}
                  label="מרחק"
                  value={distanceText}
                />
              </div>
            </motion.div>

            {/* XP chip — only when the session paid out a non-zero
                amount. Kept deliberately small so it reads as
                acknowledgement, not celebration. */}
            {xpEarned > 0 && (
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.16, type: 'spring', stiffness: 280, damping: 22 }}
                className="mt-4 flex items-center justify-center"
              >
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-cyan-50 ring-1 ring-cyan-100">
                  <Sparkles size={12} className="text-[#00ADEF]" />
                  <span className="text-xs font-black text-[#0284C7] tabular-nums">
                    +{xpEarned} XP
                  </span>
                </div>
              </motion.div>
            )}

            {/* Single primary CTA — sticky to the bottom of the card so
                it's reachable without scrolling on small phones. */}
            <div
              className="sticky bottom-0 bg-white px-0 py-4 mt-8 flex"
              style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
            >
              <button
                type="button"
                onClick={onDismiss}
                className="w-full py-4 rounded-xl font-bold bg-[#00ADEF] text-white hover:bg-[#00D4EE] transition-all shadow-md min-h-[44px] flex items-center justify-center gap-2 pointer-events-auto"
              >
                {isReadOnly ? 'סגור' : 'סיום'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SlimStat({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="px-4 py-4 text-center">
      <div className="flex items-center justify-center gap-1.5 text-gray-500 mb-1">
        {icon}
        <span className="text-[11px] font-bold uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-xl font-black text-gray-900 tabular-nums" dir="ltr">
        {value}
      </div>
    </div>
  );
}
