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
import { ProgramProgressCard } from '@/features/home/components/widgets/ProgramProgressCard';
import { useProgramProgress } from '@/features/home/hooks/useProgramProgress';
import { GhostUpsell } from './GhostUpsell';
import { Dumbbell } from 'lucide-react';

const STRENGTH_ONBOARDING_HREF = '/onboarding-new/program-path?track=strength';

/**
 * `!max-w-none` (Tailwind important modifier) overrides the internal
 * `max-w-[358px]` cap baked into `ProgramProgressCard`, and `h-full`
 * lets it stretch to match the height of the neighbouring
 * `ConsistencyWidget` inside the Row 2 65/35 grid (`items-stretch`).
 */
const FIT_PARENT_CLASS = '!max-w-none h-full';

export function ProgramProgressRow() {
  const router = useRouter();
  const data = useProgramProgress();

  if (!data) {
    return (
      <GhostUpsell
        onClick={() => router.push(STRENGTH_ONBOARDING_HREF)}
        label="השלם סקר כוח"
        ctaText="להתחיל →"
        icon={<Dumbbell size={20} className="text-[#5BC2F2]" />}
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
