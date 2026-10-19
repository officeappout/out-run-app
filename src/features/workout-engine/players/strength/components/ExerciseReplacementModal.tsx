'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Exercise, ExecutionMethod, getLocalizedText, findMethodForLocation } from '@/features/content/exercises';
import { resolveExerciseMedia } from '@/features/workout-engine/shared/utils/media-resolution.utils';
import { getExerciseVariations, getAlternativeExercises, AlternativeExerciseOption } from '../../../generator/services/exercise-replacement.service';
import {
  getMuscleGroupLabel,
  normalizeGearId,
  resolveEquipmentSvgPathList,
  resolveEquipmentLabel,
} from '../../../shared/utils/gear-mapping.utils';
import { selectExecutionMethodWithBrand } from '../../../generator/services/execution-method-selector.service';
import { ExecutionLocation } from '@/features/content/exercises';
import { UserFullProfile } from '@/types/user-profile';
import { Park } from '@/types/admin-types';
import { Dumbbell, X } from 'lucide-react';
import { LEVEL_COMPARE_ICONS } from '@/components/ui/v2/LevelCompareIcon';
import { filterAlternativesByEquipment } from '../logic/equipment-filter';
import type { ReplacementMeta, SwapReason } from '@/features/workout-engine/adaptation/adaptation.types';

interface ExerciseReplacementModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentExercise: Exercise;
  currentLevel: number;
  location: ExecutionLocation;
  park: Park | null;
  userProfile: UserFullProfile;
  /**
   * `meta` (soft-adaptation Phase 0, data only): the tab the replacement came
   * from, the optional reason chip, and both levels — for logExerciseSwap.
   * Existing 2/3-arg handlers keep working unchanged.
   */
  onReplace: (
    newExercise: Exercise,
    executionMethod: ExecutionMethod,
    levelComparison: 'lower' | 'same' | 'higher',
    meta: ReplacementMeta,
  ) => void;
  /**
   * PR-B3 — at a hybrid STATION only: the park's normalized gear ids. When given, both tabs list
   * only exercises with a park method that fits this equipment (or needs none), and picking one
   * uses that fitting method. Omitted / null → the modal is exactly as before (every other caller).
   */
  allowedEquipmentIds?: readonly string[] | null;
}

type TabType = 'adaptation' | 'alternative';

/**
 * Optional one-tap "why?" chips (Phase 0, data only). Selecting one is never
 * required to swap. 'pain' is recorded for the admin view only — it must
 * never feed adaptation (see adaptation.types.ts) — and shows a safety line.
 */
const REASON_CHIPS: { id: SwapReason; label: string }[] = [
  { id: 'too_hard', label: 'קשה מדי' },
  { id: 'too_easy', label: 'קל מדי' },
  { id: 'no_equipment', label: 'אין לי את הציוד' },
  { id: 'dislike', label: 'פחות מתאים לי' },
  { id: 'pain', label: 'כואב' },
];

// Shared with the run overview's "החלף מקטע" drawer (src/components/ui/v2/LevelCompareIcon).
const LEVEL_ICONS: Record<string, { src: string; color: string }> = LEVEL_COMPARE_ICONS;

function DrawerGearBadge({ srcList, label }: { srcList: string[]; label: string }) {
  const [srcIdx, setSrcIdx] = React.useState(0);
  const [failed, setFailed] = React.useState(false);
  const src = srcList[srcIdx];
  const validSrc = !failed && src?.startsWith('/') ? src : null;

  return (
    <div
      className="flex items-center gap-1.5 bg-white/90 dark:bg-slate-800/90 shadow-sm"
      style={{ borderRadius: 8, border: '1.5px solid #E0E9FF', padding: '4px 8px' }}
    >
      {validSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={validSrc}
          alt={label}
          width={20}
          height={20}
          className="object-contain flex-shrink-0"
          onError={() => {
            if (srcIdx < srcList.length - 1) setSrcIdx((i) => i + 1);
            else setFailed(true);
          }}
        />
      ) : (
        <Dumbbell className="text-gray-400 flex-shrink-0" style={{ width: 20, height: 20 }} />
      )}
      <span className="text-[10px] font-medium text-slate-600 dark:text-slate-300 whitespace-nowrap leading-none">
        {label}
      </span>
    </div>
  );
}

// ── Lazy-loaded image with skeleton ──
function LazyExerciseImage({ src, alt }: { src: string; alt: string }) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  const resolvedSrc = errored ? '/images/park-placeholder.svg' : src;

  return (
    <div className="w-20 h-20 rounded-xl overflow-hidden bg-slate-200 dark:bg-slate-700 flex-shrink-0 relative">
      {!loaded && <div className="absolute inset-0 animate-pulse bg-slate-200 dark:bg-slate-700" />}
      <img
        alt={alt}
        src={resolvedSrc}
        loading="lazy"
        decoding="async"
        className={`w-full h-full object-cover transition-opacity duration-200 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        onLoad={() => setLoaded(true)}
        onError={() => { setErrored(true); setLoaded(true); }}
      />
    </div>
  );
}

// ── Skeleton list (consistent 3 items matching the max output) ──
function SkeletonList() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="animate-pulse flex items-center gap-5 p-4 rounded-3xl border border-slate-100 dark:border-slate-800">
          <div className="w-20 h-20 rounded-xl bg-slate-200 dark:bg-slate-700 flex-shrink-0" />
          <div className="flex-1 space-y-3">
            <div className="h-4 w-2/3 bg-slate-200 dark:bg-slate-700 rounded" />
            <div className="h-3 w-1/2 bg-slate-200 dark:bg-slate-700 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ExerciseReplacementModal({
  isOpen,
  onClose,
  currentExercise,
  currentLevel,
  location,
  park,
  userProfile,
  onReplace,
  allowedEquipmentIds = null,
}: ExerciseReplacementModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('adaptation');
  const [adaptationExercises, setAdaptationExercises] = useState<AlternativeExerciseOption[]>([]);
  const [alternativeExercises, setAlternativeExercises] = useState<AlternativeExerciseOption[]>([]);
  const [selectedExercise, setSelectedExercise] = useState<AlternativeExerciseOption | null>(null);
  const [reason, setReason] = useState<SwapReason | null>(null);

  const [loadingAdaptation, setLoadingAdaptation] = useState(true);
  const [loadingAlternative, setLoadingAlternative] = useState(true);

  const activeProgramId =
    userProfile?.progression?.activePrograms?.[0]?.templateId ||
    userProfile?.progression?.activePrograms?.[0]?.id;

  // Fetch-cycle ref to cancel stale requests
  const fetchId = useRef(0);

  // ── Load exercises — skeleton stays until 100% done ──
  useEffect(() => {
    if (!isOpen) return;

    const id = ++fetchId.current;
    setLoadingAdaptation(true);
    setLoadingAlternative(true);
    setAdaptationExercises([]);
    setAlternativeExercises([]);
    setSelectedExercise(null);
    setReason(null);

    (async () => {
      try {
        const variations = await getExerciseVariations(
          currentExercise, currentLevel, location, park, userProfile, activeProgramId,
        );
        if (id !== fetchId.current) return;
        setAdaptationExercises(filterAlternativesByEquipment(variations, allowedEquipmentIds));
        setLoadingAdaptation(false);

        const tab1Ids = new Set(variations.map((v) => v.exercise.id));
        const alternatives = await getAlternativeExercises(
          currentExercise, currentLevel, location, park, userProfile, activeProgramId, tab1Ids,
        );
        if (id !== fetchId.current) return;
        setAlternativeExercises(filterAlternativesByEquipment(alternatives, allowedEquipmentIds));
        setLoadingAlternative(false);
      } catch (err) {
        console.error('[ExerciseReplacement] Error:', err);
        if (id === fetchId.current) {
          setLoadingAdaptation(false);
          setLoadingAlternative(false);
        }
      }
    })();

    return () => { fetchId.current++; };
  }, [isOpen, currentExercise, currentLevel, location, park, userProfile, activeProgramId, allowedEquipmentIds]);

  useEffect(() => { setSelectedExercise(null); }, [activeTab]);

  // ── Handlers ──
  const handleReplace = useCallback(async () => {
    if (!selectedExercise) return;
    let method: ExecutionMethod | undefined;
    if (allowedEquipmentIds) {
      // Station: the method the filter found doable with this park's equipment.
      method = selectedExercise.selectedExecutionMethod;
    } else if (activeTab === 'adaptation') {
      method = await selectExecutionMethodWithBrand(selectedExercise.exercise, location, park, userProfile);
    } else {
      method = selectedExercise.selectedExecutionMethod;
    }
    if (method) {
      onReplace(selectedExercise.exercise, method, selectedExercise.levelComparison, {
        tab: activeTab,
        ...(reason ? { reason } : {}),
        ...(typeof selectedExercise.resolvedLevel === 'number' ? { toLevel: selectedExercise.resolvedLevel } : {}),
        fromLevel: currentLevel,
      });
      onClose();
    }
  }, [selectedExercise, activeTab, location, park, userProfile, onReplace, onClose, allowedEquipmentIds, reason, currentLevel]);

  // ── Helpers ──
  const getImage = (ex: Exercise): string => {
    const method = findMethodForLocation(ex, location);
    const { imageUrl } = resolveExerciseMedia(ex as any, method as any);
    return imageUrl || '/images/park-placeholder.svg';
  };

  const getLevelConfig = (c: 'lower' | 'same' | 'higher') =>
    LEVEL_ICONS[c] ?? LEVEL_ICONS.same;

  const resolveGearBadges = (option: AlternativeExerciseOption) => {
    const m = option.selectedExecutionMethod || option.exercise.execution_methods?.find((em) => em.location === location || em.locationMapping?.includes(location));
    if (!m) return [];
    const rawIds: string[] = [
      ...((m as any).gearIds ?? []),
      ...((m as any).equipmentIds ?? []),
      ...((m as any).gearId ? [(m as any).gearId] : []),
    ].filter(Boolean);
    const seen = new Set<string>();
    const badges: { srcList: string[]; label: string }[] = [];
    for (const raw of rawIds) {
      let norm = normalizeGearId(raw);
      let label = resolveEquipmentLabel(raw);

      // Force fix: if the Hebrew label clearly indicates a pullup bar,
      // override whatever normalizeGearId returned (catches bad iconKey in Firestore).
      if (label.includes('מתח') || norm === 'מתח') {
        norm = 'pullup_bar';
        label = 'מתקן מתח';
      }

      console.log('[DrawerGearBadge]', {
        rawId: raw,
        normalizedKey: norm,
        label,
        exerciseName: getLocalizedText(option.exercise.name, 'he'),
      });

      if (norm === 'bodyweight' || norm === 'none' || norm === 'unknown_gear' || seen.has(norm)) continue;
      seen.add(norm);
      const srcList = resolveEquipmentSvgPathList(norm, location);
      if (srcList.length === 0) continue;
      badges.push({ srcList, label });
    }
    return badges;
  };

  const primaryMuscleLabel = currentExercise.primaryMuscle
    ? getMuscleGroupLabel(currentExercise.primaryMuscle)
    : currentExercise.muscleGroups?.[0]
      ? getMuscleGroupLabel(currentExercise.muscleGroups[0])
      : '';

  if (!isOpen) return null;

  const isCurrentTabLoading = activeTab === 'adaptation' ? loadingAdaptation : loadingAlternative;
  const currentList = activeTab === 'adaptation' ? adaptationExercises : alternativeExercises;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[110]" dir="rtl">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-10"
            onClick={onClose}
          />

          {/* Drawer */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 38, stiffness: 280, mass: 0.8 }}
            className="fixed inset-x-0 bottom-0 top-16 z-20 bg-white dark:bg-[#1E1E1E] rounded-t-[32px] shadow-2xl flex flex-col"
            style={{ willChange: 'transform' }}
          >
            {/* Handle */}
            <div className="w-12 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full mx-auto mt-3 mb-4 flex-shrink-0" />

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto px-6 pb-64">

              {/* ── Header ── */}
              <div className="flex items-center gap-5 mb-6">
                <div className="relative flex-shrink-0">
                  <img
                    alt={getLocalizedText(currentExercise.name, 'he')}
                    className="w-24 h-24 rounded-2xl object-cover border-4 border-slate-50 dark:border-slate-800 shadow-sm"
                    src={getImage(currentExercise)}
                    onError={(e) => { (e.target as HTMLImageElement).src = '/images/park-placeholder.svg'; }}
                  />
                </div>
                <div className="flex-1 text-right">
                  <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-1">החלפת תרגיל</p>
                  <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2 leading-tight">
                    {getLocalizedText(currentExercise.name, 'he')}
                  </h2>
                  {primaryMuscleLabel && (
                    <span className="text-sm text-slate-500 dark:text-slate-400 font-medium">
                      {primaryMuscleLabel}
                    </span>
                  )}
                </div>
                <button
                  onClick={onClose}
                  className="absolute top-5 left-5 w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 active:scale-90 transition-transform"
                  aria-label="סגור"
                >
                  <X size={18} />
                </button>
              </div>

              {/* ── Tabs ── */}
              <div className="flex border-b border-slate-100 dark:border-slate-800 mb-4">
                <button
                  onClick={() => setActiveTab('adaptation')}
                  className={`flex-1 py-3 text-center font-bold border-b-2 transition-colors ${
                    activeTab === 'adaptation'
                      ? 'text-[#00BAF7] border-[#00BAF7]'
                      : 'text-slate-400 dark:text-slate-500 border-transparent'
                  }`}
                >
                  התאמת התרגיל
                </button>
                <button
                  onClick={() => setActiveTab('alternative')}
                  className={`flex-1 py-3 text-center font-bold border-b-2 transition-colors ${
                    activeTab === 'alternative'
                      ? 'text-[#00BAF7] border-[#00BAF7]'
                      : 'text-slate-400 dark:text-slate-500 border-transparent'
                  }`}
                >
                  תרגיל חלופי
                </button>
              </div>

              <p className="text-slate-500 dark:text-slate-400 text-sm text-center mb-6">
                {activeTab === 'adaptation'
                  ? 'גרסאות של אותו תרגיל, ברמות קושי שונות'
                  : 'תרגילים שונים לאותה קבוצת השרירים'}
              </p>

              {/* ── Exercise List — skeleton until filtering is 100% done ── */}
              {isCurrentTabLoading ? (
                <SkeletonList />
              ) : currentList.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Dumbbell className="w-10 h-10 text-slate-300 dark:text-slate-600 mb-3" />
                  <p className="text-slate-400 font-semibold mb-1">לא נמצאו תרגילים חלופיים</p>
                  <p className="text-xs text-slate-400">
                    נסו לעבור ללשונית {activeTab === 'adaptation' ? '"תרגיל חלופי"' : '"התאמת התרגיל"'}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {currentList.map((option) => {
                    const isSelected = selectedExercise?.exercise.id === option.exercise.id;
                    const levelCfg = getLevelConfig(option.levelComparison);
                    const resolvedImageUrl = getImage(option.exercise);
                    const gearBadges = resolveGearBadges(option);

                    return (
                      <motion.div
                        key={option.exercise.id}
                        layout
                        onClick={() => setSelectedExercise(option)}
                        className={`bg-white dark:bg-slate-800/50 p-4 rounded-3xl flex items-center gap-5 shadow-sm transition-all cursor-pointer active:scale-[0.98] ${
                          isSelected
                            ? 'border-2 border-[#00BAF7] shadow-md'
                            : 'border border-slate-100 dark:border-slate-700 hover:border-[#00BAF7]/50'
                        }`}
                      >
                        <LazyExerciseImage
                          src={resolvedImageUrl}
                          alt={getLocalizedText(option.exercise.name, 'he')}
                        />

                        <div className="flex-1 flex flex-col gap-1.5 text-right items-start">
                          <h3 className="font-bold text-lg text-slate-900 dark:text-white w-full">
                            {getLocalizedText(option.exercise.name, 'he')}
                          </h3>

                          <div className="flex items-center gap-3 flex-wrap">
                            <div className={`flex items-center gap-1 ${levelCfg.color}`}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={levelCfg.src} alt="" width={16} height={16} className="object-contain" />
                              <span className="text-sm font-semibold">רמה {option.resolvedLevel}</span>
                            </div>

                            {gearBadges.length > 0 && (
                              <div className="flex gap-1.5 flex-wrap">
                                {gearBadges.slice(0, 3).map((badge, i) => (
                                  <DrawerGearBadge key={badge.srcList[0] ?? i} srcList={badge.srcList} label={badge.label} />
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── Sticky CTA ── */}
            <div
              className="absolute bottom-0 left-0 right-0 px-6 pt-4 bg-gradient-to-t from-white dark:from-[#1E1E1E] via-white/95 dark:via-[#1E1E1E]/95 to-transparent"
              style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom, 24px))' }}
            >
              {/* ── Optional reason chips (one row, skippable) ── */}
              <div className="mb-3 -mx-6 px-6 pt-2 bg-white/95 dark:bg-[#1E1E1E]/95">
                <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 mb-2 text-right">
                  למה מחליפים? (לא חובה)
                </p>
                <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1 pb-1">
                  {REASON_CHIPS.map((chip) => {
                    const on = reason === chip.id;
                    return (
                      <button
                        key={chip.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setReason(on ? null : chip.id)}
                        className={`flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-semibold border transition-colors active:scale-[0.97] ${
                          on
                            ? 'bg-[#00BAF7]/10 border-[#00BAF7] text-[#0090C0] dark:text-[#5CD3FF]'
                            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {chip.label}
                      </button>
                    );
                  })}
                </div>
                {reason === 'pain' && (
                  <p className="text-xs text-orange-600 dark:text-orange-400 mt-1.5 text-right">
                    כאב הוא סימן לעצור. אם הוא לא עובר — כדאי להתייעץ עם איש מקצוע.
                  </p>
                )}
              </div>
              <button
                onClick={handleReplace}
                disabled={!selectedExercise}
                className={`w-full font-semibold py-4 rounded-full text-lg shadow-lg transition-all ${
                  selectedExercise
                    ? 'text-black hover:opacity-90 active:scale-[0.97] shadow-cyan-400/20'
                    : 'bg-slate-200 dark:bg-slate-700 text-slate-400 cursor-not-allowed'
                }`}
                style={selectedExercise ? { background: 'linear-gradient(135deg, #00BAF7 0%, #0CF2E3 100%)' } : undefined}
              >
                החליפו תרגיל
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
