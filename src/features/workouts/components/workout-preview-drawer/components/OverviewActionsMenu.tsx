'use client';

import React, { useState } from 'react';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import TvLargeScreenLauncher from '@/features/tv-mode/phone/TvLargeScreenLauncher';
import type { WorkoutLike } from '@/features/tv-mode/phone/workout-info';
import OverviewMoreMenu, { type OverviewMoreMenuProps } from './OverviewMoreMenu';

/**
 * enable_overview_more_menu_v1: the single ⋯ menu + (when enable_tv_mode_v1 is on) its
 * "show on a big screen" row, which opens the W-18 sheet from TV mode.
 */
export default function OverviewActionsMenu({
  actions,
  workout,
  onStart,
  prepareShare,
}: {
  actions: OverviewMoreMenuProps['actions'];
  workout: WorkoutLike;
  onStart: () => void;
  prepareShare?: () => Promise<string | undefined>;
}) {
  const { flags } = useFeatureFlags();
  const [sheet, setSheet] = useState(false);
  const tv = flags.enableTvModeV1;
  return (
    <>
      <OverviewMoreMenu actions={actions} onBigScreen={tv ? () => setSheet(true) : undefined} />
      {tv && (
        <TvLargeScreenLauncher
          open={sheet}
          onClose={() => setSheet(false)}
          workout={workout}
          onStart={onStart}
          prepareShare={prepareShare}
        />
      )}
    </>
  );
}
