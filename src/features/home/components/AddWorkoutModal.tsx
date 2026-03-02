'use client';

/**
 * AddWorkoutModal — Smart form with date-locking and recommended type.
 *
 * When opened via an inline (+) on a specific day:
 *   - Date is locked & displayed at the top
 *   - Type auto-selects to the one with the largest remaining weekly gap
 *
 * On save:
 *   1. Writes schedule entry to Firestore (via upsertScheduleEntry)
 *   2. Logs activity to ActivityStore (rings update immediately)
 *   3. Calls onSaved() so parent bumps refreshKey → AgendaDayCard re-fetches
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Dumbbell, Timer, Tag, Clock, Star, CalendarDays } from 'lucide-react';
import { useActivityStore } from '@/features/activity/store/useActivityStore';
import { upsertScheduleEntry } from '@/features/user/scheduling/services/userSchedule.service';
import { toISODate } from '@/features/user/scheduling/utils/dateUtils';
import { createWorkoutPost } from '@/features/social/services/feed.service';
import { extractFeedScope } from '@/features/social/services/feed-scope.utils';
import { useUserStore } from '@/features/user';
import type { ActivityCategory } from '@/features/activity/types/activity.types';
import type { ScheduleActivityCategory } from '@/features/user/scheduling/types/schedule.types';

interface AddWorkoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetDate?: string;
  userId?: string;
  onSaved?: () => void;
}

type WorkoutType = 'strength' | 'running' | 'other';

const TYPE_OPTIONS: Array<{ value: WorkoutType; label: string; icon: string; activityCategory: ActivityCategory; scheduleCategory: ScheduleActivityCategory }> = [
  { value: 'strength', label: 'כוח',  icon: '💪', activityCategory: 'strength', scheduleCategory: 'strength' },
  { value: 'running',  label: 'ריצה', icon: '🏃', activityCategory: 'cardio',   scheduleCategory: 'cardio' },
  { value: 'other',    label: 'אחר',  icon: '⚡', activityCategory: 'maintenance', scheduleCategory: 'maintenance' },
];

const DURATION_PRESETS = [15, 30, 45, 60, 90];

const HEBREW_DAY_NAMES: Record<number, string> = {
  0: 'ראשון', 1: 'שני', 2: 'שלישי', 3: 'רביעי', 4: 'חמישי', 5: 'שישי', 6: 'שבת',
};

function getNextFullHour(): string {
  const now = new Date();
  const next = new Date(now);
  next.setMinutes(0, 0, 0);
  next.setHours(now.getHours() + 1);
  return `${String(next.getHours()).padStart(2, '0')}:${String(next.getMinutes()).padStart(2, '0')}`;
}

function formatTargetDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  const day = HEBREW_DAY_NAMES[d.getDay()] ?? '';
  return `יום ${day}, ${d.getDate()}/${d.getMonth() + 1}`;
}

export default function AddWorkoutModal({
  isOpen,
  onClose,
  targetDate,
  userId,
  onSaved,
}: AddWorkoutModalProps) {
  const defaultTime = useMemo(() => getNextFullHour(), []);
  const weeklySummary = useActivityStore((s) => s.weeklySummary);
  const logWorkout = useActivityStore((s) => s.logWorkout);
  const profile = useUserStore((s) => s.profile);

  const [title, setTitle] = useState('');
  const [type, setType] = useState<WorkoutType>('strength');
  const [duration, setDuration] = useState(30);
  const [startTime, setStartTime] = useState(defaultTime);
  const [saving, setSaving] = useState(false);

  const recommendedType = useMemo<WorkoutType | null>(() => {
    if (!weeklySummary) return null;
    const gaps = TYPE_OPTIONS.map((opt) => {
      const total = weeklySummary.categoryTotals[opt.activityCategory] ?? 0;
      const goal  = weeklySummary.categoryGoals[opt.activityCategory]  ?? 0;
      return { type: opt.value, remaining: Math.max(0, goal - total) };
    });
    gaps.sort((a, b) => b.remaining - a.remaining);
    return gaps[0]?.remaining > 0 ? gaps[0].type : null;
  }, [weeklySummary]);

  useEffect(() => {
    if (isOpen && targetDate && recommendedType) {
      setType(recommendedType);
    }
  }, [isOpen, targetDate, recommendedType]);

  const handleSave = useCallback(async () => {
    if (saving) return;
    setSaving(true);

    const opt = TYPE_OPTIONS.find((o) => o.value === type);
    const schedCat = opt?.scheduleCategory ?? 'strength';
    const dateForEntry = targetDate || toISODate(new Date());
    const isTodayOrPast = new Date(dateForEntry + 'T00:00:00') <= new Date(new Date().setHours(0, 0, 0, 0));

    // Only log to ActivityStore for today/past (rings = actual achievement)
    if (isTodayOrPast) {
      const activityCat = opt?.activityCategory ?? 'strength';
      logWorkout(activityCat, duration);
    }

    // Write to Firestore — positions the icon, does NOT mark completed
    let writeOk = false;
    if (userId) {
      try {
        await upsertScheduleEntry({
          userId,
          date: dateForEntry,
          programIds: [],
          type: 'training',
          source: 'manual',
          completed: false,
          scheduledCategories: [schedCat],
          startTime,
        });
        writeOk = true;
        console.log(`[AddWorkoutModal] ✅ Saved ${schedCat} on ${dateForEntry}`);

        // Auto-publish feed post (fire-and-forget, today/past only)
        if (isTodayOrPast && userId && profile?.core?.name) {
          const scope = extractFeedScope(profile);
          createWorkoutPost({
            authorUid: userId,
            authorName: profile.core.name,
            activityCategory: opt?.activityCategory ?? 'strength',
            durationMinutes: duration,
            title: title || undefined,
            ...scope,
          }).catch(() => {});
        }
      } catch (err) {
        console.error('[AddWorkoutModal] Firestore write failed:', err);
      }
    }

    // Reset form state
    setTitle('');
    setType('strength');
    setDuration(30);
    setStartTime(getNextFullHour());
    setSaving(false);

    // Close modal, then trigger parent refresh so grid/agenda re-fetch instantly
    onClose();
    setTimeout(() => { onSaved?.(); }, writeOk ? 80 : 300);
  }, [saving, title, type, duration, startTime, onClose, logWorkout, userId, targetDate, onSaved]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 340, damping: 34 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-white rounded-t-3xl shadow-2xl overflow-hidden"
            style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
            dir="rtl"
          >
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-gray-200" />
            </div>

            <div className="flex items-center justify-between px-5 pb-2">
              <h3 className="text-base font-black text-gray-900">הוסף אימון</h3>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg bg-gray-100 text-gray-400 hover:bg-gray-200 active:scale-90 transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {targetDate && (
              <div className="mx-5 mb-3 flex items-center gap-2 px-3 py-2 bg-cyan-50 dark:bg-cyan-900/20 rounded-xl">
                <CalendarDays className="w-4 h-4 text-cyan-500" />
                <span className="text-xs font-bold text-cyan-700 dark:text-cyan-300">{formatTargetDate(targetDate)}</span>
              </div>
            )}

            <div className="px-5 space-y-4 pb-4">
              {/* Time */}
              <div>
                <label className="flex items-center gap-1.5 text-xs font-bold text-gray-500 mb-1.5">
                  <Clock className="w-3.5 h-3.5" /> שעה <span className="text-red-400">*</span>
                </label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  required
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm text-gray-900 font-bold tabular-nums text-center focus:outline-none focus:ring-2 focus:ring-cyan-400/40 focus:border-cyan-300 transition-all"
                />
              </div>

              {/* Title */}
              <div>
                <label className="flex items-center gap-1.5 text-xs font-bold text-gray-500 mb-1.5">
                  <Tag className="w-3.5 h-3.5" /> שם
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="לדוגמא: אימון גב + חזה"
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm text-gray-900 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-cyan-400/40 focus:border-cyan-300 transition-all"
                />
              </div>

              {/* Type */}
              <div>
                <label className="flex items-center gap-1.5 text-xs font-bold text-gray-500 mb-1.5">
                  <Dumbbell className="w-3.5 h-3.5" /> סוג
                </label>
                <div className="flex gap-2">
                  {TYPE_OPTIONS.map((opt) => {
                    const isRec = recommendedType === opt.value;
                    return (
                      <button
                        key={opt.value}
                        onClick={() => setType(opt.value)}
                        className={`relative flex-1 py-2 rounded-xl text-sm font-bold transition-all active:scale-95 ${
                          type === opt.value
                            ? 'bg-[#00C9F2]/10 text-[#00C9F2] ring-2 ring-[#00C9F2]/30'
                            : 'bg-gray-50 text-gray-500 border border-gray-100'
                        }`}
                      >
                        {isRec && (
                          <span className="absolute -top-2 left-1/2 -translate-x-1/2 flex items-center gap-0.5 px-1.5 py-0.5 bg-amber-400 text-white text-[8px] font-black rounded-full shadow-sm whitespace-nowrap">
                            <Star className="w-2 h-2 fill-current" /> מומלץ
                          </span>
                        )}
                        <span className="text-base">{opt.icon}</span>
                        <span className="block text-[10px] mt-0.5">{opt.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Duration */}
              <div>
                <label className="flex items-center gap-1.5 text-xs font-bold text-gray-500 mb-1.5">
                  <Timer className="w-3.5 h-3.5" /> משך
                </label>
                <div className="flex gap-1.5">
                  {DURATION_PRESETS.map((d) => (
                    <button
                      key={d}
                      onClick={() => setDuration(d)}
                      className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 ${
                        duration === d
                          ? 'bg-[#00C9F2]/10 text-[#00C9F2] ring-2 ring-[#00C9F2]/30'
                          : 'bg-gray-50 text-gray-500 border border-gray-100'
                      }`}
                    >
                      {d}׳
                    </button>
                  ))}
                </div>
              </div>

              {/* Save */}
              <button
                onClick={handleSave}
                disabled={!startTime || saving}
                className="w-full py-3 bg-[#00C9F2] hover:bg-[#00B4D8] text-white font-bold rounded-xl shadow-lg shadow-cyan-500/25 transition-all active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none"
              >
                {saving ? 'שומר...' : 'שמור'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
