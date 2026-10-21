'use client';

/**
 * TourReplayHost — shows a tour again when a replay was requested (services/tour-replay.ts).
 * Mounted next to the first-run tour on each 'screen' tour's screen (home + plan, map,
 * community); renders nothing unless a request for this tour is pending, so it is inert while
 * ai_coach_round4 is off (nothing ever writes a request). Uses the SAME steps as the first-run
 * tour in the one tour bubble style, from the requested step; steps whose target isn't on
 * screen use their alt target or are dropped. Never writes the first-run seen flag.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import CoachMarks, { type CoachMarkStep } from '@/components/ui/CoachMarks';
import type { AppGender } from '@/lib/utils/gendered-text';
import { firstRunTourChrome, presentSteps } from '../services/first-run-tour';
import { consumeTourReplay, type ReplayableTour } from '../services/tour-replay';
import { replayStepsFrom, replayTourSteps } from '../services/tour-replay-steps';
import { coachTargetVisible } from '../hooks/useCoachTargetPresent';

export default function TourReplayHost({
  tour,
  ready = true,
  gender,
  delayMs = 700,
  onPending,
}: {
  tour: ReplayableTour;
  /** The screen is ready to point at (e.g. the map finished loading). */
  ready?: boolean;
  gender: AppGender | null | undefined;
  delayMs?: number;
  /** A replay of this tour is pending / running (e.g. the map mounts its park anchor). */
  onPending?: (pending: boolean) => void;
}) {
  const [request, setRequest] = useState<{ step: number } | null>(null);
  const [steps, setSteps] = useState<CoachMarkStep[] | null>(null);
  const onPendingRef = useRef(onPending);
  onPendingRef.current = onPending;

  useEffect(() => {
    setRequest(consumeTourReplay(tour));
  }, [tour]);

  useEffect(() => {
    onPendingRef.current?.(!!request);
  }, [request]);

  useEffect(() => {
    if (!request || !ready || steps) return;
    const t = setTimeout(() => {
      const shown = presentSteps(replayStepsFrom(replayTourSteps(tour, gender), request.step), coachTargetVisible);
      if (shown.length) setSteps(shown);
      else setRequest(null);
    }, delayMs);
    return () => clearTimeout(t);
  }, [request, ready, steps, tour, gender, delayMs]);

  if (!steps || typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 z-[1000]" data-tour-replay={tour}>
      <CoachMarks
        steps={steps}
        {...firstRunTourChrome(tour)}
        onFinish={() => {
          setSteps(null);
          setRequest(null);
        }}
      />
    </div>,
    document.body,
  );
}
