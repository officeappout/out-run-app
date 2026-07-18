'use client';

import { formatDuration } from '../format';

interface IdentityUnitsRowProps {
  durationSeconds: number;
  calories: number;
  /**
   * Display-only until the hybrid single-save lands (CLAUDE.md gate: no real
   * awardWorkoutXP for aerobic/hybrid yet). Defaults to 0.
   */
  xp?: number;
}

/**
 * The "identity units" row (design spec v0.9 §4): the only totals that unify
 * across activity types — total time · kcal · XP.
 */
export default function IdentityUnitsRow({ durationSeconds, calories, xp = 0 }: IdentityUnitsRowProps) {
  const cells = [
    { label: 'זמן', value: formatDuration(durationSeconds) },
    { label: 'קק״ל', value: String(Math.round(calories || 0)) },
    { label: 'XP', value: String(Math.round(xp || 0)) },
  ];
  return (
    <div dir="rtl" style={{ display: 'flex', gap: 8, fontFamily: 'var(--font-simpler)' }}>
      {cells.map((c) => (
        <div
          key={c.label}
          style={{ flex: 1, textAlign: 'center', padding: '10px 6px', background: '#f4f7f6', borderRadius: 12 }}
        >
          <div style={{ fontSize: 20, fontWeight: 800, color: '#1b2321' }}>{c.value}</div>
          <div style={{ fontSize: 12, color: '#6b7472' }}>{c.label}</div>
        </div>
      ))}
    </div>
  );
}
