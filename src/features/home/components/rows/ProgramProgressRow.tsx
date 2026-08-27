"use client";

/**
 * ProgramProgressRow — Right half of Row 2 in the new dashboard.
 *
 * Reuses the production `ProgramProgressCard` directly (no skeleton, no
 * placeholder card). When the user hasn't completed the strength survey
 * we still render the *real* card with neutral default values and wrap it
 * in `GhostUpsell` — exactly per the spec ("use the GhostUpsell blur on
 * the original components, don't build empty versions").
 *
 * Multi-program: when `programCount > 1`, `ProgramProgressCard` already
 * switches to its narrower carousel-card layout via the `programCount`
 * prop. Carousel paging itself is deferred — for v1 we surface the user's
 * primary program only when count > 1.
 */

import React from 'react';
import { useRouter } from 'next/navigation';
import { useUserStore } from '@/features/user';
import { ProgramProgressCard } from '@/features/home/components/widgets/ProgramProgressCard';
import { useProgramProgress } from '@/features/home/hooks/useProgramProgress';
import { GhostUpsell } from './GhostUpsell';
import { resolveOnboardingEntryHref } from '@/features/user/onboarding/utils/onboarding-entry';

/**
 * No explicit height is set here — ProgramProgressCard sizes to its own
 * content (title + level + remaining %). The outer Row 2 flex row uses
 * `items-stretch` so ConsistencyWidget fills the same height as the card.
 * Removed the previous `h-full` because it created a circular height
 * dependency: the card's height depended on the column, the column's height
 * depended on the taller sibling, leading to height oscillation during the
 * initial Firestore data-load reflow.
 */
const FIT_PARENT_CLASS = '';

export function ProgramProgressRow() {
  const router = useRouter();
  const { profile } = useUserStore();
  const data = useProgramProgress();

  if (!data) {
    return (
      <GhostUpsell
        onClick={() => router.push(resolveOnboardingEntryHref(profile, 'STRENGTH'))}
        label="בואו נראה מאיפה מתחילים"
        ctaText="לחצו כאן "
      >
        {/* Real ProgramProgressCard rendered with neutral defaults so the
            blurred surface keeps the card silhouette + height. */}
        <ProgramProgressCard
          programName="תוכנית אימון"
          iconKey="muscle"
          currentLevel={1}
          maxLevel={25}
          progressPercent={0}
          className={FIT_PARENT_CLASS}
        />
      </GhostUpsell>
    );
  }

  return (
    <ProgramProgressCard
      programName={data.programName}
      programNameLoading={data.programNameLoading}
      iconKey={data.iconKey}
      currentLevel={data.currentLevel}
      maxLevel={data.maxLevel}
      progressPercent={data.progressPercent}
      programCount={data.programCount}
      className={FIT_PARENT_CLASS}
    />
  );
}

export default ProgramProgressRow;
