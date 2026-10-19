'use client';

/**
 * TourReplayHost — shows a first-run tour again when a replay was requested
 * (services/tour-replay.ts). Mounted next to the first-run tour on home and on the map; renders
 * nothing unless a request for this tour is pending, so it is inert while ai_coach_round4 is
 * off (nothing ever writes a request). Uses the SAME steps and CoachMarks as the first-run
 * tour, from the requested step; steps whose target isn't on screen are dropped.
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import CoachMarks, { type CoachMarkStep } from '@/components/ui/CoachMarks';
import type { AppGender } from '@/lib/utils/gendered-text';
import { firstRunTourSteps, presentSteps } from '../services/first-run-tour';
import { consumeTourReplay, type ReplayableTour } from '../services/tour-replay';

function targetPresent(target: string): boolean {
  if (typeof document === 'undefined') return false;
  const el = document.querySelector<HTMLElement>(`[data-coach="${target}"]`);
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

export default function TourReplayHost({
  tour,
  ready = true,
  gender,
  delayMs = 700,
}: {
  tour: ReplayableTour;
  /** The screen is ready to point at (e.g. the map finished loading). */
  ready?: boolean;
  gender: AppGender | null | undefined;
  delayMs?: number;
}) {
  const [request, setRequest] = useState<{ step: number } | null>(null);
  const [steps, setSteps] = useState<CoachMarkStep[] | null>(null);

  useEffect(() => {
    setRequest(consumeTourReplay(tour));
  }, [tour]);

  useEffect(() => {
    if (!request || !ready || steps) return;
    const t = setTimeout(() => {
      const all = firstRunTourSteps(tour, gender);
      const fromStep = all.slice(Math.min(request.step, Math.max(0, all.length - 1)));
      const shown = presentSteps(fromStep, targetPresent);
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
        onFinish={() => {
          setSteps(null);
          setRequest(null);
        }}
      />
    </div>,
    document.body,
  );
}
