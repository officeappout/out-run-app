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
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Dumbbell, Timer, Tag, Clock, CalendarDays, Users } from 'lucide-react';
import { DrumTimePicker } from '@/components/ui/DrumTimePicker';
import { useActivityStore } from '@/features/activity/store/useActivityStore';
import { upsertScheduleEntry } from '@/features/user/scheduling/services/userSchedule.service';
import { toISODate } from '@/features/user/scheduling/utils/dateUtils';
import { createWorkoutPost } from '@/features/social/services/feed.service';
import { extractFeedScope, extractGroupIds } from '@/features/social/services/feed-scope.utils';
import { useUserStore } from '@/features/user';
import { usePrivacyStore } from '@/features/safecity/store/usePrivacyStore';
import { useGPSStore } from '@/features/parks/core/store/useGPSStore';
import { createPlannedSession } from '@/features/admin/services/planned-sessions.service';
import { auth } from '@/lib/firebase';
import { g } from '@/lib/utils/gendered-text';
import { WalkingIcon, RunIcon, MuscleIcon, getProgramIcon, ICON_MAP } from '@/features/content/programs/core/program-icon.util';
import type { ActivityCategory } from '@/features/activity/types/activity.types';
import type { ScheduleActivityCategory } from '@/features/user/scheduling/types/schedule.types';
import type { ActivityType } from '@/features/parks/core/types/route.types';
import { WORKOUT_TYPE_MAPPING, type BuilderWorkoutType } from '@/features/home/constants/workout-type-mapping';

interface AddWorkoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetDate?: string;
  userId?: string;
  onSaved?: () => void;
  /** Edit mode — pre-populate the form and update in-place instead of creating. */
  initialEntryId?: string;
  initialType?: WorkoutType;
  initialProgramId?: string;
  initialStartTime?: string;
  /** Optional: open the Smart Workout Builder sheet instead of navigating to /workout-builder */
  onOpenBuilder?: (params: { mode: string; date: string; defaultDuration?: string; defaultProgramIds?: string }) => void;
}

type WorkoutType = BuilderWorkoutType;

// Pure type→category contract lives in workout-type-mapping.ts (unit-tested);
// this array only adds the presentation layer (labels + icons).
const TYPE_OPTIONS: Array<{ value: WorkoutType; label: string; icon: React.ReactNode; activityCategory: ActivityCategory; scheduleCategory: ScheduleActivityCategory; activityType: ActivityType }> = [
  { value: 'strength', label: 'כוח',    icon: <MuscleIcon className="w-6 h-6" />,  ...WORKOUT_TYPE_MAPPING.strength },
  { value: 'running',  label: 'ריצה',   icon: <RunIcon className="w-6 h-6" />,     ...WORKOUT_TYPE_MAPPING.running },
  { value: 'walking',  label: 'הליכה',  icon: <WalkingIcon className="w-6 h-6" />, ...WORKOUT_TYPE_MAPPING.walking },
];

// ── Drum time picker constants kept for reference ───────────────────────────
// (DrumTimePicker component is imported from @/components/ui/DrumTimePicker)

const HEBREW_DAY_NAMES: Record<number, string> = {
  0: 'ראשון', 1: 'שני', 2: 'שלישי', 3: 'רביעי', 4: 'חמישי', 5: 'שישי', 6: 'שבת',
};

function getNextFullHour(): string {
  const now = new Date();
  let h = now.getHours() + 1;
  // Clamp to the drum picker's range (05–22)
  if (h < 5)  h = 5;
  if (h > 22) h = 22;
  return `${String(h).padStart(2, '0')}:00`;
}

function formatTargetDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  const day = HEBREW_DAY_NAMES[d.getDay()] ?? '';
  return `יום ${day}, ${d.getDate()}/${d.getMonth() + 1}`;
}

// Stable empty fallbacks — must live OUTSIDE the component so Zustand's
// getSnapshot always returns the same reference when the field is absent,
// preventing the "result of getSnapshot should be cached" infinite loop.
const EMPTY_PROGRAMS: Array<{ templateId: string; name?: string }> = [];
const EMPTY_TRACKS: Record<string, { currentLevel?: number }> = {};

export default function AddWorkoutModal({
  isOpen,
  onClose,
  targetDate,
  userId,
  onSaved,
  initialEntryId,
  initialType,
  initialProgramId,
  initialStartTime,
  onOpenBuilder,
}: AddWorkoutModalProps) {
  const router = useRouter();
  const isEditMode = !!initialEntryId;
  const defaultTime = useMemo(() => getNextFullHour(), []);
  const weeklySummary = useActivityStore((s) => s.weeklySummary);
  const logWorkout = useActivityStore((s) => s.logWorkout);
  const profile = useUserStore((s) => s.profile);
  const gender = useUserStore((s) => s.profile?.core?.gender ?? 'male');
  const activePrograms = useUserStore((s) => s.profile?.progression?.activePrograms ?? EMPTY_PROGRAMS) as Array<{ templateId: string; name?: string }>;
  const tracks = useUserStore((s) => s.profile?.progression?.tracks ?? EMPTY_TRACKS) as Record<string, { currentLevel?: number }>;
  const lastWorkoutProgramId = useActivityStore((s) => (s as any).history?.find((h: any) => h.category === 'strength')?.programId ?? null) as string | null;

  const [title, setTitle] = useState('');
  const [type, setType] = useState<WorkoutType>('strength');
  const [selectedProgramId, setSelectedProgramId] = useState<string | null>(null);
  const [duration, setDuration] = useState(30);
  const [startTime, setStartTime] = useState(defaultTime);
  const [saving, setSaving] = useState(false);
  const [shareWithCommunity, setShareWithCommunity] = useState(false);

  useEffect(() => {
    if (!isOpen) setShareWithCommunity(false);
  }, [isOpen]);

  // Edit mode: pre-populate form from initial props
  useEffect(() => {
    if (isOpen && isEditMode) {
      if (initialType) setType(initialType);
      if (initialStartTime) setStartTime(initialStartTime);
      if (initialProgramId) setSelectedProgramId(initialProgramId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && type === 'strength' && !isEditMode) {
      setSelectedProgramId(
        lastWorkoutProgramId
          ?? activePrograms[0]?.templateId
          ?? sortedTracks[0]?.id
          ?? null,
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const sortedTracks = useMemo(() => {
    const entries = Object.entries(tracks).map(([id, data]) => ({
      id,
      level: data.currentLevel ?? 1,
    }));

    const pinned: typeof entries = [];
    const activeProgramId = activePrograms[0]?.templateId;

    if (lastWorkoutProgramId) {
      const found = entries.find((e) => e.id === lastWorkoutProgramId);
      if (found) pinned.push(found);
    }

    if (activeProgramId && !pinned.find((p) => p.id === activeProgramId)) {
      const found = entries.find((e) => e.id === activeProgramId);
      if (found) pinned.push(found);
    }

    const pinnedIds = new Set(pinned.map((p) => p.id));
    const rest = entries
      .filter((e) => !pinnedIds.has(e.id))
      .sort((a, b) => b.level - a.level);

    return [...pinned, ...rest];
  }, [tracks, lastWorkoutProgramId, activePrograms]);

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
    if (isOpen && targetDate && recommendedType && !isEditMode) {
      setType(recommendedType);
    }
  }, [isOpen, targetDate, recommendedType, isEditMode]);

  const handleSave = useCallback(async () => {
    if (saving) return;
    setSaving(true);

    const opt = TYPE_OPTIONS.find((o) => o.value === type);
    const schedCat = opt?.scheduleCategory ?? 'strength';
    const dateForEntry = targetDate || toISODate(new Date());
    const isTodayOrPast = new Date(dateForEntry + 'T00:00:00') <= new Date(new Date().setHours(0, 0, 0, 0));

    // Only log to ActivityStore for today/past (rings = actual achievement)
    // Skip in edit mode — we're updating the schedule, not logging a new activity
    if (isTodayOrPast && !isEditMode) {
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
          // In edit mode, preserve the existing entryId so Firestore updates in-place
          ...(isEditMode && initialEntryId ? { entryId: initialEntryId } : {}),
          programIds: type === 'strength' && selectedProgramId ? [selectedProgramId] : [],
          type: 'training',
          source: 'manual',
          completed: false,
          scheduledCategories: [schedCat],
          startTime,
        });
        writeOk = true;
        console.log(`[AddWorkoutModal] ✅ ${isEditMode ? 'Updated' : 'Saved'} ${schedCat} on ${dateForEntry}`);

        // Auto-publish feed post (fire-and-forget, today/past only, skip in edit mode)
        if (isTodayOrPast && !isEditMode && userId && profile?.core?.name) {
          const scope = extractFeedScope(profile);
          createWorkoutPost({
            authorUid: userId,
            authorName: profile.core.name,
            activityCategory: opt?.activityCategory ?? 'strength',
            durationMinutes: duration,
            title: title || undefined,
            ...scope,
            groupIds: extractGroupIds(profile),
          }).catch(() => {});
        }

        // Partner Finder hook — create a discoverable planned session so
        // others looking for a training partner can see this user on the map.
        if (shareWithCommunity && auth.currentUser) {
          try {
            const [hh, mm] = (startTime || '00:00').split(':');
            const startDate = new Date(`${dateForEntry}T00:00:00`);
            startDate.setHours(parseInt(hh, 10) || 0, parseInt(mm, 10) || 0, 0, 0);
            const activeProgram = useUserStore.getState()
              .profile?.progression?.activePrograms?.[0];

            // Best-effort GPS from the shared store (driven by useGPS). If no
            // fix is available the session is created without coords — we never
            // block session creation on a fresh permission prompt here.
            const gpsFix = useGPSStore.getState().coords;
            const lat: number | null = gpsFix?.lat ?? null;
            const lng: number | null = gpsFix?.lng ?? null;

            // The new schema requires `endTime` on every planned
            // session. Manual entries have an explicit `duration`
            // (minutes) on the modal, so we use it directly — that
            // produces a more accurate window than the 1-hour
            // fallback the service would otherwise apply. Program
            // info is captured here too so the partner card can
            // render "🎯 program · רמה N" for these arrivals.
            const endDate = new Date(startDate.getTime() + duration * 60 * 1000);
            const programName = activeProgram?.name ?? undefined;
            const programLevel = activeProgram?.templateId
              ? useUserStore.getState().profile?.progression?.tracks?.[
                  activeProgram.templateId
                ]?.currentLevel
              : undefined;

            await createPlannedSession({
              userId: auth.currentUser.uid,
              displayName: auth.currentUser.displayName
                ?? auth.currentUser.email
                ?? 'משתמש',
              photoURL: auth.currentUser.photoURL,
              routeId: '',
              ...(programName ? { programName } : {}),
              ...(typeof programLevel === 'number' ? { programLevel } : {}),
              activityType: opt?.activityType ?? 'workout',
              level: activeProgram ? 'intermediate' : 'beginner',
              startTime: startDate,
              endTime: endDate,
              privacyMode: usePrivacyStore.getState().mode,
              lat,
              lng,
            });
          } catch (err) {
            console.error('[AddWorkoutModal] createPlannedSession failed:', err);
          }
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
    setShareWithCommunity(false);
    setSaving(false);

    // Close modal, then trigger parent refresh so grid/agenda re-fetch instantly
    onClose();
    setTimeout(() => { onSaved?.(); }, writeOk ? 80 : 300);
  }, [saving, title, type, duration, startTime, selectedProgramId, onClose, logWorkout, userId, targetDate, onSaved, profile, shareWithCommunity]);

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
              <h3 className="text-base font-black text-gray-900">{isEditMode ? 'ערוך אימון' : 'הוסף אימון'}</h3>
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
              {/* Time — drum / scroll picker */}
              <div>
                <label className="flex items-center gap-1.5 text-xs font-bold text-gray-500 mb-1.5">
                  <Clock className="w-3.5 h-3.5" /> שעה <span className="text-red-400">*</span>
                </label>
                <DrumTimePicker value={startTime} onChange={setStartTime} />
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
                  {TYPE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setType(opt.value)}
                      className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all active:scale-95 flex flex-col items-center gap-0.5 ${
                        type === opt.value
                          ? 'bg-[#00C9F2]/10 text-[#00C9F2] ring-2 ring-[#00C9F2]/30'
                          : 'bg-gray-50 text-gray-500 border border-gray-100'
                      }`}
                    >
                      {opt.icon}
                      <span className="text-[10px]">{opt.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Program selector — strength only */}
              {type === 'strength' && sortedTracks.length > 0 && (
                <div
                  className="flex gap-2 overflow-x-auto [&::-webkit-scrollbar]:hidden"
                  style={{ scrollbarWidth: 'none' }}
                >
                  {sortedTracks.map((track) => {
                    const iconMapEntry = (ICON_MAP as Record<string, { label: string }>)[track.id];
                    console.log('[AddWorkoutModal] track.id:', track.id, 'ICON_MAP entry:', iconMapEntry);
                    const isSelected = selectedProgramId === track.id;
                    return (
                      <button
                        key={track.id}
                        onClick={() => setSelectedProgramId(track.id)}
                        className={`flex-shrink-0 flex items-center px-3 py-1.5 rounded-xl text-xs transition-all active:scale-95 ${
                          isSelected
                            ? 'bg-[#00C9F2]/10 ring-2 ring-[#00C9F2]/30'
                            : 'bg-gray-50 border border-gray-100'
                        }`}
                      >
                        <span
                          className="flex items-center gap-1.5"
                          style={{ color: isSelected ? '#00C9F2' : '#1f2937' }}
                        >
                          {getProgramIcon(track.id, 'w-4 h-4')}
                          <span style={{ fontWeight: isSelected ? 700 : 500 }}>
                            {iconMapEntry?.label ?? track.id}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Duration — continuous range slider */}
              <div>
                <label className="flex items-center justify-between gap-1.5 text-xs font-bold text-gray-500 mb-2">
                  <span className="flex items-center gap-1.5">
                    <Timer className="w-3.5 h-3.5" /> משך
                  </span>
                  <span className="text-[#00C9F2] tabular-nums">{duration} דק׳</span>
                </label>
                <div dir="rtl">
                  <input
                    type="range"
                    min={10}
                    max={120}
                    step={5}
                    value={duration}
                    onChange={(e) => setDuration(Number(e.target.value))}
                    className="w-full h-1.5 rounded-full appearance-none cursor-pointer
                      bg-gray-200
                      [&::-webkit-slider-thumb]:appearance-none
                      [&::-webkit-slider-thumb]:w-5
                      [&::-webkit-slider-thumb]:h-5
                      [&::-webkit-slider-thumb]:rounded-full
                      [&::-webkit-slider-thumb]:bg-[#00C9F2]
                      [&::-webkit-slider-thumb]:shadow-md
                      [&::-webkit-slider-thumb]:shadow-cyan-400/40
                      [&::-moz-range-thumb]:w-5
                      [&::-moz-range-thumb]:h-5
                      [&::-moz-range-thumb]:rounded-full
                      [&::-moz-range-thumb]:bg-[#00C9F2]
                      [&::-moz-range-thumb]:border-0"
                    style={{
                      background: `linear-gradient(to right, #e5e7eb ${100 - ((duration - 10) / 110) * 100}%, #00C9F2 ${100 - ((duration - 10) / 110) * 100}%)`,
                    }}
                  />
                  <div className="flex justify-between text-[10px] text-gray-900 font-bold mt-1 tabular-nums">
                    <span>10׳</span>
                    <span>60׳</span>
                    <span>120׳</span>
                  </div>
                </div>
              </div>

              {/* Share with community — Partner Finder entry point */}
              <button
                type="button"
                onClick={() => setShareWithCommunity((v) => !v)}
                className="w-full flex items-center gap-3 px-3 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-right active:scale-[0.99] transition-all"
                aria-pressed={shareWithCommunity}
              >
                <div className="flex-shrink-0">
                  <Users size={16} color="#00ADEF" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold text-gray-900 leading-tight">
                    {g(gender, 'שתף עם הקהילה', 'שתפי עם הקהילה')} — חפש שותף לאימון
                  </div>
                  <div className="text-[10px] text-gray-500 mt-0.5 leading-tight">
                    {g(
                      gender,
                      'תופיע לאחרים שמחפשים שותף',
                      'תופיעי לאחרים שמחפשים שותפה',
                    )}
                  </div>
                </div>
                <div
                  className={`flex-shrink-0 w-9 h-5 rounded-full transition-colors relative ${
                    shareWithCommunity ? 'bg-[#0CF2E3]' : 'bg-gray-300'
                  }`}
                >
                  <div
                    className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${
                      shareWithCommunity ? 'left-0.5' : 'left-[18px]'
                    }`}
                  />
                </div>
              </button>

              {/* Save */}
              <button
                onClick={handleSave}
                disabled={!startTime || saving}
                className="w-full py-3 bg-[#00C9F2] hover:bg-[#00B4D8] text-white font-bold rounded-xl shadow-lg shadow-cyan-500/25 transition-all active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none"
              >
                {saving ? 'שומר...' : isEditMode ? 'עדכן' : 'שמור'}
              </button>

              {/* Secondary CTA — open Smart Workout Builder with schedule context */}
              {type === 'strength' && !isEditMode && (
                <button
                  type="button"
                  onClick={() => {
                    const date = targetDate || toISODate(new Date());
                    onClose();
                    if (onOpenBuilder) {
                      onOpenBuilder({
                        mode: 'schedule',
                        date,
                        defaultDuration: String(duration),
                        defaultProgramIds: selectedProgramId ?? undefined,
                      });
                    } else {
                      const params = new URLSearchParams({
                        mode: 'schedule',
                        date,
                        defaultDuration: String(duration),
                      });
                      if (selectedProgramId) params.set('defaultProgramIds', selectedProgramId);
                      router.push(`/workout-builder?${params.toString()}`);
                    }
                  }}
                  className="w-full py-2.5 text-sm font-bold text-[#0284c7] bg-cyan-50 hover:bg-cyan-100 rounded-xl border border-cyan-200 transition-all active:scale-[0.98]"
                >
                  בנה אימון מותאם ←
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
