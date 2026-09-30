"use client";

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { getProgramIcon, CheckMarkBadge, BRAND_CYAN } from '@/features/content/programs';

// ============================================================================
// TYPES
// ============================================================================

export interface GoalItem {
  id: string;
  label: string;
  isCompleted: boolean;
}

/**
 * Progression v2 Phase 4a — card state variant. Undefined (the default) is
 * today's exact rendering, unchanged — this is fully additive, not a
 * replacement of the existing visual. 🟢 active / 🔵 tracked render
 * IDENTICALLY to the default (today's card) — the section a card appears
 * in (Progression screen) already communicates which. 🔒 locked_prereq
 * gets a different look, reusing the exact dashed-border pattern that
 * already exists as a hand-rolled sibling block in ProgramsSection.tsx
 * (`!card.isAssessed`) — integrated into this card itself instead of
 * staying a separate, duplicated block.
 *
 * Phase 4a-fix: ⚪ available is kept in the type for spec-fidelity but the
 * caller (program-card-state.service.ts's resolveProgramCardState) never
 * actually produces it bare anymore — 'available' structurally means
 * "never assessed, no data to show," so it always resolves to either
 * locked_prereq (a leaf/skill program — it HAS a questionnaire) or the
 * new not_started_master (a master — it has NO own questionnaire, no own
 * real level to fabricate; same dashed look, different static text, never
 * a tappable "בצע מבדק").
 */
export type ProgramCardVisualState = 'active' | 'tracked' | 'available' | 'locked_prereq' | 'not_started_master';

export interface ProgramProgressCardProps {
  programName: string;
  /** When true, renders a shimmer skeleton in place of the program name while the CMS fetch is pending. */
  programNameLoading?: boolean;
  iconKey?: string;
  currentLevel: number;
  maxLevel: number;
  progressPercent: number; // 0-100
  goals?: GoalItem[];
  programCount?: number;
  className?: string;
  /** Progression v2 Phase 4a — see ProgramCardVisualState above. Omit for today's unchanged behavior. */
  state?: ProgramCardVisualState;
  /**
   * Shown under the (grayed) name only when state === 'locked_prereq' —
   * either the derived prerequisite ("דרוש משיכה 10") or, for a program
   * that's locked because it was never assessed, "בצע מבדק". The caller
   * decides which text applies; the card just renders what it's given.
   */
  lockedHint?: string;
  /**
   * When provided, lockedHint renders as a tappable secondary CTA (its own
   * button, stopping propagation so it doesn't also trigger the card's own
   * outer tap) instead of plain text — Progression v2 Phase 4a-fix: "the
   * 'בצע מבדק' text on discover cards becomes a secondary CTA; the card's
   * primary tap is open/view the map." Omit for a real prerequisite label
   * (no action to take there, just informational) — the card itself stays
   * dumb about WHICH case this is; the caller already knows (it computed
   * lockedHint) and decides whether to pass this.
   */
  onLockedHintTap?: () => void;
  /** Small text badge next to the name (e.g. "ראשי" for the priority-#1 active program). Any state. */
  badge?: string;
}

// ============================================================================
// PROGRESS RING
// ============================================================================

function ProgressRing({
  percentage,
  size = 80,
  strokeWidth = 6,
}: {
  percentage: number;
  size?: number;
  strokeWidth?: number;
}) {
  const center = size / 2;
  const radius = (size - strokeWidth) / 2 - 1;
  const circumference = 2 * Math.PI * radius;
  const filled = (percentage / 100) * circumference;
  const roundedPct = Math.round(percentage);

  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle
          cx={center} cy={center} r={radius}
          fill="none" stroke="#E2E8F0" strokeWidth={strokeWidth}
          className="dark:stroke-slate-700"
        />
        <motion.circle
          cx={center} cy={center} r={radius}
          fill="none" stroke={BRAND_CYAN} strokeWidth={strokeWidth}
          strokeLinecap="round" strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference - filled }}
          transition={{ duration: 1, ease: 'easeOut' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-xl font-black text-gray-800 dark:text-white leading-none tabular-nums">
          {roundedPct}<span className="text-sm font-bold">%</span>
        </span>
      </div>
    </div>
  );
}

// ============================================================================
// GOAL CHECK ICON
// ============================================================================

function GoalCheckIcon({ completed }: { completed: boolean }) {
  if (completed) {
    return <CheckMarkBadge size={22} />;
  }
  return (
    <div
      className="rounded-full"
      style={{ width: 22, height: 22, border: '0.5px solid #CBD5E1' }}
    />
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function ProgramProgressCard({
  programName,
  programNameLoading = false,
  iconKey,
  currentLevel,
  maxLevel,
  progressPercent,
  goals = [],
  programCount = 1,
  className = '',
  state,
  lockedHint,
  onLockedHintTap,
  badge,
}: ProgramProgressCardProps) {
  const nextLevel = currentLevel + 1;
  const remainingPercent = Math.max(0, 100 - Math.round(progressPercent));
  const [expanded, setExpanded] = useState(false);
  const completedCount = goals.filter(g => g.isCompleted).length;
  const hasGoals = goals.length > 0;
  const isCarousel = programCount > 1;

  const cardStyle: React.CSSProperties = isCarousel
    ? { minHeight: 107 }
    : {};

  const isLocked = state === 'locked_prereq';
  const isNotStartedMaster = state === 'not_started_master';

  // ── Locked / not-started-master variant (Progression v2 Phase 4a,
  // extended 4a-fix) ───────────────────────────────────────────────────────
  // Reuses ProgramsSection.tsx's existing dashed "not yet assessed" pattern
  // exactly (1px dashed #CBD5E1, grayed name, cyan hint) rather than
  // inventing a new locked look — no ring, no expandable goals, since
  // neither state has a meaningful own level to show yet. A master
  // (not_started_master) never gets lockedHint/onLockedHintTap — it has no
  // own questionnaire to assess, so it always shows the SAME static "not
  // started, based on your programs" text with no tappable CTA, regardless
  // of what the caller passed for lockedHint.
  if (isLocked || isNotStartedMaster) {
    const displayHint = isNotStartedMaster ? 'טרם התחיל · מבוסס על התוכניות שלך' : lockedHint;
    const hintTappable = isLocked && !!onLockedHintTap;
    return (
      <div
        className={`bg-white dark:bg-slate-800 w-full flex flex-col justify-between ${className}`}
        style={{
          minHeight: isCarousel ? 107 : undefined,
          padding: 16,
          borderRadius: 12,
          border: '1px dashed #CBD5E1',
        }}
        dir="rtl"
      >
        <div className="flex items-start gap-2 min-h-[40px]">
          <span className="text-gray-400 flex-shrink-0 mt-0.5">
            {getProgramIcon(iconKey, 'w-5 h-5')}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h3 className="text-[15px] font-bold text-gray-500 line-clamp-2 break-words leading-snug">
                {programName}
              </h3>
              {badge && (
                <span className="text-[10px] font-black text-gray-400 bg-gray-100 rounded-full px-2 py-0.5 flex-shrink-0">
                  {badge}
                </span>
              )}
            </div>
            {displayHint && (
              hintTappable ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onLockedHintTap!();
                  }}
                  className="text-xs font-bold mt-2 underline active:opacity-70 pointer-events-auto relative z-10"
                  style={{ color: BRAND_CYAN }}
                >
                  {displayHint}
                </button>
              ) : (
                <p
                  className={`text-xs font-bold mt-2 ${isNotStartedMaster ? 'text-gray-400' : ''}`}
                  style={isNotStartedMaster ? undefined : { color: BRAND_CYAN }}
                >
                  {displayHint}
                </p>
              )
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`bg-white dark:bg-slate-800 overflow-hidden w-full ${className}`}
      style={{
        ...cardStyle,
        borderRadius: 12,
        border: '0.5px solid #E0E9FF',
        boxShadow: '0 1px 4px 0 rgba(0,0,0,0.04)',
        isolation: 'isolate',
      }}
      dir="rtl"
    >
      {/* ── Top section: clickable to expand ──────────────────── */}
      {/* Using <div role="button"> instead of <button> so this component can
          be safely nested inside an outer <button> in ProgramsSection without
          triggering the invalid HTML / React hydration warning. */}
      <div
        role={hasGoals ? 'button' : undefined}
        tabIndex={hasGoals ? 0 : undefined}
        aria-disabled={!hasGoals || undefined}
        onClick={() => hasGoals && setExpanded(v => !v)}
        onKeyDown={(e) => { if (hasGoals && (e.key === 'Enter' || e.key === ' ')) setExpanded(v => !v); }}
        className={`w-full text-right flex items-center justify-between${hasGoals ? ' cursor-pointer' : ''}`}
        style={{ padding: 16 }}
      >
        {/* Right side: program info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2 mb-1.5 min-h-[40px]">
            <span className="text-gray-900 dark:text-white flex-shrink-0 mt-0.5">
              {getProgramIcon(iconKey, 'w-5 h-5')}
            </span>
            {programNameLoading ? (
              <div className="h-[40px] w-full max-w-[120px] rounded-md bg-gray-200 dark:bg-zinc-700 animate-pulse" />
            ) : (
              <div className="flex items-center gap-1.5 flex-wrap">
                <h3 className="text-[15px] font-bold text-gray-900 dark:text-white line-clamp-2 break-words leading-snug">
                  {programName}
                </h3>
                {badge && (
                  <span
                    className="text-[10px] font-black text-white rounded-full px-2 py-0.5 flex-shrink-0"
                    style={{ backgroundColor: BRAND_CYAN }}
                  >
                    {badge}
                  </span>
                )}
              </div>
            )}
          </div>

          <p className="text-sm text-gray-600 dark:text-gray-300 font-semibold mb-0.5">
            רמה {currentLevel}/{maxLevel}
          </p>

          {nextLevel <= maxLevel && (
            <div className="flex items-start gap-1 min-w-0 overflow-hidden min-h-[28px]" style={{ color: '#374151' }}>
              {programNameLoading ? (
                <div className="h-[28px] w-full max-w-[100px] rounded-md bg-gray-100 dark:bg-zinc-700 animate-pulse" />
              ) : (
                <>
                  <span className="text-xs whitespace-normal break-words min-w-0">
                    עוד {remainingPercent}% לרמה {nextLevel}
                  </span>
                  <ChevronUp className="w-3 h-3 flex-shrink-0 mt-0.5" />
                </>
              )}
            </div>
          )}
        </div>

        {/* Left side: progress ring.
            Unified to 68px / strokeWidth 5 across both single and carousel
            modes (Apr 2026 dashboard refresh) so it matches the 64px rings
            used by `CompactMetricTile` in the Health/Performance rows
            below — single design language for every ring on the dashboard. */}
        <ProgressRing
          percentage={progressPercent}
          size={68}
          strokeWidth={5}
        />
      </div>

      {/* ── Expandable goals ──────────────────────────────────── */}
      <AnimatePresence>
        {expanded && hasGoals && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            {/* Separator */}
            <div style={{ height: 0.5, backgroundColor: '#E0E9FF' }} />

            {/* Goal items */}
            <div className="space-y-3" style={{ padding: '12px 16px 16px' }}>
              {goals.map((goal, idx) => (
                <motion.div
                  key={goal.id}
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className="flex items-center gap-3"
                >
                  <GoalCheckIcon completed={goal.isCompleted} />
                  <span
                    className={`text-sm leading-snug ${
                      goal.isCompleted
                        ? 'text-gray-400 dark:text-gray-500 line-through'
                        : 'text-gray-800 dark:text-gray-200'
                    }`}
                  >
                    {goal.label}
                  </span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default ProgramProgressCard;
