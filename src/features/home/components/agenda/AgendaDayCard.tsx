'use client';

/**
 * AgendaDayCard — Compact agenda row with running program awareness.
 *
 * Resolves workout details from:
 *   1. Firestore schedule entries (strength/general)
 *   2. profile.running.activeProgram.schedule (running workouts)
 *
 * Displays actual workout names, categories, and completion status.
 */

import React, { useEffect, useLayoutEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { motion, useDragControls, useMotionValue, animate, type PanInfo } from 'framer-motion';
import { Plus, GripVertical, Footprints, Check, Zap, Timer, TrendingUp, Mountain, Users, Trash2, Pencil } from 'lucide-react';
import { getScheduleEntries, hydrateFromTemplate } from '@/features/user/scheduling/services/userSchedule.service';
import type { UserScheduleEntry, RecurringTemplate, ScheduleActivityCategory } from '@/features/user/scheduling/types/schedule.types';
import { getHebrewDayLetter } from '@/features/user/scheduling/utils/dateUtils';
import { COMMUNITY_CATEGORY_COLORS } from '@/features/home/utils/day-display.utils';
import { WalkingIcon, RunIcon, getProgramIcon, resolveIconKey } from '@/features/content/programs/core/program-icon.util';
import { SKILL_DISPLAY } from '@/features/schedule/types/smartSchedule.types';
import { useUserStore } from '@/features/user';
import { resolveRunningDayState } from '@/lib/running-day-resolution';
import { RUNNING_WORKOUT_CATEGORY_LABELS_HE } from '@/lib/running-workout-labels';
import { hapticLight } from '@/lib/haptics';
import type { WorkoutHistoryEntry } from '@/features/workout-engine/core/services/storage.service';
import { AGENDA_UNPLANNED_COMPLETION_FIX_ENABLED, AGENDA_HYBRID_DAY_DISPLAY_ENABLED } from '@/config/feature-flags';
import { excludeRunningShadowEntry } from '@/features/schedule/services/excludeRunningShadowEntry';

/** Compile-time flag with an optional runtime A/B override (device-friendly).
 *  Same pattern as isPlsCacheEnabled (programLevelSettings.service.ts). */
export function isAgendaHybridDayDisplayEnabled(): boolean {
  if (typeof window !== 'undefined') {
    try {
      const ls = window.localStorage?.getItem('OUT_AGENDA_HYBRID');
      if (ls === '0' || ls === 'false') return false;
      if (ls === '1' || ls === 'true') return true;
    } catch {
      /* private mode — ignore */
    }
  }
  return AGENDA_HYBRID_DAY_DISPLAY_ENABLED;
}

// ── Skill-aware helpers ────────────────────────────────────────────────────

/**
 * Resolves a human-readable Hebrew workout title from a schedule entry's
 * `programIds` array. Falls back to a `scheduledCategories`-derived generic
 * label — not "אימון כוח" unconditionally — for a running/walking entry
 * with no strength id, e.g. a manually-added entry from AddWorkoutModal
 * (`programIds: []`, `scheduledCategories: ['cardio' | 'walking']`,
 * per WORKOUT_TYPE_MAPPING). That id/category split is also why the card's
 * icon (resolveIconKey, driven by `scheduledCategories` as its `programAlias`
 * fallback — AgendaDayCard.tsx:637) already renders correctly while the
 * title used to fall to the strength default regardless. Reuses the same
 * category→title convention as `resolveReconstructedTitle` above, not a
 * second mapping.
 */
function resolveStrengthTitle(
  programIds: string[] | undefined,
  scheduledCategories?: ScheduleActivityCategory[],
): string {
  const primary = programIds?.[0];
  if (primary) {
    // Premium edge-case: combined hybrid session
    if (primary === 'UPPER_CALISTHENICS') return 'אימון קליסטניקס משולב';

    const display = SKILL_DISPLAY[primary as keyof typeof SKILL_DISPLAY];
    if (display) return `אימון ${display.shortName}`;
  }

  switch (scheduledCategories?.[0]) {
    case 'cardio':  return 'אימון קרדיו';
    case 'walking': return 'הליכה';
    default:        return 'אימון כוח';
  }
}

/**
 * Maps a real workout doc's `workoutType` to the `ScheduleActivityCategory`
 * a reconstructed entry (AGENDA_UNPLANNED_COMPLETION_FIX_ENABLED) should
 * carry, so its accent color/icon match the real workout instead of
 * defaulting to strength. `undefined` (shouldn't happen for a real doc, but
 * guards it anyway) and `'strength'` both fall back to `['strength']`.
 */
function workoutTypeToCategories(t: WorkoutHistoryEntry['workoutType'] | undefined): ScheduleActivityCategory[] {
  switch (t) {
    case 'walking':  return ['walking'];
    case 'running':
    case 'cycling':  return ['cardio'];
    case 'hybrid':   return ['strength', 'cardio'];
    case 'recovery': return ['maintenance'];
    default:         return ['strength'];
  }
}

/**
 * Hebrew title for a reconstructed entry — `resolveStrengthTitle` always
 * falls back to "אימון כוח" (its `programIds` is empty for a synthesized
 * entry), which would mislabel a walking/cardio/hybrid/recovery virtual
 * card even though its color/icon are already correct via
 * `workoutTypeToCategories`.
 */
function resolveReconstructedTitle(workoutType: WorkoutHistoryEntry['workoutType'] | undefined): string {
  switch (workoutType) {
    case 'walking':  return 'הליכה';
    case 'running':
    case 'cycling':  return 'אימון קרדיו';
    case 'hybrid':   return 'אימון משולב';
    case 'recovery': return 'אימון התאוששות';
    default:         return 'אימון כוח';
  }
}

/**
 * Fraction of a completed workout's actual duration that was strength (vs.
 * aerobic) — 1 = pure strength, 0 = pure aerobic. Built from
 * `segments[].actual.durationSec` grouped by `kind`, per-doc real data —
 * no existing calculation for this was found anywhere in the codebase
 * (confirmed by an exhaustive search, 23.08.2026), so this is new.
 *
 * NOTE: for a hybrid workout saved before commit dbd8533c (23.08.2026,
 * "fix(hybrid): missing card title + planned-not-actual station duration"),
 * the strength segment's `actual.durationSec` holds the pre-workout PLANNED
 * estimate, not real elapsed time — this fraction (and therefore the
 * completed-card color) will be off for those older docs. Not fixable
 * retroactively from already-saved data; only new completions are accurate.
 *
 * Falls back to the doc's own `category` when `segments` is absent or
 * yields zero total duration (e.g. a doc that predates the segments field).
 */
function computeStrengthPercent(
  segments: WorkoutHistoryEntry['segments'],
  fallbackCategory: WorkoutHistoryEntry['category'] | undefined,
): number {
  const aerobicSec = (segments ?? [])
    .filter((s) => s.kind === 'aerobic')
    .reduce((sum, s) => sum + (s.actual?.durationSec ?? 0), 0);
  const strengthSec = (segments ?? [])
    .filter((s) => s.kind === 'strength')
    .reduce((sum, s) => sum + (s.actual?.durationSec ?? 0), 0);
  const total = aerobicSec + strengthSec;
  if (total > 0) return strengthSec / total;
  if (fallbackCategory === 'cardio') return 0;
  if (fallbackCategory === 'hybrid') return 0.5;
  return 1; // 'strength' / 'recovery' / unknown
}

// Reuses the existing strength/cardio brand accents (CATEGORY_ACCENT below)
// as the two poles, rather than inventing new colors.
const STRENGTH_FILL_COLOR = '#00C9F2';
const AEROBIC_FILL_COLOR = '#84CC16';

/**
 * CSS `background` value for a completed card, per `computeStrengthPercent`.
 * A pure (>=98% / <=2%) result stays a flat color, matching today's
 * single-color convention at the poles. A mixed result blends across a
 * ~30-point-wide zone centered on the actual ratio, so the split point
 * visually communicates the real proportion rather than a fixed 50/50
 * blend. Running-specific colors are a known follow-up, not handled here.
 */
function completedFillColor(strengthPercent: number): string {
  if (strengthPercent >= 0.98) return STRENGTH_FILL_COLOR;
  if (strengthPercent <= 0.02) return AEROBIC_FILL_COLOR;
  const mid = strengthPercent * 100;
  const from = Math.max(0, Math.round(mid - 15));
  const to = Math.min(100, Math.round(mid + 15));
  return `linear-gradient(135deg, ${STRENGTH_FILL_COLOR} ${from}%, ${AEROBIC_FILL_COLOR} ${to}%)`;
}

// ── Types ──────────────────────────────────────────────────────────────────

type CardMode = 'past' | 'today' | 'future' | 'rest';

interface AgendaDayCardProps {
  date: string;
  isSelected: boolean;
  onSelect: () => void;
  userId: string;
  recurringTemplate?: RecurringTemplate;
  /**
   * Receives the ISO date of the tapped workout card so parents can
   * synchronously update selectedDate. The second (optional) arg tells the
   * caller to skip its own date-based completed-workout lookup — see
   * `handleHeroPress`'s `skipCompletedLookup` param in home/page.tsx.
   */
  onStartWorkout?: (date: string, skipCompletedLookup?: boolean) => void;
  onAddWorkout?: (date: string) => void;
  /** Called when a long-press drag activates on any card in this row. */
  onDragStart?: () => void;
  /**
   * Called on drag release. Parent hitTests `releaseY` against the day cards
   * to determine the target date and shows the confirmation sheet.
   *
   * `entryId` identifies which entry is being moved.  It is `undefined` for
   * synthesized recurring cards that have no Firestore record yet — in that
   * case the parent must supply a `fallbackEntry` to `moveScheduleEntry`.
   */
  onCardDragEnd?: (entryId: string | undefined, releaseY: number) => void;
  /** Called after the user confirms deletion of a persisted entry. */
  onDeleteEntry?: (entryId: string, date: string, groupId?: string) => void;
  /** Called when the edit button (swipe-left) is tapped on a persisted personal entry. */
  onEditEntry?: (entry: UserScheduleEntry) => void;
  /** Called when a personal card is tapped — fires before onStartWorkout. */
  onPreviewEntry?: (entry: UserScheduleEntry) => void;
  /** Called when a community entry is tapped — opens a drawer instead of navigating. */
  onCommunityTap?: (groupId: string, groupName: string) => void;
  refreshKey?: number;
  /**
   * Batched pre-fetch from the parent (`RollingAgenda`) keyed by date —
   * `undefined` when the parent doesn't provide one (e.g. `progress/page.tsx`
   * renders this card standalone), `null` while the parent's batch fetch is
   * in flight, an object once it resolves. When provided, this card skips
   * its own `getScheduleEntries` network call entirely and reads its day's
   * entries from here instead — see schedule-editor-perf-audit.md.
   */
  scheduleMap?: Record<string, UserScheduleEntry[]> | null;
  /**
   * Batched real completed-workout docs from the parent (`RollingAgenda`),
   * keyed by ISO date — one query over the `workouts` collection covering
   * the whole visible range (see `getWorkoutsInDateRange`). Sparse: a
   * missing key means "no known actual workouts that day" (or the batch
   * hasn't resolved yet — starts `{}` and fills in progressively).
   * `undefined` when the parent doesn't provide one (e.g. `progress/page.tsx`
   * renders this card standalone) — the reconstructed-entry logic is simply
   * skipped in that case, current behavior preserved. Gated by
   * AGENDA_UNPLANNED_COMPLETION_FIX_ENABLED.
   */
  actualWorkoutsMap?: Record<string, WorkoutHistoryEntry[]>;
  rowRef?: (el: HTMLDivElement | null) => void;
  /**
   * `runningOverride` and `suppressScheduleDaysFallback` are a PAIR — both
   * say the same thing about a different code path: "in this context, the
   * card shows only what it was given, and never goes looking for real
   * profile data on its own." Kept as two separate params because each
   * guards a genuinely different internal branch (the running-side store
   * read vs. the strength scheduleDays/activePrograms fallback), not
   * because they're unrelated. If a THIRD such param is ever needed, that's
   * the signal to stop accumulating flags and unify these into one
   * display-state object instead — written here so whoever adds the third
   * one sees this before doing it, not after.
   *
   * Overrides the running side for this date, bypassing the internal
   * `profile.running.activeProgram` (global store) read entirely. Strength
   * already has this escape hatch via `scheduleMap` (a parent-supplied,
   * date-keyed batch); running had none — this closes that gap. `undefined`
   * (the default, every existing caller) preserves current behavior
   * byte-for-byte — the override is only consulted when explicitly passed,
   * even as `null` (meaning "show no running workout this date," distinct
   * from "not provided, use the real store"). Added for
   * ScheduleBuilderDrawer (schedule-drawer-screen-spec.md) to preview an
   * unsaved `weaveWeek` proposal, which has no calendar dates or Firestore
   * record yet — the global store can't answer for a week that was never
   * saved.
   */
  runningOverride?: ResolvedRunningWorkout | null;
  /**
   * See `runningOverride`'s doc above — same pairing, strength side. When
   * true, skips the "scheduleDays fallback" (real `profile?.lifestyle?.
   * scheduleDays`/`profile?.progression?.activePrograms` read) that
   * otherwise fires whenever `scheduleMap[date]` resolves empty. Without
   * this, a rest day in an unsaved proposal (`scheduleMap[date] = []`)
   * could silently render the user's REAL, unrelated strength habit for
   * that weekday — actively misleading in a preview whose entire point is
   * to show something potentially different from what's real today.
   * Default `false` (or omitted) — every existing caller (`RollingAgenda`)
   * keeps its current fallback behavior unchanged; this is opt-in.
   */
  suppressScheduleDaysFallback?: boolean;
}

export interface ResolvedRunningWorkout {
  name: string;
  category?: string;
  status: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const HEBREW_DAY_SHORT: Record<string, string> = {
  'א': 'א׳', 'ב': 'ב׳', 'ג': 'ג׳', 'ד': 'ד׳',
  'ה': 'ה׳', 'ו': 'ו׳', 'ש': 'ש׳',
};

// ── Strength card constants ─────────────────────────────────────────────────
// Uses BRAND_CYAN (#00C9F2) — same as CATEGORY_COLORS.strength in day-display.utils.
const CATEGORY_ACCENT: Record<ScheduleActivityCategory, string> = {
  strength: '#00C9F2',
  cardio: '#84CC16',
  maintenance: '#A855F7',
  walking: '#F59E0B',
};
const CATEGORY_PILL_LABEL: Record<ScheduleActivityCategory, string> = {
  strength: 'כוח',
  cardio: 'קרדיו',
  maintenance: 'תחזוקה',
  walking: 'הליכה',
};
const STRENGTH_DURATION_ESTIMATE = '30–45 דק׳';

// ── Run card per-category colors (accent bar + border/bg tint) ─────────────
const RUN_CARD_COLORS: Record<string, string> = {
  easy_run:           '#4CAF50',
  long_run:           '#2E7D32',
  short_intervals:    '#E11D48',
  long_intervals:     '#0D9488',
  fartlek_easy:       '#CE93D8',
  fartlek_structured: '#AB47BC',
  tempo:              '#9C27B0',
  hill_long:          '#FF7043',
  hill_short:         '#EF6C00',
  hill_sprints:       '#DC2626',
  strides:            '#00BAF7',
  recovery:           '#B0BEC5',
};

function getCategoryIcon(category: string | undefined) {
  switch (category) {
    case 'short_intervals': case 'long_intervals':
    case 'fartlek_easy': case 'fartlek_structured':
      return <Zap className="w-3 h-3" />;
    case 'tempo': return <Timer className="w-3 h-3" />;
    case 'long_run': return <TrendingUp className="w-3 h-3" />;
    case 'hill_long': case 'hill_short': case 'hill_sprints':
      return <Mountain className="w-3 h-3" />;
    default: return <Footprints className="w-3 h-3" />;
  }
}

function resolveCardMode(iso: string): CardMode {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(iso + 'T00:00:00');
  if (target.getTime() === today.getTime()) return 'today';
  if (target < today) return 'past';
  return 'future';
}

function formatTime(hhmm: string | undefined): string | null {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':');
  if (!h || !m) return null;
  return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
}

/**
 * Map an ISO date to a running schedule entry — delegates to the shared
 * resolveRunningDayState (05.09.2026), which now owns both the date-range
 * guard this function used to carry alone (isDateWithinRunningPlan,
 * originally added here 02.09.2026 — that check didn't disappear, it moved
 * into the shared resolver, checked once instead of duplicated per caller)
 * and the scheduleDays-empty program fallback (a runner whose plan was
 * built but who never reached the day-picker step used to always resolve
 * to `null` here — same permanent-"no workout" bug NextRunWorkoutCard had,
 * just for the planner's day-cards instead of the home-page card).
 */
function resolveRunningEntry(
  iso: string,
  scheduleDays: string[],
  schedule: any[],
  programStartDate: Date | string | number | undefined,
  currentWeek: number,
): ResolvedRunningWorkout | null {
  if (!schedule?.length) return null;

  const d = new Date(iso + 'T00:00:00');
  const dayState = resolveRunningDayState(scheduleDays ?? [], schedule, currentWeek, d, programStartDate);
  const entry = dayState.todayEntry;
  if (!entry) return null;

  return {
    name: (entry as any).workoutName || RUNNING_WORKOUT_CATEGORY_LABELS_HE[(entry as any).category as keyof typeof RUNNING_WORKOUT_CATEGORY_LABELS_HE] || 'אימון ריצה',
    category: (entry as any).category,
    status: (entry as any).status ?? 'pending',
  };
}

// ── Community title mapping ────────────────────────────────────────────────
//
// `scheduledCategories[0]` on a community entry stores the **group's**
// category (walking / running / yoga / calisthenics / cycling / other).
// This is force-cast through `ScheduleActivityCategory` at write time in
// `communitySchedule.service.ts` (line ~112), so at runtime the value is a
// plain string — we widen through `string` here to handle every group
// category, not just the three strict `ScheduleActivityCategory` values.

const COMMUNITY_TITLE_BY_CATEGORY: Record<string, string> = {
  walking: 'קבוצת הליכה',
  running: 'קבוצת ריצה',
  yoga: 'קבוצת יוגה',
  calisthenics: 'קבוצת קליסטניקס',
  cycling: 'קבוצת רכיבה',
  other: 'אימון קבוצתי',
};

function getCommunityTitle(entry: UserScheduleEntry): string {
  if (entry.groupName) return entry.groupName;
  const cat = entry.scheduledCategories?.[0] as string | undefined;
  if (!cat) return 'אימון קבוצתי';
  return COMMUNITY_TITLE_BY_CATEGORY[cat] ?? 'אימון קבוצתי';
}

const COMMUNITY_CARD_ICON: Record<string, React.FC<{ className?: string }>> = {
  walking: WalkingIcon,
  running: RunIcon,
};

// ── StrengthCard sub-component ─────────────────────────────────────────────
//
// Each card on a row owns its own `useDragControls` and long-press timer so
// multiple cards can drag independently.  React doesn't allow `useDragControls`
// inside a `.map()` callback, hence this dedicated component.
//
// When `entry.source === 'community'`, a small group-icon badge is rendered in
// the bottom-left corner of the card (consistent with existing pill patterns
// in this file like "הושלם" / "היום").

interface StrengthCardProps {
  /** The schedule entry — its `source` drives the community badge. */
  entry: UserScheduleEntry;
  /** Show "completed" styling: strikethrough title + green accent bar. */
  isCompleted: boolean;
  /** Show "today" styling: cyan-tinted card border. */
  isToday: boolean;
  /** Past-day cards are not draggable and not tappable. */
  baseMode: CardMode;
  /**
   * When the card sits next to a sibling, both share the row 50/50
   * (`flex: 1`).  When it's alone, it owns half the row (`width: 50%`).
   */
  isShared: boolean;
  /** False on past/empty/loading/running rows. */
  isDraggable: boolean;
  /**
   * Override accent bar color.  Pass `COMMUNITY_CATEGORY_COLORS[category]`
   * for community entries; omit (or pass `undefined`) for personal strength
   * cards, which default to brand cyan `#00C9F2`.
   */
  accentColor?: string;
  /**
   * Overrides the resolved title. Callsite priority: `entry.title` (a real,
   * user-entered name — AddWorkoutModal's "שם" field) wins when present;
   * else a `workoutType`-derived label for `source === 'reconstructed'`
   * entries (their `programIds` is empty, so `resolveStrengthTitle` alone
   * would mislabel them); omit for every other entry, which falls through
   * to `resolveStrengthTitle`'s own category-aware guess.
   */
  title?: string;
  /**
   * Overrides the completed-state fill (flat color or `linear-gradient(...)`
   * CSS value) — see `completedFillColor`/`computeStrengthPercent`. Applies
   * only when `isCompleted`; a real, actually-strength-vs-actually-aerobic
   * split for the specific workout that was done, not the category the
   * entry happens to be filed under. Omit to keep the flat green default.
   */
  completedFill?: string;
  /**
   * Tap handler — typically opens the workout preview. Skipped for past days.
   * Receives the ISO date string of the tapped entry so callers can update
   * their selected-date state synchronously before opening the preview.
   */
  onTap?: (date: string, skipCompletedLookup?: boolean) => void;
  /**
   * True when this entry is a planned (not reconstructed) card on a date
   * that ALSO has its own real completed-workout card(s) — i.e. onTap's
   * caller should not redirect to that unrelated completion, since it
   * already has its own dedicated tap route. Always false for reconstructed
   * entries themselves (they never reach onTap — see the router.push
   * special-case in `activate` below).
   */
  skipCompletedLookupOnTap?: boolean;
  /** Fires when long-press → drag activates so the parent can lift z-index. */
  onDragStart?: () => void;
  /** Fires on drag release with the absolute Y of the release event. */
  onDragEnd: (releaseY: number) => void;
  /**
   * Called when the red delete button (revealed by swipe-left) is tapped.
   * Fired for persisted personal entries and solo-scheduled community entries
   * (those with a groupId) on non-past days.
   */
  onDeleteRequest?: (entryId: string, groupId?: string) => void;
  /**
   * Called when the blue edit button (revealed by swipe-left) is tapped.
   * Only fired for persisted personal entries on non-past days.
   */
  onEditRequest?: (entryId: string) => void;
  /**
   * Called when the card is tapped (non-community, non-past).
   * Fires before onTap so parents can capture the entry context.
   */
  onPreviewEntry?: (entry: UserScheduleEntry) => void;
  /** Called when a community entry is tapped — opens a drawer instead of navigating. */
  onCommunityTap?: (groupId: string, groupName: string) => void;
}

const DRAG_LONG_PRESS_MS = 500;

function StrengthCard({
  entry,
  isCompleted,
  isToday,
  baseMode,
  isShared,
  isDraggable,
  accentColor,
  title: titleProp,
  completedFill,
  skipCompletedLookupOnTap,
  onTap,
  onCommunityTap,
  onDragStart,
  onDragEnd,
  onDeleteRequest,
  onEditRequest,
  onPreviewEntry,
}: StrengthCardProps) {
  const router = useRouter();
  const dragControls = useDragControls();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Swipe-to-reveal (x-axis) ──────────────────────────────────────────────
  const swipeX = useMotionValue(0);
  // Swipe available for persisted personal entries, and for solo-scheduled community
  // entries (those with a groupId — e.g. a run/walk scheduled via FreeRunDrawer).
  const canSwipe = !!(entry.entryId) && baseMode !== 'past' &&
    (entry.source !== 'community' || !!(entry.groupId));

  // Measure the container to derive the correct snap point so the card
  // never slides fully off screen. We always leave ≥16px of the card visible.
  const PANEL_WIDTH = 160;
  const MIN_VISIBLE = 16;
  const swipeContainerRef = useRef<HTMLDivElement>(null);
  const [openX, setOpenX] = useState(-PANEL_WIDTH);

  useLayoutEffect(() => {
    if (!canSwipe) return;
    const el = swipeContainerRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.offsetWidth;
      // Snap at most PANEL_WIDTH left, but always leave MIN_VISIBLE px of card
      setOpenX(-Math.min(PANEL_WIDTH, w - MIN_VISIBLE));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [canSwipe]);

  const SNAP_SPRING = { type: 'spring' as const, stiffness: 300, damping: 30 };

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

  const closeSwipe = useCallback(() => {
    animate(swipeX, 0, SNAP_SPRING);
  }, [swipeX]);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const handleGripDown = useCallback((e: React.PointerEvent) => {
    if (baseMode === 'past') return;
    e.stopPropagation();
    // Close swipe first if open before starting a y-drag.
    closeSwipe();
    const ev = e;
    timerRef.current = setTimeout(() => {
      onDragStart?.();
      dragControls.start(ev);
    }, DRAG_LONG_PRESS_MS);
  }, [baseMode, dragControls, onDragStart, closeSwipe]);

  const handleGripUp = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
  }, []);

  const handleYDragEnd = useCallback(
    (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => onDragEnd(info.point.y),
    [onDragEnd],
  );

  const isCommunity = entry.source === 'community';

  /**
   * Community cards navigate to the group drawer; personal cards call the
   * workout-preview `onTap`. If the card is swiped open, a tap closes the
   * swipe instead. Community past-day taps are still suppressed (group-
   * session history isn't wired anywhere yet — out of scope, F2.2,
   * 19.08.2026). Personal past-day taps used to be suppressed too (a hard
   * no-op) — no longer: onTap's caller (home/page.tsx's handleHeroPress)
   * now resolves whether that day has a real completed workout and opens
   * its summary; a past day with nothing real found still ends up a no-op
   * there, so this is additive, not a behavior change for the empty case.
   */
  const activate = useCallback(() => {
    if (swipeX.get() < -10) { closeSwipe(); return; }
    hapticLight();
    if (isCommunity) {
      if (baseMode === 'past') return;
      onCommunityTap?.(entry.groupId ?? '', entry.groupName ?? '');
      return;
    }
    // Reconstructed entries carry a real workout doc id — navigate straight
    // to that specific workout's history instead of the generic
    // onPreviewEntry/onTap(date) flow, which resolves purely by {userId,
    // date} (home/page.tsx's tryOpenCompletedWorkout) and would be
    // ambiguous on a day with more than one real workout doc.
    if (entry.source === 'reconstructed' && entry.completedWorkoutId) {
      // This tap only ever fires while TrainingPlannerOverlay is open (the
      // card can't be tapped otherwise) — safe to unconditionally flag a
      // reopen. See home/page.tsx's matching mount-effect.
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('reopen_training_planner', 'true');
      }
      router.push(`/workouts/${entry.completedWorkoutId}/history`);
      return;
    }
    onPreviewEntry?.(entry);
    onTap?.(entry.date, skipCompletedLookupOnTap);
  }, [baseMode, isCommunity, entry, onCommunityTap, onTap, swipeX, closeSwipe, onPreviewEntry, router, skipCompletedLookupOnTap]);

  const handleTap = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    activate();
  }, [activate]);

  const handleKey = useCallback((e: React.KeyboardEvent) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.stopPropagation();
    activate();
  }, [activate]);

  const handleDeleteTap = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    closeSwipe();
    if (entry.entryId) onDeleteRequest?.(entry.entryId, entry.groupId ?? undefined);
  }, [closeSwipe, entry.entryId, entry.groupId, onDeleteRequest]);

  const handleEditTap = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    closeSwipe();
    if (entry.entryId) onEditRequest?.(entry.entryId);
  }, [closeSwipe, entry.entryId, onEditRequest]);

  const barColor = isCompleted ? (completedFill ?? '#1D9E75') : (accentColor ?? '#00C9F2');
  const title = titleProp ?? (isCommunity
    ? getCommunityTitle(entry)
    : resolveStrengthTitle(entry.programIds, entry.scheduledCategories));
  const CommunityIcon: React.FC<{ className?: string }> | undefined = isCommunity
    ? COMMUNITY_CARD_ICON[entry.scheduledCategories?.[0] as string ?? '']
    : undefined;
  const personalIconKey = isCommunity
    ? undefined
    : resolveIconKey(entry.programIds?.[0], entry.scheduledCategories?.[0]);

  return (
    <motion.div
      drag={isDraggable ? 'y' : false}
      dragControls={dragControls}
      dragListener={false}
      dragConstraints={{ top: -3000, bottom: 3000 }}
      dragElastic={0}
      dragMomentum={false}
      dragSnapToOrigin
      onDragEnd={handleYDragEnd}
      style={{
        position: 'relative',
        minWidth: 0,
        ...(isShared ? { flex: 1 } : { width: '50%' }),
      }}
      whileDrag={{
        scale: 1.02,
        boxShadow: '0 8px 30px rgba(0,0,0,0.14)',
        zIndex: 100,
        borderRadius: 8,
        backgroundColor: '#ffffff',
      }}
    >
      {/* Swipe-and-reveal container — clips the sliding card and exposes the action panel */}
      <div ref={swipeContainerRef} style={{ position: 'relative', overflow: 'hidden', borderRadius: 8 }}>

        {/* Action panel — revealed on swipe-left: edit (blue) + delete (red) */}
        {canSwipe && (
          <div
            style={{
              position: 'absolute',
              top: 0, bottom: 0, right: 0,
              width: 160,
              display: 'flex',
            }}
          >
            {/* Edit button (left half of panel) */}
            <div
              style={{
                flex: 1,
                background: '#3B82F6',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <button
                onClick={handleEditTap}
                className="flex flex-col items-center gap-0.5 text-white active:opacity-70 transition-opacity"
                aria-label="ערוך אימון"
              >
                <Pencil className="w-4 h-4" />
                <span className="text-[10px] font-bold">ערוך</span>
              </button>
            </div>
            {/* Delete button (right half of panel) */}
            <div
              style={{
                flex: 1,
                background: '#EF4444',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <button
                onClick={handleDeleteTap}
                className="flex flex-col items-center gap-0.5 text-white active:opacity-70 transition-opacity"
                aria-label="מחק אימון"
              >
                <Trash2 className="w-4 h-4" />
                <span className="text-[10px] font-bold">מחק</span>
              </button>
            </div>
          </div>
        )}

        {/* X-draggable card layer */}
        <motion.div
          drag={canSwipe ? 'x' : false}
          style={{ x: swipeX, touchAction: 'pan-y', opacity: 1 }}
          dragConstraints={{ left: openX, right: 0 }}
          dragElastic={0}
          dragMomentum={false}
          onDragEnd={handleSwipeDragEnd}
        >
          <div
            role="button"
            tabIndex={0}
            onClick={handleTap}
            onKeyDown={handleKey}
            className="min-w-0 flex items-stretch cursor-pointer"
            style={{
              position: 'relative',
              width: '100%',
              // Stage C (18.08.2026): a completed entry fills the whole card solid
              // (barColor as background) instead of a white card + 4px stripe — the
              // border becomes redundant on a solid-fill card, so it's dropped too.
              border: isCompleted ? 'none' : `0.5px solid ${isToday ? '#00C9F240' : '#E0E9FF'}`,
              background: isCompleted ? barColor : 'var(--color-background-primary, #ffffff)',
              borderRadius: 8,
              overflow: 'hidden',
              minHeight: 36,
            }}
          >
            {/* 4px accent bar — only for not-yet-completed entries. A completed card
                is filled solid with this same color, so a same-color stripe would be
                invisible against it — the fill itself is now the completion signal. */}
            {!isCompleted && (
              <div
                className="flex-shrink-0"
                style={{ width: 4, backgroundColor: barColor }}
              />
            )}

            {/* Card body — icon/text color inverts to white once the card is filled
                solid (barColor), matching the same fill. */}
            <div className="flex items-center gap-1.5 flex-1 min-w-0" style={{ padding: '6px 8px', color: isCompleted ? '#FFFFFF' : barColor }}>
              {isCommunity
                ? (CommunityIcon && <CommunityIcon className="w-4 h-4 flex-shrink-0" />)
                : (() => {
                    const primaryId = entry.programIds?.[0];
                    // Adversarial review (19.08.2026): 6 of 9 SKILL_DISPLAY assets
                    // (PLANCHE/HSPU/FRONT_LEVER/OAPU/MUSCLE_UP/HANDSTAND — the core
                    // calisthenics skill tracks) are raster SVGs whose FIRST path is an
                    // opaque near-white (#FEFEFE) full-canvas background rectangle —
                    // confirmed by reading the actual asset files. Loaded via <img>, not
                    // inline/masked, so they can't inherit `color` at all: on a completed
                    // card's solid green fill they'd render as a visibly broken white
                    // square, not just "stay uncolored". Skip the raster path entirely
                    // when completed and fall back to getProgramIcon — a real currentColor
                    // SVG (program-icon.util.tsx's own doc comment confirms this) that
                    // correctly renders white here. Not-completed cards are unaffected —
                    // the raster's white background already matches the white card bg.
                    const skillDisplay = !isCompleted && primaryId
                      ? SKILL_DISPLAY[primaryId as keyof typeof SKILL_DISPLAY]
                      : null;
                    return skillDisplay
                      ? (
                        <img
                          src={skillDisplay.iconPath}
                          alt={skillDisplay.shortName}
                          className="w-4 h-4 object-contain flex-shrink-0"
                          onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        />
                      )
                      : getProgramIcon(personalIconKey, 'w-4 h-4 flex-shrink-0');
                  })()
              }
              <p className={`text-[13px] font-medium leading-tight truncate ${
                isCompleted ? 'text-white line-through' : 'text-gray-900 dark:text-white'
              }`}>
                {title}
              </p>
            </div>

            {/* Grip handle */}
            {isDraggable && (
              <div
                className="text-gray-300 dark:text-gray-600 cursor-grab active:cursor-grabbing flex items-center flex-shrink-0"
                style={{ touchAction: 'none', padding: '4px 2px' }}
                onPointerDown={handleGripDown}
                onPointerUp={handleGripUp}
                onPointerCancel={handleGripUp}
              >
                <GripVertical className="w-3.5 h-3.5" />
              </div>
            )}

            {/* Community badge — only for real group sessions, not solo-scheduled runs */}
            {isCommunity && !entry.isSoloScheduled && (
              <div
                className="absolute flex items-center justify-center"
                style={{
                  bottom: 3,
                  left: 3,
                  padding: '1px 3px',
                  borderRadius: 3,
                  background: '#E8F4FE',
                }}
                aria-label={entry.groupName ? `קבוצה: ${entry.groupName}` : 'אימון קהילתי'}
                title={entry.groupName ?? 'אימון קהילתי'}
              >
                <Users className="w-2.5 h-2.5" style={{ color: '#3B82F6' }} />
              </div>
            )}
          </div>
        </motion.div>

      </div>
    </motion.div>
  );
}

// ── Component ──────────────────────────────────────────────────────────────

export default function AgendaDayCard({
  date,
  isSelected,
  onSelect,
  userId,
  recurringTemplate,
  onStartWorkout,
  onAddWorkout,
  onDragStart,
  onCardDragEnd,
  onDeleteEntry,
  onEditEntry,
  onPreviewEntry,
  onCommunityTap,
  refreshKey,
  scheduleMap,
  actualWorkoutsMap,
  rowRef,
  runningOverride,
  suppressScheduleDaysFallback,
}: AgendaDayCardProps) {
  const { profile } = useUserStore();
  /**
   * `undefined` while the initial fetch is in flight, then a (possibly empty)
   * array.  The first element after migration plays the role of the legacy
   * "primary" entry; subsequent elements are additional workouts on the same
   * day (formerly written as `_2` Firestore docs).
   */
  const [entries, setEntries] = useState<UserScheduleEntry[] | undefined>(undefined);
  /** Entry pending delete-confirmation; null when the sheet is hidden. */
  const [deleteEntryId, setDeleteEntryId] = useState<{ entryId: string; groupId?: string } | null>(null);
  const baseMode = resolveCardMode(date);
  const d = new Date(date + 'T00:00:00');
  const dayLetter = getHebrewDayLetter(d);
  const dayShort = HEBREW_DAY_SHORT[dayLetter] ?? dayLetter;
  const dayNum = d.getDate();

  // Resolve running workout for this date — `runningOverride`, when passed
  // (even `null`), bypasses the global-store read entirely. See its own doc
  // on AgendaDayCardProps.
  const runningWorkout = useMemo(() => {
    if (runningOverride !== undefined) return runningOverride;
    const running = profile?.running;
    if (!running?.activeProgram?.schedule) return null;
    return resolveRunningEntry(
      date,
      running.scheduleDays ?? [],
      running.activeProgram.schedule as any[],
      running.activeProgram.startDate,
      running.activeProgram.currentWeek ?? 1,
    );
  }, [date, profile?.running, runningOverride]);

  const hasRunning = !!runningWorkout;
  const runCompleted = runningWorkout?.status === 'completed';

  // AGENDA_HYBRID_DAY_DISPLAY_ENABLED, read once. runningReplacesDay is true
  // whenever running is still acting as the OLD day-replacing mode (flag
  // off), false once it's just one item among others (flag on) or there's
  // no running at all. Every one of the 4 touched pieces below reduces to
  // hybridDisplayOn/runningReplacesDay instead of re-checking the flag 4
  // separate times.
  const hybridDisplayOn = isAgendaHybridDayDisplayEnabled();
  const runningReplacesDay = hasRunning && !hybridDisplayOn;

  useEffect(() => {
    // Reset to loading state on every re-run so the destination card
    // always re-renders after a drag move (not stuck showing stale data).
    setEntries(undefined);
    // AGENDA_HYBRID_DAY_DISPLAY_ENABLED off: running still replaces the whole
    // day (original behavior, byte-identical). On: fall through and fetch
    // strength/community entries even when there's a run today.
    if (runningReplacesDay) { setEntries([]); return; }
    if (!userId) { setEntries([]); return; }
    // Parent's batched fetch (see RollingAgenda) is still in flight — hold
    // the skeleton instead of falling back to a per-card network call.
    if (scheduleMap === null) return;
    let cancelled = false;
    async function load() {
      try {
        // scheduleMap provided → read the pre-fetched batch (no network call).
        // scheduleMap undefined → standalone usage (e.g. progress/page.tsx),
        // fall back to the original single-day round-trip.
        let result = scheduleMap ? (scheduleMap[date] ?? []) : await getScheduleEntries(userId, date);

        // Recurring-template fallback — only if Firestore returned nothing.
        if (result.length === 0 && recurringTemplate) {
          const hydrated = await hydrateFromTemplate(userId, date, recurringTemplate);
          if (hydrated.length > 0) result = hydrated;
        }

        // scheduleDays fallback — synthesize a recurring strength entry without
        // writing to Firestore.  Makes strength users' scheduled days visible
        // without requiring a recurringTemplate (which is only written for
        // running users). Suppressed by `suppressScheduleDaysFallback` — see
        // its doc on AgendaDayCardProps (paired with `runningOverride`).
        if (result.length === 0 && !suppressScheduleDaysFallback) {
          const letter = getHebrewDayLetter(new Date(date + 'T00:00:00'));
          const scheduleDays = profile?.lifestyle?.scheduleDays as string[] | undefined;
          if (scheduleDays?.includes(letter)) {
            result = [{
              userId,
              date,
              programIds: (profile?.progression?.activePrograms as any[] | undefined)
                ?.map((p: any) => p.templateId).filter(Boolean) ?? [],
              type: 'training',
              source: 'recurring',
              completed: false,
              scheduledCategories: ['strength'],
            } as UserScheduleEntry];
          }
        }

        // Reconstructed entries — plan-independent, real per-document
        // completion signal (AGENDA_UNPLANNED_COMPLETION_FIX_ENABLED).
        // Appended alongside whatever tiers 1-3 already produced (a real
        // planned entry, a recurring-template entry, a scheduleDays
        // synthetic entry, or nothing). Every real workout doc for the day
        // gets its own card, so a day with 2+ spontaneous workouts renders
        // 2+ distinct cards instead of one aggregate flag. Gated to
        // non-future days (a "completed" day can only be today or past —
        // mirrors isEmpty's own future-only gate).
        const actualWorkouts = actualWorkoutsMap?.[date] ?? [];
        if (AGENDA_UNPLANNED_COMPLETION_FIX_ENABLED && baseMode !== 'future' && actualWorkouts.length > 0) {
          // Dedup against the auto-generated recurring placeholder (28.08
          // handoff, Section J): once a real workout exists for this date,
          // the recurringTemplate/scheduleDays-fallback entry
          // (source:'recurring') would otherwise sit forever next to the
          // real completed card — no live writer ever flips a 'recurring'
          // entry's `completed` to true, so it always reads as a second,
          // still-pending workout. Only 'recurring' is dropped —
          // 'manual'/'community'/'google_calendar' entries are a real,
          // explicit plan and keep showing regardless.
          result = result.filter((e) => !(e.type === 'training' && e.source === 'recurring' && !e.completed));
          result = [
            ...result,
            ...actualWorkouts.map((w) => ({
              userId,
              date,
              programIds: [],
              type: 'training',
              source: 'reconstructed',
              completed: true,
              // Real workout doc id — lets a tap route straight to that
              // specific workout's history instead of the generic
              // onStartWorkout(date)/onPreviewEntry(entry) flow, which
              // would be ambiguous with 2+ docs on the same day.
              completedWorkoutId: w.id,
              scheduledCategories: workoutTypeToCategories(w.workoutType),
            } as UserScheduleEntry)),
          ];
        }

        // The running bridge seeds recurringTemplate[day] with its own
        // program's id, so hydrateFromTemplate above may have materialized a
        // shadow entry representing the same run `runningWorkout` (above)
        // already represents via profile.running.activeProgram.schedule —
        // exclude it so a running day doesn't render/count the same activity
        // twice now that running and strength/community render together.
        result = excludeRunningShadowEntry(result, profile?.running?.activeProgram?.programId);

        if (!cancelled) setEntries(result);
      } catch {
        if (!cancelled) setEntries([]);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [userId, date, recurringTemplate, refreshKey, runningReplacesDay, profile?.lifestyle?.scheduleDays, profile?.progression?.activePrograms, profile?.running?.activeProgram?.programId, scheduleMap, actualWorkoutsMap, baseMode, suppressScheduleDaysFallback]);

  const handleAddClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onAddWorkout?.(date);
  }, [onAddWorkout, date]);

  // ── Derived day-level state (uses the priority-picked primary entry) ──────
  //
  // The "primary" entry is what drives day-level UI: timeline-dot color, day-
  // number color, isCompleted strikethrough.  We mirror the legacy
  // `getScheduleEntry` priority — first non-community training, then any
  // training, then any entry — so behavior is unchanged on single-entry days.
  const primaryEntry: UserScheduleEntry | null = entries === undefined
    ? null
    : (entries.find((e) => e.type === 'training' && e.source !== 'community')
       ?? entries.find((e) => e.type === 'training')
       ?? entries[0]
       ?? null);

  // Training entries get rendered as cards.  Rest-override entries (type:'rest'
  // with source:'manual') are filtered out so they don't appear as cards but
  // still drive `isRest` below.
  const trainingEntries = (entries ?? []).filter((e) => e.type === 'training');
  const trainingCount   = trainingEntries.length;

  const isLoading = entries === undefined && !runningReplacesDay;
  const isEmpty   = !hasRunning && !isLoading && entries !== undefined && entries.length === 0 && baseMode === 'future';
  const isMissedPast = baseMode === 'past' && primaryEntry?.type === 'training' && primaryEntry?.completed === false;
  const isRest    = !hasRunning && !isEmpty && (!primaryEntry || primaryEntry?.type === 'rest' || isMissedPast);
  const isCompleted = runCompleted || (primaryEntry?.completed ?? false);
  const mode: CardMode = isRest ? 'rest' : baseMode;
  const timeLabel = formatTime(primaryEntry?.startTime);
  const hasContent = !isLoading && (primaryEntry !== null || hasRunning || isRest);
  const showAddButton = !!onAddWorkout && hasContent && !isEmpty && baseMode !== 'past';
  const isDraggable = !!onCardDragEnd && !isRest && !isEmpty && !isLoading && !hasRunning;

  /**
   * Per-card drag handlers live inside `StrengthCard`.  Each card forwards
   * its `entryId` (or `undefined` for synthesized recurring fallbacks) so the
   * parent can identify exactly which entry is being moved.
   */
  const handleCardDragRelease = useCallback(
    (entryId: string | undefined, y: number) => onCardDragEnd?.(entryId, y),
    [onCardDragEnd],
  );

  // Additive, not exclusive (29.08.2026, §0d stage 3) — a day can now show
  // running alongside strength/community cards; the day-number/timeline-dot
  // accent must reflect all of them, not just whichever branch used to win.
  // dominantCat below still prioritizes strength > cardio > cats[0], unchanged.
  // Byte-identical-when-off note: the additive branch below also affects a
  // NORMAL (non-running) multi-strength day's accent color (reading every
  // trainingEntries' categories instead of just primaryEntry's) — so it's
  // gated on hybridDisplayOn, not just runningReplacesDay, or a plain
  // multi-item strength day would silently change behavior with the flag off.
  const cats: ScheduleActivityCategory[] = runningReplacesDay
    ? ['cardio']
    : !hybridDisplayOn
      ? (primaryEntry?.scheduledCategories && primaryEntry.scheduledCategories.length > 0
          ? primaryEntry.scheduledCategories
          : (isRest ? [] : ['strength']))
      : (() => {
          const fromEntries = trainingEntries.flatMap((e) => e.scheduledCategories ?? []);
          const combined = Array.from(new Set([
            ...(hasRunning ? (['cardio'] as ScheduleActivityCategory[]) : []),
            ...fromEntries,
          ]));
          if (combined.length > 0) return combined;
          return isRest ? [] : ['strength'];
        })();

  // ── Derived styling helpers ──────────────────────────────────────────────

  const isToday = mode === 'today';
  const isFutureRest = isRest && baseMode === 'future';
  const isPastRest = isRest && baseMode === 'past';

  // Dominant accent color for strength/cardio/maintenance workout cards
  const dominantCat = cats.includes('strength') ? 'strength'
    : cats.includes('cardio') ? 'cardio'
    : cats[0] ?? 'strength';
  const accentColor: string = CATEGORY_ACCENT[dominantCat as ScheduleActivityCategory] ?? '#00C9F2';

  // Per-type color for running cards
  const runColor: string = RUN_CARD_COLORS[runningWorkout?.category ?? ''] ?? '#4CAF50';

  return (
    <div ref={rowRef} data-date={date}>
      {/* role="button" instead of <button> to allow real <button> children */}
      <div
        role="button"
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelect(); }}
        className={`
          w-full flex items-center gap-1.5 px-1 text-right transition-colors cursor-pointer
          ${(isRest || isEmpty) ? 'h-[46px]' : 'h-[56px]'}
          ${isSelected ? 'bg-cyan-50/60 dark:bg-cyan-950/20' : 'bg-transparent'}
          active:bg-gray-50 dark:active:bg-gray-800/40
        `}
        dir="rtl"
      >
        {/* ── RIGHT: Day label + date number ── */}
        <div className="w-9 flex-shrink-0 flex flex-col items-center justify-center">
          <span className={`text-[9px] font-bold uppercase leading-none ${
            isToday ? 'text-cyan-500' : 'text-gray-500 dark:text-gray-400'
          }`}>
            {dayShort}
          </span>
          <span className={`leading-tight tabular-nums ${
            isToday
              ? 'text-base font-black text-cyan-600 dark:text-cyan-400'
              : isCompleted
                ? 'text-base font-black text-emerald-600 dark:text-emerald-400'
                : (isRest || isEmpty)
                  ? 'text-sm font-semibold text-gray-500 dark:text-gray-400'
                  : 'text-base font-black text-gray-900 dark:text-gray-100'
          }`}>
            {dayNum}
          </span>
        </div>

        {/* ── Timeline dot ── */}
        <div className="flex flex-col items-center self-stretch py-2 flex-shrink-0">
          {(isFutureRest || isPastRest || isEmpty) ? (
            <div className="w-1.5 h-1.5 flex-shrink-0" />
          ) : (
            <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
              isToday ? 'bg-cyan-500'
              : isCompleted ? 'bg-emerald-500'
              : 'bg-gray-200 dark:bg-gray-700'
            }`} />
          )}
          <div className="w-px flex-1 mt-0.5" style={{ backgroundColor: 'rgba(100,116,139,0.4)' }} />
        </div>

        {/* ── CENTER: Activity content ── */}
        <div className="flex-1 min-w-0 flex items-center gap-1.5">
          {isLoading ? (
            /* Loading skeleton */
            <div className="h-2.5 w-16 bg-gray-100 dark:bg-gray-800 rounded-full animate-pulse" />

          ) : isEmpty ? (
            /* ── Empty future day: plain + הוסף אימון text ── */
            <button
              onClick={handleAddClick}
              className="flex items-center gap-1.5 transition-colors active:scale-95"
              style={{ color: '#64748B' }}
              aria-label="הוסף אימון ליום זה"
            >
              <Plus className="w-3 h-3" strokeWidth={2.5} />
              <span className="text-[10px] font-semibold">הוסף אימון</span>
            </button>

          ) : mode === 'rest' ? (
            /* ── Rest day ── */
            (baseMode !== 'past' && !!onAddWorkout) ? (
              <button
                onClick={handleAddClick}
                className="flex items-center gap-1.5 transition-colors active:scale-95"
                style={{ color: '#64748B' }}
                aria-label="הוסף אימון ליום זה"
              >
                <Plus className="w-3 h-3" strokeWidth={2.5} />
                <span className="text-[10px] font-semibold">הוסף אימון</span>
              </button>
            ) : (
              <span className="text-[10px] text-gray-400 dark:text-gray-500 font-medium">🛌 מנוחה</span>
            )

          ) : (hasRunning || trainingCount > 0) ? (
            /* ── §0d stage 1-3 (29.08.2026, AGENDA_HYBRID_DAY_DISPLAY_ENABLED):
               this branch's JSX itself needs no flag check — when the flag is
               off and running is present, runningReplacesDay forced entries
               to [] upstream (the load() effect's early return), so
               trainingEntries is empty here and only the running card
               renders, byte-identical to the old exclusive branch. When the
               flag is on, entries genuinely loaded and both render together.
               Running's width shares the row (flex:1) with other cards the
               same way StrengthCard's own isShared pattern does (:637) —
               matches when trainingCount > 0. Per-card drag/delete/tap for
               the running item specifically is still deferred to stage 4-5
               (no stable identity — no entryId, no Firestore doc);
               isDraggable still blanket-excludes hasRunning days, unchanged. ── */
            <div className="flex items-center flex-1 min-w-0" style={{ gap: 4 }}>
              {hasRunning && (
                /* ── Running workout — styled card with per-type accent bar ── */
                <div
                  className="min-w-0 flex items-stretch flex-shrink-0"
                  style={{
                    ...(trainingCount > 0 ? { flex: 1 } : { width: '50%' }),
                    // Stage C (18.08.2026): same full-color-fill treatment as StrengthCard
                    // above — completed fills solid instead of white+stripe, so the border
                    // (only meaningful against a white/tinted bg) is dropped too.
                    border: isCompleted ? 'none' : `0.5px solid ${runColor}26`,
                    background: isCompleted ? '#1D9E75' : `${runColor}0D`,
                    borderRadius: 8,
                    overflow: 'hidden',
                    minHeight: 36,
                  }}
                >
                  {/* Accent bar — only for not-yet-completed; see StrengthCard's identical
                      reasoning above (same-color stripe on a same-color fill is invisible). */}
                  {!isCompleted && (
                    <div className="flex-shrink-0" style={{ width: 4, backgroundColor: runColor }} />
                  )}

                  {/* Card body */}
                  <div className="flex items-center gap-1.5 flex-1 min-w-0" style={{ padding: '5px 10px' }}>
                    <span style={{ color: isCompleted ? '#FFFFFF' : runColor, flexShrink: 0 }}>
                      {getCategoryIcon(runningWorkout?.category)}
                    </span>
                    <span className={`text-[11px] font-semibold truncate flex-1 min-w-0 ${
                      isCompleted ? 'text-white line-through' : 'text-gray-900 dark:text-white'
                    }`}>
                      {runningWorkout!.name}
                    </span>
                    {isCompleted ? (
                      // Colors inverted (white pill, green text/icon) from the previous
                      // light-emerald-on-white treatment — that combination would have
                      // very poor contrast against the new solid #1D9E75 fill. Keeping the
                      // pill+label (not just relying on the fill color) preserves an
                      // accessible, non-color-only "done" signal.
                      <div className="flex items-center gap-0.5 px-1.5 py-px rounded-md bg-white/90 flex-shrink-0">
                        <Check className="w-2.5 h-2.5 text-[#1D9E75]" />
                        <span className="text-[9px] font-bold text-[#1D9E75]">הושלם</span>
                      </div>
                    ) : isToday ? (
                      <div className="flex items-center gap-1 px-1.5 py-px rounded-md flex-shrink-0" style={{ background: `${runColor}20` }}>
                        <div className="w-1 h-1 rounded-full animate-pulse" style={{ backgroundColor: runColor }} />
                        <span className="text-[9px] font-bold" style={{ color: runColor }}>היום</span>
                      </div>
                    ) : timeLabel ? (
                      <span className="text-[10px] font-bold tabular-nums flex-shrink-0" style={{ color: runColor }}>{timeLabel}</span>
                    ) : null}
                  </div>
                </div>
              )}

              {trainingEntries.map((e, idx) => (
                <StrengthCard
                  key={e.entryId ?? `${date}-${idx}`}
                  entry={e}
                  isCompleted={e.completed}
                  isToday={isToday}
                  baseMode={baseMode}
                  isShared={trainingCount > 1}
                  isDraggable={isDraggable && e.source !== 'community' && e.source !== 'reconstructed'}
                  accentColor={
                    e.source === 'community'
                      ? (COMMUNITY_CATEGORY_COLORS[e.scheduledCategories?.[0] as string ?? ''] ?? '#9CA3AF')
                      : undefined
                  }
                  title={e.title
                    ? e.title
                    : e.source === 'reconstructed'
                      ? resolveReconstructedTitle(actualWorkoutsMap?.[date]?.find((w) => w.id === e.completedWorkoutId)?.workoutType)
                      : undefined}
                  completedFill={e.source === 'reconstructed'
                    ? (() => {
                        const w = actualWorkoutsMap?.[date]?.find((x) => x.id === e.completedWorkoutId);
                        return completedFillColor(computeStrengthPercent(w?.segments, w?.category));
                      })()
                    : undefined}
                  skipCompletedLookupOnTap={e.source !== 'reconstructed' && (actualWorkoutsMap?.[date]?.length ?? 0) > 0}
                  onTap={onStartWorkout}
                  onCommunityTap={onCommunityTap}
                  onDragStart={onDragStart}
                  onDragEnd={(y) => handleCardDragRelease(e.entryId, y)}
                  onDeleteRequest={onDeleteEntry ? (id, gid) => setDeleteEntryId({ entryId: id, groupId: gid }) : undefined}
                  onEditRequest={onEditEntry ? (id) => {
                    const found = entries?.find(x => x.entryId === id);
                    if (found) onEditEntry(found);
                  } : undefined}
                  onPreviewEntry={onPreviewEntry}
                />
              ))}

              {/* Inline + icon — no border, 4px gap is set on parent */}
              {showAddButton && (
                <button
                  onClick={handleAddClick}
                  className="flex items-center justify-center flex-shrink-0 active:scale-90 transition-all"
                  style={{ color: '#64748B' }}
                  aria-label="הוסף אימון ליום זה"
                >
                  <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
                </button>
              )}
            </div>
          ) : null}
        </div>

      </div>

      {/* ── Delete confirmation bottom sheet ──────────────────────────────── */}
      {/* Backdrop */}
      <motion.div
        className="fixed inset-0 bg-black/40"
        style={{ zIndex: 300, pointerEvents: deleteEntryId ? 'auto' : 'none' }}
        animate={{ opacity: deleteEntryId ? 1 : 0 }}
        transition={{ duration: 0.2 }}
        onClick={() => setDeleteEntryId(null)}
      />
      {/* Sheet */}
      <motion.div
        className="fixed bottom-0 inset-x-0 bg-white rounded-t-2xl"
        style={{
          zIndex: 301,
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 80px)',
        }}
        initial={{ y: '100%' }}
        animate={{ y: deleteEntryId ? 0 : '100%' }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        dir="rtl"
      >
        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>
        {/* Title */}
        <div className="px-5 pt-3 pb-4 border-b border-gray-100">
          <h2 className="text-base font-black text-gray-900">מחיקת אימון?</h2>
          <p className="text-xs text-gray-500 mt-1">האימון יוסר מהלוח השבועי</p>
        </div>
        {/* Buttons */}
        <div className="px-5 py-4 space-y-3">
          <button
            type="button"
            className="w-full py-3.5 rounded-xl text-sm font-black text-white active:scale-[0.98] transition-transform"
            style={{ background: '#EF4444' }}
            onClick={() => {
              if (deleteEntryId) {
                onDeleteEntry?.(deleteEntryId.entryId, date, deleteEntryId.groupId);
              }
              setDeleteEntryId(null);
            }}
          >
            מחק
          </button>
          <button
            type="button"
            className="w-full py-2 text-sm text-gray-400 active:scale-[0.98] transition-transform"
            onClick={() => setDeleteEntryId(null)}
          >
            ביטול
          </button>
        </div>
      </motion.div>

    </div>
  );
}
