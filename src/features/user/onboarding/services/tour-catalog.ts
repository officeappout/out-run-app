/**
 * The tours list ("סיורים באפליקציה") — every replayable tour with a name and one line, in the
 * order a new user meets them. Shown by the help hub and the search Help tab (ai_coach_round4);
 * Kelly's tour chips name the same tours. Pure data; every replayable tour is listed exactly once
 * (unit-tested).
 */
import type { ReplayableTour } from './tour-replay';
import { makeLiveT } from '@/lib/i18n/live-t';
import { onboarding } from '@/messages/ns/onboarding';

const t = makeLiveT(onboarding);

export interface TourCatalogEntry {
  id: ReplayableTour;
  name: string;
  /** One line under the name. */
  line: string;
}

export const TOUR_CATALOG: readonly TourCatalogEntry[] = [
  { id: 'home', get name() { return t('tourCatalog.home.name'); }, get line() { return t('tourCatalog.home.line'); } },
  { id: 'plan', get name() { return t('tourCatalog.plan.name'); }, get line() { return t('tourCatalog.plan.line'); } },
  { id: 'map', get name() { return t('tourCatalog.map.name'); }, get line() { return t('tourCatalog.map.line'); } },
  { id: 'route', get name() { return t('tourCatalog.route.name'); }, get line() { return t('tourCatalog.route.line'); } },
  { id: 'route-player', get name() { return t('tourCatalog.routePlayer.name'); }, get line() { return t('tourCatalog.routePlayer.line'); } },
  { id: 'player', get name() { return t('tourCatalog.player.name'); }, get line() { return t('tourCatalog.player.line'); } },
  { id: 'station', get name() { return t('tourCatalog.station.name'); }, get line() { return t('tourCatalog.station.line'); } },
  { id: 'community', get name() { return t('tourCatalog.community.name'); }, get line() { return t('tourCatalog.community.line'); } },
];

export function tourCatalogEntry(id: ReplayableTour): TourCatalogEntry {
  return TOUR_CATALOG.find((t) => t.id === id) ?? { id, name: id, line: '' };
}
