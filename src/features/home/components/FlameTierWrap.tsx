'use client';

/**
 * enable_flame_tiers_v1 — wraps a weekly-strip day cell:
 *   • the neutral "started" mark under the icon (a workout below the bar, no flame);
 *   • on the v1 (image) flame, the level's size + level-3 glow (the v2 flame sizes itself).
 */
import type { ReactNode } from 'react';
import FlameStartedMark from '@/components/ui/v2/FlameStartedMark';
import { FLAME_TIER, type FlameTier } from '@/components/ui/v2/tokens';
import { useT } from '@/hooks/useT';
import { common } from '@/messages/ns/common';

export interface FlameTierWrapProps {
  level?: 0 | FlameTier;
  started: boolean;
  /** The v1 cell shows an image flame: scale it by level. */
  scaleV1Flame: boolean;
  children: ReactNode;
}

export function FlameTierWrap({ level, started, scaleV1Flame, children }: FlameTierWrapProps) {
  const t = useT(common);
  const tier = level ? level : undefined;
  const scaled = scaleV1Flame && tier;
  return (
    <span
      className="relative inline-flex items-center justify-center"
      {...(scaled ? { role: 'img', 'aria-label': t(`flame.level.${tier}`) } : {})}
    >
      <span
        className="inline-flex"
        style={scaled ? { transform: `scale(${FLAME_TIER.scale[tier]})`, filter: tier === 3 ? FLAME_TIER.glow : undefined } : undefined}
      >
        {children}
      </span>
      {started && (
        <span className="pointer-events-none absolute -bottom-1 left-1/2 -translate-x-1/2">
          <FlameStartedMark label={t('flame.started')} />
        </span>
      )}
    </span>
  );
}
