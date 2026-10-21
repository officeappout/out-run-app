'use client';

/**
 * TourPreviewScreen — replays an in-flow tour (player, route, route player, station) over a
 * static illustration of its screen, with the SAME steps and the one tour bubble. Nothing here
 * starts a workout, a route or a station, and nothing is written. Closing (done / דלג) calls
 * onClose.
 */
import React, { useEffect, useState } from 'react';
import CoachMarks, { type CoachMarkStep } from '@/components/ui/CoachMarks';
import type { AppGender } from '@/lib/utils/gendered-text';
import { firstRunTourChrome, presentSteps } from '@/features/user/onboarding/services/first-run-tour';
import { tourCatalogEntry } from '@/features/user/onboarding/services/tour-catalog';
import type { ReplayableTour } from '@/features/user/onboarding/services/tour-replay';
import { replayStepsFrom, replayTourSteps } from '@/features/user/onboarding/services/tour-replay-steps';
import { coachTargetVisible } from '@/features/user/onboarding/hooks/useCoachTargetPresent';
import PreviewPlayer from './PreviewPlayer';
import PreviewRoute from './PreviewRoute';
import PreviewRoutePlayer from './PreviewRoutePlayer';
import PreviewStation from './PreviewStation';

export const PREVIEW_ILLUSTRATION: Partial<Record<ReplayableTour, () => React.ReactElement>> = {
  player: PreviewPlayer,
  route: PreviewRoute,
  'route-player': PreviewRoutePlayer,
  station: PreviewStation,
};

export default function TourPreviewScreen({ tour, step, gender, onClose }: {
  tour: ReplayableTour;
  step: number;
  gender: AppGender | null | undefined;
  onClose: () => void;
}) {
  const Illustration = PREVIEW_ILLUSTRATION[tour];
  const [steps, setSteps] = useState<CoachMarkStep[] | null>(null);

  // Measure after the illustration has painted.
  useEffect(() => {
    const t = setTimeout(() => {
      const shown = presentSteps(replayStepsFrom(replayTourSteps(tour, gender), step), coachTargetVisible);
      if (shown.length) setSteps(shown);
      else onClose();
    }, 350);
    return () => clearTimeout(t);
  }, [tour, step, gender, onClose]);

  if (!Illustration) return null;
  return (
    <div className="fixed inset-0 z-[60] overflow-hidden bg-white" dir="rtl" style={{ colorScheme: 'light' }} data-tour-preview={tour}>
      <Illustration />
      <div
        className="pointer-events-none absolute inset-x-0 flex justify-center"
        style={{ top: 'calc(env(safe-area-inset-top, 0px) + 14px)' }}
      >
        <span className="rounded-full bg-white/95 px-3 py-1 text-[12px] font-bold text-v2-ink-2 shadow-v2-card">
          {`תצוגה לדוגמה · ${tourCatalogEntry(tour).name}`}
        </span>
      </div>
      {steps && <CoachMarks steps={steps} {...firstRunTourChrome(tour)} onFinish={onClose} />}
    </div>
  );
}
