'use client';

import { useWorkoutTutorialV1 } from '@/hooks/useWorkoutTutorialV1';
import WorkoutOverviewTour from '@/features/workout-engine/tutorial/WorkoutOverviewTour';
import { useContentLanguage } from '@/features/content/shared/useContentLanguage';
import { pickText } from '@/features/content/shared/stored-text-fields';
import { useHomeV2 } from "@/features/home/context/HomeV2Context";
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, useMotionValue, useMotionValueEvent, useTransform, useDragControls, animate } from 'framer-motion';
import { useElementHeight } from '@/hooks/useElementHeight';
import { stickyFooterPaddingPx } from '@/components/ui/v2/bottom-chrome';
import HeroSheetFrame from '@/components/ui/HeroSheetFrame';
import IconButton from '@/components/ui/v2/IconButton';
import { useSheetScrollChain } from '@/hooks/useSheetScrollChain';
import { X, MapPin } from 'lucide-react';
import { useRouter } from 'next/navigation';
import ExerciseReplacementModal from '@/features/workout-engine/players/strength/components/ExerciseReplacementModal';
import { useSwapFixesV1 } from '@/features/workout-engine/players/strength/hooks/useSwapFixesV1';
import { useLocationGateV1 } from '@/hooks/useLocationGateV1';
import { useOverviewMoreMenuV1 } from '@/hooks/useOverviewMoreMenuV1';
import OverviewActionsMenu from './components/OverviewActionsMenu';
import type { LocationAvailability } from './hooks/useLocationSwapPlanner';
import { collectWorkoutExerciseIds } from '@/features/workout-engine/players/strength/logic/swap-fixes';
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
import { Analytics } from '@/features/analytics/AnalyticsService';

// ── Module-internal types + components + hooks ──
import type { WorkoutPreviewDrawerProps } from './types';
import ParkCardImage from './components/ParkCardImage';
import DrawerHeader from './components/DrawerHeader';
import WorkoutWhyLine from './components/WorkoutWhyLine';
import WorkoutLocationSwitcher from './components/WorkoutLocationSwitcher';
import { useSwapAll } from './hooks/useSwapAll';
import { SWAP_ALL_ENABLED } from '@/config/feature-flags';
import type { ExecutionMethod } from '@/features/content/exercises';
import DrawerFooter from './components/DrawerFooter';
import GeneratedWorkoutExerciseList from './components/exercise-list/GeneratedWorkoutExerciseList';
import ExerciseDetailDrawer from './components/ExerciseDetailDrawer';
import EquipmentDetailDrawer from '@/features/parks/client/components/equipment-detail/EquipmentDetailDrawer';
import { useScrollAnimation } from './hooks/useScrollAnimation';
import { useDrawerMediaState } from './hooks/useDrawerMediaState';
import { usePartnerPresence } from './hooks/usePartnerPresence';
import { useExercisePool } from './hooks/useExercisePool';
import { useFavoritesActions } from './hooks/useFavoritesActions';
import TvEntryMenu from '@/features/tv-mode/phone/TvEntryMenu';
import { persistSharedWorkout } from '@/features/workout-engine/services/share.service';
import { useProgramMap } from './hooks/useProgramMap';
import { useWorkoutSession } from './hooks/useWorkoutSession';
import { useExerciseSwap } from './hooks/useExerciseSwap';
import ReportProblemButton from '@/features/generation-review/components/ReportProblemButton';
import { useT } from '@/hooks/useT';
import { library } from '@/messages/ns/library';
import { common } from '@/messages/ns/common';
import { withUnit } from '@/lib/i18n/units';
import { useWhereToTrainV1 } from '@/hooks/useWhereToTrainV1';
import { hasPersona } from '@/features/workout-engine/services/user-profile.utils';
import WhereToTrainSection from '../where-to-train/WhereToTrainSection';
import { useWhereToTrain } from '../where-to-train/useWhereToTrain';
import { chosenParkIdForSwap } from './location-gate/chosen-park';
import { useHybridSwapPark } from '@/features/workout-engine/hybrid/useHybridSwapPark';
import { machineIdOf } from '@/features/workout-engine/players/strength/logic/machine-swap';
import TrainingHereSheet from '@/features/parks/client/components/training-here/TrainingHereSheet';
import { useFeatureInfoSheetsV1 } from '@/features/info-sheets/useFeatureInfoSheetsV1';
import StructureInfoButton from '@/features/info-sheets/structure/StructureInfoButton';

const DRAWER_HEIGHT = '95vh';
const CLOSE_THRESHOLD = 120; // px dragged DOWN to dismiss

/**
 * Skeleton shimmer shown while the workout engine calculates a new workout.
 * Uses the same animate-pulse + token config as CarouselSkeleton on the home
 * dashboard so the visual language stays consistent.
 */
function WorkoutLoadingSkeleton() {
  return (
    <div className="space-y-3 pt-2">
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
  surface,
  sourceParkId = null,
}: WorkoutPreviewDrawerProps) {
  const homeV2 = useHomeV2();
  const t = useT(library);
  const contentLang = useContentLanguage();
  const router = useRouter();
  const { profile } = useUserStore();
  const tutorialOn = useWorkoutTutorialV1();
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
  // enable_home_v2: ONE close button at a time — the hero's while the hero shows, the
  // sticky header's once it has faded in (flips at half opacity; re-renders only on flip).
  const [headerShown, setHeaderShown] = useState(false);
  useMotionValueEvent(headerOpacity, 'change', (v) => {
    const shown = v >= 0.5;
    setHeaderShown((prev) => (prev === shown ? prev : shown));
  });
  // enable_home_v2: the scroll body ends above the sticky footer (share bar + CTA), so
  // the last exercise is never covered — padding = the footer's measured height + a gap.
  const [footerRef, footerHeight] = useElementHeight<HTMLDivElement>();

  const heroClosePointerEvents = useTransform(
    imageOpacity,
    (v) => (v < 0.1 ? 'none' : 'auto') as 'none' | 'auto',
  );

  // Hero media is derived from THIS drawer's live workout (not a global
  // sessionStorage slot), so a swap / swap-all / option-switch updates it and it
  // always tracks the exercises actually shown. Location follows the workout's
  // stamped executionLocation (updated by swap-all), falling back to the prop.
  const locationGateOn = useLocationGateV1(); // enable_location_gate_v1
  const featureInfoOn = useFeatureInfoSheetsV1(); // enable_feature_info_sheets_v1: "i" after the title
  const moreMenuOn = useOverviewMoreMenuV1(); // enable_overview_more_menu_v1
  const { heroMedia, cachedHeroThumb, cachedHeroVideo } = useDrawerMediaState(
    generatedWorkout?.exercises,
    (generatedWorkout?.executionLocation as string | undefined) ??
      (workoutLocation as string | undefined) ??
      null,
    workout?.coverImage,
    locationGateOn,
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

  const swapFixesOn = useSwapFixesV1();
  const {
    replacementModalOpen,
    exerciseToReplace,
    exerciseToReplaceLevel,
    handleOpenSwapModal,
    handleOpenPyramidStepSwap,
    handleExerciseReplace,
    closeReplacementModal,
  } = useExerciseSwap({
    generatedWorkout,
    onGeneratedWorkoutUpdate,
    // Phase 0 swap log only — the live location (swap-all stamps it on the content).
    location:
      (generatedWorkout?.executionLocation as string | undefined) ||
      (workoutLocation as string | undefined) ||
      'park',
    swapFixesOn,
  });
  const swapExcludeIds = React.useMemo(
    () => (swapFixesOn && generatedWorkout ? collectWorkoutExerciseIds(generatedWorkout.exercises as any) : null),
    [swapFixesOn, generatedWorkout],
  );

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
  // Unify machine-detail UI (16.09.2026 follow-up): a machine pseudo-exercise
  // (compose-park-strength-workout.service.ts's buildMachinePseudoExercise —
  // marked by reasoning:['park_workout:machine_block']) opens the SAME rich
  // EquipmentDetailDrawer the park sheet/map use, instead of the lean
  // MasterExerciseView path — which can't resolve a machine's video (the
  // pseudo-exercise carries it on `.method.media.mainVideoUrl`, a sibling of
  // `.exercise` that MasterExerciseView never receives; EquipmentDetailDrawer
  // instead re-fetches the real GymEquipment doc directly by id). The
  // pseudo-exercise's `.exercise.id` IS the gym_equipment doc id — the
  // machine IS the exercise, see buildMachinePseudoExercise's own comment.
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<string | null>(null);
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
    if (ex.reasoning?.includes('park_workout:machine_block')) {
      setSelectedEquipmentId(ex.exercise.id);
      return;
    }
    setDetailExercise(ex);
  }, []);

  const handleDetailDismiss = useCallback(() => {
    setDetailExercise(null);
  }, []);

  const handleEquipmentDetailDismiss = useCallback(() => {
    setSelectedEquipmentId(null);
  }, []);

  // ── Location swap-all (bulk + single), gated by SWAP_ALL_ENABLED ──
  // Prefer the location stamped on the content by a prior swap, so the switcher
  // badge and the swap no-op guard track the LIVE location (not the static prop,
  // which the parent never updates after a swap).
  const resolvedSwapLocation: ExecutionLocation =
    (generatedWorkout?.executionLocation as ExecutionLocation) ||
    (workoutLocation as ExecutionLocation) ||
    'park';
  // ── enable_where_to_train_v1: "איפה מתאמנים?" under the title + the shared sheet ──
  // (above the swap: a switch to the park uses the park chosen there — chosen-park.ts)
  const whereOn = useWhereToTrainV1();
  const where = useWhereToTrain(whereOn && isOpen && !!generatedWorkout, generatedWorkout?.exercises);
  const wherePicked = whereOn ? where.pickedParkId : null;
  const whereSuggested = whereOn ? where.selectedParkId : null;
  const swapParkIdFor = useCallback(
    (location: ExecutionLocation) =>
      chosenParkIdForSwap({ location, pickedParkId: wherePicked, sourceParkId, suggestedParkId: whereSuggested }),
    [wherePicked, sourceParkId, whereSuggested],
  );
  // Pilot AJ9: a park machine swaps for THIS park's other machines, so the sheet needs the park
  // (its gymEquipment). Loaded only while a machine is being swapped.
  const swapMachinePark = useHybridSwapPark(
    exerciseToReplace && machineIdOf(exerciseToReplace) ? swapParkIdFor('park') : null,
    true,
  );
  const { swapAll, isSwapping, lastResult: swapResult, checkAvailability } = useSwapAll({
    generatedWorkout,
    onGeneratedWorkoutUpdate,
    userProfile: profile,
    currentLocation: resolvedSwapLocation,
    exercisePool,
    locationGateEnabled: locationGateOn,
    parkIdFor: swapParkIdFor,
  });
  // enable_location_gate_v1: which other locations the switcher may offer, decided by a dry-run when it
  // opens; reset whenever the workout changes (a swap, a method pick) so a stale verdict never lingers.
  const [locationAvailability, setLocationAvailability] = useState<Record<string, LocationAvailability>>({});
  useEffect(() => {
    setLocationAvailability({});
  }, [generatedWorkout]);
  // AA4 (phone test 28.10): a workout with no home version shows the parks alone, no בית / פארק toggle.
  // One dry-run for 'home' when the where-to-train drawer opens (the swap reuses the cached plan).
  const [homeCheck, setHomeCheck] = useState<LocationAvailability | null>(null);
  useEffect(() => {
    setHomeCheck(null);
    if (!whereOn || !locationGateOn || !isOpen || !generatedWorkout || resolvedSwapLocation === 'home') return;
    let cancelled = false;
    void checkAvailability(['home']).then((r) => { if (!cancelled) setHomeCheck(r.home ?? null); });
    return () => { cancelled = true; };
  }, [whereOn, locationGateOn, isOpen, generatedWorkout, resolvedSwapLocation, checkAvailability]);
  const homeBlocked =
    locationGateOn && (homeCheck?.allowed === false || swapResult?.blockedLocation === 'home');
  const handleLocationSwitcherOpen = useCallback(
    (others: ExecutionLocation[]) => {
      if (locationGateOn) void checkAvailability(others).then(setLocationAvailability);
    },
    [locationGateOn, checkAvailability],
  );


  // ── B: loading-skeleton gate during a select's media re-resolution (instead of a white gap) ──
  // isSwapping already covers the async location swapAll window. methodRecomputing covers the
  // synchronous per-exercise method change, held ~250ms past the generatedWorkout flip to bridge the
  // thumbnail/video re-resolution that follows it (the [generatedWorkout] flip is the real trigger;
  // the 250ms is the bridge duration so the skeleton doesn't lift onto a still-loading frame).
  const [methodRecomputing, setMethodRecomputing] = useState(false);
  useEffect(() => {
    if (!methodRecomputing) return;
    const timer = setTimeout(() => setMethodRecomputing(false), 250);
    return () => clearTimeout(timer);
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

  const tc = useT(common);
  // Military persona keeps its "service" location (as in WorkoutLocationSwitcher) — a third segment.
  const whereShowService = profile ? hasPersona(profile, 'military') : false;

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
    (generatedWorkout?.title ? pickText(generatedWorkout, 'title', contentLang) : '') || dynamicContent?.title || workout?.title || '';

  // enable_where_to_train_v1: "אימון עליון · 45 דק׳" for the shared sheet.
  const whereWorkoutLabel = whereOn && displayTitle
    ? (generatedWorkout?.estimatedDuration
        ? t('preview.where.workoutLine', { title: displayTitle, duration: withUnit('min', String(Math.round(generatedWorkout.estimatedDuration)), tc) })
        : displayTitle)
    : null;
  const whereFooterShare = React.useMemo(
    () => (whereOn ? { place: where.selectedPlace, alternatives: where.places, workoutLabel: whereWorkoutLabel } : undefined),
    [whereOn, where.selectedPlace, where.places, whereWorkoutLabel],
  );

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

  // Journey Hub Phase 2 (07.10.2026) — workout_detail_viewed, the
  // highest-priority event this phase: fires once per real "the user is
  // actually looking at this workout's detail" moment. Keyed on
  // workout?.id (not generatedWorkout, which has no stable id of its own
  // — see useWorkoutSession.ts's own workoutId resolution) + isOpen, same
  // gating condition the chart/skeleton rendering below already uses.
  useEffect(() => {
    if (isOpen && (workout || generatedWorkout)) {
      Analytics.logWorkoutDetailViewed({
        workoutId: workout?.id ?? 'unknown',
        surface,
      }).catch((error) => {
        console.error('[WorkoutPreviewDrawer] Error logging workout_detail_viewed:', error);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workout?.id, isOpen]);

  const { handleStartWorkout } = useWorkoutSession({
    workout,
    workoutPlan,
    generatedWorkout,
    isWarmupActive,
    workoutLocation,
    onStartWorkout,
    surface,
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
      <HeroSheetFrame
        isOpen={isOpen && !!(workout || generatedWorkout)}
        onClose={onClose}
        v2={homeV2}
        y={y}
        opacity={opacity}
        dragControls={dragControls}
        onDragEnd={handleDragEnd}
        frameStyle={{
          height: DRAWER_HEIGHT,
          maxHeight: '95vh',
          fontFamily: 'var(--font-simpler)',
          willChange: 'transform',
        }}
        classicClassName="fixed bottom-0 end-0 start-0 z-[100] bg-white dark:bg-slate-900 rounded-t-[32px] shadow-2xl overflow-hidden"
        ariaLabel={displayTitle || undefined}
      >
        <DrawerHeader
          headerOpacity={headerOpacity}
          displayTitle={displayTitle}
          onClose={onClose}
          onEditEntry={onEditEntry}
          v2={homeV2}
          inactive={!headerShown}
        />

        {/* Unified scrollable container */}
        <div
          ref={scrollContainerRef}
          className={`h-full overflow-y-auto overflow-x-hidden overscroll-contain${homeV2 ? '' : ' pb-36'}`}
          style={homeV2 ? { paddingBottom: stickyFooterPaddingPx(footerHeight) } : undefined}
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
              className="absolute top-0 start-0 px-3 pb-3 z-10 transform-gpu will-change-transform"
              style={{
                paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.5rem)',
                opacity: imageOpacity,
                pointerEvents: heroClosePointerEvents,
              }}
            >
              {homeV2 ? (
                !headerShown && (
                  <IconButton aria-label={t('preview.hero.close')} tone="glass" size={40} onClick={onClose}>
                    <X size={20} strokeWidth={2.5} />
                  </IconButton>
                )
              ) : (
                <button
                  onClick={onClose}
                  className="w-9 h-9 rounded-full bg-white/90 shadow-md flex items-center justify-center text-slate-700 active:scale-90 transition-transform"
                  aria-label={t('preview.hero.close')}
                >
                  <X size={20} strokeWidth={2.5} />
                </button>
              )}
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
              {featureInfoOn && generatedWorkout && (
                <span className="mt-0.5 shrink-0">
                  <StructureInfoButton
                    exercises={generatedWorkout.exercises}
                    tabata={generatedWorkout.tabataBlock?.config}
                    posterFromVideo={locationGateOn}
                  />
                </span>
              )}
            </div>
            {/* enable_home_v2: why this workout (day focus · split · days / no pull gear). */}
            {homeV2 && (
              <WorkoutWhyLine workout={generatedWorkout} profile={profile} location={resolvedSwapLocation} />
            )}
          </motion.div>

          {/* No intensity pills (קל / מאוזן / אינטנסיבי): owner decision, phone test 28.10 AA3. The
              workout is built at the user's own session length (full-strength-minutes.ts). */}
          {whereOn && generatedWorkout && (
            <WhereToTrainSection
              location={resolvedSwapLocation === 'home' || resolvedSwapLocation === 'service' ? resolvedSwapLocation : 'park'}
              showService={whereShowService || resolvedSwapLocation === 'service'}
              onSelectLocation={(loc) => { void swapAll('location', loc); }}
              isSwapping={isSwapping}
              blockedNotice={
                locationGateOn && swapResult?.blockedLocation
                  ? t('preview.location.unavailable.explained', { location: swapResult.blockedLocation, reason: swapResult.blocked ?? 'notEnoughContent' })
                  : null
              }
              parks={where.parks}
              loading={where.loading}
              selectedParkId={where.selectedParkId}
              onOpenPark={where.openPark}
              homeGearLabels={where.homeGearLabels}
              homeBlocked={homeBlocked}
            />
          )}

          <div className="bg-white dark:bg-slate-900 relative z-10 px-4 pt-4 pb-8">
            {/* Priority: skeleton while loading → generated list → legacy overview */}
            {isGeneratingWorkout && !generatedWorkout ? (
              <WorkoutLoadingSkeleton />
            ) : generatedWorkout ? (
              <>
                {SWAP_ALL_ENABLED && !whereOn && (
                  <WorkoutLocationSwitcher
                    currentLocation={resolvedSwapLocation}
                    isSwapping={isSwapping}
                    onSwap={(v) => { void swapAll('location', v); }}
                    availability={locationGateOn ? locationAvailability : undefined}
                    onOpen={locationGateOn ? handleLocationSwitcherOpen : undefined}
                    blockedLocation={locationGateOn ? swapResult?.blockedLocation ?? null : null}
                    blockedReason={swapResult?.blocked ?? null}
                  />
                )}
                {isRecomputing ? (
                  <WorkoutLoadingSkeleton />
                ) : (
                  <GeneratedWorkoutExerciseList
                    generatedWorkout={generatedWorkout}
                    exercisePool={exercisePool}
                    posterFromVideo={locationGateOn}
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
                      // enable_tv_mode_v1: ⋯ → "show on a big screen" (renders nothing with the flag off).
                      // enable_overview_more_menu_v1: the icons + the TV ⋯ collapse into one menu (flag off = unchanged).
                      menu: moreMenuOn ? (
                        <OverviewActionsMenu
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
                          workout={generatedWorkout}
                          onStart={() => handleStartWorkout()}
                          prepareShare={async () => (await persistSharedWorkout(generatedWorkout, workoutLocation)).docId}
                        />
                      ) : undefined,
                      trailing: (
                        <TvEntryMenu
                          workout={generatedWorkout}
                          onStart={() => handleStartWorkout()}
                          prepareShare={async () => (await persistSharedWorkout(generatedWorkout, workoutLocation)).docId}
                        />
                      ),
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
            {!whereOn && nearbyParks.length > 0 && (
              <section className="mt-6 mb-2">
                <h3 className="text-start font-bold text-lg text-slate-900 dark:text-white mb-3">
                  {t('preview.parks.title')}
                </h3>
                <div
                  className="flex gap-3 overflow-x-auto overscroll-x-contain no-scrollbar -mx-6 px-6 scroll-px-6 pb-1 snap-x snap-mandatory"
                >
                  {nearbyParks.map((park, idx) => (
                    <motion.div
                      key={park.id}
                      initial={{ opacity: 0, x: 30 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.08, duration: 0.35 }}
                      className="flex-shrink-0 snap-start snap-always w-[160px] rounded-2xl border-[0.5px] border-[#E0E9FF] dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-800/60 shadow-sm"
                    >
                      <ParkCardImage
                        src={park.imageUrl}
                        fallback={PARK_FALLBACK_IMAGE}
                        alt={park.name}
                        eager={idx < 2}
                      />
                      <div className="px-2.5 py-2">
                        <p className="font-bold text-[13px] text-gray-900 dark:text-white truncate">
                          {park.name}
                        </p>
                        <div className="flex items-center gap-1 mt-1 text-slate-500 dark:text-slate-400">
                          <MapPin size={12} className="flex-shrink-0" />
                          <span className="text-xs font-medium">
                            {park.walkingMinutes <= 1
                              ? t('preview.parks.walkOne')
                              : t('preview.parks.walk', { minutes: String(park.walkingMinutes) })}
                          </span>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </section>
            )}
            <ReportProblemButton types={['home_strength', 'kelly_workout']} wrapperClassName="flex justify-center py-3" />
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
          measureRef={homeV2 ? footerRef : undefined}
          shareTrainingHere={whereFooterShare}
        />
      </HeroSheetFrame>

      {/* enable_where_to_train_v1: a park card → the ONE "I'm training here" sheet. */}
      {whereOn && where.sheetPlace && (
        <TrainingHereSheet
          open={where.sheetOpen}
          onClose={where.closeSheet}
          activity="workout"
          workoutLabel={whereWorkoutLabel}
          workoutTitle={displayTitle || null}
          place={where.sheetPlace}
          alternatives={where.places}
          onStartNow={() => handleStartWorkout()}
          onPickOnly={where.pickOnly}
          onPublished={(_id, place) => where.pickOnly(place)}
        />
      )}

      {/* enable_workout_tutorial_v1: first-time "now the warm-up" / "now the main part" bubbles. */}
      <WorkoutOverviewTour
        enabled={tutorialOn && isOpen && !!generatedWorkout && !isRecomputing && !detailExercise && !replacementModalOpen}
        uid={profile?.id}
      />

      {/* Exercise detail hero drawer (memoised + lazy) — regular exercises only;
          machine pseudo-exercises are routed to EquipmentDetailDrawer below. */}
      <ExerciseDetailDrawer
        detailExercise={detailExercise}
        programMap={programMap}
        onDismiss={handleDetailDismiss}
        onMethodChange={SWAP_ALL_ENABLED ? handleSingleMethodChange : undefined}
      />

      {/* Machine detail — the SAME drawer the park sheet/map use for this
          equipment (unify machine-detail UI, 16.09.2026). pinnedToPark: the
          park already determined which machine/brand this is; no catalogue
          brand-switcher needed here. */}
      <EquipmentDetailDrawer
        isOpen={!!selectedEquipmentId}
        onClose={handleEquipmentDetailDismiss}
        equipmentId={selectedEquipmentId}
        pinnedToPark
      />

      {/* Exercise replacement modal */}
      {exerciseToReplace && profile && (
        <ExerciseReplacementModal
          isOpen={replacementModalOpen}
          onClose={closeReplacementModal}
          currentExercise={exerciseToReplace}
          currentLevel={exerciseToReplaceLevel}
          location={resolvedLocation}
          park={swapMachinePark}
          userProfile={profile as any}
          onReplace={handleExerciseReplace}
          excludeExerciseIds={swapExcludeIds}
        />
      )}
    </>
  );
}
