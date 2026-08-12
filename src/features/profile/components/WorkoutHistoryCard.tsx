'use client';

import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { motion, animate, useMotionValue, type PanInfo } from 'framer-motion';
import { Trash2 } from 'lucide-react';
import { WorkoutHistoryEntry } from '@/features/workout-engine/core/services/storage.service';
import { WORKOUT_DELETE_EXPANDED_ENABLED } from '@/config/feature-flags';
import RunningHistoryCard from './cards/RunningHistoryCard';
import StrengthHistoryCard from './cards/StrengthHistoryCard';
import ActivityHistoryCard from './cards/ActivityHistoryCard';

interface WorkoutHistoryCardProps {
  workout: WorkoutHistoryEntry;
  onClick: () => void;
  /**
   * Fired when the swipe-revealed delete button is tapped. Only ever invoked
   * when WORKOUT_DELETE_EXPANDED_ENABLED is true — see the flag branch below.
   * The parent (HistoryTab) owns the shared DeleteWorkoutConfirmModal
   * instance + the actual deleteWorkoutWithReversal() call + list removal,
   * mirroring how AgendaDayCard's per-row StrengthCard raises
   * onDeleteRequest up to the row's own parent for the confirm sheet.
   */
  onDeleteRequest?: (workout: WorkoutHistoryEntry) => void;
}

/**
 * WorkoutHistoryCard - The Hub Component
 * Routes to the appropriate card component based on workoutType
 */
export default function WorkoutHistoryCard({ workout, onClick, onDeleteRequest }: WorkoutHistoryCardProps) {
  const renderCard = (handleTap: () => void) => {
    switch (workout.workoutType) {
      case 'running':
        return <RunningHistoryCard workout={workout} onClick={handleTap} />;

      case 'strength':
        return <StrengthHistoryCard workout={workout} onClick={handleTap} />;

      case 'walking':
      case 'cycling':
      case 'hybrid':
      default:
        return <ActivityHistoryCard workout={workout} onClick={handleTap} />;
    }
  };

  // ── Flag OFF (default): today's exact existing behaviour, byte-identical —
  // no swipe wrapper, no gesture binding, nothing new mounted. ──────────────
  if (!WORKOUT_DELETE_EXPANDED_ENABLED) {
    return renderCard(onClick);
  }

  // ── Flag ON: wrap the routed card in swipe-to-reveal-delete ───────────────
  return (
    <SwipeToDeleteRow workout={workout} onClick={onClick} onDeleteRequest={onDeleteRequest}>
      {renderCard}
    </SwipeToDeleteRow>
  );
}

// ── Swipe-to-delete wrapper ──────────────────────────────────────────────────
//
// Implementation-pattern reference (different data model — schedule entries,
// not completed workouts — mechanics only, not copied wholesale):
// src/features/home/components/agenda/AgendaDayCard.tsx's StrengthCard
// swipe-to-reveal (swipeX motion value / dragConstraints / snap-spring /
// tap-vs-swipe-close disambiguation).
//
// Pre-check performed before adding this: none of RunningHistoryCard /
// StrengthHistoryCard / ActivityHistoryCard (the three cards this hub
// renders) has any existing drag/pan/swipe binding — each is a plain
// `motion.button` using only `whileHover` / `whileTap` scale transforms, and
// the row's container (HistoryTab's `space-y-4` list inside HistorySheet's
// `overflow-y-auto`) has no horizontal gesture of its own either (the only
// horizontal-scroll region in this tree is the unrelated filter-chip bar in
// HistoryTab, a separate DOM subtree). No conflict found.

const PANEL_WIDTH = 88;
const MIN_VISIBLE = 16;
const SNAP_SPRING = { type: 'spring' as const, stiffness: 300, damping: 30 };

interface SwipeToDeleteRowProps {
  workout: WorkoutHistoryEntry;
  onClick: () => void;
  onDeleteRequest?: (workout: WorkoutHistoryEntry) => void;
  children: (handleTap: () => void) => React.ReactNode;
}

function SwipeToDeleteRow({ workout, onClick, onDeleteRequest, children }: SwipeToDeleteRowProps) {
  const swipeX = useMotionValue(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const [openX, setOpenX] = useState(-PANEL_WIDTH);

  // Swipe-to-delete requires a real Firestore doc id to delete against.
  // Defensive guard — WorkoutHistoryEntry.id is optional on the type, and
  // HistoryTab already filters out id-less entries, but this keeps the row
  // itself safe if that upstream guard ever changes.
  const canSwipe = !!workout.id;

  useLayoutEffect(() => {
    if (!canSwipe) return;
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.offsetWidth;
      // Snap at most PANEL_WIDTH left, but always leave MIN_VISIBLE px of card.
      setOpenX(-Math.min(PANEL_WIDTH, w - MIN_VISIBLE));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [canSwipe]);

  const closeSwipe = useCallback(() => {
    animate(swipeX, 0, SNAP_SPRING);
  }, [swipeX]);

  const handleSwipeDragEnd = useCallback(
    (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      if (info.offset.x < -50) {
        animate(swipeX, openX, SNAP_SPRING);
      } else {
        animate(swipeX, 0, SNAP_SPRING);
      }
    },
    [swipeX, openX],
  );

  // Tapping the card while the delete panel is revealed closes it instead of
  // navigating — same disambiguation AgendaDayCard's StrengthCard uses.
  const handleTap = useCallback(() => {
    if (swipeX.get() < -10) {
      closeSwipe();
      return;
    }
    onClick();
  }, [swipeX, closeSwipe, onClick]);

  const handleDeleteTap = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      closeSwipe();
      onDeleteRequest?.(workout);
    },
    [closeSwipe, onDeleteRequest, workout],
  );

  if (!canSwipe) {
    return <>{children(onClick)}</>;
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', overflow: 'hidden', borderRadius: 16 }}>
      {/* Delete action panel — revealed on swipe-left, sits behind the card */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          right: 0,
          width: PANEL_WIDTH,
          display: 'flex',
        }}
      >
        <button
          onClick={handleDeleteTap}
          className="flex-1 flex flex-col items-center justify-center gap-1 text-white active:opacity-70 transition-opacity"
          style={{ background: '#EF4444' }}
          aria-label="מחק אימון"
        >
          <Trash2 className="w-5 h-5" />
          <span className="text-[11px] font-bold">מחק</span>
        </button>
      </div>

      {/* X-draggable card layer */}
      <motion.div
        drag="x"
        style={{ x: swipeX, touchAction: 'pan-y' }}
        dragConstraints={{ left: openX, right: 0 }}
        dragElastic={0}
        dragMomentum={false}
        onDragEnd={handleSwipeDragEnd}
      >
        {children(handleTap)}
      </motion.div>
    </div>
  );
}
