'use client';

/**
 * CalendarSheet — Phase 5 (Clean Execution / Deep Planning)
 *
 * Three snap states with clear UX separation:
 *
 *   collapsed  → Week strip + Home content (training dashboard)
 *   split      → 2.5-row month grid + Agenda overlay (partial planning)
 *   expanded   → Full month grid + Agenda overlay (full-screen planner)
 *
 * Home content (StatsOverview, HeroCard) is progressively blurred as the
 * user moves deeper into planning mode, while the Agenda overlay slides UP
 * to cover it.
 */

import React, { useCallback } from 'react';
import { motion, PanInfo, AnimatePresence } from 'framer-motion';

// ── Types ──────────────────────────────────────────────────────────────────

export type SheetSnap = 'collapsed' | 'split' | 'expanded';

// ── Tuning ─────────────────────────────────────────────────────────────────

const SWIPE_PX  = 30;
const SWIPE_VEL = 250;

const SPRING = {
  type: 'spring' as const,
  stiffness: 320,
  damping: 30,
  mass: 0.8,
};

const AGENDA_SPRING = {
  type: 'spring' as const,
  stiffness: 300,
  damping: 30,
  mass: 0.7,
};

const SPLIT_AGENDA_HEIGHT = 280;

// ── Props ──────────────────────────────────────────────────────────────────

interface CalendarSheetProps {
  snapState: SheetSnap;
  onSnapChange: (next: SheetSnap) => void;
  /** Calendar component (SmartWeeklySchedule) */
  calendarSlot: React.ReactNode;
  /** Home execution content (StatsOverview, HeroCard) — always rendered, blurred in planning */
  children: React.ReactNode;
  /** Agenda content — slides up as overlay in split/expanded */
  agendaSlot?: React.ReactNode;
}

// ── Component ──────────────────────────────────────────────────────────────

export default function CalendarSheet({
  snapState,
  onSnapChange,
  calendarSlot,
  children,
  agendaSlot,
}: CalendarSheetProps) {

  /* ─── gesture handler ─── */
  const handleDragEnd = useCallback(
    (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      const { offset, velocity } = info;
      const swipedDown = offset.y > SWIPE_PX || velocity.y > SWIPE_VEL;
      const swipedUp   = offset.y < -SWIPE_PX || velocity.y < -SWIPE_VEL;

      if (swipedDown) {
        onSnapChange(
          snapState === 'collapsed' ? 'split' :
          snapState === 'split'     ? 'expanded' : 'expanded',
        );
      } else if (swipedUp) {
        onSnapChange(
          snapState === 'expanded' ? 'split' :
          snapState === 'split'    ? 'collapsed' : 'collapsed',
        );
      }
    },
    [snapState, onSnapChange],
  );

  const isCollapsed = snapState === 'collapsed';
  const isSplit     = snapState === 'split';
  const isExpanded  = snapState === 'expanded';
  const isPlanning  = !isCollapsed;

  return (
    <div className="flex flex-col">

      {/* ── Calendar Section (auto-sized, layout-animated) ── */}
      <motion.div layout transition={SPRING} className="overflow-hidden">
        {calendarSlot}
      </motion.div>

      {/* ── Drag Handle ── */}
      <motion.div
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={0.5}
        onDragEnd={handleDragEnd}
        className="flex items-center justify-center py-3 cursor-grab active:cursor-grabbing touch-none select-none relative z-30"
      >
        <motion.div
          className="rounded-full"
          animate={{
            width: isCollapsed ? 40 : 52,
            backgroundColor: isCollapsed
              ? 'rgba(156,163,175,0.4)'
              : 'rgba(6,182,212,0.6)',
          }}
          transition={{ duration: 0.2 }}
          style={{ height: 4 }}
        />
      </motion.div>

      {/* ── Content area below handle ── */}
      <div className="relative">

        {/* Home content — always rendered for stable layout; blurred in planning */}
        <motion.div
          animate={{
            filter:  isExpanded ? 'blur(20px)' : isSplit ? 'blur(10px)' : 'blur(0px)',
            opacity: isExpanded ? 0.06         : isSplit ? 0.2          : 1,
            scale:   isExpanded ? 0.97         : 1,
          }}
          transition={{ duration: 0.35, ease: 'easeInOut' }}
          className={isPlanning ? 'pointer-events-none select-none' : ''}
        >
          {children}
        </motion.div>

        {/* Agenda Overlay — slides UP in planning mode */}
        <AnimatePresence>
          {isPlanning && agendaSlot && (
            <motion.div
              key="agenda-overlay"
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              transition={AGENDA_SPRING}
              className="absolute inset-x-0 top-0 z-20"
            >
              <div
                className="rounded-t-2xl overflow-hidden"
                style={{
                  background: 'linear-gradient(180deg, rgba(248,250,252,0.98) 0%, #F8FAFC 15%)',
                  backdropFilter: 'blur(24px)',
                  WebkitBackdropFilter: 'blur(24px)',
                  boxShadow: '0 -4px 24px rgba(0,0,0,0.06)',
                }}
              >
                {/* Accent edge */}
                <div className="h-px bg-gradient-to-r from-transparent via-cyan-400/50 to-transparent" />

                <div
                  className={isSplit ? 'overflow-hidden' : 'overflow-y-auto'}
                  style={{
                    maxHeight: isSplit ? SPLIT_AGENDA_HEIGHT : 'calc(100dvh - 340px)',
                    ...(isSplit ? {
                      maskImage: 'linear-gradient(to bottom, black 70%, transparent 100%)',
                      WebkitMaskImage: 'linear-gradient(to bottom, black 70%, transparent 100%)',
                    } : {}),
                  }}
                >
                  <div className="px-1 pt-3 pb-6">
                    {agendaSlot}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
