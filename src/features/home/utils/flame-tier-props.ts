/**
 * enable_flame_tiers_v1 — put flameLevelForDay's result onto a resolved day cell (weekly strip,
 * month grid). PURE. A steps-only day (level 1, no workout) gets the steps (orange) flame
 * instead of the scheduled program's colour (owner 26.10.2026).
 */
import { ASSET_REGISTRY, type DayDisplayProps } from './day-display.utils';
import type { FlameDay } from '@/features/activity/lib/flame-level';

export function withFlameTier(props: DayDisplayProps, flame: Pick<FlameDay, 'level' | 'started' | 'stepsOnly'>): DayDisplayProps {
  const tiered: DayDisplayProps = { ...props, flameLevel: flame.level, flameStarted: flame.started };
  if (flame.stepsOnly && props.icon.type === 'img') {
    return { ...tiered, icon: { ...props.icon, src: ASSET_REGISTRY.flames.steps }, sessions: undefined };
  }
  return tiered;
}
