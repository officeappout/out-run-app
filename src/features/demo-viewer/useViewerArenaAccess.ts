'use client';

/**
 * useArenaAccess for READ surfaces: the demo viewer reads their demo home
 * city / neighbourhood (viewer-arena-access.ts); everyone else gets exactly
 * useArenaAccess's value.
 */
import { useMemo } from 'react';
import type { ArenaAccess } from '@/features/arena/hooks/derive-arena-access';
import { applyViewerWorldToArenaAccess } from './viewer-arena-access';
import { useDemoViewerWorld } from './useDemoViewerWorld';

export function useViewerArenaAccess(access: ArenaAccess): ArenaAccess {
  const world = useDemoViewerWorld();
  return useMemo(() => applyViewerWorldToArenaAccess(access, world), [access, world]);
}
