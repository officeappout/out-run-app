'use client';

import { formatDuration } from '../format';

interface IdentityUnitsRowProps {
  durationSeconds: number;
  calories: number;
  /**
   * Display-only until the hybrid single-save lands (CLAUDE.md gate: no real
   * awardWorkoutXP for aerobic/hybrid yet). Shown only when > 0 — we never
   * invent a bonus number (XP_Progression axiom).
   */
  xp?: number;
  /** 'boxes' (default) = 3 stat tiles; 'inline' = compact "time · kcal · +XP". */
  variant?: 'boxes' | 'inline';
}

/**
 * The "identity units" row (design spec v0.9 §4): the only totals that unify
 * across activity types — total time · kcal · XP.
 */
export default function IdentityUnitsRow({
  durationSeconds,
  calories,
  xp = 0,
  variant = 'boxes',
}: IdentityUnitsRowProps) {
  const time = formatDuration(durationSeconds);
  const cal = Math.round(calories || 0);
  const xpVal = Math.round(xp || 0);

  if (variant === 'inline') {
    return (
      <span dir="rtl" style={{ fontSize: 11, color: '#9aa3a1', fontFamily: 'var(--font-simpler)' }}>
        {time} · {cal} קק״ל{xpVal > 0 ? ` · +${xpVal} XP` : ''}
      </span>
    );
  }

  const cells = [
    { label: 'זמן', value: time },
    { label: 'קק״ל', value: String(cal) },
    { label: 'XP', value: String(xpVal) },
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
