'use client';

import React from 'react';
import TvLargeScreenSheet from './TvLargeScreenSheet';
import { useTvPhoneStore } from './phone-store';
import { workoutInfoFrom, type WorkoutLike } from './workout-info';

/**
 * The W-18 sheet + pairing hand-off, controlled from outside (the overview's single ⋯ menu,
 * enable_overview_more_menu_v1). Same wiring as TvEntryMenu's sheet, minus its own ⋯ button.
 * The caller decides whether to mount it (enable_tv_mode_v1).
 */
export default function TvLargeScreenLauncher({
  open,
  onClose,
  workout,
  onStart,
  prepareShare,
}: {
  open: boolean;
  onClose: () => void;
  workout: WorkoutLike;
  onStart: () => void;
  prepareShare?: () => Promise<string | undefined>;
}) {
  const openPair = useTvPhoneStore((s) => s.openPair);
  return (
    <TvLargeScreenSheet
      open={open}
      onClose={onClose}
      onPickCode={() => {
        onClose();
        openPair({ info: workoutInfoFrom(workout), onStart, prepareShare });
      }}
    />
  );
}
