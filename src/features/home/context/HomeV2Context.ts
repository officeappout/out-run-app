'use client';

import { createContext, useContext } from 'react';

/**
 * Home v2 (system_config/feature_flags.enable_home_v2) for the components
 * home renders deep in its tree (the workout card, the location chip, the
 * groups row) — provided once at the top of /home so no prop has to be
 * threaded through StatsOverview / the carousel. false = today's look.
 */
export const HomeV2Context = createContext(false);

export function useHomeV2(): boolean {
  return useContext(HomeV2Context);
}
