'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Exercise, ExecutionMethod, getLocalizedText, findMethodForLocation } from '@/features/content/exercises';
import { resolveExerciseMedia } from '@/features/workout-engine/shared/utils/media-resolution.utils';
import { getExerciseVariations, getAlternativeExercises, AlternativeExerciseOption } from '../../../generator/services/exercise-replacement.service';
import { getGearBadgeProps, getMuscleGroupLabel } from '../../../shared/utils/gear-mapping.utils';
import { selectExecutionMethodWithBrand } from '../../../generator/services/execution-method-selector.service';
import { ExecutionLocation } from '@/features/content/exercises';
import { UserFullProfile } from '@/types/user-profile';
import { Park } from '@/types/admin-types';
import { TrendingDown, TrendingUp, Minus, Dumbbell, X } from 'lucide-react';

interface ExerciseReplacementModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentExercise: Exercise;
  currentLevel: number;
  location: ExecutionLocation;
  park: Park | null;
  userProfile: UserFullProfile;
  onReplace: (newExercise: Exercise, executionMethod: ExecutionMethod, levelComparison: 'lower' | 'same' | 'higher') => void;
}

type TabType = 'adaptation' | 'alternative';

const LEVEL_STYLES: Record<string, { color: string }> = {
  lower:  { color: 'text-orange-500' },
  same:   { color: 'text-blue-500' },
  higher: { color: 'text-emerald-500' },
};

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
}: ExerciseReplacementModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('adaptation');
  const [adaptationExercises, setAdaptationExercises] = useState<AlternativeExerciseOption[]>([]);
  const [alternativeExercises, setAlternativeExercises] = useState<AlternativeExerciseOption[]>([]);
  const [selectedExercise, setSelectedExercise] = useState<AlternativeExerciseOption | null>(null);
  const [gearLabels, setGearLabels] = useState<Record<string, { label: string }>>({});

  // Separate loading flags: skeleton stays until ALL async work (fetch + filter + gear labels) completes
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
    setGearLabels({});
    setSelectedExercise(null);

    (async () => {
      try {
        // Tab 1 — Variations
        const variations = await getExerciseVariations(
          currentExercise, currentLevel, location, park, userProfile, activeProgramId,
        );
        if (id !== fetchId.current) return;

        // Resolve gear labels for Tab 1
        const gearPromises: Promise<[string, { label: string }]>[] = [];
        const enqueueGear = (opt: AlternativeExerciseOption) => {
          const m = opt.selectedExecutionMethod || opt.exercise.execution_methods?.find((em) => em.location === location);
          if (!m) return;
          const gearId = m.gearIds?.[0] || (m as any).gearId || '';
          gearPromises.push(
            getGearBadgeProps(m.requiredGearType, gearId).then((p) => [opt.exercise.id, p]),
          );
        };
        for (const v of variations) enqueueGear(v);

        const tab1Labels = await Promise.all(gearPromises);
        if (id !== fetchId.current) return;

        setAdaptationExercises(variations);
        setGearLabels((prev) => ({ ...prev, ...Object.fromEntries(tab1Labels) }));
        setLoadingAdaptation(false);

        // Tab 2 — Alternatives (deduplicated)
        const tab1Ids = new Set(variations.map((v) => v.exercise.id));
        const alternatives = await getAlternativeExercises(
          currentExercise, currentLevel, location, park, userProfile, activeProgramId, tab1Ids,
        );
        if (id !== fetchId.current) return;

        const gearPromises2: Promise<[string, { label: string }]>[] = [];
        for (const a of alternatives) {
          const m = a.selectedExecutionMethod;
          if (!m) continue;
          const gearId = m.gearIds?.[0] || (m as any).gearId || '';
          gearPromises2.push(
            getGearBadgeProps(m.requiredGearType, gearId).then((p) => [a.exercise.id, p]),
          );
        }

        const tab2Labels = await Promise.all(gearPromises2);
        if (id !== fetchId.current) return;

        setAlternativeExercises(alternatives);
        setGearLabels((prev) => ({ ...prev, ...Object.fromEntries(tab2Labels) }));
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
  }, [isOpen, currentExercise, currentLevel, location, park, userProfile, activeProgramId]);

  useEffect(() => { setSelectedExercise(null); }, [activeTab]);

  // ── Handlers ──
  const handleReplace = useCallback(async () => {
    if (!selectedExercise) return;
    let method: ExecutionMethod | undefined;
    if (activeTab === 'adaptation') {
      method = await selectExecutionMethodWithBrand(selectedExercise.exercise, location, park, userProfile);
    } else {
      method = selectedExercise.selectedExecutionMethod;
    }
    if (method) {
      onReplace(selectedExercise.exercise, method, selectedExercise.levelComparison);
      onClose();
    }
  }, [selectedExercise, activeTab, location, park, userProfile, onReplace, onClose]);

  // ── Helpers ──
  const getImage = (ex: Exercise): string => {
    const method = findMethodForLocation(ex, location);
    const { imageUrl } = resolveExerciseMedia(ex as any, method as any);
    return imageUrl || '/images/park-placeholder.svg';
  };

  const getLevelIcon = (c: 'lower' | 'same' | 'higher') =>
    c === 'lower' ? TrendingDown : c === 'higher' ? TrendingUp : Minus;

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
            <div className="flex-1 overflow-y-auto px-6 pb-44">

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
                      ? 'text-[#00E5FF] border-[#00E5FF]'
                      : 'text-slate-400 dark:text-slate-500 border-transparent'
                  }`}
                >
                  התאמת התרגיל
                </button>
                <button
                  onClick={() => setActiveTab('alternative')}
                  className={`flex-1 py-3 text-center font-bold border-b-2 transition-colors ${
                    activeTab === 'alternative'
                      ? 'text-[#00E5FF] border-[#00E5FF]'
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
                    const gearInfo = gearLabels[option.exercise.id];
                    const style = LEVEL_STYLES[option.levelComparison];
                    const LevelIcon = getLevelIcon(option.levelComparison);
                    const resolvedImageUrl = getImage(option.exercise);

                    // DEBUG: verify image URL reaching the UI
                    const methodForDebug = findMethodForLocation(option.exercise, location);
                    console.log(
                      `[SwapUI] "${getLocalizedText(option.exercise.name, 'he')}" (${option.exercise.id})`,
                      `| method.media.imageUrl=${methodForDebug?.media?.imageUrl ?? '(none)'}`,
                      `| method.media.mainVideoUrl=${methodForDebug?.media?.mainVideoUrl ?? '(none)'}`,
                      `| ex.media.imageUrl=${option.exercise.media?.imageUrl ?? '(none)'}`,
                      `| resolved → ${resolvedImageUrl}`,
                    );

                    return (
                      <motion.div
                        key={option.exercise.id}
                        layout
                        onClick={() => setSelectedExercise(option)}
                        className={`bg-white dark:bg-slate-800/50 p-4 rounded-3xl flex items-center gap-5 shadow-sm transition-all cursor-pointer ${
                          isSelected
                            ? 'border-2 border-[#00E5FF] shadow-md'
                            : 'border border-slate-100 dark:border-slate-700 hover:border-[#00E5FF]/50'
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
                            <div className={`flex items-center gap-1 ${style.color}`}>
                              <LevelIcon size={18} />
                              <span className="text-sm font-semibold">רמה {option.resolvedLevel}</span>
                            </div>

                            {gearInfo && (
                              <div className="inline-flex items-center gap-1 bg-slate-50 dark:bg-slate-700/50 px-3 py-1 rounded-full">
                                <Dumbbell size={12} className="text-slate-400" />
                                <span className="text-xs font-bold text-slate-500 dark:text-slate-400">{gearInfo.label}</span>
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
              <button
                onClick={handleReplace}
                disabled={!selectedExercise}
                className={`w-full font-black py-4 rounded-full text-lg shadow-lg transition-all ${
                  selectedExercise
                    ? 'bg-[#00E5FF] hover:opacity-90 active:scale-[0.97] text-slate-900 shadow-[#00E5FF]/20'
                    : 'bg-slate-200 dark:bg-slate-700 text-slate-400 cursor-not-allowed'
                }`}
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
