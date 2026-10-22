'use client';

/**
 * Rings view of one planner day (enable_week_builder_v1): outer = activity minutes split by
 * track colour, inner = steps toward the user's goal (buildDayRings). Days still ahead fade.
 */
import { TRACK_COLORS } from '@/components/ui/v2/track-colors';
import type { DayRings } from '../lib/dayRings';

const OUTER_R = 12.5;
const INNER_R = 6.5;
const C1 = 2 * Math.PI * OUTER_R;
const C2 = 2 * Math.PI * INNER_R;
const STEPS_TRACK = '#fdf1dc';
const MINUTES_TRACK = '#eef2f6';

export default function PlannerDayRings({ rings, size = 32, faded = false }: { rings: DayRings; size?: number; faded?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden style={{ opacity: faded ? 0.6 : 1, display: 'block' }}>
      <circle cx={16} cy={16} r={OUTER_R} fill="none" stroke={MINUTES_TRACK} strokeWidth={4.5} />
      {rings.arcs.map((a) => (
        <circle
          key={a.key}
          cx={16}
          cy={16}
          r={OUTER_R}
          fill="none"
          stroke={a.color}
          strokeWidth={4.5}
          strokeDasharray={`${(a.length * C1).toFixed(2)} ${C1.toFixed(2)}`}
          strokeDashoffset={(-a.from * C1).toFixed(2)}
          transform="rotate(-90 16 16)"
        />
      ))}
      <circle cx={16} cy={16} r={INNER_R} fill="none" stroke={STEPS_TRACK} strokeWidth={3.5} />
      {rings.stepsPct > 0 && (
        <circle
          cx={16}
          cy={16}
          r={INNER_R}
          fill="none"
          stroke={TRACK_COLORS.walk}
          strokeWidth={3.5}
          strokeLinecap="round"
          strokeDasharray={`${(rings.stepsPct * C2).toFixed(2)} ${C2.toFixed(2)}`}
          transform="rotate(-90 16 16)"
        />
      )}
    </svg>
  );
}
