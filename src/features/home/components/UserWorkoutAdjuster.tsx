'use client';

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Trees, Home, Dumbbell, Zap, ZapOff, Star } from 'lucide-react';
import type { UserFullProfile } from '@/features/user/core/types/user.types';
import type { ExecutionLocation } from '@/features/content/exercises/core/exercise.types';
import type { DifficultyLevel, GeneratedWorkout } from '@/features/workout-engine/logic/WorkoutGenerator';
import { generateHomeWorkout } from '@/features/workout-engine/services/home-workout.service';
import { useWeeklyVolumeStore } from '@/features/workout-engine/core/store/useWeeklyVolumeStore';

// Known calisthenics skill program IDs → Hebrew labels
const SKILL_LABELS: Record<string, { label: string; emoji: string }> = {
  handstand:    { label: 'עמידת ידיים', emoji: '🤸' },
  front_lever:  { label: 'פרונט לבר',   emoji: '💫' },
  back_lever:   { label: 'בק לבר',      emoji: '🌀' },
  oap:          { label: 'משיכה חד ידנית', emoji: '💪' },
  muscle_up:    { label: 'מוסל אפ',     emoji: '🔥' },
  planche:      { label: 'פלאנש',       emoji: '⚡' },
  pull_up_pro:  { label: 'מתח מתקדם',   emoji: '🏋️' },
  l_sit:        { label: 'L-Sit',       emoji: '🧘' },
};

// ─── Types ──────────────────────────────────────────────────────────────────

interface UserWorkoutAdjusterProps {
  isOpen: boolean;
  onClose: () => void;
  userProfile: UserFullProfile;
  /**
   * Fired after the single workout is generated.
   * Parent should then immediately open WorkoutPreviewDrawer.
   */
  onApplyAndStart: (workout: GeneratedWorkout) => void;
  /** Pre-fill location from the current workout context */
  initialLocation?: ExecutionLocation;
}

// ─── Muscle Chip Config ──────────────────────────────────────────────────────

interface MuscleChip {
  id: string;
  label: string;
  emoji: string;
  domains: string[];
}

const MUSCLE_CHIPS: MuscleChip[] = [
  { id: 'back',      label: 'גב',      emoji: '🏋️', domains: ['pull'] },
  { id: 'chest',     label: 'חזה',     emoji: '💪', domains: ['push'] },
  { id: 'legs',      label: 'רגליים',  emoji: '🦵', domains: ['legs'] },
  { id: 'core',      label: 'בטן',     emoji: '🔥', domains: ['core'] },
  { id: 'shoulders', label: 'כתפיים',  emoji: '🏋️', domains: ['push'] },
  { id: 'arms',      label: 'ידיים',   emoji: '💪', domains: ['push', 'pull'] },
];

// ─── Intensity Config ────────────────────────────────────────────────────────

const INTENSITY_OPTIONS: { value: DifficultyLevel; label: string; sub: string }[] = [
  { value: 1, label: '⚡ קל',    sub: 'שחזור' },
  { value: 2, label: '⚡⚡ בינוני', sub: 'מאוזן' },
  { value: 3, label: '⚡⚡⚡ עצים',  sub: 'פרו' },
];

// ─── Duration Snap Points ────────────────────────────────────────────────────

const DURATION_MIN = 5;
const DURATION_MAX = 60;
const DURATION_STEP = 5;

// ─── Component ───────────────────────────────────────────────────────────────

export default function UserWorkoutAdjuster({
  isOpen,
  onClose,
  userProfile,
  onApplyAndStart,
  initialLocation,
}: UserWorkoutAdjusterProps) {
  const [location, setLocation] = useState<'park' | 'home'>(
    initialLocation === 'home' ? 'home' : 'park',
  );
  const [availableTime, setAvailableTime] = useState(30);
  const [selectedChips, setSelectedChips] = useState<string[]>([]);
  const [difficulty, setDifficulty] = useState<DifficultyLevel>(2);
  const [isEquipped, setIsEquipped] = useState(true);
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Derive user's active skill programs (shown only if 2+)
  const userSkillIds = useMemo(() => {
    const ids = userProfile.progression?.skillFocusIds ?? [];
    return ids.filter(id => id in SKILL_LABELS);
  }, [userProfile.progression?.skillFocusIds]);
  const hasSkills = userSkillIds.length >= 1;

  const sliderRef = useRef<HTMLInputElement>(null);

  // Sync gradient fill on slider
  useEffect(() => {
    const el = sliderRef.current;
    if (!el) return;
    const pct = ((availableTime - DURATION_MIN) / (DURATION_MAX - DURATION_MIN)) * 100;
    el.style.background = `linear-gradient(to left, #2b6cb0 ${pct}%, #e5e7eb ${pct}%)`;
  }, [availableTime]);

  // Reset selections when drawer opens
  useEffect(() => {
    if (isOpen) {
      setSelectedChips([]);
      setSelectedSkillId(null);
      setError(null);
    }
  }, [isOpen]);

  const toggleChip = useCallback((id: string) => {
    setSelectedChips(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id],
    );
  }, []);

  const derivedRequiredDomains: string[] | undefined = selectedChips.length > 0
    ? [...new Set(selectedChips.flatMap(id => MUSCLE_CHIPS.find(c => c.id === id)?.domains ?? []))]
    : undefined;

  const handleApply = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const store = useWeeklyVolumeStore.getState();
      const remaining = (store as any).getRemainingBudget?.() ?? undefined;
      const usagePct  = (store as any).getBudgetUsagePercent?.() ?? undefined;

      const result = await generateHomeWorkout({
        userProfile,
        testLocation: location as ExecutionLocation,
        availableTime,
        difficulty,
        requiredDomains: derivedRequiredDomains,
        equipmentOverride: isEquipped ? undefined : [],
        remainingWeeklyBudget:    remaining > 0 ? remaining : undefined,
        weeklyBudgetUsagePercent: usagePct  > 0 ? usagePct  : undefined,
        // Skill focus: override scheduled programs to focus on the selected skill
        scheduledProgramIds: selectedSkillId ? [selectedSkillId] : undefined,
      });

      onApplyAndStart(result.workout);
      onClose();
    } catch (err: any) {
      console.error('[UserWorkoutAdjuster] Generation failed:', err);
      setError('לא הצלחנו ליצור אימון. נסה שוב.');
    } finally {
      setIsLoading(false);
    }
  }, [
    userProfile, location, availableTime, difficulty,
    derivedRequiredDomains, isEquipped, onApplyAndStart, onClose,
  ]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            className="fixed inset-0 z-[199] bg-black/50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Bottom Sheet */}
          <motion.div
            key="sheet"
            className="fixed inset-x-0 bottom-0 z-[200] flex flex-col bg-white dark:bg-gray-900 rounded-t-[36px] shadow-2xl"
            style={{ maxHeight: '90vh' }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 36, mass: 1 }}
            dir="rtl"
          >
            {/* Drag Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1.5 rounded-full bg-gray-300 dark:bg-gray-600" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-2 pb-4 border-b border-gray-100 dark:border-gray-800">
              <button
                onClick={onClose}
                className="p-2 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                aria-label="סגור"
              >
                <X size={20} />
              </button>
              <h2 className="text-lg font-extrabold text-gray-900 dark:text-white">
                התאמת אימון
              </h2>
              <div className="w-9" />
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">

              {/* ── 1. Location ── */}
              <Section title="מיקום">
                <div className="grid grid-cols-2 gap-3">
                  <LocationPill
                    active={location === 'park'}
                    icon={<Trees size={18} />}
                    label="בחוץ"
                    sub="פארק / מגרש"
                    onClick={() => setLocation('park')}
                  />
                  <LocationPill
                    active={location === 'home'}
                    icon={<Home size={18} />}
                    label="בבית"
                    sub="אימון ביתי"
                    onClick={() => setLocation('home')}
                  />
                </div>
              </Section>

              {/* ── 2. Duration ── */}
              <Section title={`משך זמן`} rightEl={
                <span className="text-base font-extrabold text-[#2b6cb0]">
                  {availableTime} דק׳
                </span>
              }>
                <input
                  ref={sliderRef}
                  type="range"
                  min={DURATION_MIN}
                  max={DURATION_MAX}
                  step={DURATION_STEP}
                  value={availableTime}
                  onChange={e => setAvailableTime(Number(e.target.value))}
                  className="w-full h-2 rounded-full appearance-none cursor-pointer
                    [&::-webkit-slider-thumb]:appearance-none
                    [&::-webkit-slider-thumb]:w-5
                    [&::-webkit-slider-thumb]:h-5
                    [&::-webkit-slider-thumb]:rounded-full
                    [&::-webkit-slider-thumb]:bg-[#2b6cb0]
                    [&::-webkit-slider-thumb]:shadow-md
                    [&::-webkit-slider-thumb]:border-2
                    [&::-webkit-slider-thumb]:border-white
                    [&::-moz-range-thumb]:w-5
                    [&::-moz-range-thumb]:h-5
                    [&::-moz-range-thumb]:rounded-full
                    [&::-moz-range-thumb]:bg-[#2b6cb0]
                    [&::-moz-range-thumb]:border-2
                    [&::-moz-range-thumb]:border-white"
                />
                <div className="flex justify-between text-xs text-gray-400 dark:text-gray-500 mt-1">
                  <span>{DURATION_MIN} דק׳</span>
                  <span>{DURATION_MAX} דק׳</span>
                </div>
              </Section>

              {/* ── 3. Muscle Focus ── */}
              <Section title="אזור אימון" sub="(ריק = כל הגוף)">
                <div className="grid grid-cols-3 gap-2">
                  {MUSCLE_CHIPS.map(chip => {
                    const active = selectedChips.includes(chip.id);
                    return (
                      <button
                        key={chip.id}
                        onClick={() => toggleChip(chip.id)}
                        className={`
                          flex flex-col items-center gap-1 py-2.5 px-2 rounded-2xl border text-xs font-bold
                          transition-all active:scale-95
                          ${active
                            ? 'bg-[#2b6cb0] border-[#2b6cb0] text-white shadow-md shadow-blue-500/30'
                            : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300'
                          }
                        `}
                      >
                        <span className="text-lg leading-none">{chip.emoji}</span>
                        {chip.label}
                      </button>
                    );
                  })}
                </div>
              </Section>

              {/* ── 4. Skill Focus (contextual — only for calisthenics users) ── */}
              {hasSkills && (
                <Section title="מיקוד סקיל" sub="(כלי לאימון ממוקד)" rightEl={
                  <Star size={14} className="text-[#2b6cb0]" />
                }>
                  <div className="flex flex-wrap gap-2">
                    {userSkillIds.map(skillId => {
                      const meta = SKILL_LABELS[skillId];
                      if (!meta) return null;
                      const active = selectedSkillId === skillId;
                      return (
                        <button
                          key={skillId}
                          onClick={() => setSelectedSkillId(prev => prev === skillId ? null : skillId)}
                          className={`
                            flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-bold
                            transition-all active:scale-95
                            ${active
                              ? 'bg-[#2b6cb0] border-[#2b6cb0] text-white shadow-md shadow-blue-500/30'
                              : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300'
                            }
                          `}
                        >
                          <span>{meta.emoji}</span>
                          {meta.label}
                        </button>
                      );
                    })}
                  </div>
                  {selectedSkillId && (
                    <p className="text-xs text-[#2b6cb0] font-medium mt-1">
                      האימון יתמקד ב-{SKILL_LABELS[selectedSkillId]?.label}
                    </p>
                  )}
                </Section>
              )}

              {/* ── 5. Intensity ── */}
              <Section title="עוצמה">
                <div className="grid grid-cols-3 gap-2">
                  {INTENSITY_OPTIONS.map(opt => {
                    const active = difficulty === opt.value;
                    return (
                      <button
                        key={opt.value}
                        onClick={() => setDifficulty(opt.value)}
                        className={`
                          flex flex-col items-center gap-0.5 py-3 rounded-2xl border text-xs font-bold
                          transition-all active:scale-95
                          ${active
                            ? 'bg-[#2b6cb0] border-[#2b6cb0] text-white shadow-md shadow-blue-500/30'
                            : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300'
                          }
                        `}
                      >
                        <span className="text-sm leading-none">{opt.label}</span>
                        <span className={`text-[10px] font-medium ${active ? 'text-blue-100' : 'text-gray-400 dark:text-gray-500'}`}>
                          {opt.sub}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </Section>

              {/* ── 6. Equipment ── */}
              <Section title="ציוד">
                <div
                  className="flex items-center justify-between p-4 rounded-2xl border bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 cursor-pointer"
                  onClick={() => setIsEquipped(v => !v)}
                >
                  <div className="flex items-center gap-3">
                    {isEquipped
                      ? <Dumbbell size={20} className="text-[#2b6cb0]" />
                      : <ZapOff size={20} className="text-gray-400" />
                    }
                    <div>
                      <p className="text-sm font-bold text-gray-800 dark:text-gray-100">
                        {isEquipped ? 'יש לי ציוד' : 'רק משקל גוף'}
                      </p>
                      <p className="text-xs text-gray-400 dark:text-gray-500">
                        {isEquipped ? 'מוטות, רצועות, משקולות' : 'ללא ציוד כלל'}
                      </p>
                    </div>
                  </div>

                  {/* Toggle */}
                  <div
                    className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${isEquipped ? 'bg-[#2b6cb0]' : 'bg-gray-300 dark:bg-gray-600'}`}
                  >
                    <div
                      className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all duration-200 ${isEquipped ? 'left-[22px]' : 'left-0.5'}`}
                    />
                  </div>
                </div>
              </Section>

              {/* Error */}
              {error && (
                <p className="text-center text-sm font-medium text-red-500 dark:text-red-400">
                  {error}
                </p>
              )}

            </div>

            {/* ── CTA Button ── */}
            <div className="px-5 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] border-t border-gray-100 dark:border-gray-800">
              <button
                onClick={handleApply}
                disabled={isLoading}
                className="
                  w-full py-4 rounded-2xl font-extrabold text-base text-white
                  bg-gradient-to-r from-[#2b6cb0] to-blue-400
                  shadow-xl shadow-blue-500/40
                  transition-all active:scale-[0.97]
                  disabled:opacity-60 disabled:cursor-not-allowed
                "
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    מייצר אימון…
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <Zap size={18} />
                    עדכן אימון
                  </span>
                )}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Section({
  title,
  sub,
  rightEl,
  children,
}: {
  title: string;
  sub?: string;
  rightEl?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-1.5">
          <h3 className="text-sm font-extrabold text-gray-800 dark:text-gray-100">{title}</h3>
          {sub && <span className="text-xs text-gray-400 dark:text-gray-500">{sub}</span>}
        </div>
        {rightEl}
      </div>
      {children}
    </div>
  );
}

function LocationPill({
  active,
  icon,
  label,
  sub,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  sub: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`
        flex flex-col items-center gap-1.5 py-4 rounded-2xl border font-bold
        transition-all active:scale-95
        ${active
          ? 'bg-[#2b6cb0] border-[#2b6cb0] text-white shadow-lg shadow-blue-500/30'
          : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300'
        }
      `}
    >
      <span className={active ? 'text-white' : 'text-gray-400'}>{icon}</span>
      <span className="text-sm">{label}</span>
      <span className={`text-xs font-medium ${active ? 'text-blue-100' : 'text-gray-400 dark:text-gray-500'}`}>
        {sub}
      </span>
    </button>
  );
}
