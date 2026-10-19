'use client';

/**
 * Kelly round 4 — the extras under one Kelly reply: the walk / run card, then the nearby parks.
 * Rendered by AiCoachChat only while ai_coach_round4 is on.
 */
import React from 'react';
import type { Round4Extras } from '@/lib/ai/coach/round4/types';
import type { AerobicCardView } from '@/lib/ai/coach/round4/types';
import KellyAerobicCard from './KellyAerobicCard';
import KellyNearbyParks from './KellyNearbyParks';

export default function Round4MessageExtras({
  extras,
  onOpenAerobic,
  onOpenPark,
}: {
  extras: Round4Extras;
  onOpenAerobic: (card: AerobicCardView) => void;
  onOpenPark: (parkId: string) => void;
}) {
  return (
    <>
      {extras.aerobic && (
        <div className="mt-2">
          <KellyAerobicCard card={extras.aerobic} onOpen={onOpenAerobic} />
        </div>
      )}
      {extras.parks?.length ? <KellyNearbyParks parks={extras.parks} onOpen={onOpenPark} /> : null}
    </>
  );
}
