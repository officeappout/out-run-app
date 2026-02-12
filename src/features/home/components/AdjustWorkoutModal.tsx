'use client';

/**
 * AdjustWorkoutModal – QA Control Room
 *
 * A comprehensive testing/tuning dashboard that allows real-time
 * manipulation of every workout-generation parameter and instant
 * regeneration of the workout.
 *
 * Layout:
 *   Mobile  – 3 tabs  (Context | Shadow Matrix | Preview)
 *   Desktop – 3 columns side by side
 *
 * @see HOME_WORKOUT_SERVICE_FINAL_ARCHITECTURE.md Part 2
 */

import React, { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, RefreshCw, Save, RotateCcw, Sliders, Eye, Settings2,
  Zap, MapPin, Timer, Shield, Dumbbell, Brain, Sun, ChevronDown, ChevronUp, Calendar,
} from 'lucide-react';

import { UserFullProfile } from '@/features/user/core/types/user.types';
import {
  ExecutionLocation,
  InjuryShieldArea,
  INJURY_SHIELD_LABELS,
  MovementGroup,
  MuscleGroup,
  MUSCLE_GROUP_LABELS,
} from '@/features/content/exercises/core/exercise.types';
import { LOCATION_OPTIONS_ARRAY } from '@/features/content/exercises/core/exercise-location.constants';
import {
  LifestylePersona,
  IntentMode,
  LIFESTYLE_LABELS,
} from '@/features/workout-engine/logic/ContextualEngine';
import { DifficultyLevel, GeneratedWorkout, WorkoutExercise } from '@/features/workout-engine/logic/WorkoutGenerator';
import { ShadowMatrix, LevelOverride, createDefaultShadowMatrix, SHADOW_PROGRAM_IDS } from '@/features/workout-engine/services/shadow-level.utils';
import { generateHomeWorkout, HomeWorkoutResult, TimeOfDay, detectTimeOfDay, TIME_OF_DAY_OPTIONS } from '@/features/workout-engine/services/home-workout.service';
import { getLocalizedText } from '@/features/content/exercises/core/exercise.types';

// ============================================================================
// CONSTANTS
// ============================================================================

const PERSONA_OPTIONS: { id: LifestylePersona; label: string; icon: string }[] = [
  { id: 'parent', label: 'הורה', icon: '👨‍👧' },
  { id: 'student', label: 'סטודנט', icon: '📚' },
  { id: 'school_student', label: 'תלמיד', icon: '🎒' },
  { id: 'office_worker', label: 'עובד משרד', icon: '💼' },
  { id: 'home_worker', label: 'עובד מהבית', icon: '🏠' },
  { id: 'senior', label: 'גיל הזהב', icon: '🧓' },
  { id: 'athlete', label: 'ספורטאי', icon: '🏆' },
  { id: 'reservist', label: 'מילואימניק', icon: '🎖️' },
  { id: 'active_soldier', label: 'חייל סדיר', icon: '🪖' },
];

/**
 * Location options — imported from centralized constants (Single Source of Truth).
 * All 7 ExecutionLocation values, matching Firestore execution_methods exactly.
 */
const LOCATION_OPTIONS = LOCATION_OPTIONS_ARRAY;

const INTENT_OPTIONS: { id: IntentMode; label: string }[] = [
  { id: 'normal', label: 'רגיל' },
  { id: 'blast', label: 'Blast 🔥' },
  { id: 'on_the_way', label: 'בדרך' },
  { id: 'field', label: 'שטח' },
];

const INJURY_AREAS: InjuryShieldArea[] = [
  'wrist', 'elbow', 'shoulder', 'lower_back', 'neck', 'knees', 'ankles', 'hips',
];

const MOVEMENT_GROUPS: { id: MovementGroup; label: string }[] = [
  { id: 'horizontal_push', label: 'Push (Horizontal)' },
  { id: 'vertical_push', label: 'Push (Vertical)' },
  { id: 'horizontal_pull', label: 'Pull (Horizontal)' },
  { id: 'vertical_pull', label: 'Pull (Vertical)' },
  { id: 'squat', label: 'Squat' },
  { id: 'hinge', label: 'Hinge' },
  { id: 'core', label: 'Core' },
  { id: 'isolation', label: 'Isolation' },
];

const MUSCLE_GROUPS: { id: MuscleGroup; label: string }[] = [
  { id: 'chest', label: 'חזה' },
  { id: 'back', label: 'גב' },
  { id: 'shoulders', label: 'כתפיים' },
  { id: 'biceps', label: 'דו-ראשי' },
  { id: 'triceps', label: 'תלת-ראשי' },
  { id: 'quads', label: 'ארבע-ראשי' },
  { id: 'hamstrings', label: 'המסטרינג' },
  { id: 'glutes', label: 'ישבן' },
  { id: 'calves', label: 'שוקיים' },
  { id: 'abs', label: 'בטן' },
  { id: 'obliques', label: 'אלכסונים' },
  { id: 'forearms', label: 'אמות' },
  { id: 'traps', label: 'טרפז' },
];

type TabId = 'context' | 'matrix' | 'preview';

// ============================================================================
// PROPS
// ============================================================================

interface AdjustWorkoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  userProfile: UserFullProfile;
  currentWorkout: GeneratedWorkout | null;
  /** Called with the final workout after user clicks "Save & Apply" */
  onSave: (workout: GeneratedWorkout) => void;
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function AdjustWorkoutModal({
  isOpen,
  onClose,
  userProfile,
  currentWorkout,
  onSave,
}: AdjustWorkoutModalProps) {
  // ── Tab state (mobile) ──
  const [activeTab, setActiveTab] = useState<TabId>('context');

  // ── Context controls ──
  const [persona, setPersona] = useState<LifestylePersona | null>(null);
  const [location, setLocation] = useState<ExecutionLocation>('home');
  const [intentMode, setIntentMode] = useState<IntentMode>('normal');
  const [availableTime, setAvailableTime] = useState(30);
  const [difficulty, setDifficulty] = useState<DifficultyLevel>(2);
  const [injuries, setInjuries] = useState<InjuryShieldArea[]>([]);
  const [daysInactiveOverride, setDaysInactiveOverride] = useState<number>(0);
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>(detectTimeOfDay);

  // ── Shadow Matrix ──
  const [shadowMatrix, setShadowMatrix] = useState<ShadowMatrix>(createDefaultShadowMatrix);
  const [showAdvancedMatrix, setShowAdvancedMatrix] = useState(false);

  // ── Preview ──
  const [previewWorkout, setPreviewWorkout] = useState<GeneratedWorkout | null>(currentWorkout);
  const [previewMeta, setPreviewMeta] = useState<HomeWorkoutResult['meta'] | null>(null);
  const [isRegenerating, setIsRegenerating] = useState(false);

  // Sync initial workout on open
  useEffect(() => {
    if (isOpen && currentWorkout) {
      setPreviewWorkout(currentWorkout);
    }
  }, [isOpen, currentWorkout]);

  // ── Handlers ──

  const toggleInjury = (area: InjuryShieldArea) => {
    setInjuries((prev) =>
      prev.includes(area) ? prev.filter((a) => a !== area) : [...prev, area],
    );
  };

  const updateMovementGroup = (mg: MovementGroup, patch: Partial<LevelOverride>) => {
    setShadowMatrix((prev) => ({
      ...prev,
      movementGroups: {
        ...prev.movementGroups,
        [mg]: { ...prev.movementGroups[mg], ...patch },
      },
    }));
  };

  const updateMuscleGroup = (mg: MuscleGroup, patch: Partial<LevelOverride>) => {
    setShadowMatrix((prev) => ({
      ...prev,
      muscleGroups: {
        ...prev.muscleGroups,
        [mg]: { ...(prev.muscleGroups[mg] || { level: 10, override: false }), ...patch },
      },
    }));
  };

  const updateProgram = (programId: string, patch: Partial<LevelOverride>) => {
    setShadowMatrix((prev) => ({
      ...prev,
      programs: {
        ...prev.programs,
        [programId]: { ...(prev.programs[programId] || { level: 10, override: false }), ...patch },
      },
    }));
  };

  const resetShadowMatrix = () => setShadowMatrix(createDefaultShadowMatrix());

  const handleRegenerate = useCallback(async () => {
    setIsRegenerating(true);
    try {
      const result = await generateHomeWorkout({
        userProfile,
        location,
        intentMode,
        availableTime,
        difficulty,
        shadowMatrix,
        injuryOverride: injuries.length > 0 ? injuries : undefined,
        daysInactiveOverride: daysInactiveOverride > 0 ? daysInactiveOverride : undefined,
        personaOverride: persona ?? undefined,
        timeOfDay,
      });
      setPreviewWorkout(result.workout);
      setPreviewMeta(result.meta);
      setActiveTab('preview');
    } catch (err) {
      console.error('[AdjustWorkoutModal] Regeneration error:', err);
    } finally {
      setIsRegenerating(false);
    }
  }, [userProfile, location, intentMode, availableTime, difficulty, shadowMatrix, injuries, daysInactiveOverride, persona, timeOfDay]);

  const handleSaveAndApply = () => {
    if (previewWorkout) {
      onSave(previewWorkout);
      onClose();
    }
  };

  // ── Subcomponents ──

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'context', label: 'הקשר', icon: <Settings2 size={16} /> },
    { id: 'matrix', label: 'Shadow Matrix', icon: <Sliders size={16} /> },
    { id: 'preview', label: 'תצוגה מקדימה', icon: <Eye size={16} /> },
  ];

  // ────────────────────────────────────────────────────────────────────────
  // RENDER
  // ────────────────────────────────────────────────────────────────────────

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[150] bg-black/50 backdrop-blur-sm"
          />

          {/* Modal */}
          <motion.div
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed inset-0 z-[151] flex items-end sm:items-center sm:justify-center"
          >
            <div
              className="relative w-full sm:max-w-5xl sm:mx-4 bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden"
              style={{ maxHeight: '92vh' }}
              dir="rtl"
            >
              {/* ── Header ── */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-slate-800">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <Brain size={20} className="text-cyan-500" />
                  QA Control Room
                </h2>
                <button
                  onClick={onClose}
                  className="w-9 h-9 rounded-full bg-gray-100 dark:bg-slate-800 flex items-center justify-center"
                >
                  <X size={18} className="text-gray-500" />
                </button>
              </div>

              {/* ── Tab Bar (Mobile) ── */}
              <div className="flex sm:hidden border-b border-gray-100 dark:border-slate-800">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-medium transition-colors ${
                      activeTab === tab.id
                        ? 'text-cyan-600 border-b-2 border-cyan-500 bg-cyan-50/50 dark:bg-cyan-500/10'
                        : 'text-gray-500'
                    }`}
                  >
                    {tab.icon}
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* ── Body (scrollable) — pb-36 clears the absolute footer ── */}
              <div className="overflow-y-auto pb-36" style={{ maxHeight: 'calc(92vh - 120px)' }}>
                <div className="sm:grid sm:grid-cols-3 sm:divide-x sm:divide-gray-100 dark:sm:divide-slate-800">
                  {/* ═══════════════════════════════════════════════════════
                     LEFT COLUMN: Context Controls
                     ═══════════════════════════════════════════════════════ */}
                  <div className={`p-5 space-y-5 ${activeTab !== 'context' ? 'hidden sm:block' : ''}`}>
                    {/* Persona */}
                    <Section title="פרסונה" icon={<Zap size={14} />}>
                      <div className="grid grid-cols-3 gap-2">
                        {PERSONA_OPTIONS.map((p) => (
                          <button
                            key={p.id}
                            onClick={() => setPersona(persona === p.id ? null : p.id)}
                            className={`p-2 rounded-xl text-xs font-medium transition-all ${
                              persona === p.id
                                ? 'bg-cyan-500 text-white shadow-md'
                                : 'bg-gray-50 dark:bg-slate-800 text-gray-600 dark:text-gray-300'
                            }`}
                          >
                            <span className="text-base block mb-0.5">{p.icon}</span>
                            {p.label}
                          </button>
                        ))}
                      </div>
                    </Section>

                    {/* Location */}
                    <Section title="מיקום" icon={<MapPin size={14} />}>
                      <div className="grid grid-cols-3 gap-2">
                        {LOCATION_OPTIONS.map((loc) => (
                          <button
                            key={loc.id}
                            onClick={() => setLocation(loc.id)}
                            className={`p-2 rounded-xl text-xs font-medium transition-all ${
                              location === loc.id
                                ? 'bg-blue-500 text-white shadow-md'
                                : 'bg-gray-50 dark:bg-slate-800 text-gray-600 dark:text-gray-300'
                            }`}
                          >
                            <span className="text-base block mb-0.5">{loc.icon}</span>
                            {loc.label}
                          </button>
                        ))}
                      </div>
                    </Section>

                    {/* Intent */}
                    <Section title="מצב כוונה">
                      <div className="grid grid-cols-2 gap-2">
                        {INTENT_OPTIONS.map((i) => (
                          <button
                            key={i.id}
                            onClick={() => setIntentMode(i.id)}
                            className={`p-2 rounded-xl text-xs font-medium transition-all ${
                              intentMode === i.id
                                ? 'bg-orange-500 text-white shadow-md'
                                : 'bg-gray-50 dark:bg-slate-800 text-gray-600 dark:text-gray-300'
                            }`}
                          >
                            {i.label}
                          </button>
                        ))}
                      </div>
                    </Section>

                    {/* Duration */}
                    <Section title={`משך אימון: ${availableTime} דק'`} icon={<Timer size={14} />}>
                      <input
                        type="range"
                        min={5}
                        max={60}
                        step={5}
                        value={availableTime}
                        onChange={(e) => setAvailableTime(Number(e.target.value))}
                        className="w-full accent-cyan-500"
                      />
                      <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                        <span>5</span><span>15</span><span>30</span><span>45</span><span>60</span>
                      </div>
                    </Section>

                    {/* Difficulty */}
                    <Section title="דרגת קושי">
                      <div className="flex gap-2">
                        {([1, 2, 3] as DifficultyLevel[]).map((d) => (
                          <button
                            key={d}
                            onClick={() => setDifficulty(d)}
                            className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all ${
                              difficulty === d
                                ? 'bg-yellow-500 text-white shadow-md'
                                : 'bg-gray-50 dark:bg-slate-800 text-gray-600 dark:text-gray-300'
                            }`}
                          >
                            {'⚡'.repeat(d)}
                          </button>
                        ))}
                      </div>
                    </Section>

                    {/* Time of Day */}
                    <Section title="שעה ביום" icon={<Sun size={14} />}>
                      <div className="grid grid-cols-4 gap-2">
                        {TIME_OF_DAY_OPTIONS.map((t) => (
                          <button
                            key={t.id}
                            onClick={() => setTimeOfDay(t.id)}
                            className={`p-2 rounded-xl text-xs font-medium transition-all ${
                              timeOfDay === t.id
                                ? 'bg-amber-500 text-white shadow-md'
                                : 'bg-gray-50 dark:bg-slate-800 text-gray-600 dark:text-gray-300'
                            }`}
                          >
                            <span className="text-base block mb-0.5">{t.icon}</span>
                            {t.label}
                          </button>
                        ))}
                      </div>
                    </Section>

                    {/* Days Inactive */}
                    <Section title={`ימים לא פעיל: ${daysInactiveOverride}`} icon={<Calendar size={14} />}>
                      <input
                        type="range"
                        min={0}
                        max={30}
                        step={1}
                        value={daysInactiveOverride}
                        onChange={(e) => setDaysInactiveOverride(Number(e.target.value))}
                        className="w-full accent-purple-500"
                      />
                      <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                        <span>0 (פעיל)</span><span>3</span><span>7</span><span>14</span><span>30</span>
                      </div>
                    </Section>

                    {/* Injury Shield */}
                    <Section title="Injury Shield" icon={<Shield size={14} />}>
                      <div className="flex flex-wrap gap-2">
                        {INJURY_AREAS.map((area) => (
                          <button
                            key={area}
                            onClick={() => toggleInjury(area)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                              injuries.includes(area)
                                ? 'bg-red-500 text-white'
                                : 'bg-gray-50 dark:bg-slate-800 text-gray-600 dark:text-gray-300'
                            }`}
                          >
                            {INJURY_SHIELD_LABELS[area].he}
                          </button>
                        ))}
                      </div>
                    </Section>

                    {/* Regenerate button (mobile: inside context tab) */}
                    <button
                      onClick={handleRegenerate}
                      disabled={isRegenerating}
                      className="w-full py-3 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold rounded-xl shadow-lg disabled:opacity-50 flex items-center justify-center gap-2 sm:hidden"
                    >
                      <RefreshCw size={18} className={isRegenerating ? 'animate-spin' : ''} />
                      {isRegenerating ? 'מייצר...' : 'צור אימון מחדש'}
                    </button>
                  </div>

                  {/* ═══════════════════════════════════════════════════════
                     MIDDLE COLUMN: Shadow Matrix
                     ═══════════════════════════════════════════════════════ */}
                  <div className={`p-5 space-y-5 ${activeTab !== 'matrix' ? 'hidden sm:block' : ''}`}>
                    {/* ═══ PROGRAMS (TOP — HIGHEST PRIORITY) ═══ */}
                    <Section title={`תוכניות (${SHADOW_PROGRAM_IDS.length})`} icon={<Zap size={14} />}>
                      <p className="text-[10px] text-orange-500 font-bold mb-2">עדיפות גבוהה ביותר — Push, Pull, Core, Upper, Full</p>
                      <div className="space-y-3">
                        {SHADOW_PROGRAM_IDS.map((prog) => {
                          const entry = shadowMatrix.programs[prog.id] || { level: 10, override: false };
                          return (
                            <div key={prog.id}>
                              <label className="flex items-center gap-2 cursor-pointer mb-1">
                                <input
                                  type="checkbox"
                                  checked={entry.override}
                                  onChange={(e) => updateProgram(prog.id, { override: e.target.checked })}
                                  className="w-3.5 h-3.5 rounded accent-orange-500"
                                />
                                <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                                  {prog.label}
                                </span>
                              </label>
                              <SliderRow
                                label={`${entry.level}`}
                                value={entry.level}
                                onChange={(v) => updateProgram(prog.id, { level: v })}
                                active={entry.override}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </Section>

                    {/* ═══ GLOBAL OVERRIDE ═══ */}
                    <Section title="Global Override">
                      <label className="flex items-center gap-2 mb-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={shadowMatrix.useGlobalLevel}
                          onChange={(e) =>
                            setShadowMatrix((prev) => ({ ...prev, useGlobalLevel: e.target.checked }))
                          }
                          className="w-4 h-4 rounded accent-cyan-500"
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">רמה אחידה לכולם</span>
                      </label>
                      {shadowMatrix.useGlobalLevel && (
                        <SliderRow
                          label={`Global: ${shadowMatrix.globalLevel}`}
                          value={shadowMatrix.globalLevel}
                          onChange={(v) => setShadowMatrix((prev) => ({ ...prev, globalLevel: v }))}
                          active
                        />
                      )}
                    </Section>

                    {/* ═══ ADVANCED: Movement + Muscle Groups (collapsible) ═══ */}
                    <div className="border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
                      <button
                        onClick={() => setShowAdvancedMatrix(!showAdvancedMatrix)}
                        className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 dark:bg-slate-800 text-sm font-bold text-gray-600 dark:text-gray-300"
                      >
                        <span className="flex items-center gap-2">
                          <Dumbbell size={14} />
                          Advanced: Movement & Muscle Groups
                        </span>
                        {showAdvancedMatrix ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>

                      {showAdvancedMatrix && (
                        <div className="p-4 space-y-5">
                          {/* Movement Groups (8 sliders) */}
                          <Section title={`Movement Groups (${MOVEMENT_GROUPS.length})`} icon={<Dumbbell size={14} />}>
                            <div className="space-y-3">
                              {MOVEMENT_GROUPS.map((mg) => {
                                const entry = shadowMatrix.movementGroups[mg.id];
                                return (
                                  <div key={mg.id}>
                                    <label className="flex items-center gap-2 cursor-pointer mb-1">
                                      <input
                                        type="checkbox"
                                        checked={entry.override}
                                        onChange={(e) => updateMovementGroup(mg.id, { override: e.target.checked })}
                                        className="w-3.5 h-3.5 rounded accent-cyan-500"
                                      />
                                      <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                                        {mg.label}
                                      </span>
                                    </label>
                                    <SliderRow
                                      label={`${entry.level}`}
                                      value={entry.level}
                                      onChange={(v) => updateMovementGroup(mg.id, { level: v })}
                                      active={entry.override}
                                    />
                                  </div>
                                );
                              })}
                            </div>
                          </Section>

                          {/* Muscle Groups (13 sliders) */}
                          <Section title={`Muscle Groups (${MUSCLE_GROUPS.length})`}>
                            <div className="space-y-3">
                              {MUSCLE_GROUPS.map((mg) => {
                                const entry = shadowMatrix.muscleGroups[mg.id] || { level: 10, override: false };
                                return (
                                  <div key={mg.id}>
                                    <label className="flex items-center gap-2 cursor-pointer mb-1">
                                      <input
                                        type="checkbox"
                                        checked={entry.override}
                                        onChange={(e) => updateMuscleGroup(mg.id, { override: e.target.checked })}
                                        className="w-3.5 h-3.5 rounded accent-cyan-500"
                                      />
                                      <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                                        {mg.label}
                                      </span>
                                    </label>
                                    <SliderRow
                                      label={`${entry.level}`}
                                      value={entry.level}
                                      onChange={(v) => updateMuscleGroup(mg.id, { level: v })}
                                      active={entry.override}
                                    />
                                  </div>
                                );
                              })}
                            </div>
                          </Section>
                        </div>
                      )}
                    </div>

                    {/* Reset Button */}
                    <button
                      onClick={resetShadowMatrix}
                      className="w-full py-2 rounded-xl border border-gray-200 dark:border-slate-700 text-sm text-gray-600 dark:text-gray-300 flex items-center justify-center gap-2"
                    >
                      <RotateCcw size={14} />
                      Reset to Auto
                    </button>
                  </div>

                  {/* ═══════════════════════════════════════════════════════
                     RIGHT COLUMN: Live Preview
                     ═══════════════════════════════════════════════════════ */}
                  <div className={`p-5 space-y-4 ${activeTab !== 'preview' ? 'hidden sm:block' : ''}`}>
                    {previewWorkout ? (
                      <>
                        {/* Title & Description */}
                        <div className="p-4 bg-gray-50 dark:bg-slate-800 rounded-2xl">
                          <h3 className="font-bold text-lg text-gray-900 dark:text-white">
                            {previewWorkout.title}
                          </h3>
                          <p className="text-sm text-gray-500 mt-1">{previewWorkout.description}</p>
                          {previewWorkout.aiCue && (
                            <p className="text-xs text-cyan-500 mt-2 font-medium">{previewWorkout.aiCue}</p>
                          )}
                        </div>

                        {/* Stats Grid */}
                        <div className="grid grid-cols-3 gap-2">
                          <StatBox label="משך" value={`${previewWorkout.estimatedDuration} דק'`} />
                          <StatBox label="קלוריות" value={`${previewWorkout.stats.calories}`} />
                          <StatBox label="קושי" value={'⚡'.repeat(previewWorkout.difficulty)} />
                        </div>

                        {/* SA:BA Balance */}
                        <div className="p-3 bg-gray-50 dark:bg-slate-800 rounded-xl">
                          <p className="text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">SA:BA Balance</p>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-mono">{previewWorkout.mechanicalBalance.ratio}</span>
                            {previewWorkout.mechanicalBalance.isBalanced ? (
                              <span className="text-xs text-green-600 font-medium">מאוזן</span>
                            ) : (
                              <span className="text-xs text-orange-600 font-medium">לא מאוזן</span>
                            )}
                          </div>
                        </div>

                        {/* Volume Badge */}
                        {previewWorkout.volumeAdjustment && (
                          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl">
                            <p className="text-xs font-bold text-blue-700 dark:text-blue-300">
                              {previewWorkout.volumeAdjustment.badge}
                            </p>
                            <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">
                              Sets: {previewWorkout.volumeAdjustment.originalSets} → {previewWorkout.volumeAdjustment.adjustedSets}{' '}
                              (-{previewWorkout.volumeAdjustment.reductionPercent}%)
                            </p>
                          </div>
                        )}

                        {/* Meta (if available) */}
                        {previewMeta && (
                          <div className="p-3 bg-gray-50 dark:bg-slate-800 rounded-xl text-xs text-gray-500 space-y-1">
                            <p>Days inactive: <span className="font-bold text-gray-700 dark:text-gray-300">{previewMeta.daysInactive}</span></p>
                            <p>Persona: <span className="font-bold text-gray-700 dark:text-gray-300">{previewMeta.persona || 'None'}</span></p>
                            <p>Time of day: <span className="font-bold text-gray-700 dark:text-gray-300">{previewMeta.timeOfDay}</span></p>
                            <p>Exercises considered: <span className="font-bold text-gray-700 dark:text-gray-300">{previewMeta.exercisesConsidered}</span></p>
                            <p>Excluded: <span className="font-bold text-gray-700 dark:text-gray-300">{previewMeta.exercisesExcluded}</span></p>
                          </div>
                        )}

                        {/* Exercise List — SETS × REPS ONLY (no rest timers) */}
                        <div className="space-y-2">
                          <p className="text-xs font-bold text-gray-600 dark:text-gray-400">
                            תרגילים ({previewWorkout.exercises.length})
                          </p>
                          {previewWorkout.exercises.map((ex, i) => (
                            <ExerciseRow key={`${ex.exercise.id}-${i}`} ex={ex} index={i} />
                          ))}
                        </div>
                      </>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                        <Eye size={40} className="mb-3 opacity-50" />
                        <p className="text-sm">לחץ על "צור אימון מחדש" לראות תוצאות</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* ── Footer — absolute, floats over content ── */}
              <div className="absolute bottom-0 left-0 right-0 z-50 flex items-center gap-3 px-5 pt-4 border-t border-gray-100 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 16px))' }}>
                {/* Desktop-only Regenerate */}
                <button
                  onClick={handleRegenerate}
                  disabled={isRegenerating}
                  className="hidden sm:flex flex-1 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold rounded-xl shadow-lg disabled:opacity-50 items-center justify-center gap-2"
                >
                  <RefreshCw size={18} className={isRegenerating ? 'animate-spin' : ''} />
                  {isRegenerating ? 'מייצר...' : 'צור אימון מחדש'}
                </button>

                <button
                  onClick={handleSaveAndApply}
                  disabled={!previewWorkout}
                  className="flex-1 py-3 bg-green-500 text-white font-bold rounded-xl shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <Save size={18} />
                  שמור והחל
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h4 className="text-xs font-bold text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-1.5 uppercase tracking-wide">
        {icon}
        {title}
      </h4>
      {children}
    </section>
  );
}

function SliderRow({
  label,
  value,
  onChange,
  active,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  active: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="range"
        min={1}
        max={20}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={!active}
        className={`flex-1 h-1.5 rounded-full appearance-none cursor-pointer ${
          active ? 'accent-cyan-500' : 'accent-gray-300 opacity-40'
        }`}
      />
      <span
        className={`text-xs font-mono w-6 text-center ${
          active ? 'text-cyan-600 dark:text-cyan-400 font-bold' : 'text-gray-400'
        }`}
      >
        {label}
      </span>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3 bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-xl text-center">
      <p className="text-[10px] text-gray-400 uppercase">{label}</p>
      <p className="text-base font-bold text-gray-900 dark:text-white mt-0.5">{value}</p>
    </div>
  );
}

/** Exercise row — card-based design matching HTML reference (no rest timer) */
function ExerciseRow({ ex, index }: { ex: WorkoutExercise; index: number }) {
  const name = getLocalizedText(ex.exercise.name, 'he');
  const volume = ex.isTimeBased
    ? `${ex.sets} × ${ex.reps} שניות`
    : `${ex.sets} × ${ex.reps} חזרות`;

  // Resolve image
  const methodMedia = ex.exercise.execution_methods?.[0]?.media || ex.exercise.executionMethods?.[0]?.media;
  const imageUrl = methodMedia?.imageUrl
    || methodMedia?.mainVideoUrl
    || ex.exercise.media?.imageUrl
    || ex.exercise.media?.videoUrl
    || 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?auto=format&fit=crop&w=160&q=60';

  return (
    <div
      className="bg-[#F8FAFC] dark:bg-[#1E293B] rounded-2xl overflow-hidden flex flex-row items-stretch shadow-sm border border-slate-100 dark:border-slate-800"
      dir="rtl"
    >
      {/* Thumbnail — RIGHT side (edge-to-edge, no padding) */}
      <div className="w-14 min-h-[56px] flex-shrink-0">
        <img alt={name} className="w-full h-full object-cover" src={imageUrl} loading="lazy" />
      </div>
      {/* Info */}
      <div className="flex-grow text-right min-w-0 flex flex-col justify-center py-2 pr-3 pl-2">
        <p className="font-bold text-xs leading-tight truncate text-black dark:text-white">{name}</p>
        <p className="text-slate-500 dark:text-slate-400 text-[10px] font-medium mt-0.5">{volume}</p>
      </div>
      {/* Mechanical badge */}
      {ex.mechanicalType !== 'none' && (
        <span className="text-[9px] px-1 py-0.5 rounded bg-gray-100 dark:bg-slate-700 text-gray-400 flex-shrink-0 self-center ml-2">
          {ex.mechanicalType === 'straight_arm' ? 'SA' : ex.mechanicalType === 'bent_arm' ? 'BA' : 'H'}
        </span>
      )}
    </div>
  );
}
