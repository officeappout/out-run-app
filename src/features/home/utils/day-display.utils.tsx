/**
 * day-display.utils.tsx
 *
 * Centralized state engine for the weekly schedule day cells.
 * Both ScheduleCalendar.tsx and SmartWeeklySchedule.tsx pipe their data
 * through resolveDayDisplayProps() and render the result via DayIconCell.
 *
 * Asset registry, short-label dictionary, and the visual decision table
 * for past / today / future, completed / rest / missed, and debt-cleared
 * states all live here so the two calendars stay visually consistent.
 */

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { getProgramIcon, BRAND_CYAN } from '@/features/content/programs/core/program-icon.util';
import type { ActivityCategory } from '@/features/activity/types/activity.types';

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
  steps:       '#F97316',  // orange-500
  rest:        '#9CA3AF',  // gray-400
  missed:      '#9CA3AF',  // gray-400
} as const;

export type DayDisplayCategory = keyof typeof CATEGORY_COLORS;

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
  isRest: boolean;
  isMissed: boolean;
  isCompleted: boolean;
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
   * 2+ sessions logged on this day. When provided, the engine returns
   * `sessions` in the output and DayIconCell alternates between them.
   * Only honored for `state==='today'` or `state==='past' && isCompleted`.
   */
  sessions?: DaySessionInput[];
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
    type: 'img' | 'program' | 'ghost' | 'zz' | 'none';
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
   * Pager-dot list rendered in the 4 px gap below the icon.
   * Length = number of sessions/planned activities (1, 2, or 3).
   * Empty for pure-rest (Lemur) and missed-no-debt (ghost) days.
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
  if (input.isMissed && !input.debtCleared) return 'missed';
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
  isPastCompleted: boolean,
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

  // Container: solid for today, selectable elsewhere
  const container: DayDisplayProps['container'] =
    state === 'today'
      ? { bgColor: color, bgOpacity: 1, borderColor: color, borderWidth: 0 }
      : selectableContainer(color, isSelected);

  // Icon: branded flame for past completed, program icon otherwise
  let icon: DayDisplayProps['icon'];
  if (isPastCompleted) {
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
    label: { text: labelText, color: state === 'today' ? '#FFFFFF' : color },
    color,
  };
}

/**
 * Single decision function: maps day state + selection → exact visual props.
 * Both calendar components use this; do NOT duplicate this logic anywhere else.
 */
export function resolveDayDisplayProps(input: DayDisplayInput): DayDisplayProps {
  const category = resolveCategory(input);
  const color = input.runningColor ?? CATEGORY_COLORS[category];
  const labelText = getShortLabel(input.runningCategory ?? input.programIconKey);

  // Common echo so DayIconCell can apply state-specific polish (today shadow, etc.)
  const echo = { state: input.state, isSelected: input.isSelected };

  // ── MULTI-SESSION (alternating icons) ───────────────────────────────────
  // Only fires when 2+ sessions are passed AND the day is either today
  // OR a past completed (non-rest, non-missed) day.
  const sessionInputs = input.sessions ?? [];
  const allowMulti =
    sessionInputs.length >= 2 &&
    !input.isRest &&
    !input.isMissed &&
    (input.state === 'today' || (input.state === 'past' && input.isCompleted));

  if (allowMulti) {
    const isPastCompleted = input.state === 'past' && input.isCompleted;
    // Cap at 3 sessions for the pager UI; assume already sorted by minutes desc.
    const sessions = sessionInputs
      .slice(0, 3)
      .map((s) => buildSession(input.state, isPastCompleted, input.isSelected, s));

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
  // Two sub-states:
  //   • Not yet completed → white program icon (motivational "you can do it")
  //   • Completed today   → flame icon (medal, immediate satisfaction)
  //
  // Both keep the 100 % opaque background so the cell always reads as TODAY.
  if (input.state === 'today') {
    // Two visual sub-states:
    //   Pending   → solid fill bg + white program icon (motivational)
    //   Completed → transparent bg + 2px category-colour border + colored flame with subtle glow
    const todayIcon: DayDisplayProps['icon'] = input.isCompleted
      // Colored flame at full size — `color` feeds the glow tint so the halo
      // matches the category colour exactly. `forceWhite` is NOT set.
      ? { type: 'img', src: resolveFlameSrc(input), overrideSizePx: 28, glow: true, color }
      : { type: 'program', iconKey: input.programIconKey, color: '#FFFFFF' };

    if (process.env.NODE_ENV === 'development') {
      console.log('[day-display] Today Debug:', {
        state: input.state,
        isCompleted: input.isCompleted,
        iconType: todayIcon.type,
        iconSrc: 'src' in todayIcon ? todayIcon.src : undefined,
      });
    }

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
    // Missed / unplanned past day → soft Zz (clean slate, not punitive 'X').
    // No dot — no achievement to indicate.
    if (input.isMissed && !input.debtCleared) {
      return {
        ...echo,
        container: selectableContainer(CATEGORY_COLORS.rest, input.isSelected),
        icon: { type: 'zz' },
        label: { text: 'מנוחה', color: CATEGORY_COLORS.rest },
        dots: [],
      };
    }

    // Missed day with cleared debt → render the appropriate flame (made up).
    if (input.isMissed && input.debtCleared) {
      return {
        ...echo,
        container: selectableContainer(color, input.isSelected),
        icon: { type: 'img', src: resolveFlameSrc(input) },
        label: { text: labelText, color },
        dots: [{ color }],
      };
    }

    // Rest-day BONUS: rest day with a completed workout → branded flame
    // (not Lemur). Wins over the steps flame because a logged session
    // outranks step-only achievements.
    if (input.isRest && input.isCompleted) {
      return {
        ...echo,
        container: selectableContainer(color, input.isSelected),
        icon: { type: 'img', src: resolveFlameSrc(input) },
        label: { text: labelText, color },
        dots: [{ color }],
      };
    }

    // Past rest day with steps goal met → orange step flame
    if (input.isRest && input.stepGoalMet) {
      return {
        ...echo,
        container: selectableContainer(CATEGORY_COLORS.steps, input.isSelected),
        icon: { type: 'img', src: ASSET_REGISTRY.flames.steps },
        label: { text: 'צעדים', color: CATEGORY_COLORS.steps },
        dots: [{ color: CATEGORY_COLORS.steps }],
      };
    }

    // Past rest day, no activity → soft Zz (no dot)
    if (input.isRest) {
      return {
        ...echo,
        container: selectableContainer(CATEGORY_COLORS.rest, input.isSelected),
        icon: { type: 'zz' },
        label: { text: 'מנוחה', color: CATEGORY_COLORS.rest },
        dots: [],
      };
    }

    // Past completed → branded flame
    if (input.isCompleted) {
      return {
        ...echo,
        container: selectableContainer(color, input.isSelected),
        icon: { type: 'img', src: resolveFlameSrc(input) },
        label: { text: labelText, color },
        dots: [{ color }],
      };
    }

    // Past planned but not completed (edge case: past today's slot) → Zz
    return {
      ...echo,
      container: selectableContainer(CATEGORY_COLORS.rest, input.isSelected),
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
      container: selectableContainer(CATEGORY_COLORS.rest, input.isSelected),
      icon: { type: 'zz' },
      label: { text: 'מנוחה', color: CATEGORY_COLORS.rest },
      dots: [],
    };
  }

  // Future training day
  // Default: gray icon
  // Selected: 15% category bg + 1px border + colorful icon
  return {
    ...echo,
    container: selectableContainer(color, input.isSelected),
    icon: {
      type: 'program',
      iconKey: input.programIconKey,
      color: input.isSelected ? color : '#1F2937', // gray-800
    },
    label: { text: labelText, color },
    dots: [{ color }],
  };
}

// ============================================================================
// GHOST RING (shared)
// ============================================================================

/**
 * Ghost ring for missed days.
 * Outer ring = 12 px (PROGRAM_ICON_PX) — same visual weight as program icons.
 * Centered inside the 24 px icon frame, which itself sits in the 32 px container.
 */
function GhostRing() {
  return (
    <div className="w-3 h-3 rounded-full border-[1.5px] border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center bg-gray-50 dark:bg-gray-800/50 opacity-60">
      <X className="w-1.5 h-1.5 text-gray-400" />
    </div>
  );
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
 * Program icons (JSX SVGs) and GhostRing render at 12 px *inside* this frame
 * — see `IconRenderer` — for the minimalist look David specified.
 * The lemur stays at 24 px to be clearly more prominent than the 12 px icons.
 */
const ICON_SIZE_PX = 24;
/** Inner size for program-icon SVGs and GhostRing (Figma minimalist spec). */
const PROGRAM_ICON_PX = 12;
/** Pager-dot diameter (px). Phase 5 spec. */
const DOT_SIZE_PX = 3;
/** Inactive dot opacity. Active dot is always 1. */
const DOT_INACTIVE_OPACITY = 0.3;

export interface DayIconCellProps {
  props: DayDisplayProps;
}

/**
 * Render a single icon descriptor (img / program / ghost / zz / none).
 * Pure renderer — no state.
 */
function IconRenderer({ icon }: { icon: DayDisplayProps['icon'] }) {
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
    case 'program':
      return (
        // Outer div = 24 px icon frame (ICON_SIZE_PX); inner SVG = 12 px
        // (PROGRAM_ICON_PX) for the minimalist Figma look.
        <div
          className="flex items-center justify-center"
          style={{ color: icon.color, width: ICON_SIZE_PX, height: ICON_SIZE_PX }}
        >
          {getProgramIcon(icon.iconKey, 'w-3 h-3')}
        </div>
      );
    case 'ghost':
      return <GhostRing />;
    case 'zz':
      // Soft-gray rest indicator. Sharp 14 px text, no shadows, no glow.
      return (
        <div
          className="flex items-center justify-center"
          style={{ width: ICON_SIZE_PX, height: ICON_SIZE_PX }}
          aria-label="מנוחה"
        >
          <span
            className="font-bold leading-none select-none"
            style={{ fontSize: 14, color: '#D1D5DB' }}
          >
            Z<sup style={{ fontSize: 8, verticalAlign: 'super' }}>z</sup>
          </span>
        </div>
      );
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
 * Figma visual spec (final — same in SmartWeeklySchedule + ScheduleCalendar):
 *  • Container: 32 × 32 px, rounded-lg (8 px)
 *  • Icon frame: 24 × 24 px — flames fill fully; program icons at 12 px; Zz at 11 px text
 *  • Today: solid category fill + `shadow-md`, white icon
 *  • Selected (non-today): 15 % category bg + 1 px solid 100 %-opacity border
 *
 * Phase 5 dots-only UI (replaces all text labels):
 *  • Below the icon (4 px gap area) we render `props.dots.length` 3 px dots
 *    (1 for single-session/planned days, 2–3 for multi-session days).
 *  • Each dot uses its corresponding session's category color.
 *  • Active dot = 100 % opacity, inactive dots = 30 %.
 *  • Multi-session: the icon cross-fades every 2 s (300 ms transition) and
 *    the active dot rotates in lock-step with the visible icon.
 *  • Rest (Zz) and missed-no-debt days render zero dots.
 */
export function DayIconCell({ props }: DayIconCellProps) {
  const { container, icon, state, sessions, dots } = props;
  const isToday = state === 'today';
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
  const currentIcon = active?.icon ?? icon;

  return (
    <div className="flex flex-col items-center justify-center" dir="rtl">
      {/* ── Icon container ─────────────────────────────────────────────── */}
      {/* `rounded-lg` (8 px) — paired with the smaller 38 px footprint so
          the container keeps its 'soft square' identity at the new size
          without drifting toward a circle. */}
      <div
        className="rounded-lg flex items-center justify-center transition-all duration-300"
        style={{
          width: CONTAINER_SIZE_PX,
          height: CONTAINER_SIZE_PX,
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
              <IconRenderer icon={currentIcon} />
            </motion.div>
          </AnimatePresence>
        ) : (
          <IconRenderer icon={currentIcon} />
        )}
      </div>

      {/* ── 4 px gap → pager dots row (1 / 2 / 3 dots, or empty) ───────── */}
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
    </div>
  );
}
