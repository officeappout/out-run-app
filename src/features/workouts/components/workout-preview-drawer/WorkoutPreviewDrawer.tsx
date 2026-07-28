'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform, useDragControls, animate } from 'framer-motion';
import { useSheetScrollChain } from '@/hooks/useSheetScrollChain';
import { X, MapPin } from 'lucide-react';
import { useRouter } from 'next/navigation';
import ExerciseReplacementModal from '@/features/workout-engine/players/strength/components/ExerciseReplacementModal';
import StrengthOverviewCard from '@/features/workout-engine/components/StrengthOverviewCard';
import type { ExecutionLocation } from '@/features/content/exercises';
import { useUserStore } from '@/features/user';
import type { WorkoutExercise as EngineWorkoutExercise } from '@/features/workout-engine/logic/WorkoutGenerator';
import { generateWorkoutExperience } from '@/features/workout-engine/utils/messageGenerator';
import { type WorkoutClassification } from '@/features/workout-engine/utils/classification';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { usePartnerFilters } from '@/features/partners';
import { useMapStore } from '@/features/parks/core/store/useMapStore';
import { PARK_FALLBACK_IMAGE } from '@/features/parks/core/hooks/useNearbyParks';

// ── Module-internal types + components + hooks ──
import type { WorkoutPreviewDrawerProps } from './types';
import ParkCardImage from './components/ParkCardImage';
import DrawerHeader from './components/DrawerHeader';
import WorkoutLocationSwitcher from './components/WorkoutLocationSwitcher';
import { useSwapAll } from './hooks/useSwapAll';
import { SWAP_ALL_ENABLED } from '@/config/feature-flags';
import type { ExecutionMethod } from '@/features/content/exercises';
import DrawerFooter from './components/DrawerFooter';
import GeneratedWorkoutExerciseList from './components/exercise-list/GeneratedWorkoutExerciseList';
import ExerciseDetailDrawer from './components/ExerciseDetailDrawer';
import { useScrollAnimation } from './hooks/useScrollAnimation';
import { useDrawerMediaState } from './hooks/useDrawerMediaState';
import { usePartnerPresence } from './hooks/usePartnerPresence';
import { useExercisePool } from './hooks/useExercisePool';
import { useFavoritesActions } from './hooks/useFavoritesActions';
import { useProgramMap } from './hooks/useProgramMap';
import { useWorkoutSession } from './hooks/useWorkoutSession';
import { useExerciseSwap } from './hooks/useExerciseSwap';

const DRAWER_HEIGHT = '95vh';
const CLOSE_THRESHOLD = 120; // px dragged DOWN to dismiss

/**
 * Skeleton shimmer shown while the workout engine calculates a new workout.
 * Uses the same animate-pulse + token config as CarouselSkeleton on the home
 * dashboard so the visual language stays consistent.
 */
function WorkoutLoadingSkeleton() {
  return (
    <div className="space-y-3 pt-2" dir="rtl">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-3 animate-pulse">
          <div className="w-[72px] h-[72px] rounded-2xl bg-gray-100 dark:bg-slate-800 flex-shrink-0" />
          <div className="flex-1 space-y-2.5 py-1">
            <div className="h-4 rounded-lg bg-gray-100 dark:bg-slate-800 w-3/4" />
            <div className="h-3 rounded-lg bg-gray-100 dark:bg-slate-800 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * WorkoutPreviewDrawer — Draggable bottom sheet for workout preview.
 *
 * Post-refactor composition root.  All side-effects, async fetches, swap
 * mutation logic, scroll math, and presentational sub-trees live in the
 * dedicated hooks + components under `./hooks/` and `./components/`.
 * This file's job is exclusively to wire those primitives together
 * and stamp out the visual shell.
 */
export default function WorkoutPreviewDrawer({
  isOpen,
  onClose,
  workout,
  onStartWorkout,
  generatedWorkout,
  workoutLocation,
  onGeneratedWorkoutUpdate,
  onEditEntry,
  isGeneratingWorkout = false,
}: WorkoutPreviewDrawerProps) {
  const router = useRouter();
  const { profile } = useUserStore();
  const y = useMotionValue(0);
  // Opacity fades as the user drags the sheet down — starts immediately, completes at 220 px.
  const opacity = useTransform(y, [0, 220], [1, 0]);

  // ── Hook bus — every async / state concern lives here. ──
  const {
    scrollContainerRef,
    imageOpacity,
    imageScale,
    headerOpacity,
    dynamicHeight,
    titleScale,
  } = useScrollAnimation(isOpen);

  const dragControls = useDragControls();

  // Instagram-style gesture chain: intercepts down-swipe at scrollTop=0 and
  // drives the sheet's y MotionValue directly, no React re-renders.
  useSheetScrollChain({ isOpen, y, onClose, scrollRef: scrollContainerRef });

  // Gate pointer-events on the hero close button using a compositor-thread
  // transform so it never blocks taps when faded out.
  const heroClosePointerEvents = useTransform(
    imageOpacity,
    (v) => (v < 0.1 ? 'none' : 'auto') as 'none' | 'auto',
  );

  // Hero media is derived from THIS drawer's live workout (not a global
  // sessionStorage slot), so a swap / swap-all / option-switch updates it and it
  // always tracks the exercises actually shown. Location follows the workout's
  // stamped executionLocation (updated by swap-all), falling back to the prop.
  const { heroMedia, cachedHeroThumb, cachedHeroVideo } = useDrawerMediaState(
    generatedWorkout?.exercises,
    (generatedWorkout?.executionLocation as string | undefined) ??
      (workoutLocation as string | undefined) ??
      null,
    workout?.coverImage,
  );

  const { userLocation, similarCount, nearbyParks } = usePartnerPresence(isOpen);

  const { exercisePool, workoutPlan } = useExercisePool({
    isOpen,
    generatedWorkout,
    workoutId: workout?.id,
  });

  const { programMap } = useProgramMap();

  const {
    isFav,
    isFavToggling,
    isFavDownloaded,
    isFavDownloading,
    dlProgress,
    isSharing,
    handleToggleFavorite,
    handleDownload,
    handleShare,
  } = useFavoritesActions({ generatedWorkout, workout, workoutLocation });

  const {
    replacementModalOpen,
    exerciseToReplace,
    exerciseToReplaceLevel,
    handleOpenSwapModal,
    handleOpenPyramidStepSwap,
    handleExerciseReplace,
    closeReplacementModal,
  } = useExerciseSwap({ generatedWorkout, onGeneratedWorkoutUpdate });

  const isOnline = useOnlineStatus();
  const workoutTitleForPresence = generatedWorkout?.title ?? workout?.title ?? '';
  const resolvedLocation: ExecutionLocation =
    (workoutLocation as ExecutionLocation) || 'park';

  // ── Local UI state (presentational only) ──
  const [dynamicContent, setDynamicContent] = useState<{
    title: string;
    description: string;
    classification?: WorkoutClassification;
    isPersonalized?: boolean;
    matchedGoals?: string[];
  } | null>(null);
  const [, setIsGenerating] = useState(false);
  const [isAudioEnabled, setIsAudioEnabled] = useState(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('isAudioEnabled') === 'true';
    }
    return false;
  });
  const [isWarmupExpanded, setIsWarmupExpanded] = useState(false);
  const [isWarmupActive, setIsWarmupActive] = useState(true);
  const [detailExercise, setDetailExercise] =
    useState<EngineWorkoutExercise | null>(null);
  // §2: raised by an in-place per-exercise method swap so the [generatedWorkout] reset
  // effect below skips closing the detail drawer for that ONE update. A real workout-level
  // swap / regeneration does NOT raise it, so those still reset the drawer as before.
  const inPlaceEditRef = useRef(false);
  // §1 (batch 1): keep ONE stable hero <video> and reload it on src change via ref + .load(),
  // instead of remounting on a `key`. The remount mounted the new element with a STALE
  // cachedHeroVideo (blob-cache lag) → froze on the old frame / flashed the poster. .load()
  // reloads once the RESOLVED src is the new one; the method-locked <img> covers the load gap.
  const heroVideoRef = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    heroVideoRef.current?.load();
    heroVideoRef.current?.play().catch(() => {});
    // Deps: cachedHeroVideo IS the effective src whenever the <video> renders (it's null only when
    // heroMedia?.videoUrl is falsy → element not rendered). With the useCachedMediaUrl hook now
    // re-resolving on url change, cachedHeroVideo tracks every change, so the videoUrl backstop dep
    // is redundant.
  }, [cachedHeroVideo]);

  const toggleAudio = useCallback(() => {
    setIsAudioEnabled((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('isAudioEnabled', String(next));
      }
      return next;
    });
  }, []);

  const handleToggleWarmupActive = useCallback(() => {
    setIsWarmupActive((prev) => {
      if (prev) setIsWarmupExpanded(false);
      return !prev;
    });
  }, []);

  const handleToggleWarmupExpanded = useCallback(() => {
    setIsWarmupExpanded((p) => !p);
  }, []);

  const handleExerciseTap = useCallback((ex: EngineWorkoutExercise) => {
    setDetailExercise(ex);
  }, []);

  const handleDetailDismiss = useCallback(() => {
    setDetailExercise(null);
  }, []);

  // ── Location swap-all (bulk + single), gated by SWAP_ALL_ENABLED ──
  // Prefer the location stamped on the content by a prior swap, so the switcher
  // badge and the swap no-op guard track the LIVE location (not the static prop,
  // which the parent never updates after a swap).
  const resolvedSwapLocation: ExecutionLocation =
    (generatedWorkout?.executionLocation as ExecutionLocation) ||
    (workoutLocation as ExecutionLocation) ||
    'park';
  const { swapAll, isSwapping } = useSwapAll({
    generatedWorkout,
    onGeneratedWorkoutUpdate,
    userProfile: profile,
    currentLocation: resolvedSwapLocation,
    exercisePool,
  });

  // ── B: loading-skeleton gate during a select's media re-resolution (instead of a white gap) ──
  // isSwapping already covers the async location swapAll window. methodRecomputing covers the
  // synchronous per-exercise method change, held ~250ms past the generatedWorkout flip to bridge the
  // thumbnail/video re-resolution that follows it (the [generatedWorkout] flip is the real trigger;
  // the 250ms is the bridge duration so the skeleton doesn't lift onto a still-loading frame).
  const [methodRecomputing, setMethodRecomputing] = useState(false);
  useEffect(() => {
    if (!methodRecomputing) return;
    const t = setTimeout(() => setMethodRecomputing(false), 250);
    return () => clearTimeout(t);
  }, [generatedWorkout, methodRecomputing]);
  const isRecomputing = isSwapping || methodRecomputing;

  // Single per-exercise method write from MasterExerciseView (detail drawer): persist
  // the picked method to the LIVE workout (so it reaches the runner via Merge 1) and
  // re-sync the detail snapshot so the sheet reflects the new method.
  const handleSingleMethodChange = useCallback(
    (method: ExecutionMethod) => {
      if (!generatedWorkout || !detailExercise) return;
      setMethodRecomputing(true); // B: cover the media re-resolution gap with the skeleton
      const targetId = detailExercise.exercise.id;
      const updatedExercises = generatedWorkout.exercises.map((we) =>
        we.exercise.id === targetId
          ? { ...we, method: method as typeof we.method, wasSwapped: true, dimensionUnavailable: undefined }
          : we,
      );
      inPlaceEditRef.current = true; // §2: keep the detail drawer open across this in-place update
      onGeneratedWorkoutUpdate?.({ ...generatedWorkout, exercises: updatedExercises });
      setDetailExercise((prev) => (prev ? { ...prev, method: method as typeof prev.method } : prev));
    },
    [generatedWorkout, detailExercise, onGeneratedWorkoutUpdate],
  );

  const handleOpenLivePartners = useCallback(() => {
    usePartnerFilters.getState().setLiveActivity('strength');
    useMapStore.getState().setPendingPartnerOverlay({ tab: 'live' });
    onClose();
    router.push('/map');
  }, [onClose, router]);

  // ── Per-workout state reset ──
  // With a stable component key (no remount on workout change), reset
  // per-session UI state whenever a new GeneratedWorkout object arrives.
  // Runs ONLY when generatedWorkout transitions from null → a real workout
  // (guarded by the early return), so it never triggers on the skeleton phase.
  useEffect(() => {
    if (!generatedWorkout) return;
    // §2: an in-place per-exercise swap already re-synced detailExercise itself — skip the
    // reset AND clear the flag HERE (same effect, not a cleanup) so the next real workout
    // swap / regeneration still resets the drawer.
    if (inPlaceEditRef.current) { inPlaceEditRef.current = false; return; }
    setIsWarmupExpanded(false);
    setIsWarmupActive(true);
    setDetailExercise(null);
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [generatedWorkout]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Dynamic content (title / description / classification) ──
  // Keyed on workout.id + isOpen only to prevent goal-change re-render loops.
  const userGoals = profile?.selectedGoals || [];
  useEffect(() => {
    if (workout && isOpen) {
      setIsGenerating(true);
      generateWorkoutExperience(workout, undefined, userGoals)
        .then((result) => {
          setDynamicContent({
            title: result.title,
            description: result.description,
            classification: result.classification,
            isPersonalized: result.isPersonalized,
            matchedGoals: result.matchedGoals,
          });
          setIsGenerating(false);
        })
        .catch((error) => {
          console.error('[WorkoutPreviewDrawer] Error generating dynamic content:', error);
          setDynamicContent({
            title: workout.title || '',
            description: workout.description || '',
          });
          setIsGenerating(false);
        });
    } else {
      setDynamicContent(null);
      setIsGenerating(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workout?.id, isOpen]);

  // SYNC FIX: generatedWorkout always wins so a post-adjust render never
  // shows stale dynamicContent.
  const displayTitle =
    generatedWorkout?.title || dynamicContent?.title || workout?.title || '';

  // Body-scroll lock while the drawer is open.
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const { handleStartWorkout } = useWorkoutSession({
    workout,
    workoutPlan,
    generatedWorkout,
    isWarmupActive,
    workoutLocation,
    onStartWorkout,
  });

  const SPRING = { type: 'spring', damping: 40, stiffness: 260, mass: 0.8 } as const;

  const handleDragEnd = useCallback(
    (_event: any, info: any) => {
      const offset = info.offset.y;
      const velocity = info.velocity.y;

      if (offset > CLOSE_THRESHOLD || velocity > 500) {
        onClose();
      } else {
        animate(y, 0, SPRING);
      }
    },
    [onClose, y, SPRING],
  );

  return (
    <>
      <AnimatePresence>
        {isOpen && (workout || generatedWorkout) && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100]"
            />

            <motion.div
              drag="y"
              dragControls={dragControls}
              dragListener={false}
              dragConstraints={{ top: 0, bottom: 500 }}
              dragElastic={{ top: 0.08, bottom: 0 }}
              dragMomentum={false}
              onDragEnd={handleDragEnd}
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 40, stiffness: 260, mass: 0.8 }}
              style={{
                y,
                opacity,
                height: DRAWER_HEIGHT,
                maxHeight: '95vh',
                fontFamily: 'var(--font-simpler)',
                willChange: 'transform',
              }}
              className="fixed bottom-0 left-0 right-0 z-[100] bg-white dark:bg-slate-900 rounded-t-[32px] shadow-2xl overflow-hidden"
              dir="rtl"
            >
              {/* Drag handle — full-width touch target; starts framer drag via dragControls */}
              <div
                className="absolute top-0 left-0 right-0 z-[60] flex justify-center pt-3 pb-4 cursor-grab active:cursor-grabbing"
                onPointerDown={(e) => dragControls.start(e)}
                style={{ touchAction: 'none' }}
              >
                <div className="w-10 h-1.5 rounded-full bg-gray-300 dark:bg-gray-600" />
              </div>

              <DrawerHeader
                headerOpacity={headerOpacity}
                displayTitle={displayTitle}
                onClose={onClose}
                onEditEntry={onEditEntry}
              />

              {/* Unified scrollable container */}
              <div
                ref={scrollContainerRef}
                className="h-full overflow-y-auto overflow-x-hidden overscroll-contain pb-36"
              >
                {/* Hero — overflow-hidden prevents image bleed on overscroll */}
                <motion.div
                  className="relative w-full overflow-hidden"
                  style={{
                    height: dynamicHeight,
                    opacity: imageOpacity,
                    scale: imageScale,
                  }}
                >
                  {(cachedHeroThumb || heroMedia?.thumbnailUrl || workout?.coverImage) && (
                    <div className="absolute inset-0" style={{ isolation: 'isolate' }}>
                      {/* White backdrop revealed by the media mask's bottom fade — keeps the fade
                          WHITE with NO separate layer above the video. (A static poster backdrop was
                          tried to hide the switcher-open flash but the masked media revealed it through
                          its dimmed band = double-exposure ghosting; the <body> portal removed the
                          re-composite at its root, so the plain white floor is enough.) */}
                      <div className="absolute inset-0 bg-white" />
                      {/* Media wrapper. The mask does DOUBLE duty on iOS: (1) it IS the bottom fade —
                          the media fades to transparent so the white backdrop shows through, so there
                          is NO overlay layer for the <video> to paint above; (2) applying a mask forces
                          the <video> OFF the iOS hardware-overlay fast-path (it must be composited to be
                          masked) — the actual root of the raw-square-no-fade bug that z-index couldn't
                          beat. */}
                      <div
                        className="absolute inset-0"
                        style={{
                          WebkitMaskImage:
                            'linear-gradient(to top, rgba(255,255,255,0) 13%, rgba(255,255,255,0.4) 42%, rgba(255,255,255,1) 85%)',
                          maskImage:
                            'linear-gradient(to top, rgba(255,255,255,0) 13%, rgba(255,255,255,0.4) 42%, rgba(255,255,255,1) 85%)',
                          transform: 'translateZ(0)',
                        }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={cachedHeroThumb || heroMedia?.thumbnailUrl || workout?.coverImage}
                          alt={displayTitle}
                          className="absolute inset-0 w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                        {(cachedHeroVideo || heroMedia?.videoUrl) && (
                          <video
                            ref={heroVideoRef}
                            src={cachedHeroVideo || heroMedia?.videoUrl}
                            autoPlay
                            loop
                            muted
                            playsInline
                            {...{"webkit-playsinline": "true"}}
                            preload="auto"
                            className="absolute inset-0 w-full h-full object-cover"
                          />
                        )}
                      </div>
                      {/* Top dark gradient for close-button legibility. With the video no longer a
                          free hardware overlay, this z-index now paints above it normally. */}
                      <div
                        className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/25 to-transparent pointer-events-none"
                        style={{ transform: 'translateZ(0)', willChange: 'transform', zIndex: 2 }}
                      />
                    </div>
                  )}

                  {/* B: skeleton overlay over the hero while a select re-resolves media — reuses the
                      same animate-pulse token as WorkoutLoadingSkeleton; below the z-10 close button. */}
                  {isRecomputing && (
                    <div className="absolute inset-0 bg-gray-100 dark:bg-slate-800 animate-pulse z-[5]" />
                  )}

                  {/* Hero close button — fades with hero */}
                  <motion.div
                    className="absolute top-0 right-0 px-3 pb-3 z-10 transform-gpu will-change-transform"
                    style={{
                      paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.5rem)',
                      opacity: imageOpacity,
                      pointerEvents: heroClosePointerEvents,
                    }}
                  >
                    <button
                      onClick={onClose}
                      className="w-9 h-9 rounded-full bg-white/90 shadow-md flex items-center justify-center text-slate-700 active:scale-90 transition-transform"
                      aria-label="סגור"
                    >
                      <X size={20} strokeWidth={2.5} />
                    </button>
                    </motion.div>
                </motion.div>

                {/* Workout title — compositor-thread scale collapse */}
                <motion.div
                  className="relative z-20 -mt-14 px-6 pb-2 will-change-transform"
                  style={{
                    scale: titleScale,
                    originX: 1,
                    originY: 1,
                  }}
                >
                  <div className="flex items-start gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/icons/programs/full_body.svg"
                      alt=""
                      width={20}
                      height={20}
                      className="flex-shrink-0 mt-0.5"
                      style={{ filter: 'brightness(0)' }}
                    />
                    <h1 className="text-lg font-bold text-gray-900 dark:text-white leading-tight whitespace-normal">
                      {displayTitle}
                    </h1>
                  </div>
                </motion.div>

                <div className="bg-white dark:bg-slate-900 relative z-10 px-4 pt-4 pb-8">
                  {/* Priority: skeleton while loading → generated list → legacy overview */}
                  {isGeneratingWorkout && !generatedWorkout ? (
                    <WorkoutLoadingSkeleton />
                  ) : generatedWorkout ? (
                    <>
                      {SWAP_ALL_ENABLED && (
                        <WorkoutLocationSwitcher
                          currentLocation={resolvedSwapLocation}
                          isSwapping={isSwapping}
                          onSwap={(v) => { void swapAll('location', v); }}
                        />
                      )}
                      {isRecomputing ? (
                        <WorkoutLoadingSkeleton />
                      ) : (
                        <GeneratedWorkoutExerciseList
                          generatedWorkout={generatedWorkout}
                          exercisePool={exercisePool}
                          onSwap={handleOpenSwapModal}
                          onSwapPyramidStep={handleOpenPyramidStepSwap}
                          onExerciseTap={handleExerciseTap}
                          isWarmupExpanded={isWarmupExpanded}
                          isWarmupActive={isWarmupActive}
                          onToggleWarmupExpanded={handleToggleWarmupExpanded}
                          onToggleWarmupActive={handleToggleWarmupActive}
                          actions={{
                            isFav,
                            isFavToggling,
                            isFavDownloading,
                            isFavDownloaded,
                            downloadProgress: dlProgress,
                            isSharing,
                            onToggleFavorite: handleToggleFavorite,
                            onShare: handleShare,
                            onDownload: handleDownload,
                          }}
                        />
                      )}
                    </>
                  ) : (
                    workoutPlan && (
                      <StrengthOverviewCard
                        workoutPlan={workoutPlan}
                        userProfile={profile || undefined}
                        coverImage={workout?.coverImage}
                        onStartWorkout={handleStartWorkout}
                      />
                    )
                  )}

                  {/* "Where to Train" — nearest parks carousel */}
                  {nearbyParks.length > 0 && (
                    <section className="mt-6 mb-2">
                      <h3 className="text-right font-bold text-lg text-slate-900 dark:text-white mb-3">
                        איפה כדאי להתאמן?
                      </h3>
                      <div
                        className="flex gap-3 overflow-x-auto no-scrollbar -mx-6 px-6 pb-1"
                        dir="rtl"
                      >
                        {nearbyParks.map((park, idx) => (
                          <motion.div
                            key={park.id}
                            initial={{ opacity: 0, x: 30 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: idx * 0.08, duration: 0.35 }}
                            className="flex-shrink-0 w-[200px] rounded-2xl border-[0.5px] border-[#E0E9FF] dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-800/60 shadow-sm"
                          >
                            <ParkCardImage
                              src={park.imageUrl}
                              fallback={PARK_FALLBACK_IMAGE}
                              alt={park.name}
                              eager={idx < 2}
                            />
                            <div className="p-3">
                              <p className="font-bold text-sm text-gray-900 dark:text-white truncate">
                                {park.name}
                              </p>
                              <div className="flex items-center gap-1 mt-1.5 text-slate-500 dark:text-slate-400">
                                <MapPin size={13} className="flex-shrink-0" />
                                <span className="text-xs font-medium">
                                  {park.walkingMinutes <= 1
                                    ? 'דקה הליכה ממך'
                                    : `${park.walkingMinutes} דקות הליכה ממך`}
                                </span>
                              </div>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    </section>
                  )}
                </div>
              </div>

              <DrawerFooter
                similarCount={similarCount}
                onOpenLivePartners={handleOpenLivePartners}
                workoutTitleForPresence={workoutTitleForPresence}
                userLocation={userLocation}
                isOnline={isOnline}
                isFavDownloaded={isFavDownloaded}
                onStart={handleStartWorkout}
                onEditEntry={onEditEntry}
                isAudioEnabled={isAudioEnabled}
                onToggleAudio={toggleAudio}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Exercise detail hero drawer (memoised + lazy) */}
      <ExerciseDetailDrawer
        detailExercise={detailExercise}
        programMap={programMap}
        onDismiss={handleDetailDismiss}
        onMethodChange={SWAP_ALL_ENABLED ? handleSingleMethodChange : undefined}
      />

      {/* Exercise replacement modal */}
      {exerciseToReplace && profile && (
        <ExerciseReplacementModal
          isOpen={replacementModalOpen}
          onClose={closeReplacementModal}
          currentExercise={exerciseToReplace}
          currentLevel={exerciseToReplaceLevel}
          location={resolvedLocation}
          park={null}
          userProfile={profile as any}
          onReplace={handleExerciseReplace}
        />
      )}
    </>
  );
}
