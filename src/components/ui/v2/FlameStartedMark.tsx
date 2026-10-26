'use client';

import { FLAME_TIER } from './tokens';

/**
 * The neutral "started" mark (enable_flame_tiers_v1): a workout happened that day but
 * below the bar — a small hollow ring, deliberately not a flame.
 */
export default function FlameStartedMark({ label, size = FLAME_TIER.startedPx }: { label: string; size?: number }) {
  return (
    <span
      role="img"
      aria-label={label}
      className="inline-block shrink-0 rounded-full bg-white"
      style={{ width: size, height: size, border: `1.5px solid ${FLAME_TIER.startedColor}` }}
    />
  );
}
