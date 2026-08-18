/**
 * day-display.utils.tsx
 *
 * Centralized state engine for the weekly schedule day cells.
 * Both SmartWeeklySchedule.tsx and MonthlyCalendarGrid.tsx pipe their data
 * through resolveDayDisplayProps() and render the result via DayIconCell.
 *
 * Asset registry, short-label dictionary, and the visual decision table
 * for past / today / future, completed / rest / missed, and debt-cleared
 * states all live here so the two calendars stay visually consistent.
 */

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getProgramIcon, BRAND_CYAN } from '@/features/content/programs/core/program-icon.util';
import type { ActivityCategory } from '@/features/activity/types/activity.types';
import { type ActivityRingData, ACTIVITY_RING_EMPTY_COLOR } from './activity-ring.utils';

// ============================================================================
// ASSET REGISTRY
// ============================================================================

/**
 * Branded asset paths. Single source of truth — change once, propagates
 * everywhere the engine is used.
 *
 * Note: lemur-rest B&W variant does not exist as a standalone asset.
 * Future / unselected rest days render the colorful lemur-rest.svg with
 * a CSS `filter: grayscale(1)` instead.
 */
export const ASSET_REGISTRY = {
  flames: {
    /** All strength workouts (any program iconKey under the strength umbrella). */
    strength:    '/assets/icons/ui/flame-strength.svg',
    /** Aerobic / steady-state running: easy_run, long_run, recovery. */
    endurance:   '/assets/icons/ui/flame-endurance.svg',
    /** High-intensity efforts: tempo, short/long intervals, hill_sprints. */
    intensity:   '/assets/icons/ui/flame-intensity.svg',
    /** Playful / mixed efforts: fartlek_easy/structured, hill_long, hill_short. */
    play:        '/assets/icons/ui/flame-play.svg',
    /** Mobility / yoga / pilates / flexibility (maintenance bucket). */
    maintenance: '/assets/icons/ui/flame-maintenance.svg',
    /** Rest day where step goal was met (orange step flame). */
    steps:       '/assets/icons/ui/flame-steps.svg',
  },
  lemur: {
    rest: '/assets/lemur/lemur-rest.svg',
  },
} as const;

export type FlameKey = keyof typeof ASSET_REGISTRY.flames;

/**
 * Running category → flame bucket. Single source of truth for routing
 * a workout category to the right branded medal.
 */
export const FLAME_BY_RUNNING_CATEGORY: Record<string, FlameKey> = {
  // Endurance bucket
  easy_run:           'endurance',
  long_run:           'endurance',
  recovery:           'endurance',
  // Intensity bucket
  tempo:              'intensity',
  short_intervals:    'intensity',
  long_intervals:     'intensity',
  hill_sprints:       'intensity',
  strides:            'intensity',
  // Play bucket
  fartlek_easy:       'play',
  fartlek_structured: 'play',
  hill_long:          'play',
  hill_short:         'play',
};

/**
 * Program iconKey / alias → flame bucket. Used when a day has no running
 * category (i.e., strength / wellness tracks).
 */
export const FLAME_BY_PROGRAM_ICON_KEY: Record<string, FlameKey> = {
  // Strength
  muscle:       'strength',
  upper_body:   'strength',
  push:         'strength',
  pushing:      'strength',
  pullup:       'strength',
  pull:         'strength',
  pulling:      'strength',
  calisthenics: 'strength',
  pull_up_pro:  'strength',
  full_body:    'strength',
  fullbody:     'strength',
  fullbady:     'strength',
  leg:          'strength',
  lower_body:   'strength',
  legs:         'strength',
  // Cardio / running fallback
  shoe:         'endurance',
  running:      'endurance',
  cardio:       'endurance',
  walking:      'endurance',
  // Maintenance / mobility
  core:         'maintenance',
  handstand:    'maintenance',
  pilates:      'maintenance',
  yoga:         'maintenance',
  mobility:     'maintenance',
  flexibility:  'maintenance',
  // Health / wellness defaults to maintenance flame
  heart:             'maintenance',
  healthy_lifestyle: 'maintenance',
  wellness:          'maintenance',
};

// ============================================================================
// SHORT LABEL DICTIONARY
// ============================================================================

/**
 * Maps every program iconKey, alias, and running category to a short
 * Hebrew label (≤ 6 chars) suitable for the tiny text under each day cell.
 */
export const SHORT_LABEL_MAP: Record<string, string> = {
  // ── Strength program iconKeys + aliases ─────────────────────────────
  muscle: 'עליון',
  upper_body: 'עליון',
  push: 'עליון',
  pushing: 'עליון',
  pullup: 'מתח',
  pull: 'מתח',
  pulling: 'מתח',
  calisthenics: 'מתח',
  pull_up_pro: 'מתח',
  full_body: 'שלם',
  fullbody: 'שלם',
  fullbady: 'שלם',
  leg: 'תחתון',
  lower_body: 'תחתון',
  legs: 'תחתון',
  core: 'ליבה',
  handstand: 'ליבה',
  pilates: 'ליבה',
  yoga: 'ליבה',
  // ── Cardio / running aliases ─────────────────────────────────────────
  shoe: 'ריצה',
  running: 'ריצה',
  cardio: 'ריצה',
  walking: 'הליכה',
  // ── Health aliases ───────────────────────────────────────────────────
  heart: 'בריאות',
  healthy_lifestyle: 'בריאות',
  wellness: 'בריאות',
  // ── Running category keys (from SmartWeeklySchedule.CATEGORY_COLORS) ──
  easy_run: 'קלה',
  long_run: 'נפח',
  short_intervals: 'ספרינט',
  long_intervals: 'אינטרוול',
  fartlek_easy: 'פארטלק',
  fartlek_structured: 'פארטלק',
  tempo: 'טמפו',
  hill_long: 'גבעות',
  hill_short: 'גבעות',
  hill_sprints: 'גבעות',
  strides: 'סטריידס',
  recovery: 'שחזור',
};

/** Resolve a short Hebrew label for any iconKey / alias / running category. */
export function getShortLabel(key?: string | null): string {
  if (!key) return '';
  return SHORT_LABEL_MAP[key.toLowerCase()] ?? '';
}

// ============================================================================
// COLOR PALETTE
// ============================================================================

/**
 * Category → hex color. Mirrors ACTIVITY_COLORS in activity.types.ts plus
 * additional semantic colors for steps / rest / missed states.
 *
 * `strength` uses BRAND_CYAN (#00C9F2) — the canonical brand color shared
 * with CheckMarkBadge, CyanDot, and the today-state ring. Using cyan-500
 * (#06B6D4) here previously made the muscle icon look turquoise/teal.
 */
export const CATEGORY_COLORS = {
  strength:    BRAND_CYAN, // #00C9F2 — brand cyan
  cardio:      '#84CC16',  // lime-500
  maintenance: '#A855F7',  // purple-500
  steps:       '#F97316',  // orange-500 — energy/flame accent (not the steps identity color)
  rest:        '#9CA3AF',  // gray-400
} as const;

/**
 * "Beast Mode" accent color — applied to flames on scheduled rest days that
 * the user nonetheless trained on. A vibrant violet that visually outranks
 * the standard category palette so the bonus achievement reads as a premium
 * accomplishment rather than a routine training completion.
 */
export const BONUS_WORKOUT_COLOR = '#A855F7';

export type DayDisplayCategory = keyof typeof CATEGORY_COLORS;

/**
 * Running sub-category → exact hex color.
 * Mirrors the CATEGORY_COLORS map in SmartWeeklySchedule.tsx so the weekly
 * strip and the full-schedule agenda always share the same palette.
 */
export const RUNNING_CATEGORY_COLORS: Record<string, string> = {
  easy_run:           '#4CAF50',
  long_run:           '#2E7D32',
  short_intervals:    '#E11D48',
  long_intervals:     '#0D9488',
  fartlek_easy:       '#CE93D8',
  fartlek_structured: '#CE93D8',
  tempo:              '#9C27B0',
  hill_long:          '#FF7043',
  hill_short:         '#FF7043',
  hill_sprints:       '#FF7043',
  strides:            '#FF7043',
  recovery:           '#B0BEC5',
};

/**
 * Community group category → accent color for agenda/calendar UI.
 * Aligned with the Tailwind gradient palette used by `GroupCard.tsx` and
 * `GroupDetailsDrawer.tsx` (emerald/orange/violet/cyan/lime), converted to
 * solid hex values so they can be used in inline styles.
 */
export const COMMUNITY_CATEGORY_COLORS: Record<string, string> = {
  walking:      '#10B981', // emerald-500
  running:      '#F97316', // orange-500
  yoga:         '#8B5CF6', // violet-500
  calisthenics: '#06B6D4', // cyan-500
  cycling:      '#84CC16', // lime-500
  other:        '#9CA3AF', // gray-400
};

// ============================================================================
// TYPES
// ============================================================================

export type DayState = 'future' | 'today' | 'past';

/**
 * Single-session input for multi-activity days. Pass 2+ of these in
 * `DayDisplayInput.sessions` and the engine will return an alternating
 * sessions array instead of collapsing to one dominant icon.
 */
export interface DaySessionInput {
  category: ActivityCategory;
  minutes: number;
  programIconKey?: string;
  runningCategory?: string;
  runningColor?: string;
}

export interface DayDisplayInput {
  state: DayState;
  isSelected: boolean;
  /**
   * When true, never paint selectable chrome (15 % fill / 1 px border) on the
   * icon container — e.g. month grid shows selection only on the day number.
   */
  suppressIconSelectableChrome?: boolean;
  isRest: boolean;
  isMissed: boolean;
  isCompleted: boolean;
  /**
   * True when `isCompleted`'s completion was recovery-only content (rest-day
   * video trio OR the "Budget Floor" cooldown/mobility fallback) rather than
   * bonus effort. When true, suppresses the "Beast Mode" bonus-flame
   * treatment on an `isRest && isCompleted` day — that content is the day's
   * INTENDED programming, not surprise effort. Gated end-to-end by
   * RECOVERY_DAY_BADGE_FIX_ENABLED (see feature-flags.ts); always false/
   * undefined while that flag is off, so Beast Mode fires exactly as before.
   */
  isRecoveryCompletion?: boolean;
  /** True if this missed training day was made up on a later rest day. */
  debtCleared?: boolean;
  /** True if a full workout (super) was logged. */
  isSuper?: boolean;
  /** True if user hit the daily step goal. */
  stepGoalMet?: boolean;
  /** Dominant activity category for the day (for color/flame selection). */
  dominantCategory?: ActivityCategory | null;
  /** Program icon key (muscle / shoe / heart / etc.) */
  programIconKey?: string;
  /** Running category key (easy_run / tempo / etc.) — overrides programIconKey label. */
  runningCategory?: string;
  /** Color override for running mode (when not strength/cardio/maintenance). */
  runningColor?: string;
  /**
   * 2+ sessions logged/scheduled on this day. When provided, the engine
   * returns `sessions` in the output and DayIconCell alternates between
   * them. Honored for `state==='today'`, `state==='future'`, or
   * `state==='past' && sessionsCompleted` — i.e. any day whose activities are
   * either already done or genuinely scheduled; never for an unresolved
   * past day (missed/rest), where a session list wouldn't mean anything.
   */
  sessions?: DaySessionInput[];
  /**
   * True when `sessions` reflects real completed activity rather than a
   * planned/scheduled fallback — deliberately DECOUPLED from `isCompleted`
   * (the single-session WORKOUT axis — did the user finish a structured OUT
   * workout). `sessions` is sourced from the ACTIVITY axis (real per-category
   * minutes / scheduled entries), which is not 1:1 with the workout axis — a
   * user can log real activity without pressing "workout complete", or have
   * a scheduled run still pending while other activities that day are
   * already done. Only read by the multi-session branch (2+ sessions); the
   * single-session branches keep using `isCompleted` as before, unchanged.
   */
  sessionsCompleted?: boolean;
}

/** Single resolved session, ready to render. */
export interface DaySession {
  /** Pre-computed container styling (bg, border) for this session. */
  container: DayDisplayProps['container'];
  icon: DayDisplayProps['icon'];
  label: { text: string; color: string };
  /** Category color used for the pager dot and the container ring. */
  color: string;
}

export interface DayDisplayProps {
  /** Echo of the input state so renderers can apply state-specific polish (e.g. today shadow). */
  state: DayState;
  /** Echo of input.isSelected for downstream consumers. */
  isSelected: boolean;
  container: {
    bgColor: string;
    bgOpacity: number; // 0–1 (background opacity only — border is always 100%)
    borderColor: string;
    borderWidth: number;
    /** When true, adds a CSS box-shadow glow matching `borderColor`. */
    glowBorder?: boolean;
  };
  icon: {
    type: 'img' | 'program' | 'zz' | 'none';
    src?: string;
    iconKey?: string;
    /** Apply CSS grayscale(1) — used for future-rest lemur. */
    grayscale?: boolean;
    /**
     * For `program` icons: passed as CSS `currentColor`.
     * For `img` icons with `glow: true`: used as the drop-shadow tint colour
     * so the halo matches the flame's category colour instead of being white.
     */
    color?: string;
    /**
     * Override the rendered px size of an img icon independently of
     * `ICON_SIZE_PX`. Used for the Today-completed flame (28 px).
     */
    overrideSizePx?: number;
    /**
     * Adds a subtle drop-shadow. For `img` icons the shadow colour is taken
     * from `color` when provided (category-coloured halo), otherwise white.
     */
    glow?: boolean;
    /**
     * Forces the icon to pure white via `brightness(0) invert(1)`.
     * Reserved for future use — not active in the today-completed state.
     */
    forceWhite?: boolean;
  };
  label: {
    text: string;
    color: string;
  };
  /**
   * Multi-session display. When present (length ≥ 2), DayIconCell rotates
   * between sessions every 2 s with a 300 ms opacity transition and
   * renders one pager dot per session in the gap area below the icon.
   *
   * The single-icon fields above mirror `sessions[0]` for renderers that
   * don't support multi-session.
   */
  sessions?: DaySession[];
  /**
   * Pager-dot list. Only ever rendered (by DayIconCell) when length >= 2 —
   * a single activity shows just its flame/icon, no dot. Length = number of
   * sessions/planned activities when multi (2 or 3, capped); computed but
   * suppressed at length 1; empty for pure-rest (Lemur) and missed/rest days.
   * The dot at index === activeSessionIndex renders at 100 % opacity;
   * all other dots stay at 30 %.
   */
  dots: { color: string }[];
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Resolve the display **color/label bucket** from input.
 * Note: this drives `color` (for the 15%-bg + 1px-border selection ring)
 * and the bottom label tint — NOT the flame asset selection. Flame asset
 * selection is more granular and handled by `resolveFlameSrc()`.
 */
function resolveCategory(input: DayDisplayInput): DayDisplayCategory {
  // Missed (past training, not completed) → treated as REST (softening: a missed day
  // is a day you rested, not a failure). No distinct 'missed' category.
  if (input.isMissed && !input.debtCleared) return 'rest';
  if (input.isRest && !input.isCompleted && !input.stepGoalMet) return 'rest';
  if (input.isRest && input.stepGoalMet) return 'steps';
  if (input.dominantCategory === 'cardio') return 'cardio';
  if (input.dominantCategory === 'maintenance') return 'maintenance';
  if (input.dominantCategory === 'strength') return 'strength';
  // Fallbacks based on iconKey (no dominantCategory available)
  const ik = input.programIconKey?.toLowerCase();
  if (ik === 'shoe' || ik === 'running' || ik === 'cardio' || ik === 'walking') return 'cardio';
  if (ik === 'yoga' || ik === 'pilates' || ik === 'mobility' || ik === 'flexibility' || ik === 'core' || ik === 'handstand') {
    return 'maintenance';
  }
  return 'strength';
}

/**
 * Pick the right flame asset for a completed past day.
 *
 * Priority:
 *  1. `runningCategory` (most specific — e.g. `tempo` → intensity flame)
 *  2. `programIconKey` (e.g. `muscle` → strength flame, `yoga` → maintenance)
 *  3. `dominantCategory` bucketing (cardio → endurance, maintenance → maintenance)
 *  4. Fallback → strength flame
 */
function resolveFlameSrc(input: DayDisplayInput): string {
  // 1. Running category wins
  if (input.runningCategory) {
    const flameKey = FLAME_BY_RUNNING_CATEGORY[input.runningCategory.toLowerCase()];
    if (flameKey) return ASSET_REGISTRY.flames[flameKey];
  }

  // 2. Program icon key
  if (input.programIconKey) {
    const flameKey = FLAME_BY_PROGRAM_ICON_KEY[input.programIconKey.toLowerCase()];
    if (flameKey) return ASSET_REGISTRY.flames[flameKey];
  }

  // 3. Dominant activity-store category
  if (input.dominantCategory === 'cardio') return ASSET_REGISTRY.flames.endurance;
  if (input.dominantCategory === 'maintenance') return ASSET_REGISTRY.flames.maintenance;
  if (input.dominantCategory === 'strength') return ASSET_REGISTRY.flames.strength;

  // 4. Fallback
  return ASSET_REGISTRY.flames.strength;
}

// ============================================================================
// STATE ENGINE — resolveDayDisplayProps()
// ============================================================================

/**
 * Build the standard "selectable" container — transparent by default,
 * 15% category-colored bg + 1px solid (100% opacity) border when selected.
 *
 * Per spec: background is the only opacity-modulated layer; the border
 * always uses the exact category color at 100% opacity for sharp edges.
 */
function selectableContainer(color: string, isSelected: boolean): DayDisplayProps['container'] {
  return {
    bgColor: isSelected ? color : 'transparent',
    bgOpacity: isSelected ? 0.15 : 0,
    borderColor: isSelected ? color : 'transparent',
    borderWidth: isSelected ? 1 : 0,
  };
}

/** Default program-icon key per activity-store category. */
const CATEGORY_DEFAULT_ICON_KEY: Record<ActivityCategory, string> = {
  strength:    'muscle',
  cardio:      'shoe',
  maintenance: 'core',
};

/** Hebrew fallback label when no iconKey/runningCategory mapping exists. */
const CATEGORY_FALLBACK_LABEL: Record<ActivityCategory, string> = {
  strength:    'כוח',
  cardio:      'ריצה',
  maintenance: 'גמישות',
};

/**
 * Build a complete render bundle (icon + label + container + color) for
 * one session of a multi-activity day. Used by the multi-session branch
 * of `resolveDayDisplayProps()`.
 */
function buildSession(
  state: DayState,
  isCompletedDay: boolean,
  isSelected: boolean,
  sessionInput: DaySessionInput,
): DaySession {
  // Color: explicit running color > category bucket
  const color = sessionInput.runningColor ?? CATEGORY_COLORS[sessionInput.category];

  // Label: runningCategory > programIconKey > category fallback
  const labelKey = sessionInput.runningCategory ?? sessionInput.programIconKey;
  const labelText = getShortLabel(labelKey) || CATEGORY_FALLBACK_LABEL[sessionInput.category];

  // Resolved program icon for this session
  const programIconKey =
    sessionInput.programIconKey ?? CATEGORY_DEFAULT_ICON_KEY[sessionInput.category];

  // Container: today-completed mirrors the single-session "medal" treatment
  // (transparent + 2px border); today-pending / future stays solid-or-selectable
  // exactly like the single-session branches below.
  const container: DayDisplayProps['container'] =
    state === 'today'
      ? (isCompletedDay
          ? { bgColor: color, bgOpacity: 0, borderColor: color, borderWidth: 2 }
          : { bgColor: color, bgOpacity: 1, borderColor: color, borderWidth: 0 })
      : selectableContainer(color, isSelected);

  // Icon: branded flame for ANY completed day (today or past — matches the
  // single-session today-completed and past-completed branches respectively),
  // program icon otherwise (today-pending or future/planned).
  let icon: DayDisplayProps['icon'];
  if (isCompletedDay) {
    icon = {
      type: 'img',
      src: resolveFlameSrc({
        state,
        isSelected,
        isRest: false,
        isMissed: false,
        isCompleted: true,
        programIconKey,
        runningCategory: sessionInput.runningCategory,
        dominantCategory: sessionInput.category,
      }),
      // Today's single-session completed flame is 28px + glow + category tint;
      // past-completed is plain. Mirror that split here.
      ...(state === 'today' ? { overrideSizePx: 28, glow: true, color } : {}),
    };
  } else {
    icon = {
      type: 'program',
      iconKey: programIconKey,
      color: state === 'today' ? '#FFFFFF' : color,
    };
  }

  return {
    container,
    icon,
    // White only for today-PENDING (matches the today-pending single-session
    // branch); today-completed (medal, transparent bg) and past/future all
    // use the category color, same as their single-session siblings.
    label: { text: labelText, color: (state === 'today' && !isCompletedDay) ? '#FFFFFF' : color },
    color,
  };
}

/**
 * Single decision function: maps day state + selection → exact visual props.
 * Both calendar components use this; do NOT duplicate this logic anywhere else.
 */
export function resolveDayDisplayProps(input: DayDisplayInput): DayDisplayProps {
  /** Selection ring on icon — disabled when the host UI handles selection elsewhere. */
  const selForChrome = input.suppressIconSelectableChrome ? false : input.isSelected;

  const category = resolveCategory(input);
  const color =
    input.runningColor ??
    (input.runningCategory ? RUNNING_CATEGORY_COLORS[input.runningCategory.toLowerCase()] : undefined) ??
    CATEGORY_COLORS[category];
  const labelText = getShortLabel(input.runningCategory ?? input.programIconKey);

  // Common echo so DayIconCell can apply state-specific polish (today shadow, etc.)
  const echo = { state: input.state, isSelected: input.isSelected };

  // ── MULTI-SESSION (alternating icons) ───────────────────────────────────
  // Fires when 2+ sessions are passed AND the day is today, a future/planned
  // day, or a past completed (non-rest, non-missed) day — i.e. any day whose
  // activities are either already done or genuinely scheduled. Gated on
  // sessionsCompleted (the ACTIVITY axis `sessions` was actually built from),
  // not `isCompleted` (the WORKOUT axis) — see sessionsCompleted's doc.
  const sessionInputs = input.sessions ?? [];
  const allowMulti =
    sessionInputs.length >= 2 &&
    !input.isRest &&
    !input.isMissed &&
    (input.state === 'today' || input.state === 'future' || (input.state === 'past' && !!input.sessionsCompleted));

  if (allowMulti) {
    const isCompletedDay = (input.state === 'past' || input.state === 'today') && !!input.sessionsCompleted;
    // Cap at 3 sessions for the pager UI; assume already sorted by minutes desc.
    const sessions = sessionInputs
      .slice(0, 3)
      .map((s) => buildSession(input.state, isCompletedDay, selForChrome, s));

    return {
      ...echo,
      // Single-icon fields mirror sessions[0] for renderers that don't support multi.
      container: sessions[0].container,
      icon: sessions[0].icon,
      label: sessions[0].label,
      sessions,
      dots: sessions.map((s) => ({ color: s.color })),
    };
  }

  // ── TODAY: solid category fill + shadow-md (applied by DayIconCell) ─────
  //
  // Sub-states:
  //   • Rest day, not yet completed → Zz with rest-colour background
  //   • Rest day, workout logged    → fall through to flame (made up on a rest day)
  //   • Training, not yet completed → white program icon (motivational "you can do it")
  //   • Training, completed         → flame icon (medal, immediate satisfaction)
  //
  // All keep the 100 % opaque background so the cell always reads as TODAY.
  if (input.state === 'today') {
    // ── Rest day with no activity yet → Zz (mirrors the future-rest branch) ──
    // This prevents a leaked activeProgram (from the engine fallback) from
    // rendering a muscle-arm icon on an unscheduled off-day.
    if (input.isRest && !input.isCompleted) {
      return {
        ...echo,
        container: {
          bgColor: CATEGORY_COLORS.rest,
          bgOpacity: 1,
          borderColor: CATEGORY_COLORS.rest,
          borderWidth: 0,
        },
        icon: { type: 'zz' },
        label: { text: 'מנוחה', color: '#FFFFFF' },
        dots: [],
      };
    }
    // ── Rest day with a logged workout TODAY → Beast Mode flame ──
    // The user trained on a scheduled rest day right now. Render the
    // premium violet bonus treatment immediately so the cell celebrates
    // the surprise effort instead of mimicking a routine training day.
    // Exception: if the only completed activity was recovery-only content
    // (video trio / Budget-Floor cooldown), that's the day's INTENDED
    // content, not bonus effort — fall through to the ordinary rest
    // treatment below instead.
    if (input.isRest && input.isCompleted && !input.isRecoveryCompletion) {
      return {
        ...echo,
        container: {
          bgColor: BONUS_WORKOUT_COLOR,
          bgOpacity: 0,
          borderColor: BONUS_WORKOUT_COLOR,
          borderWidth: 2,
        },
        icon: {
          type: 'img',
          src: resolveFlameSrc(input),
          overrideSizePx: 28,
          glow: true,
          color: BONUS_WORKOUT_COLOR,
        },
        label: { text: labelText || 'בונוס', color: BONUS_WORKOUT_COLOR },
        dots: [{ color: BONUS_WORKOUT_COLOR }],
      };
    }

    // Two visual sub-states:
    //   Pending   → solid fill bg + white program icon (motivational)
    //   Completed → transparent bg + 2px category-colour border + colored flame with subtle glow
    const todayIcon: DayDisplayProps['icon'] = input.isCompleted
      // Colored flame at full size — `color` feeds the glow tint so the halo
      // matches the category colour exactly. `forceWhite` is NOT set.
      ? { type: 'img', src: resolveFlameSrc(input), overrideSizePx: 28, glow: true, color }
      : { type: 'program', iconKey: input.programIconKey, color: '#FFFFFF' };

    if (input.isCompleted) {
      // Medal state: transparent square + 2px category-colour border + colored flame
      return {
        ...echo,
        container: {
          bgColor: color,
          bgOpacity: 0,
          borderColor: color,
          borderWidth: 2,
        },
        icon: todayIcon,
        label: { text: labelText, color },
        dots: [{ color }],
      };
    }

    // Pending today: solid fill so the cell always reads as TODAY
    return {
      ...echo,
      container: {
        bgColor: color,
        bgOpacity: 1,
        borderColor: color,
        borderWidth: 0,
      },
      icon: todayIcon,
      label: { text: labelText, color: '#FFFFFF' },
      dots: [{ color }],
    };
  }

  // ── PAST ─────────────────────────────────────────────────────────────────
  if (input.state === 'past') {
    // (Non-debt missed days are handled below by the shared rest-Zz fallback —
    //  a missed day renders identically to a planned rest day. Softening: no
    //  distinct 'missed' visual, no punitive marker.)

    // Missed day with cleared debt → render the appropriate flame (made up).
    if (input.isMissed && input.debtCleared) {
      return {
        ...echo,
        container: selectableContainer(color, selForChrome),
        icon: { type: 'img', src: resolveFlameSrc(input) },
        label: { text: labelText, color },
        dots: [{ color }],
      };
    }

    // Rest-day BEAST MODE: scheduled rest day with a logged workout.
    // The user voluntarily trained on a planned off-day, so we honor the
    // bonus effort with a premium violet glow that visually outranks the
    // routine training-day flame. Container ring + label both adopt the
    // bonus hue so the cell reads as a distinct achievement at a glance.
    // Exception: recovery-only content (video trio / Budget-Floor cooldown)
    // is the day's INTENDED programming, not bonus effort — falls through
    // to the ordinary past-rest treatment below instead.
    if (input.isRest && input.isCompleted && !input.isRecoveryCompletion) {
      return {
        ...echo,
        container: selectableContainer(BONUS_WORKOUT_COLOR, selForChrome),
        icon: {
          type: 'img',
          src: resolveFlameSrc(input),
          glow: true,
          color: BONUS_WORKOUT_COLOR,
        },
        label: { text: labelText || 'בונוס', color: BONUS_WORKOUT_COLOR },
        dots: [{ color: BONUS_WORKOUT_COLOR }],
      };
    }

    // Past rest day with steps goal met → orange step flame
    if (input.isRest && input.stepGoalMet) {
      return {
        ...echo,
        container: selectableContainer(CATEGORY_COLORS.steps, selForChrome),
        icon: { type: 'img', src: ASSET_REGISTRY.flames.steps },
        label: { text: 'צעדים', color: CATEGORY_COLORS.steps },
        dots: [{ color: CATEGORY_COLORS.steps }],
      };
    }

    // Past rest day, no activity → soft Zz (no dot)
    if (input.isRest) {
      return {
        ...echo,
        container: selectableContainer(CATEGORY_COLORS.rest, selForChrome),
        icon: { type: 'zz' },
        label: { text: 'מנוחה', color: CATEGORY_COLORS.rest },
        dots: [],
      };
    }

    // Past completed → branded flame
    if (input.isCompleted) {
      return {
        ...echo,
        container: selectableContainer(color, selForChrome),
        icon: { type: 'img', src: resolveFlameSrc(input) },
        label: { text: labelText, color },
        dots: [{ color }],
      };
    }

    // Past training not completed — MISSED (the common case) or a past today-slot →
    // rest Zz. A missed day renders identically to a planned rest day (softening).
    return {
      ...echo,
      container: selectableContainer(CATEGORY_COLORS.rest, selForChrome),
      icon: { type: 'zz' },
      label: { text: 'מנוחה', color: CATEGORY_COLORS.rest },
      dots: [],
    };
  }

  // ── FUTURE ───────────────────────────────────────────────────────────────
  // Future rest day → Zz (softer opacity when not selected)
  if (input.isRest) {
    return {
      ...echo,
      container: selectableContainer(CATEGORY_COLORS.rest, selForChrome),
      icon: { type: 'zz' },
      label: { text: 'מנוחה', color: CATEGORY_COLORS.rest },
      dots: [],
    };
  }

  // Future training day — icon always uses the activity/running category color
  return {
    ...echo,
    container: selectableContainer(color, selForChrome),
    icon: {
      type: 'program',
      iconKey: input.programIconKey,
      color,
    },
    label: { text: labelText, color },
    dots: [{ color }],
  };
}


// ============================================================================
// HEX → RGBA HELPER (for inline opacity backgrounds)
// ============================================================================

function hexToRgba(hex: string, alpha: number): string {
  if (hex === 'transparent' || alpha === 0) return 'transparent';
  const cleaned = hex.replace('#', '');
  const r = parseInt(cleaned.substring(0, 2), 16);
  const g = parseInt(cleaned.substring(2, 4), 16);
  const b = parseInt(cleaned.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ============================================================================
// DAY ICON CELL — renders the output of resolveDayDisplayProps()
// ============================================================================

/** Figma spec (final): 32 px container, rounded-lg. Do not override. */
const CONTAINER_SIZE_PX = 32;
/**
 * 24 px — the Figma icon *frame*. All `img` icons (flames + lemur) fill this
 * slot entirely (4 px padding each side inside the 32 px container).
 * Program icons (JSX SVGs) render at 12 px *inside* this frame
 * — see `IconRenderer` — for the minimalist look David specified.
 * The lemur stays at 24 px to be clearly more prominent than the 12 px icons.
 */
const ICON_SIZE_PX = 24;
/** Inner size for program-icon SVGs (Figma minimalist spec). */
const PROGRAM_ICON_PX = 12;
/** Pager-dot diameter (px). Phase 5 spec. */
const DOT_SIZE_PX = 3;
/** Inactive dot opacity. Active dot is always 1. */
const DOT_INACTIVE_OPACITY = 0.3;

export interface DayIconCellProps {
  props: DayDisplayProps;
  /** When true the pager-dot row below the icon is not rendered. */
  hideDots?: boolean;
  /** Override the icon container (month grid «today» badge, etc.). */
  sizeOverride?: {
    sizePx: number;
    radiusPx: number;
    /** Program / zz inner frame side (defaults to ICON_SIZE_PX ≈24). */
    innerSlotPx?: number;
    /** Flame / raster icons — exact render side inside the badge. */
    imgIconPx?: number;
  };
  /**
   * ACTIVITY schedule (Stage 2) — when provided, the cell renders a SINGLE
   * summary ring (S10 activity) INSTEAD of the flame/icon container. The flame
   * axis (S8) is never touched; the two schedules are separate views toggled by
   * the host. Ring diameter defaults to 40 px (see `ringSizePx`).
   */
  activityRing?: ActivityRingData;
  /** Ring diameter in px for the activity view (defaults to 40). */
  ringSizePx?: number;
}

/**
 * Render a single icon descriptor (img / program / zz / none).
 * Pure renderer — no state.
 */
function IconRenderer({
  icon,
  innerFramePx,
}: {
  icon: DayDisplayProps['icon'];
  /** When set (e.g. month «today» 34 px badge), scales the inner icon frame. */
  innerFramePx?: number;
}) {
  switch (icon.type) {
    case 'img': {
      const sz = icon.overrideSizePx ?? ICON_SIZE_PX;
      const filters: string[] = [];

      if (icon.forceWhite) {
        // Convert any colour to pure white + a tiny sharp halo (2 px, not bleeding).
        filters.push('brightness(0) invert(1)');
        filters.push('drop-shadow(0 0 2px rgba(255,255,255,0.9))');
      } else {
        if (icon.grayscale) filters.push('grayscale(1)');
        if (icon.glow) {
          // Use category colour as shadow tint when provided (today-completed flame);
          // fall back to white for non-categorised glowing icons.
          const glowColor = icon.color ?? 'rgba(255,255,255,0.8)';
          filters.push(`drop-shadow(0 0 3px ${glowColor})`);
        }
      }

      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={icon.src}
          alt=""
          width={sz}
          height={sz}
          style={{
            width: sz,
            height: sz,
            objectFit: 'contain',
            // mix-blend-mode: multiply makes residual white canvas areas in
            // the Canva-exported SVGs transparent against any non-white bg.
            // Disabled for forceWhite icons (white × anything ≠ white).
            mixBlendMode: icon.forceWhite ? undefined : 'multiply',
            filter: filters.length ? filters.join(' ') : undefined,
          }}
        />
      );
    }
    case 'program': {
      const frame = innerFramePx ?? ICON_SIZE_PX;
      const largeGlyph = innerFramePx != null && innerFramePx >= 18;
      return (
        <div
          className="flex items-center justify-center shrink-0"
          style={{ color: icon.color, width: frame, height: frame }}
        >
          {getProgramIcon(icon.iconKey, largeGlyph ? 'w-5 h-5' : 'w-3 h-3')}
        </div>
      );
    }
    case 'zz': {
      const frame = innerFramePx ?? ICON_SIZE_PX;
      const fontSize = innerFramePx != null ? Math.round(14 * (frame / ICON_SIZE_PX)) : 14;
      return (
        <div
          className="flex items-center justify-center shrink-0"
          style={{ width: frame, height: frame }}
          aria-label="מנוחה"
        >
          <span
            className="font-bold leading-none select-none"
            style={{ fontSize, color: '#D1D5DB' }}
          >
            Z<sup style={{ fontSize: Math.max(6, fontSize * 0.55), verticalAlign: 'super' }}>z</sup>
          </span>
        </div>
      );
    }
    case 'none':
    default:
      return null;
  }
}

/** How long each session is shown in a multi-session day (ms). */
const SESSION_ROTATION_MS = 2000;
/** Half-duration for the cross-fade — full transition = 2 × this = 300 ms. */
const FADE_DURATION_S = 0.15;

/**
 * Renders the output of `resolveDayDisplayProps()`.
 *
 * Figma visual spec (final — same in SmartWeeklySchedule + MonthlyCalendarGrid):
 *  • Container: 32 × 32 px, rounded-lg (8 px)
 *  • Icon frame: 24 × 24 px — flames fill fully; program icons at 12 px; Zz at 11 px text
 *  • Today: solid category fill + `shadow-md`, white icon
 *  • Selected (non-today): 15 % category bg + 1 px solid 100 %-opacity border
 *
 * Phase 5 dots-only UI (replaces all text labels):
 *  • Below the icon (4 px gap area) we render dots ONLY when there are 2+
 *    sessions (Stage H, 18.08.2026) — a single activity/goal shows just its
 *    flame/icon, no dot underneath.
 *  • Each dot uses its corresponding session's category color.
 *  • Active dot = 100 % opacity, inactive dots = 30 %.
 *  • Multi-session: the icon cross-fades every 2 s (300 ms transition) and
 *    the active dot rotates in lock-step with the visible icon.
 *  • Rest (Zz), missed-no-debt days, and single-activity days render zero dots.
 */
/**
 * ActivityDayRing — the single summary ring for the ACTIVITY schedule (S10).
 *
 * One arc: total activity minutes vs the daily goal, in the dominant-category
 * colour, over a faded track. No activity → track only (empty/faded ring).
 * This is deliberately NOT the multi-ring ConcentricRingsProgress — the activity
 * schedule shows one aggregate ring per day.
 */
function ActivityDayRing({
  ring,
  sizePx,
  isToday,
}: {
  ring: ActivityRingData;
  sizePx: number;
  isToday: boolean;
}) {
  const strokeWidth = Math.max(4, Math.round(sizePx * 0.13)); // ≈5 px at 40 px
  const radius = (sizePx - strokeWidth) / 2;
  const center = sizePx / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.min(100, Math.max(0, ring.percentage));
  const dashoffset = circumference - (circumference * pct) / 100;
  const trackColor = ring.active ? `${ring.color}22` : ACTIVITY_RING_EMPTY_COLOR;

  return (
    <svg
      width={sizePx}
      height={sizePx}
      viewBox={`0 0 ${sizePx} ${sizePx}`}
      style={{ display: 'block', flexShrink: 0, overflow: 'visible' }}
      aria-hidden
    >
      {/* Track */}
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke={trackColor}
        strokeWidth={strokeWidth}
      />
      {/* Progress arc — only when there is activity */}
      {ring.active && (
        <motion.circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={ring.color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: dashoffset }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          style={{
            transform: 'rotate(-90deg)',
            transformOrigin: `${center}px ${center}px`,
            filter: isToday ? `drop-shadow(0 0 3px ${ring.color}66)` : undefined,
          }}
        />
      )}
    </svg>
  );
}

export function DayIconCell({ props, hideDots = false, sizeOverride, activityRing, ringSizePx }: DayIconCellProps) {
  const { container, icon, state, sessions, dots } = props;
  const isToday = state === 'today';
  const containerSize = sizeOverride?.sizePx ?? CONTAINER_SIZE_PX;
  const containerRadius = sizeOverride?.radiusPx ?? 8; // rounded-lg = 8px
  const isMulti = !!(sessions && sessions.length >= 2);

  // Active session index for multi-session days. Resets to 0 when the
  // sessions array identity / length changes.
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    setActiveIndex(0);
    if (!isMulti) return;
    const interval = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % sessions!.length);
    }, SESSION_ROTATION_MS);
    return () => clearInterval(interval);
  }, [isMulti, sessions]);

  // Active visual bundle — multi mode pulls from sessions[activeIndex],
  // single mode uses the top-level fields.
  const active = isMulti ? sessions![activeIndex] : null;
  const currentContainer = active?.container ?? container;
  const rawIcon = active?.icon ?? icon;

  let currentIcon = rawIcon;
  if (currentIcon.type === 'img' && sizeOverride?.imgIconPx != null) {
    currentIcon = {
      ...currentIcon,
      overrideSizePx: sizeOverride.imgIconPx,
    };
  }

  const innerSlotPx = sizeOverride?.innerSlotPx;

  // ── ACTIVITY schedule (Stage 2) ─────────────────────────────────────────
  // When an activity ring is supplied, this cell renders ONLY the single
  // summary ring (S10) — no flame, no dots. Selection / click chrome is owned
  // by the host cell wrapper. Placed after the hooks above so hook order is
  // stable whether or not the activity view is active.
  if (activityRing) {
    return (
      <div className="flex items-center justify-center" dir="rtl">
        <ActivityDayRing ring={activityRing} sizePx={ringSizePx ?? 40} isToday={isToday} />
      </div>
    );
  }

  return (
    <div
      className="flex flex-col items-center justify-center"
      dir="rtl"
      style={sizeOverride ? {
        width: sizeOverride.sizePx,
        height: sizeOverride.sizePx,
        maxWidth: sizeOverride.sizePx,
        maxHeight: sizeOverride.sizePx,
        flexShrink: 0,
      } : undefined}
    >
      {/* ── Icon container ─────────────────────────────────────────────── */}
      {/* `rounded-lg` (8 px) — paired with the smaller 38 px footprint so
          the container keeps its 'soft square' identity at the new size
          without drifting toward a circle. */}
      <div
        className="flex items-center justify-center transition-all duration-300"
        style={{
          width: containerSize,
          height: containerSize,
          maxWidth: sizeOverride ? containerSize : undefined,
          maxHeight: sizeOverride ? containerSize : undefined,
          flexShrink: sizeOverride ? 0 : undefined,
          boxSizing: sizeOverride ? 'border-box' : undefined,
          borderRadius: containerRadius,
          backgroundColor: hexToRgba(currentContainer.bgColor, currentContainer.bgOpacity),
          // Border is always 100 % opaque — only the bg uses 15 % alpha.
          border:
            currentContainer.borderWidth > 0
              ? `${currentContainer.borderWidth}px solid ${currentContainer.borderColor}`
              : undefined,
          // No box-shadow on container — glow lives only on the flame icon itself.
        }}
      >
        {isMulti ? (
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={`icon-${activeIndex}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: FADE_DURATION_S, ease: 'easeInOut' }}
              className="flex items-center justify-center"
            >
              <IconRenderer icon={currentIcon} innerFramePx={innerSlotPx} />
            </motion.div>
          </AnimatePresence>
        ) : (
          <IconRenderer icon={currentIcon} innerFramePx={innerSlotPx} />
        )}
      </div>

      {/* ── 4 px gap → pager dots row (2 or 3 dots; suppressed at 0/1 —
          Stage H, 18.08.2026: a single activity shows only its flame/icon,
          no redundant dot underneath) ───────────────────────────────────── */}
      {!hideDots && dots.length >= 2 && (
        <div
          className="flex items-center justify-center gap-[2px]"
          style={{ height: 4, marginTop: 4 }}
        >
          {dots.map((d, i) => {
            // For single-dot days the lone dot is always active. For multi
            // days the dot index lines up with the rotating session index.
            const isActive = !isMulti || i === activeIndex;
            return (
              <span
                key={`dot-${i}`}
                className="rounded-full transition-opacity duration-300"
                style={{
                  width: DOT_SIZE_PX,
                  height: DOT_SIZE_PX,
                  backgroundColor: d.color,
                  opacity: isActive ? 1 : DOT_INACTIVE_OPACITY,
                }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
