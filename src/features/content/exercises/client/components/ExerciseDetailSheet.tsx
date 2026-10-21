'use client';

/**
 * ExerciseDetailSheet — library exercise detail surface ("Spotify Track Page").
 *
 * A single immersive 95vh bottom sheet with ONE vertical scroll conduit:
 * the network-aware hero video sits at the top of MasterExerciseView and every
 * section flows beneath it in the same scroll timeline. No nested scrollers,
 * no snap points, no morphing hero — a clean drag-down from the top dismisses.
 *
 * This component owns only the sheet chrome (portal, backdrop, drag-to-dismiss,
 * close, body-scroll-lock). All content + data live in MasterExerciseView.
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { useExerciseLibraryStore } from '../store/useExerciseLibraryStore';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useUserStore } from '@/features/user';
import MasterExerciseView from './MasterExerciseView';
import Sheet from '@/components/ui/v2/Sheet';
import IconButton from '@/components/ui/v2/IconButton';
import { SHEET_Z, type SheetZIndex } from '@/components/ui/v2/tokens';
import type { Exercise } from '../../core/exercise.types';
import { useT } from '@/hooks/useT';
import { library } from '@/messages/ns/library';

export interface ExerciseDetailSheetProps {
  /**
   * When set, overrides the GLOBAL useExerciseLibraryStore filters.location
   * for this instance only — added for the Progression Map screen, which
   * needs every open here to resolve the park execution-method regardless
   * of whatever the user last set in the real library filter (which this
   * sheet would otherwise silently inherit). Deliberately a local prop, not
   * another write to the shared store: an earlier version forced the
   * global filter on mount/restored it on unmount, which turned out to
   * cause real churn (MasterExerciseView's own method-reseed effect is
   * keyed off filterLocation, so mutating a value shared across every
   * mounted consumer of that store was exactly the kind of cross-component
   * side effect worth avoiding). Omitted (undefined) for every existing
   * caller — falls through to the global filter, byte-identical to before.
   */
  locationOverride?: 'home' | 'park' | 'gym';
  /**
   * Feature #5 (program/path switcher, Phase 1): the initial selected path
   * when the exercise belongs to 2+ targetPrograms — passed straight
   * through to MasterExerciseView. SkillTreeScreen passes its own tree's
   * programId here (the route param it already holds) so opening the
   * sheet from a Skill Tree defaults to THAT tree's path, not whichever
   * program happens to resolve first. Omitted for every other caller —
   * MasterExerciseView falls back to its own default
   * (resolveTreeProgramId(exercise), then targetPrograms[0]), unchanged
   * from before this prop existed.
   */
  defaultProgramId?: string | null;
  /**
   * Round 6 (Progression Map, sheet round 6): when set, this instance is
   * driven ENTIRELY by these local props instead of the global
   * useExerciseLibraryStore open/close state. Added because the global
   * store is an app-wide portal that survives a screen unmount and
   * re-renders on whatever screen loads next — five rounds of patching the
   * close path (popstate, pushState, pathname-change effects, unmount
   * cleanup) all failed to fully close that gap, because the real fix was
   * never "close it better," it was "don't share app-wide open/close state
   * with a screen-scoped sheet." A caller in controlled mode owns its own
   * `exercise` state; when the screen that renders this sheet unmounts
   * (bottom nav, back, any navigation), the sheet unmounts with it — there
   * is no shared state left for anything else to read as "still open."
   * Omitted (undefined) for every other caller (ExerciseLibraryPage) —
   * falls through to the global store, byte-identical to before.
   */
  controlled?: {
    exercise: Exercise | null;
    notice?: string | null;
    onClose: () => void;
  };
  /**
   * v2 chrome only: the panel / backdrop z-layer when the sheet opens over a
   * higher surface (the run overview drawer, z-[100]). Omitted → z-[60]/z-[61],
   * unchanged for every existing caller.
   */
  layer?: { zIndex: SheetZIndex; backdropZIndex: SheetZIndex };
}

export default function ExerciseDetailSheet({ locationOverride, defaultProgramId, controlled, layer }: ExerciseDetailSheetProps = {}) {
  const router = useRouter();
  const t = useT(library);
  // Home v2 (enable_home_v2): sheet chrome styling only.
  const isSuperAdmin = useUserStore((st) => !!(st.profile?.core as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin);
  const v2 = useFeatureFlags(isSuperAdmin).flags.enableHomeV2;

  // ── Store reads (unconditional — hooks can't be conditional; the
  // controlled/global choice below is a plain value computation, not a
  // hook-call difference) ─────────────────────────────────────────────────
  const globalIsOpen     = useExerciseLibraryStore((s) => s.isDetailOpen);
  const globalExercise   = useExerciseLibraryStore((s) => s.selectedExercise);
  const globalClose      = useExerciseLibraryStore((s) => s.closeDetail);
  const globalNotice     = useExerciseLibraryStore((s) => s.detailNotice);
  const globalFilterLocation = useExerciseLibraryStore((s) => s.filters.location);
  const allPrograms      = useExerciseLibraryStore((s) => s.allPrograms);

  const exercise       = controlled ? controlled.exercise : globalExercise;
  const isOpen         = controlled ? controlled.exercise !== null : globalIsOpen;
  const close          = controlled ? controlled.onClose : globalClose;
  const notice         = controlled ? controlled.notice ?? null : globalNotice;
  const filterLocation = locationOverride ?? globalFilterLocation;

  // Real program names for the "תוכניות" per-program level list (round 5,
  // #2). Without this, useExerciseMasterData falls back to a static
  // slug→Hebrew heuristic (PROGRAM_LABEL_FALLBACK) — a real name from the
  // loaded catalog is strictly better when we already have it.
  const programLabels = useMemo(
    () => Object.fromEntries(allPrograms.map((p) => [p.id, p.name])),
    [allPrograms],
  );

  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // ── Body scroll lock ─────────────────────────────────────────────────────
  // Locks the page behind the sheet so wheel/touch on the dimmed area doesn't
  // scroll the library underneath. Compensates for the disappearing scrollbar
  // with padding-right to avoid a visible reflow when the sheet opens/closes.
  useEffect(() => {
    if (!isOpen) return;
    if (typeof document === 'undefined') return;

    const { body, documentElement: html } = document;
    const prevBodyOverflow     = body.style.overflow;
    const prevBodyPaddingRight = body.style.paddingRight;
    const prevHtmlOverflow     = html.style.overflow;

    const scrollbarGutter = window.innerWidth - html.clientWidth;
    body.style.overflow = 'hidden';
    html.style.overflow = 'hidden';
    if (scrollbarGutter > 0) body.style.paddingRight = `${scrollbarGutter}px`;

    return () => {
      body.style.overflow     = prevBodyOverflow;
      body.style.paddingRight = prevBodyPaddingRight;
      html.style.overflow     = prevHtmlOverflow;
    };
  }, [isOpen]);

  const handleNavigateToAnalytics = (exerciseId: string, exerciseName: string) => {
    router.push(`/profile/exercise/${exerciseId}?name=${encodeURIComponent(exerciseName)}`);
  };

  // Feature #5 (program/path switcher): the destination is resolved by
  // MasterExerciseView itself, from its own activeProgramId (the switcher's
  // current selection). It only calls this when that path HAS a progression
  // map — otherwise the "מפה מלאה" link isn't rendered at all (the old
  // fallback, /exercises/roadmap/<base_movement_id>, was a route that never
  // existed). This handler is a plain "navigate there" executor.
  const handleNavigateToRoadmap = (progressionMapHref: string) => {
    router.push(progressionMapHref);
  };

  const master = exercise ? (
    <MasterExerciseView
      exercise={exercise}
      filterLocation={filterLocation}
      programLabels={programLabels}
      defaultProgramId={defaultProgramId}
      onNavigateToAnalytics={handleNavigateToAnalytics}
      onNavigateToRoadmap={handleNavigateToRoadmap}
      notice={notice}
    />
  ) : null;

  if (v2) {
    // enable_home_v2: the shared <Sheet> — whole-panel drag (the inner scroll
    // owns vertical scrolling; framer wins only at scrollTop 0), > 140 px closes.
    return (
      <Sheet
        open={isOpen && !!exercise}
        onClose={close}
        // Backdrop z-[60] / sheet z-[61] (.cursorrules), portalled after mount.
        zIndex={layer?.zIndex ?? SHEET_Z.drawerPanel}
        backdropZIndex={layer?.backdropZIndex}
        keyboardAware={false}
        backdropClassName="bg-black/50"
        surface="rounded-t-[28px] bg-v2-surface shadow-v2-sheet"
        className="relative h-[95vh]"
        safeArea={false}
        grabber={false}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        dragToDismiss={{ handleOnly: false, distance: 140, velocity: 0, elastic: 0.2 }}
        ariaLabel={t('exercises.detail.label')}
        header={
          <>
            {/* Grabber floats over the full-bleed hero (which starts at the
                sheet's top edge and fades into the page). */}
            <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex justify-center pt-2">
              <div className="h-1.5 w-10 rounded-full bg-white/80 shadow-v2-ring" />
            </div>
            <IconButton aria-label={t('exercises.detail.close')} tone="surface" size={36} className="absolute left-3 top-3 z-30" onClick={close}>
              <X size={17} strokeWidth={2.5} />
            </IconButton>
          </>
        }
      >
        {master}
      </Sheet>
    );
  }

  const sheet = (
    <AnimatePresence>
      {isOpen && exercise && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={close}
            className="fixed inset-0 bg-black/50 z-[60]"
          />

          {/* Single immersive sheet — drag the whole sheet down to dismiss.
              The inner scroll container owns vertical scrolling; framer's drag
              only wins the gesture at the top of the scroll (scrollTop === 0),
              giving a fluid "roll the layout over the screen" feel without
              gesture traps. */}
          <motion.div
            key="master-sheet"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.2}
            onDragEnd={(_, info) => { if (info.offset.y > 140) close(); }}
            className="fixed bottom-0 left-0 right-0 z-[61] bg-white rounded-t-3xl shadow-drawer flex flex-col overflow-hidden"
            style={{ height: '95vh' }}
            dir="rtl"
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-2 pb-1 flex-shrink-0">
              <div className="w-10 h-1 rounded-full bg-gray-200" />
            </div>

            {/* Close */}
            <button
              type="button"
              onClick={close}
              className="absolute top-3 left-3 p-2 text-gray-500 hover:text-gray-700 rounded-full bg-white/80 backdrop-blur-sm z-30 shadow-sm"
              aria-label={t('exercises.detail.close')}
            >
              <X size={18} strokeWidth={2} />
            </button>

            {/* ── SINGLE conduit scroll ── */}
            <div className="flex-auto min-h-0 overflow-y-auto overscroll-contain">
              {master}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  if (!mounted) return null;
  return createPortal(sheet, document.body);
}
