'use client';

/**
 * HybridStationLayer — the live map overlay for a hybrid session (Phase 3c ③).
 *
 * Rendered by FreeRunLayer, but returns NULL unless a hybrid session is active,
 * so a normal run is byte-identical. When active:
 *   • aerobic leg  → a single floating CTA: "הגעתי לתחנה" (or "סיים" on the last leg).
 *   • station      → StrengthRunner mounted full-screen (one-card law §9 — it
 *                    covers the run overlay while the station is live).
 *
 * ⚠️ z-index: the station overlay uses z-[120] (above the run overlays, below
 * RunSummary z-[200]). Register this value in the .cursorrules z-index budget
 * (axiom §8) before production. It is inert in normal runs (flag-gated).
 */

import StrengthRunner from '@/features/workout-engine/players/strength/StrengthRunner';
import { useHybridRun } from './useHybridRun';

const ACCENT = '#00ADEF';

export default function HybridStationLayer() {
  const active = useHybridRun((s) => s.active);
  const phase = useHybridRun((s) => s.phase);
  const stationPlan = useHybridRun((s) => s.stationPlan);
  const isFinalLeg = useHybridRun((s) => s.isFinalLeg);
  const arrive = useHybridRun((s) => s.arrive);
  const completeStation = useHybridRun((s) => s.completeStation);
  const finishHybrid = useHybridRun((s) => s.finishHybrid);

  if (!active) return null; // normal run → nothing rendered

  // Station live — StrengthRunner owns the screen until the block completes.
  if (phase === 'station' && stationPlan) {
    return (
      <div className="fixed inset-0 z-[120] bg-white pointer-events-auto" dir="rtl">
        <StrengthRunner workout={stationPlan} onComplete={() => completeStation()} />
      </div>
    );
  }

  // Aerobic leg — one CTA: arrive at the station, or finish on the final leg.
  if (phase === 'aerobic') {
    return (
      <div
        className="absolute left-0 right-0 z-[60] flex justify-center pointer-events-none"
        style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 150px)' }}
      >
        <button
          type="button"
          onClick={() => (isFinalLeg ? finishHybrid() : arrive())}
          className="pointer-events-auto rounded-full px-6 py-3 text-white text-[14px] font-black shadow-xl active:scale-95 transition-transform"
          style={{ backgroundColor: isFinalLeg ? '#16A34A' : ACCENT }}
        >
          {isFinalLeg ? '🏁 סיים אימון משולב' : '📍 הגעתי לתחנה'}
        </button>
      </div>
    );
  }

  return null;
}
