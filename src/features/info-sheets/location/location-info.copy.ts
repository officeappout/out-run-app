/**
 * Location sheet words (enable_feature_info_sheets_v1). PURE: takes the caller's `library`
 * translator; the place names are the toggle's own labels.
 */

import type { LibraryT } from '@/messages/ns/library';
import { locationChips, type InfoLocation, type LocationInfoModel } from './location-info.model';

export const LOCATION_LABEL_KEY = {
  park: 'preview.where.park',
  home: 'preview.where.home',
  service: 'preview.where.service',
} as const satisfies Record<InfoLocation, string>;

export function listOr(t: LibraryT, values: readonly string[]): string {
  if (values.length <= 1) return values.join('');
  return t('featureInfo.listOr', { head: values.slice(0, -1).join(', '), last: values[values.length - 1] });
}

const CHIP_KEY = {
  service: 'featureInfo.location.chipService',
  parkHome: 'featureInfo.location.chipParkHome',
  noGear: 'featureInfo.location.chipNoGear',
} as const;

export function locationCopy(m: LocationInfoModel, t: LibraryT) {
  const places = listOr(t, m.offered.map((p) => t(LOCATION_LABEL_KEY[p])));
  return {
    title: t('featureInfo.location.title'),
    lead: t('featureInfo.location.lead'),
    steps: [
      t('featureInfo.location.step1', { places }),
      t('featureInfo.location.step2'),
      t('featureInfo.location.step3'),
    ],
    chips: locationChips(m).map((c) => t(CHIP_KEY[c])),
  };
}
