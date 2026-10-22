'use client';

/**
 * TimedPreviewOverview — top of the preview drawer for a workout with a
 * timed block (enable_home_v2; boards A-1a, A-2a, A-4a, A-5a): the shared
 * overview header's meta row ("14 דק׳ · 9 תרגילים · מסיים ~9:55" — the
 * drawer's own header already shows the title), the journey strip and the
 * intensity profile. Shared v2 primitives only.
 */
import React, { useMemo } from 'react';
import { JourneyStrip, ProfileStrip, WorkoutOverviewHeader } from '@/components/ui/v2';
import type { GeneratedWorkout } from '@/features/workout-engine/logic/workout-generator.types';
import { previewJourney, previewMeta, previewProfile, type PreviewTimedModel } from '../../utils/timed-preview.utils';
import { useT } from '@/hooks/useT';
import { library } from '@/messages/ns/library';

export function TimedPreviewMeta({ workout }: { workout: GeneratedWorkout }) {
  const t = useT(library);
  const meta = useMemo(() => previewMeta(workout, new Date(), t), [workout, t]);
  return <WorkoutOverviewHeader v2 title={null} meta={meta} />;
}

export default function TimedPreviewStrips({ workout, model }: { workout: GeneratedWorkout; model: PreviewTimedModel }) {
  const journey = useMemo(() => previewJourney(workout, model), [workout, model]);
  const profile = useMemo(() => previewProfile(workout, model), [workout, model]);
  const t = useT(library);
  return (
    <div className="mb-3 space-y-2.5">
      <JourneyStrip v2 items={journey} />
      <ProfileStrip segments={profile} ariaLabel={t('preview.timed.profile')} />
    </div>
  );
}
