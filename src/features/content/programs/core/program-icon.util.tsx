/**
 * Program Icon Resolver + Smart Day Icon Wrapper
 *
 * Maps iconKey strings (stored on Program documents) to inline SVG components
 * sourced from /public/icons/programs/.  All SVGs use `currentColor` so the
 * parent's CSS `color` / Tailwind `text-*` controls their fill/stroke.
 *
 * The SmartDayIcon wrapper renders any program icon with state-aware styling
 * (future, today, completed, selected) so every icon type gets the same
 * treatment without duplicating rendering logic.
 */

import React from 'react';
import { Heart, Sparkles, Target } from 'lucide-react';

/** Brand cyan used throughout the schedule and completion states */
export const BRAND_CYAN = '#00C9F2';

/** Canonical icon key values (matches Admin dropdown options) */
export type ProgramIconKey = 'muscle' | 'full_body' | 'pullup' | 'leg' | 'core' | 'shoe' | 'heart';

interface IconConfig {
  component: React.FC<{ className?: string }>;
  label: string;
}

// ── Inline SVG components (from public/icons/programs/) ──────────────
// Using `currentColor` makes color controllable via CSS `color` / Tailwind.

function MuscleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 13 11" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M11.875 8.49641C11.6642 9.35355 10.5787 9.5625 9.88848 9.5625C8.3983 9.5625 2.71702 9.5625 2.71702 9.5625C1.30519 9.5625 0.227331 7.96126 0.766428 6.5655C1.95888 4.46229 3.02976 2.83719 3.64838 0.894899C5.07769 0.0616627 6.91005 0.894898 6.4791 2.2858M4.64655 2.83719C3.87448 3.99641 4.30703 5.28212 3.64838 6.5655C5.60422 5.28159 7.52284 5.02481 9.60907 6.5655" stroke="currentColor" strokeWidth="1.125" strokeLinejoin="round"/>
    </svg>
  );
}

function LegIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M5.73765 0.500977C5.73765 0.500977 2.6587 0.974661 2.6587 2.39571C2.6587 4.29045 5.26373 7.60624 5.26373 7.60624C3.13215 7.13256 1.94824 7.84308 1.94824 9.50098H8.34268L6.44794 6.18519C7.39531 5.23782 7.15824 3.81677 5.97426 2.39571" stroke="currentColor" strokeWidth="0.947368" strokeLinejoin="round"/>
    </svg>
  );
}

function RunIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M13.5411 4.81964C13.2994 4.38452 12.7507 4.22773 12.3155 4.46947L10.8856 5.26389L9.94303 3.82233C9.91514 3.82331 9.88731 3.82446 9.8592 3.82446C8.90979 3.82446 8.09211 3.25156 7.73243 2.43354C6.62716 2.43346 4.76196 2.43335 4.76196 2.43335C4.43346 2.43335 4.13098 2.6121 3.9725 2.89983L2.83089 4.97276C2.59079 5.40879 2.74957 5.95689 3.18557 6.197C3.32344 6.27293 3.47252 6.30897 3.61954 6.30897C3.93741 6.30897 4.24563 6.14045 4.4098 5.84232L5.29451 4.23588H6.99666L4.39786 8.77229H1.24698C0.749242 8.77229 0.345703 9.1758 0.345703 9.67356C0.345703 10.1713 0.749215 10.5748 1.24698 10.5748H4.91216C5.23091 10.5748 5.52595 10.4065 5.6881 10.1321L6.33552 9.03646L7.97002 10.3243L6.99004 12.7623C6.80441 13.2241 7.0283 13.749 7.49013 13.9346C7.60036 13.9789 7.71408 13.9999 7.826 13.9999C8.18313 13.9999 8.52118 13.7862 8.66252 13.4345L9.89425 10.3702C10.0435 9.99893 9.9301 9.57373 9.61581 9.32611L7.80349 7.89822L9.05652 5.76032L9.83584 6.95223C10.0079 7.21539 10.2957 7.36039 10.5909 7.36039C10.7393 7.36039 10.8896 7.32367 11.0279 7.24686L13.1909 6.04516C13.626 5.80347 13.7828 5.25476 13.5411 4.81964Z" fill="currentColor"/>
      <path d="M9.85906 3.00426C10.6887 3.00426 11.3612 2.33173 11.3612 1.50213C11.3612 0.672526 10.6887 0 9.85906 0C9.02946 0 8.35693 0.672526 8.35693 1.50213C8.35693 2.33173 9.02946 3.00426 9.85906 3.00426Z" fill="currentColor"/>
    </svg>
  );
}

function FullBodyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M15.5856 20.8002L13.9597 16.0393C13.6381 15.0994 12.8429 14.6106 12.1311 14.6106C11.4457 14.6106 10.6586 15.1356 10.3057 16.0306L8.4213 20.8002H6.18344L8.35268 14.5995L8.35331 14.5976C8.56349 13.9772 9.08177 13.4024 9.78337 12.9803C10.483 12.5595 11.3492 12.3007 12.2295 12.3007C14.0262 12.3007 15.415 13.3056 15.8429 14.5963L17.8559 20.8002H15.5856Z" fill="currentColor"/>
      <path d="M14.5213 4.55611C14.5213 5.85056 13.4097 6.91203 12 6.91203C10.5902 6.91203 9.47864 5.85056 9.47864 4.55611C9.47864 3.26166 10.5902 2.2002 12 2.2002C13.4097 2.2002 14.5213 3.26167 14.5213 4.55611Z" fill="currentColor"/>
      <path d="M19.8 10.7613H4.19995V8.35903H19.8V10.7613Z" fill="currentColor"/>
    </svg>
  );
}

/** Checkmark badge — derived from check_mark.svg */
export function CheckMarkBadge({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 8 8" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="8" height="8" rx="4" fill={BRAND_CYAN}/>
      <path d="M3.33333 5.5L2 4.2062L2.425 3.7938L3.33333 4.6752L5.575 2.5L6 2.9124L3.33333 5.5Z" fill="white"/>
    </svg>
  );
}

const ICON_MAP: Record<ProgramIconKey, IconConfig> = {
  muscle: {
    component: MuscleIcon,
    label: 'שריר',
  },
  full_body: {
    component: FullBodyIcon,
    label: 'כל הגוף',
  },
  pullup: {
    component: ({ className }) => <Target className={className} />,
    label: 'מתח',
  },
  leg: {
    component: LegIcon,
    label: 'רגליים',
  },
  core: {
    component: ({ className }) => <Sparkles className={className} />,
    label: 'ליבה',
  },
  shoe: {
    component: RunIcon,
    label: 'ריצה',
  },
  heart: {
    component: ({ className }) => <Heart className={className} />,
    label: 'בריאות',
  },
};

/**
 * Single source of truth: maps program aliases / template IDs to icon keys.
 * Consumed by DashedGoalCarousel, SmartWeeklySchedule, and any component
 * that needs to resolve a program name into a visual icon.
 */
export const PROGRAM_ALIAS_TO_ICON: Record<string, ProgramIconKey> = {
  upper_body: 'muscle',
  push: 'muscle',
  pushing: 'muscle',
  pull: 'pullup',
  pulling: 'pullup',
  full_body: 'full_body',
  fullbody: 'full_body',
  fullbady: 'full_body',
  lower_body: 'leg',
  legs: 'leg',
  core: 'core',
  running: 'shoe',
  cardio: 'shoe',
  walking: 'shoe',
  calisthenics: 'pullup',
  handstand: 'core',
  pull_up_pro: 'pullup',
  healthy_lifestyle: 'heart',
  wellness: 'heart',
  pilates: 'core',
  yoga: 'core',
};

/**
 * Resolve the canonical iconKey for a program.
 *
 * Priority:
 *  1. Explicit key (templateId or admin iconKey) — checked as both
 *     a direct ICON_MAP key and an alias
 *  2. Activity-store program alias (track-derived, less specific)
 *  3. Fallback: 'muscle'
 */
export function resolveIconKey(
  firestoreIconKey?: string | null,
  programAlias?: string | null,
): ProgramIconKey {
  if (firestoreIconKey) {
    const lower = firestoreIconKey.toLowerCase();
    if (lower in ICON_MAP) return lower as ProgramIconKey;
    const mapped = PROGRAM_ALIAS_TO_ICON[lower];
    if (mapped) return mapped;
  }
  if (programAlias) {
    const key = PROGRAM_ALIAS_TO_ICON[programAlias.toLowerCase()];
    if (key) return key;
  }
  return 'muscle';
}

/**
 * Get a React icon component for a given iconKey.
 * Falls back to MuscleIcon if the key is unknown or undefined.
 */
export function getProgramIcon(
  iconKey: string | undefined,
  className: string = 'w-6 h-6',
): React.ReactNode {
  if (!iconKey) {
    return <MuscleIcon className={className} />;
  }

  const config = ICON_MAP[iconKey as ProgramIconKey];
  if (!config) {
    return <MuscleIcon className={className} />;
  }

  const IconComponent = config.component;
  return <IconComponent className={className} />;
}

/**
 * Get the label for an iconKey (for tooltips / accessibility).
 */
export function getProgramIconLabel(iconKey: string | undefined): string {
  if (!iconKey) return 'כושר';
  return ICON_MAP[iconKey as ProgramIconKey]?.label ?? 'כושר';
}

/**
 * Short Hebrew labels (≤ 6 chars) used under day-cells in the weekly schedule.
 * Includes program iconKeys + canonical aliases so any value passed through
 * resolveIconKey()/PROGRAM_ALIAS_TO_ICON resolves to a label.
 */
const PROGRAM_SHORT_LABEL_MAP: Record<string, string> = {
  // Strength program iconKeys + aliases
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
  // Cardio / running aliases
  shoe: 'ריצה',
  running: 'ריצה',
  cardio: 'ריצה',
  walking: 'הליכה',
  // Health aliases
  heart: 'בריאות',
  healthy_lifestyle: 'בריאות',
  wellness: 'בריאות',
};

/**
 * Returns a short Hebrew label for a program iconKey or alias.
 * Falls back to '' when no mapping is available.
 */
export function getProgramShortLabel(iconKey: string | undefined | null): string {
  if (!iconKey) return '';
  return PROGRAM_SHORT_LABEL_MAP[iconKey.toLowerCase()] ?? '';
}

// ============================================================================
// SMART DAY ICON — Unified state-aware wrapper
// ============================================================================

export type DayIconStatus = 'completed' | 'today' | 'future' | 'rest' | 'missed';

export interface SmartDayIconProps {
  iconKey: string | undefined;
  status: DayIconStatus;
  /** Today-specific: 0-100 progress toward daily goal */
  progress?: number;
  /** Whether this day is a planned training day */
  isPlanned?: boolean;
  /** Whether this cell is currently selected / focused */
  isSelected?: boolean;
  /** Override size — default 40px */
  size?: number;
}

/**
 * Unified day-icon renderer for the weekly schedule.
 *
 * Accepts a single `iconKey` and wraps it with status-driven styling:
 *  - **completed** → filled cyan circle, white icon, green checkmark badge
 *  - **today**     → progress ring + inner icon with cyan glow
 *  - **future**    → dashed border, muted icon, optional planned dot
 *  - **rest**      → nothing (handled externally)
 *  - **missed**    → nothing (handled externally via GhostRing)
 */
export function SmartDayIcon({
  iconKey,
  status,
  progress = 0,
  isPlanned = false,
  isSelected = false,
  size = 40,
}: SmartDayIconProps) {
  const iconSizeClass = size >= 40 ? 'w-5 h-5' : 'w-4 h-4';
  const icon = getProgramIcon(iconKey, iconSizeClass);

  // ── Completed ──────────────────────────────────────────────────────
  if (status === 'completed') {
    return (
      <div
        className="rounded-full flex items-center justify-center relative z-10 shadow-md"
        style={{
          width: size,
          height: size,
          background: `linear-gradient(135deg, ${BRAND_CYAN}, #00A8D6)`,
          boxShadow: isSelected
            ? `0 0 0 3px ${BRAND_CYAN}66, 0 4px 14px ${BRAND_CYAN}59`
            : `0 4px 14px ${BRAND_CYAN}59`,
        }}
      >
        <div className="text-white">{icon}</div>
        <div className="absolute -bottom-0.5 -right-0.5">
          <CheckMarkBadge size={16} />
        </div>
      </div>
    );
  }

  // ── Today (active) — standalone icon colored cyan, no circle ────────
  if (status === 'today') {
    return (
      <div
        className="flex items-center justify-center"
        style={{ width: size, height: size }}
      >
        <div style={{ color: BRAND_CYAN, filter: `drop-shadow(0 0 4px ${BRAND_CYAN}60)` }}>
          {getProgramIcon(iconKey, size >= 40 ? 'w-6 h-6' : 'w-5 h-5')}
        </div>
      </div>
    );
  }

  // ── Future / Planned ───────────────────────────────────────────────
  if (status === 'future') {
    return (
      <div
        className={`rounded-full border-2 border-dashed flex items-center justify-center ${
          isSelected
            ? 'border-cyan-400 bg-cyan-50 dark:bg-cyan-900/30'
            : 'border-slate-300 dark:border-slate-600 bg-slate-50/50 dark:bg-slate-800/30'
        }`}
        style={{ width: size - 2, height: size - 2 }}
      >
        <div className={isSelected ? 'text-cyan-500' : 'text-slate-300 dark:text-slate-500'}>
          {icon}
        </div>
      </div>
    );
  }

  return null;
}

/** 4×4px solid cyan dot — rendered externally with controlled spacing */
export function CyanDot() {
  return (
    <div className="rounded-full" style={{ width: 4, height: 4, backgroundColor: BRAND_CYAN }} />
  );
}
