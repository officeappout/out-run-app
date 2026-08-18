'use client';

/**
 * PlannedActivityComposeSheet — the unified "4 questions" compose flow
 * (type / where / when / visibility) that creates a `planned_sessions` doc.
 *
 * Single owning implementation for the map-"+" "יוצא להתאמן" entry point and
 * the promoted home-"+" entry point (Phase 1 of the social-activities build
 * plan, .claude/plans/new-chat-investigation-stateful-fern.md). Deliberately
 * separate from AddWorkoutModal (home's schedule-entry + optional-share
 * flow) rather than a forced merge — this sheet's only job is broadcasting
 * ephemeral intent, not writing a personal schedule entry.
 *
 * v1 simplification (documented, not silent): "where" is always a park
 * picker regardless of activity type, for every entry point that opens this
 * generic sheet. A route-scoped "where" for running/walking is intentionally
 * deferred to Phase 2, where the existing ShareAsLiveToggle call sites
 * (RouteDetailSheet / WorkoutPreviewScreen) already know their route and can
 * prefill it directly — building a full route-picker inside a brand-new
 * generic sheet was judged out of proportion for this slice.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Dumbbell, MapPin, Clock, Eye, AlertTriangle } from 'lucide-react';
import { DrumTimePicker } from '@/components/ui/DrumTimePicker';
import { useUserStore } from '@/features/user';
import { auth } from '@/lib/firebase';
import { g } from '@/lib/utils/gendered-text';
import { getParksByAuthority } from '@/features/admin/services/parks.service';
import { createPlannedSession } from '@/features/admin/services/planned-sessions.service';
import type { Park } from '@/features/parks/core/types/park.types';
import type { FitnessLevel, PrivacyMode } from '@/types/community.types';
import type { ActivityType } from '@/features/parks/core/types/route.types';
import { WalkingIcon, RunIcon, MuscleIcon, getProgramIcon, ICON_MAP } from '@/features/content/programs/core/program-icon.util';

export type ComposeActivityType = 'workout' | 'running' | 'walking';

interface PlannedActivityComposeSheetProps {
  isOpen: boolean;
  onClose: () => void;
  /** Optional context prefill — reserved for Phase 2's toggle rewiring. */
  initialType?: ComposeActivityType;
  onCreated?: (sessionId: string) => void;
}

// Real, distinct per-type ActivityType for planned_sessions — deliberately
// NOT reusing WORKOUT_TYPE_MAPPING (workout-type-mapping.ts), whose own
// `activityType` field collapses walking onto 'workout' (it only
// distinguishes 'workout'|'running', by design for presence/schedule
// stamping elsewhere). A planned-activity announcement needs the real
// 3-way distinction so the park drawer / partner finder / future push
// targeting can tell a walking arrival from a strength arrival.
const ACTIVITY_TYPE_FOR: Record<ComposeActivityType, ActivityType> = {
  workout: 'workout',
  running: 'running',
  walking: 'walking',
};

const TYPE_OPTIONS: Array<{ value: ComposeActivityType; label: string; icon: React.ReactNode }> = [
  { value: 'workout', label: 'כוח', icon: <MuscleIcon className="w-6 h-6" /> },
  { value: 'running', label: 'ריצה', icon: <RunIcon className="w-6 h-6" /> },
  { value: 'walking', label: 'הליכה', icon: <WalkingIcon className="w-6 h-6" /> },
];

const EMPTY_PROGRAMS: Array<{ templateId: string; name?: string }> = [];
const EMPTY_TRACKS: Record<string, { currentLevel?: number }> = {};

function getNextFullHour(): string {
  const now = new Date();
  let h = now.getHours() + 1;
  if (h < 5) h = 5;
  if (h > 22) h = 22;
  return `${String(h).padStart(2, '0')}:00`;
}

/**
 * Numeric program level → FitnessLevel bucket.
 * ⚠️ PLACEHOLDER heuristic, not a grounded product decision — level scales
 * are not confirmed to be uniform across programs/domains. Flagged
 * explicitly for David's confirmation rather than silently trusted; see the
 * Phase 1 build report. Do not treat these thresholds as authoritative.
 */
function bucketProgramLevel(level: number): FitnessLevel {
  if (level >= 8) return 'advanced';
  if (level >= 4) return 'intermediate';
  return 'beginner';
}

export default function PlannedActivityComposeSheet({
  isOpen,
  onClose,
  initialType,
  onCreated,
}: PlannedActivityComposeSheetProps) {
  const router = useRouter();
  const profile = useUserStore((s) => s.profile);
  const gender = useUserStore((s) => s.profile?.core?.gender ?? 'male');
  const authorityId = useUserStore((s) => s.profile?.core?.authorityId ?? '');
  const activePrograms = useUserStore((s) => s.profile?.progression?.activePrograms ?? EMPTY_PROGRAMS) as Array<{ templateId: string; name?: string }>;
  const tracks = useUserStore((s) => s.profile?.progression?.tracks ?? EMPTY_TRACKS) as Record<string, { currentLevel?: number }>;

  const [type, setType] = useState<ComposeActivityType>(initialType ?? 'workout');
  const [parks, setParks] = useState<Park[]>([]);
  const [parksLoading, setParksLoading] = useState(false);
  const [selectedParkId, setSelectedParkId] = useState<string | null>(null);
  const [when, setWhen] = useState<'now' | 'scheduled'>('now');
  const [day, setDay] = useState<'today' | 'tomorrow'>('today');
  const [time, setTime] = useState(() => getNextFullHour());
  const [visibility, setVisibility] = useState<PrivacyMode>('verified_global');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setType(initialType ?? 'workout');
    setSelectedParkId(null);
    setWhen('now');
    setDay('today');
    setTime(getNextFullHour());
    setVisibility('verified_global');
  }, [isOpen, initialType]);

  useEffect(() => {
    if (!isOpen || !authorityId) return;
    setParksLoading(true);
    getParksByAuthority(authorityId)
      .then(setParks)
      .finally(() => setParksLoading(false));
  }, [isOpen, authorityId]);

  // Strength level derivation (Decision 2) — pinned/most-recent program
  // first, mirroring AddWorkoutModal's sortedTracks pattern.
  const sortedTracks = useMemo(() => {
    const entries = Object.entries(tracks).map(([id, data]) => ({
      id,
      level: data.currentLevel ?? 1,
    }));
    const activeProgramId = activePrograms[0]?.templateId;
    const pinned = activeProgramId ? entries.filter((e) => e.id === activeProgramId) : [];
    const pinnedIds = new Set(pinned.map((p) => p.id));
    const rest = entries.filter((e) => !pinnedIds.has(e.id)).sort((a, b) => b.level - a.level);
    return [...pinned, ...rest];
  }, [tracks, activePrograms]);

  const selectedTrack = sortedTracks[0] ?? null;
  const hasStrengthLevel = type !== 'workout' || !!selectedTrack;
  const derivedLevel: FitnessLevel | undefined = selectedTrack
    ? bucketProgramLevel(selectedTrack.level)
    : undefined;
  const programName = selectedTrack
    ? ((ICON_MAP as Record<string, { label: string }>)[selectedTrack.id]?.label ?? selectedTrack.id)
    : undefined;

  const selectedPark = parks.find((p) => p.id === selectedParkId) ?? null;
  const canSubmit = !!selectedPark && !saving && (type !== 'workout' || hasStrengthLevel);

  const handleSubmit = useCallback(async () => {
    if (!canSubmit || !selectedPark || !auth.currentUser) return;
    setSaving(true);
    try {
      let startTime = new Date();
      if (when === 'scheduled') {
        const [hh, mm] = time.split(':');
        startTime = new Date();
        if (day === 'tomorrow') startTime.setDate(startTime.getDate() + 1);
        startTime.setHours(parseInt(hh, 10) || 0, parseInt(mm, 10) || 0, 0, 0);
      }

      await createPlannedSession({
        userId: auth.currentUser.uid,
        displayName: auth.currentUser.displayName ?? auth.currentUser.email ?? 'משתמש',
        photoURL: auth.currentUser.photoURL,
        parkId: selectedPark.id,
        parkName: selectedPark.name,
        ...(programName ? { programName } : {}),
        ...(selectedTrack ? { programLevel: selectedTrack.level } : {}),
        activityType: ACTIVITY_TYPE_FOR[type],
        // Only strength carries a level (Decision 2) — never a guessed
        // default for running/walking.
        ...(type === 'workout' && derivedLevel ? { level: derivedLevel } : {}),
        startTime,
        privacyMode: visibility,
        lat: selectedPark.location?.lat ?? null,
        lng: selectedPark.location?.lng ?? null,
      }).then((id) => onCreated?.(id));

      onClose();
    } catch (err) {
      console.error('[PlannedActivityComposeSheet] createPlannedSession failed:', err);
    } finally {
      setSaving(false);
    }
  }, [canSubmit, selectedPark, when, day, time, type, derivedLevel, programName, selectedTrack, visibility, onClose, onCreated]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          // z-[100]: matches this sheet's live siblings on the map screen
          // (ContributionWizard, QuickReportSheet — see .cursorrules z-index
          // budget "Full-screen overlays"), its primary mount context.
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 340, damping: 34 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-white rounded-t-3xl shadow-2xl overflow-hidden max-h-[85vh] overflow-y-auto"
            style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
            dir="rtl"
          >
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-gray-200" />
            </div>

            <div className="flex items-center justify-between px-5 pb-2">
              <h3 className="text-base font-black text-gray-900">יוצא להתאמן</h3>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg bg-gray-100 text-gray-400 hover:bg-gray-200 active:scale-90 transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-5 space-y-4 pb-4">
              {/* Q1 — Type */}
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

              {/* Strength-only: level source / missing-level prompt */}
              {type === 'workout' && (
                hasStrengthLevel ? (
                  selectedTrack && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl">
                      {getProgramIcon(selectedTrack.id, 'w-4 h-4')}
                      <span className="text-xs font-bold text-gray-700">
                        {programName} · רמה {selectedTrack.level}
                      </span>
                    </div>
                  )
                ) : (
                  <div className="flex items-start gap-2 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-xl">
                    <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-amber-800 leading-tight">
                        {g(gender, 'עדיין לא הגדרת תוכנית/רמת כוח', 'עדיין לא הגדרת תוכנית/רמת כוח')}
                      </p>
                      <button
                        type="button"
                        onClick={() => { onClose(); router.push('/profile'); }}
                        className="mt-1.5 text-xs font-bold text-amber-700 underline underline-offset-2"
                      >
                        הגדר רמת כוח ←
                      </button>
                    </div>
                  </div>
                )
              )}

              {/* Q2 — Where (park picker, all types — see file header) */}
              <div>
                <label className="flex items-center gap-1.5 text-xs font-bold text-gray-500 mb-1.5">
                  <MapPin className="w-3.5 h-3.5" /> איפה <span className="text-red-400">*</span>
                </label>
                {parksLoading ? (
                  <div className="text-xs text-gray-400 py-2">טוען פארקים...</div>
                ) : parks.length === 0 ? (
                  <div className="text-xs text-gray-400 py-2">לא נמצאו פארקים עירוניים</div>
                ) : (
                  <div className="flex gap-2 overflow-x-auto [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
                    {parks.map((park) => (
                      <button
                        key={park.id}
                        onClick={() => setSelectedParkId(park.id)}
                        className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold transition-all active:scale-95 ${
                          selectedParkId === park.id
                            ? 'bg-[#00C9F2]/10 text-[#00C9F2] ring-2 ring-[#00C9F2]/30'
                            : 'bg-gray-50 text-gray-600 border border-gray-100'
                        }`}
                      >
                        {park.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Q3 — When */}
              <div>
                <label className="flex items-center gap-1.5 text-xs font-bold text-gray-500 mb-1.5">
                  <Clock className="w-3.5 h-3.5" /> מתי
                </label>
                <div className="flex gap-2 mb-2">
                  {(['now', 'scheduled'] as const).map((w) => (
                    <button
                      key={w}
                      onClick={() => setWhen(w)}
                      className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all active:scale-95 ${
                        when === w
                          ? 'bg-[#00C9F2]/10 text-[#00C9F2] ring-2 ring-[#00C9F2]/30'
                          : 'bg-gray-50 text-gray-500 border border-gray-100'
                      }`}
                    >
                      {w === 'now' ? 'עכשיו' : 'מתוזמן'}
                    </button>
                  ))}
                </div>
                {when === 'scheduled' && (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      {(['today', 'tomorrow'] as const).map((d) => (
                        <button
                          key={d}
                          onClick={() => setDay(d)}
                          className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition-all active:scale-95 ${
                            day === d
                              ? 'bg-[#00C9F2]/10 text-[#00C9F2] ring-2 ring-[#00C9F2]/30'
                              : 'bg-gray-50 text-gray-500 border border-gray-100'
                          }`}
                        >
                          {d === 'today' ? 'היום' : 'מחר'}
                        </button>
                      ))}
                    </div>
                    <DrumTimePicker value={time} onChange={setTime} />
                  </div>
                )}
              </div>

              {/* Q4 — Visibility (Decision 3: public/partners only, ghost stays unexposed) */}
              <div>
                <label className="flex items-center gap-1.5 text-xs font-bold text-gray-500 mb-1.5">
                  <Eye className="w-3.5 h-3.5" /> למי גלוי
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setVisibility('verified_global')}
                    className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all active:scale-95 ${
                      visibility === 'verified_global'
                        ? 'bg-[#00C9F2]/10 text-[#00C9F2] ring-2 ring-[#00C9F2]/30'
                        : 'bg-gray-50 text-gray-500 border border-gray-100'
                    }`}
                  >
                    כולם
                  </button>
                  <button
                    onClick={() => setVisibility('squad')}
                    className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all active:scale-95 ${
                      visibility === 'squad'
                        ? 'bg-[#00C9F2]/10 text-[#00C9F2] ring-2 ring-[#00C9F2]/30'
                        : 'bg-gray-50 text-gray-500 border border-gray-100'
                    }`}
                  >
                    שותפי אימון בלבד
                  </button>
                </div>
              </div>

              {/* Submit */}
              <button
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="w-full py-3 bg-[#00C9F2] hover:bg-[#00B4D8] text-white font-bold rounded-xl shadow-lg shadow-cyan-500/25 transition-all active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none"
              >
                {saving ? 'שומר...' : 'פרסם'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
