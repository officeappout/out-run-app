import React from 'react';
import {
  WalkingIcon, RunIcon, MuscleIcon, ICON_MAP, resolveIconKey,
} from '@/features/content/programs/core/program-icon.util';

/**
 * activity-icons — SINGLE SOURCE for the hybrid AXIS icons (points 13 / 17 / 18).
 *
 * One canonical icon per ACTIVITY kind, shared by BOTH axes — the vertical journey
 * axis and the horizontal Moovit strip. The axes never define an icon themselves;
 * they both call `activityIcon()`. Adding a future activity is ONE line in
 * ACTIVITY_ICON — no axis change, no refactor.
 *
 *   walk     → WalkingIcon (walking.svg)                              filled
 *   run      → RunIcon                                                filled
 *   strength → domain-variable: push→muscle · pull→target · legs→leg  filled
 *   cycle / core / stretch → placeholder, ready for the future
 *
 * Design decision (point 17): strength is NOT a single glyph — it varies by the
 * station's program (domainFocus), exactly the mapping the strip has always used.
 * So the dictionary value is a function of the subtype, not a fixed component.
 */

export type ActivityKind = 'walk' | 'run' | 'cycle' | 'strength' | 'core' | 'stretch';
type IconFC = React.FC<{ className?: string }>;

/** Neutral placeholder for activity kinds not yet designed (fills in currentColor). */
const PlaceholderIcon: IconFC = ({ className }) => (
  <span
    className={className}
    aria-hidden
    style={{ display: 'inline-block', borderRadius: '50%', backgroundColor: 'currentColor', opacity: 0.35 }}
  />
);

/** Strength icon by program domain — push→muscle · pull→target · legs→leg. The SAME
 *  resolveIconKey mapping the strip has always used; falls back to MuscleIcon. */
function strengthIcon(domainFocus?: string): IconFC {
  const alias = domainFocus === 'legs_core' ? 'legs' : domainFocus;
  return ICON_MAP[resolveIconKey(alias)]?.component ?? MuscleIcon;
}

/** The dictionary — each value maps an optional subtype → icon component. */
const ACTIVITY_ICON: Record<ActivityKind, (subtype?: string) => IconFC> = {
  walk: () => WalkingIcon,
  run: () => RunIcon,
  strength: (domainFocus) => strengthIcon(domainFocus),
  cycle: () => PlaceholderIcon,
  core: () => PlaceholderIcon,
  stretch: () => PlaceholderIcon,
};

/**
 * Resolve the icon component for a hybrid segment — the ONE entry point both axes use.
 * @param kind    the segment kind ('aerobic' | 'strength')
 * @param subtype aerobicType ('walking' | 'running') for aerobic; domainFocus for strength
 */
export function activityIcon(kind: 'aerobic' | 'strength', subtype?: string): IconFC {
  const k: ActivityKind = kind === 'strength' ? 'strength' : subtype === 'running' ? 'run' : 'walk';
  return ACTIVITY_ICON[k](subtype);
}

/** Render helper — the ONE glyph both axes use (Node, leg meta, strip). Sizing is
 *  the caller's `className` (point 18). */
export function ActivityGlyph({
  kind, subtype, className,
}: { kind: 'aerobic' | 'strength'; subtype?: string; className?: string }) {
  const Icon = activityIcon(kind, subtype);
  return <Icon className={className} />;
}
