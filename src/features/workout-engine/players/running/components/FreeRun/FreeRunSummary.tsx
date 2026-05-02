'use client';

import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useEffect, useState, type ReactNode } from 'react';
import { CheckCircle, Save, Share2, Coins, Flag, Clock, Navigation as NavIcon, Sparkles } from 'lucide-react';
import { useSessionStore } from '@/features/workout-engine/core/store/useSessionStore';
import { useRunningPlayer } from '@/features/workout-engine/players/running/store/useRunningPlayer';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { useProgressionStore } from '@/features/user/progression/store/useProgressionStore';
import { formatPace } from '@/features/workout-engine/core/utils/formatPace';
import RunLapsList from './RunLapsList';
import { IS_COIN_SYSTEM_ENABLED } from '@/config/feature-flags';
import RunMapBlock from '@/features/workout-engine/summary/components/running/RunMapBlock';
import SummaryStatsGrid from '@/features/workout-engine/summary/components/shared/SummaryStatsGrid';
import { createContribution } from '@/features/parks/core/services/contribution.service';
import { XP_REWARDS } from '@/types/contribution.types';
import type { WorkoutHistoryEntry } from '@/features/workout-engine/core/services/storage.service';

interface FreeRunSummaryProps {
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
  const { profile } = useUserStore();

  // Data source priority:
  //   1. isReadOnly + workout prop  → historical view from profile
  //   2. savedWorkoutSnapshot        → live session confirmed snapshot from finishWorkout
  //   3. session store / player       → fallback (e.g. snapshot not yet available)
  const confirmedSource = !isReadOnly ? savedWorkoutSnapshot : null;
  const historySource  = isReadOnly && workout ? workout : null;

  const totalDistance = historySource?.distance ?? confirmedSource?.distance ?? sessionDistance;
  const totalDuration = historySource?.duration ?? confirmedSource?.duration ?? sessionDuration;
  const laps = historySource ? [] : (confirmedSource?.laps ?? sessionLaps);
  
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

      {/* Map Hero - Fixed at top, 40% of screen */}
      <div className="relative w-full" style={{ height: '40vh', minHeight: '40vh', maxHeight: '40vh' }}>
        {routeCoords.length > 0 ? (
          <div className="w-full h-full">
            <RunMapBlock
              routeCoords={routeCoords}
              startCoord={routeCoords[0]}
              endCoord={routeCoords[routeCoords.length - 1]}
            />
          </div>
        ) : (
          <div className="w-full h-full bg-gray-200 flex items-center justify-center">
            <p className="text-gray-400">אין נתוני מסלול</p>
          </div>
        )}
      </div>

      {/* Scrollable Details Card - Starts below map, covers rest of screen */}
      <div className="flex-1 overflow-y-auto pointer-events-auto relative z-[30]">
        <div className="bg-white rounded-t-[32px] shadow-2xl min-h-full">
          <div className="px-6 pt-6 pb-24 space-y-6">
            {/* Header */}
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 200, damping: 20 }}
              className="flex items-center justify-center gap-3 mb-2"
            >
              <CheckCircle size={32} className="text-[#00ADEF]" fill="currentColor" />
              <h1 className="text-2xl font-black tracking-wide text-gray-900">אימון הושלם!</h1>
            </motion.div>
            <p className="text-center text-gray-500 text-sm mb-4">כל הכבוד על ההתמדה</p>

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
                  delay: 0.2 
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

            {/* Stats Grid — shared component used by all summary screens */}
            <SummaryStatsGrid
              time={totalDuration}
              distance={totalDistance}
              calories={calories}
              pace={avgPace > 0 ? avgPace : currentPace}
              elevationGain={
                (confirmedSource?.elevationGain ?? (historySource as any)?.elevationGain) || undefined
              }
            />

            {/* Laps Table */}
            {laps.length > 0 && (
              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="bg-gray-50 rounded-xl shadow-sm overflow-hidden"
                style={{ height: '300px' }}
              >
                <div className="px-6 py-4 border-b border-gray-200">
                  <h2 className="text-lg font-bold text-gray-900">פירוט הקפות</h2>
                </div>
                <div className="h-[calc(300px-4rem)] overflow-y-auto">
                  <RunLapsList />
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

            {/* Action Buttons - Fixed at bottom of scrollable card */}
            <div
              className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4 flex gap-3 shadow-lg -mx-6 -mb-6 mt-6"
              style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
            >
              {!isReadOnly && (
                <button
                  onClick={handleShare}
                  className="px-4 py-4 rounded-xl font-bold bg-gray-100 text-gray-700 hover:bg-gray-200 transition-all shadow-sm min-h-[44px] flex items-center justify-center gap-2 pointer-events-auto"
                >
                  <Share2 size={20} />
                  שתף
                </button>
              )}
              <button
                onClick={handleSaveAndClose}
                className={`${isReadOnly ? 'w-full' : 'flex-1'} py-4 rounded-xl font-bold bg-[#00ADEF] text-white hover:bg-[#00D4EE] transition-all shadow-md hover:shadow-lg min-h-[44px] flex items-center justify-center gap-2 pointer-events-auto`}
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
