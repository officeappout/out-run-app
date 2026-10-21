/**
 * Demo viewer → ArenaAccess overlay (PR 5). Pure.
 *
 * READ surfaces only (community feed / leagues, nearby groups): the viewer's
 * city and neighbourhood become their demo home, so the city board, the
 * neighbourhood board, city groups / events and the scope battles read the
 * demo world. Write paths (workout posts, league credit, the running player)
 * keep using useArenaAccess untouched — the viewer's own activity stays real.
 * A null world returns the very same object (no re-render, no change).
 */
import type { ArenaAccess } from '@/features/arena/hooks/derive-arena-access';
import type { DemoViewerWorld } from './viewer-world.types';

export function applyViewerWorldToArenaAccess(access: ArenaAccess, world: DemoViewerWorld | null): ArenaAccess {
  if (!world) return access;
  const { home } = world;
  const activeTabs = access.activeTabs.some((t) => t.key === 'city')
    ? access.activeTabs
    : [...access.activeTabs.slice(0, 1), { key: 'city' as const, label: 'עיר' }, ...access.activeTabs.slice(1)];
  return {
    ...access,
    cityAuthorityId: home.cityId,
    cityName: home.cityName,
    hasCityAccess: true,
    neighborhoodAuthorityId: home.neighborhoodId,
    neighborhoodName: home.neighborhoodName,
    hasNeighborhoodAccess: !!home.neighborhoodId,
    activeTabs,
  };
}
