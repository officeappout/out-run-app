/**
 * Progress hub v2 colours (enable_progress_hub_v2, owner 23.10.2026).
 *
 *   strength — cyan (TRACK_COLORS.strength, unchanged)
 *   running  — the existing running green (TRACK_COLORS.run)
 *   steps + walking — ONE orange: STEPS_WALK_COLORS, the shared token the home
 *   progress slot (#807) reads too. The hub reads only HUB_COLORS. Plain .ts.
 */
import { STEPS_WALK_COLORS, TRACK_COLORS, TRACK_RGB } from '@/components/ui/v2/track-colors';

export const STEPS_ORANGE = STEPS_WALK_COLORS.fill;
export const STEPS_ORANGE_TEXT = STEPS_WALK_COLORS.text;
const STEPS_ORANGE_RGB = STEPS_WALK_COLORS.rgb;

export type HubKind = 'strength' | 'run' | 'walk' | 'steps';

export interface HubTone {
  /** Ring / bar fill. */
  fill: string;
  /** Text on white. */
  text: string;
  /** Soft tile background. */
  tile: string;
}

export const HUB_COLORS: Record<HubKind, HubTone> = {
  strength: { fill: TRACK_COLORS.strength, text: '#0284c7', tile: `rgba(${TRACK_RGB.strength},0.12)` },
  run: { fill: TRACK_COLORS.run, text: '#4d7c0f', tile: `rgba(${TRACK_RGB.run},0.14)` },
  walk: { fill: STEPS_ORANGE, text: STEPS_ORANGE_TEXT, tile: `rgba(${STEPS_ORANGE_RGB},0.13)` },
  steps: { fill: STEPS_ORANGE, text: STEPS_ORANGE_TEXT, tile: `rgba(${STEPS_ORANGE_RGB},0.13)` },
};
