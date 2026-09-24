'use client';

/**
 * HybridStationLayer — the live map overlay for a hybrid session (Phase 3c ③).
 *
 * Rendered by FreeRunLayer, but returns NULL unless a hybrid session is active,
 * so a normal run is byte-identical. When active:
 *   • aerobic leg, not yet approaching a station → nothing rendered (David,
 *                    25.09.2026 — the CTA used to be visible the whole leg,
 *                    "convenient for testing"; a button that's always there
 *                    carries no information).
 *   • aerobic leg, WITHIN the approach window   → the floating CTA
 *                    ("הגעתי לתחנה", or "סיים" unconditionally on the final
 *                    leg — that one isn't approach-gated, there's no station
 *                    to approach) plus a corner "X" to skip the upcoming
 *                    station before ever arriving.
 *   • station      → StrengthRunner mounted full-screen (one-card law §9 — it
 *                    covers the run overlay while the station is live), plus a
 *                    small secondary "דלג" affordance (22.09.2026, field-test
 *                    doc 13) — top corner, ghost-styled, deliberately NOT a
 *                    prominent pill like the aerobic-leg CTA below: the user
 *                    must not be able to tap it by mistake reaching for
 *                    StrengthRunner's own primary actions.
 *
 * ⚠️ z-index: the station overlay uses z-[120] (above the run overlays, below
 * RunSummary z-[200]). Register this value in the .cursorrules z-index budget
 * (axiom §8) before production. It is inert in normal runs (flag-gated).
 */

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import StrengthRunner from '@/features/workout-engine/players/strength/StrengthRunner';
import { useHybridRun } from './useHybridRun';
import { isApproachingStation } from './hybrid-orchestrator';
import { toSegmentExerciseDetail } from '@/features/workout-engine/core/services/storage.service';
import { useRunningPlayer } from '@/features/workout-engine/players/running/store/useRunningPlayer';
import { hapticMedium } from '@/lib/haptics';

const ACCENT = '#00ADEF';

export default function HybridStationLayer() {
  const active = useHybridRun((s) => s.active);
  const phase = useHybridRun((s) => s.phase);
  const stationPlan = useHybridRun((s) => s.stationPlan);
  const isFinalLeg = useHybridRun((s) => s.isFinalLeg);
  const upcomingStation = useHybridRun((s) => s.upcomingStation);
  const arrive = useHybridRun((s) => s.arrive);
  const completeStation = useHybridRun((s) => s.completeStation);
  const skipStation = useHybridRun((s) => s.skipStation);
  const finishHybrid = useHybridRun((s) => s.finishHybrid);
  const lastPosition = useRunningPlayer((s) => s.lastPosition);

  // Station-approach moment (David, 25.09.2026): real GPS distance to the
  // upcoming station's actual coordinates, gated by an activity-type speed
  // constant (not live pace — see isApproachingStation's doc comment).
  // False whenever there's no upcoming station (final leg, already at/past
  // one) or no GPS fix yet.
  const approaching =
    phase === 'aerobic' && !isFinalLeg && upcomingStation != null && lastPosition != null
      ? isApproachingStation(
          lastPosition.lat, lastPosition.lng,
          upcomingStation.lat, upcomingStation.lng,
          upcomingStation.aerobicType,
        )
      : false;

  // Haptic fires once on the rising edge (entering the approach window),
  // never on every render while already inside it.
  const wasApproachingRef = useRef(false);
  useEffect(() => {
    if (approaching && !wasApproachingRef.current) hapticMedium();
    wasApproachingRef.current = approaching;
  }, [approaching]);

  if (!active) return null; // normal run → nothing rendered

  // Station live — StrengthRunner owns the screen until the block completes.
  if (phase === 'station' && stationPlan) {
    return (
      <div className="fixed inset-0 z-[120] bg-white pointer-events-auto" dir="rtl">
        <StrengthRunner
          workout={stationPlan}
          // F1 (19.08.2026): StrengthRunner's real exerciseLog was previously
          // discarded here (onComplete={() => completeStation()}) — the root
          // cause of hybrid's strength segments having zero per-set detail.
          // Mapped through the same toSegmentExerciseDetail() solo strength
          // uses, so both paths persist an identical shape.
          onComplete={(exerciseLog) => completeStation(toSegmentExerciseDetail(exerciseLog ?? []))}
          embedded
        />
        {/* Secondary, de-emphasized — top corner, away from StrengthRunner's
            own bottom-of-screen primary actions (set-complete / next
            exercise), so a user can't hit it reaching for those. */}
        <button
          type="button"
          onClick={() => skipStation()}
          className="fixed left-4 z-[121] pointer-events-auto rounded-full px-3 py-1.5 text-[12px] font-bold text-gray-500 bg-white/90 border border-gray-200 shadow-sm active:scale-95 transition-transform"
          style={{ top: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}
        >
          דלג על התחנה
        </button>
      </div>
    );
  }

  // Aerobic leg: the finish CTA is unconditional on the final leg (no
  // station to approach there); the arrive CTA is gated to the approach
  // window (David, 25.09.2026 — was unconditional for the whole leg before,
  // "convenient for testing"; a button that's always there carries no
  // information). #1/#4: portal the CTA to document.body so it escapes the
  // TwoLayerShell TOP motion.div transform stack — inside that stack the CTA
  // (z-[60]) was being covered by the MetricsDrawer despite a nominally
  // higher z (a nested drag-transform stacking quirk); at the document root
  // with a high z it reliably sits above the drawer.
  if (phase === 'aerobic' && (isFinalLeg || approaching)) {
    const cta = (
      <div
        className="fixed left-0 right-0 z-[110] flex justify-center pointer-events-none"
        style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 150px)' }}
      >
        <button
          type="button"
          onClick={() => (isFinalLeg ? finishHybrid() : arrive())}
          // Approach window → large, thumb-height target (David: "כפתור גדול
          // בגובה אגודל"). Final-leg finish CTA keeps its previous size —
          // out of scope for this change, not a station-approach moment.
          className={
            isFinalLeg
              ? 'pointer-events-auto rounded-full px-6 py-3 text-white text-[14px] font-black shadow-xl active:scale-95 transition-transform'
              : 'pointer-events-auto rounded-full px-8 py-5 min-h-[64px] text-white text-[17px] font-black shadow-xl active:scale-95 transition-transform'
          }
          style={{ backgroundColor: isFinalLeg ? '#16A34A' : ACCENT }}
        >
          {isFinalLeg ? '🏁 סיים אימון משולב' : '📍 הגעתי לתחנה'}
        </button>
        {!isFinalLeg && (
          // Corner "X" — skip visible DURING approach too, not only once at
          // the station (David, 25.09.2026). Same de-emphasized styling as
          // the at-station "דלג" button below: must not compete with the
          // CTA above for the thumb.
          <button
            type="button"
            onClick={() => skipStation()}
            aria-label="דלג על התחנה"
            className="pointer-events-auto fixed left-4 z-[121] w-8 h-8 flex items-center justify-center rounded-full text-gray-500 bg-white/90 border border-gray-200 shadow-sm active:scale-95 transition-transform"
            style={{ top: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}
          >
            ✕
          </button>
        )}
      </div>
    );
    return typeof document !== 'undefined' ? createPortal(cta, document.body) : null;
  }

  return null;
}
