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

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import StrengthRunner from '@/features/workout-engine/players/strength/StrengthRunner';
import { useHybridRun, hybridDemoSeen, hybridEquipmentFound } from './useHybridRun';
import { scopedFoundStore } from '@/features/workout-engine/players/strength/logic/find-equipment';
import { isApproachingStation } from './hybrid-orchestrator';
import { toSegmentExerciseDetail } from '@/features/workout-engine/core/services/storage.service';
import { useRunningPlayer } from '@/features/workout-engine/players/running/store/useRunningPlayer';
import { hapticMedium } from '@/lib/haptics';
import { haversineMeters } from '@/features/parks/core/services/geoUtils';
import { formatApproxDistance } from './hybrid-intro-format';
import { resolveWalkUiState, nextArmed, walkingLine } from './hybrid-walk-state';
import StationCompleteScreen from './StationCompleteScreen';
import HybridStationCta from './HybridStationCta';
import ExerciseReplacementModal from '@/features/workout-engine/players/strength/components/ExerciseReplacementModal';
import { useUserStore } from '@/features/user';
import type { Park } from '@/features/parks/core/types/park.types';
import StationWelcomeScreen from './StationWelcomeScreen';
import { COACH_TARGET_SKIP } from './station-tutorial';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import {
  readGuidedSettings, resolveGuidedMode, isCompletedStation, shouldShowFastPrompt,
} from './guided-station';
import {
  recordGuidedStationCompleted, markFastPromptAsked, setGuidedStationChoice,
} from './guided-station.service';

// G3.1 fix: how long the start-of-walk intro stays up before auto-dismissing
// on its own (it also hides immediately once the approach CTA takes over).
const INTRO_AUTO_HIDE_MS = 6000;

export default function HybridStationLayer() {
  const active = useHybridRun((s) => s.active);
  const phase = useHybridRun((s) => s.phase);
  const stationPlan = useHybridRun((s) => s.stationPlan);
  const isFinalLeg = useHybridRun((s) => s.isFinalLeg);
  const upcomingStation = useHybridRun((s) => s.upcomingStation);
  const arrive = useHybridRun((s) => s.arrive);
  const finishStationWork = useHybridRun((s) => s.finishStationWork);
  const continueAfterStation = useHybridRun((s) => s.continueAfterStation);
  const pendingStationComplete = useHybridRun((s) => s.pendingStationComplete);
  const stationContext = useHybridRun((s) => s.stationContext);
  const swapStationExercise = useHybridRun((s) => s.swapStationExercise);
  const getStationSwapCandidate = useHybridRun((s) => s.getStationSwapCandidate);
  const skipStation = useHybridRun((s) => s.skipStation);
  const profile = useUserStore((s) => s.profile);
  // G2.4 in-station swap: which plan position is being replaced + the modal's inputs.
  const [swapTarget, setSwapTarget] = useState<{
    segIdx: number; exIdx: number; exercise: unknown; level: number; park: Park | null;
  } | null>(null);
  const finishHybrid = useHybridRun((s) => s.finishHybrid);
  const lastPosition = useRunningPlayer((s) => s.lastPosition);
  const nextStationNumber = useHybridRun((s) => s.nextStationNumber);

  // ── PR-B1 guided layer ("ליווי צעד-אחר-צעד") ─────────────────────────────
  // Kill-switch (remote flag, fail-open) off → fast mode for everyone. Otherwise the user's
  // explicit setting wins; unset → ON. Fast mode = exactly today's station (PR-A).
  const { flags } = useFeatureFlags();
  const guidedSettings = readGuidedSettings(profile);
  const guided = resolveGuidedMode(guidedSettings.guidedStation, flags.enableGuidedStation);
  const userGender = (profile?.core?.gender ?? 'male') as 'male' | 'female' | 'other';
  // Welcome screen dismissed for station N (keyed by station number so it re-shows per station).
  const [welcomeDoneFor, setWelcomeDoneFor] = useState<number | null>(null);
  // Station number whose completion screen should carry the one-time switch-to-fast prompt.
  const [fastPromptFor, setFastPromptFor] = useState<number | null>(null);

  // PR-B3: the "found" store scoped to this station's place (stable per location).
  const foundAtThisLocation = useMemo(
    () => (stationContext ? scopedFoundStore(hybridEquipmentFound, stationContext.locationKey) : null),
    [stationContext?.locationKey],
  );

  const handleStationWorkDone = (exerciseLog: ReturnType<typeof toSegmentExerciseDetail>) => {
    // Count only COMPLETED guided stations (≥1 logged set) — never skipped / empty exits.
    if (guided && isCompletedStation(exerciseLog)) {
      const count = recordGuidedStationCompleted();
      // The prompt lives on the station-complete screen, which only non-final stations get.
      // Mark "asked" only when it's really shown, so a final-station 2nd completion still
      // gets the offer at the next opportunity.
      if (stationContext && !stationContext.isFinalStation
          && shouldShowFastPrompt(true, count, guidedSettings.guidedFastPromptAsked)) {
        markFastPromptAsked();
        setFastPromptFor(stationContext.stationNumber);
      }
    }
    finishStationWork(exerciseLog);
  };

  // Station-approach moment (David, 25.09.2026): real GPS distance to the
  // upcoming station's actual coordinates, gated by an activity-type speed
  // constant (not live pace — see isApproachingStation's doc comment).
  // False whenever there's no upcoming station (final leg, already at/past
  // one) or no GPS fix yet.
  const withinApproachRadius =
    phase === 'aerobic' && !isFinalLeg && upcomingStation != null && lastPosition != null
      ? isApproachingStation(
          lastPosition.lat, lastPosition.lng,
          upcomingStation.lat, upcomingStation.lng,
          upcomingStation.aerobicType,
        )
      : false;

  // G3.1 walk-to-first-stop (Sderot pilot, flag `enable_walk_to_first_stop`, fail-closed). Off →
  // `approaching` is exactly the proximity check above (today's behaviour). On → the big CTA
  // needs the leg ARMED: a fix OUTSIDE the radius seen on this leg, so a park at the drop-in
  // point no longer shows "הגעתי לתחנה" on the first fix (hybrid-walk-state.ts). Until then the
  // walking card below shows live distance + a secondary "הגעתי".
  const walkFlag = flags.enableWalkToFirstStop;
  const legKey = `${phase}:${nextStationNumber ?? 'none'}`;
  const [armedFor, setArmedFor] = useState<string | null>(null);
  const legArmed = armedFor === legKey;
  const walkUi = walkFlag
    ? resolveWalkUiState({
        phase, isFinalLeg, hasNextStation: nextStationNumber != null,
        withinRadius: withinApproachRadius, armed: legArmed,
      })
    : null;
  const approaching = walkFlag ? walkUi === 'approach' : withinApproachRadius;

  // Haptic fires once on the rising edge (entering the approach window),
  // never on every render while already inside it.
  const wasApproachingRef = useRef(false);
  useEffect(() => {
    if (approaching && !wasApproachingRef.current) hapticMedium();
    wasApproachingRef.current = approaching;
  }, [approaching]);

  // G3.1 fix (Sderot field test, 10.10.2026): first-timers dropped straight
  // into the live map with no orientation found it confusing — nothing told
  // them to start walking or where they were headed (the approach CTA below
  // is correctly gated to only appear once actually near the station; before
  // that gate fires there was no feedback of any kind). One-time toast, fires
  // once per session on the FIRST render where there's a real walk ahead and
  // we're not already in the approach window — `showIntroRef` makes it a
  // true one-shot (not re-shown on a later leg after a station), mirroring
  // wasApproachingRef's rising-edge pattern above. Component unmounts between
  // sessions (FreeRunLayer only mounts this while isWorkoutActive), so a
  // plain useState(false) is already correctly scoped per-session.
  const [showIntro, setShowIntro] = useState(false);
  const introShownRef = useRef(false);
  const distanceToStationM =
    upcomingStation != null && lastPosition != null
      ? haversineMeters(lastPosition.lat, lastPosition.lng, upcomingStation.lat, upcomingStation.lng)
      : null;
  // G3.1: arm the leg on the first fix outside the approach radius (re-keyed per leg).
  useEffect(() => {
    if (!walkFlag || legArmed) return;
    if (nextArmed(false, distanceToStationM, withinApproachRadius)) setArmedFor(legKey);
  }, [walkFlag, legArmed, legKey, distanceToStationM, withinApproachRadius]);
  useEffect(() => {
    // G3.1: the persistent walking card replaces the one-shot intro when the flag is on.
    if (walkFlag) return;
    if (introShownRef.current) return;
    if (phase !== 'aerobic' || isFinalLeg || approaching || upcomingStation == null) return;
    introShownRef.current = true;
    setShowIntro(true);
    const t = setTimeout(() => setShowIntro(false), INTRO_AUTO_HIDE_MS);
    return () => clearTimeout(t);
  }, [phase, isFinalLeg, approaching, upcomingStation, walkFlag]);
  // Hide immediately once the real approach CTA takes over — never show both.
  useEffect(() => {
    if (approaching) setShowIntro(false);
  }, [approaching]);

  if (!active) return null; // normal run → nothing rendered

  // Station live — StrengthRunner owns the screen until the block completes.
  if (phase === 'station' && stationPlan) {
    return (
      <div className="fixed inset-0 z-[120] bg-white pointer-events-auto" dir="rtl">
        {pendingStationComplete ? (
          // G2.4: non-final station done → short completion screen; the run clock stays
          // paused until "המשך במסלול" (continueAfterStation).
          <StationCompleteScreen
            summary={pendingStationComplete}
            context={stationContext}
            onContinue={continueAfterStation}
            fastPrompt={
              stationContext && fastPromptFor === stationContext.stationNumber
                ? { onAccept: () => setGuidedStationChoice(false) }
                : undefined
            }
          />
        ) : guided && stationContext && welcomeDoneFor !== stationContext.stationNumber ? (
          // PR-B1 guided: welcome-to-the-station BEFORE StrengthRunner mounts (i.e. before
          // its PREPARING countdown). Fast mode never takes this branch.
          <StationWelcomeScreen
            plan={stationPlan}
            context={stationContext}
            gender={userGender}
            onStart={() => setWelcomeDoneFor(stationContext.stationNumber)}
            guided={guided}
            uid={profile?.id}
          />
        ) : (
        <StrengthRunner
          workout={stationPlan}
          // F1 (19.08.2026): StrengthRunner's real exerciseLog was previously
          // discarded here (onComplete={() => completeStation()}) — the root
          // cause of hybrid's strength segments having zero per-set detail.
          // Mapped through the same toSegmentExerciseDetail() solo strength
          // uses, so both paths persist an identical shape. G2.4: routed via
          // finishStationWork — final station → completeStation (unchanged),
          // otherwise the completion screen first.
          onComplete={(exerciseLog) => handleStationWorkDone(toSegmentExerciseDetail(exerciseLog ?? []))}
          // PR-B1: guidance lines + rest-tile auto-expand (guided only; fast = unchanged).
          guided={guided}
          // PR-B2: watch-the-demo gate (guided only — omitted in fast mode → PREPARING unchanged).
          demoGate={guided ? hybridDemoSeen : undefined}
          // PR-B3: find-the-equipment before the gate (guided only — omitted in fast mode), once per
          // exercise per station LOCATION (a later park needs it again; the demo gate doesn't).
          findEquipment={guided && foundAtThisLocation ? foundAtThisLocation : undefined}
          // G2.4: in-station swap — same modal as the overview / standalone player; the
          // replacement is written into the live station plan (useHybridRun), so it is what
          // StrengthRunner plays and logs from here on.
          onSwapExercise={(_exerciseId, segIdx, exIdx) => {
            const candidate = getStationSwapCandidate(segIdx, exIdx);
            if (!candidate) return;
            setSwapTarget({ segIdx, exIdx, exercise: candidate.exercise, level: candidate.level, park: null });
            // Prefer methods that fit THIS park's equipment: the modal's method selector
            // matches against park.gymEquipment (full record — the catalog park lacks it).
            const parkId = stationContext?.parkId;
            if (parkId) {
              import('@/features/parks/core/services/parks.service')
                .then(({ getPark }) => getPark(parkId))
                .then((park) => {
                  if (park) setSwapTarget((t) => (t && t.segIdx === segIdx && t.exIdx === exIdx ? { ...t, park } : t));
                })
                .catch(() => { /* no park → generic park methods */ });
            }
          }}
          embedded
        />
        )}
        {swapTarget && profile && (
          <ExerciseReplacementModal
            isOpen
            onClose={() => setSwapTarget(null)}
            currentExercise={swapTarget.exercise as any}
            currentLevel={swapTarget.level}
            location="park"
            park={swapTarget.park}
            userProfile={profile as any}
            // PR-B3 (guided only): limit alternatives to this park's equipment + bodyweight.
            // Fast mode / every other caller: unchanged (null = no filter).
            allowedEquipmentIds={guided ? stationContext?.availableEquipment ?? null : null}
            onReplace={(newExercise, executionMethod) => {
              swapStationExercise(swapTarget.segIdx, swapTarget.exIdx, newExercise, executionMethod);
              setSwapTarget(null);
            }}
          />
        )}
        {/* Secondary, de-emphasized — top corner, away from StrengthRunner's
            own bottom-of-screen primary actions (set-complete / next
            exercise), so a user can't hit it reaching for those. Hidden on the
            completion screen (the station is already done there) and while the swap
            modal is open (it sits above the modal's z-[110] backdrop otherwise). */}
        {!pendingStationComplete && !swapTarget && (
        <button
          type="button"
          onClick={() => skipStation()}
          // PR-B4: the tutorial's pause/skip bubble points here.
          data-coach={COACH_TARGET_SKIP}
          className="fixed left-4 z-[121] pointer-events-auto rounded-full px-3 py-1.5 text-[12px] font-bold text-gray-500 bg-white/90 border border-gray-200 shadow-sm active:scale-95 transition-transform"
          style={{ top: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}
        >
          דלג על התחנה
        </button>
        )}
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
        {/* Visual only: the CTA itself (lucide icon in a v2 IconTile, no emoji) lives in
            HybridStationCta; the gating + action stay here. */}
        <HybridStationCta
          isFinalLeg={isFinalLeg}
          onClick={() => (isFinalLeg ? finishHybrid() : arrive())}
        />
        {!isFinalLeg && (
          // Corner "X" — skip visible DURING approach too, not only once at
          // the station (David, 25.09.2026). Same de-emphasized styling as
          // the at-station "דלג" button below: must not compete with the
          // CTA above for the thumb.
          <button
            type="button"
            onClick={() => skipStation()}
            // G2.4: was an icon-only "✕" — now the same labelled ghost pill as at the station.
            className="pointer-events-auto fixed left-4 z-[121] rounded-full px-3 py-1.5 text-[12px] font-bold text-gray-500 bg-white/90 border border-gray-200 shadow-sm active:scale-95 transition-transform"
            style={{ top: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}
          >
            דלג על התחנה
          </button>
        )}
      </div>
    );
    return typeof document !== 'undefined' ? createPortal(cta, document.body) : null;
  }

  // G3.1 walk-to-first-stop (flag on): persistent walking card on every leg until the user walks
  // into the station's radius — live distance + a SECONDARY "הגעתי" (the user may genuinely start
  // at the park, or the station may have no coordinates). Same z-[110] bottom slot as the CTA
  // above (never both — walkUi is either 'walking' or 'approach').
  if (walkFlag && walkUi === 'walking') {
    const card = (
      <div
        className="fixed left-0 right-0 z-[110] flex justify-center pointer-events-none px-6"
        style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 150px)' }}
        dir="rtl"
      >
        <div
          className="pointer-events-auto flex items-center gap-3 rounded-2xl ps-4 pe-2 py-2 text-white shadow-xl"
          style={{ backgroundColor: 'rgba(5,8,18,0.82)', backdropFilter: 'blur(10px)' }}
        >
          <span className="text-[14px] font-bold">
            🚶 {walkingLine(userGender, nextStationNumber, distanceToStationM)}
          </span>
          <button
            type="button"
            onClick={() => arrive()}
            className="rounded-full border border-white/40 px-3 py-1.5 text-[12px] font-bold text-white/90 active:scale-95 transition-transform"
          >
            הגעתי
          </button>
        </div>
      </div>
    );
    return typeof document !== 'undefined' ? createPortal(card, document.body) : null;
  }

  // G3.1 fix: start-of-walk intro, shown exactly once per session on the
  // aerobic leg BEFORE the approach CTA above has anything to say.
  if (showIntro) {
    const intro = (
      <div
        className="fixed left-0 right-0 z-[110] flex justify-center pointer-events-none px-6"
        style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 150px)' }}
      >
        <div
          className="pointer-events-none rounded-2xl px-4 py-3 text-center text-white text-[14px] font-bold shadow-xl"
          style={{ backgroundColor: 'rgba(5,8,18,0.82)', backdropFilter: 'blur(10px)' }}
        >
          🚶 התחל ללכת
          {distanceToStationM != null && (
            <> — בעוד {formatApproxDistance(distanceToStationM)} יש גינת כושר</>
          )}
        </div>
      </div>
    );
    return typeof document !== 'undefined' ? createPortal(intro, document.body) : null;
  }

  return null;
}
