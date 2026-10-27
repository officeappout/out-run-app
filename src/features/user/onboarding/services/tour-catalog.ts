/**
 * The tours list ("סיורים באפליקציה") — every replayable tour with a name and one line, in the
 * order a new user meets them. Shown by the help hub and the search Help tab (ai_coach_round4);
 * Kelly's tour chips name the same tours. Pure data; every replayable tour is listed exactly once
 * (unit-tested).
 */
import type { ReplayableTour } from './tour-replay';
import { makeT } from '@/lib/i18n/t';
import { onboarding } from '@/messages/ns/onboarding';

const t = makeT('he', onboarding);

export interface TourCatalogEntry {
  id: ReplayableTour;
  name: string;
  /** One line under the name. */
  line: string;
}

export const TOUR_CATALOG: readonly TourCatalogEntry[] = [
  { id: 'home', name: t('tourCatalog.home.name'), line: t('tourCatalog.home.line') },
  { id: 'plan', name: t('tourCatalog.plan.name'), line: t('tourCatalog.plan.line') },
  { id: 'map', name: t('tourCatalog.map.name'), line: t('tourCatalog.map.line') },
  { id: 'route', name: t('tourCatalog.route.name'), line: t('tourCatalog.route.line') },
  { id: 'route-player', name: t('tourCatalog.routePlayer.name'), line: t('tourCatalog.routePlayer.line') },
  { id: 'player', name: t('tourCatalog.player.name'), line: t('tourCatalog.player.line') },
  { id: 'station', name: t('tourCatalog.station.name'), line: t('tourCatalog.station.line') },
  { id: 'community', name: t('tourCatalog.community.name'), line: t('tourCatalog.community.line') },
];

export function tourCatalogEntry(id: ReplayableTour): TourCatalogEntry {
  return TOUR_CATALOG.find((t) => t.id === id) ?? { id, name: id, line: '' };
}
