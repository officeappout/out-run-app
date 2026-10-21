/**
 * The datasets cleared for import (owner decision Q11, 21.10.2026): CC-BY or
 * ODbL only. data.gov.il "Other (Open)" (bph_infra_exist, Be'er Sheva) and
 * Tel Aviv GIS stay OUT until a written licence approval exists.
 * Licence + attribute schema checked against the CKAN API (package_show,
 * datastore_search) on 21.10.2026.
 */
import type { DatasetSpec } from './types';

const MOT_ATTRIBUTION = 'משרד התחבורה והבטיחות בדרכים — data.gov.il (CC BY)';

export const DATASETS: Record<string, DatasetSpec> = {
  ofneidan: {
    key: 'ofneidan',
    title: 'אופנידן — רשת אופניים בין-עירונית גוש דן',
    sourceType: 'mot_open_data',
    publisher: 'משרד התחבורה / נתיבי איילון',
    license: 'CC-BY-4.0',
    attribution: MOT_ATTRIBUTION,
    datasetUrl: 'https://data.gov.il/dataset/ofneidan',
    activity: 'cycling',
    nameField: 'NAME',
    statusField: 'STATUS',
    // Values seen 21.10: נפתח לתנועה (66), תכנון (48), ביצוע (35), HOLD (22), לא הוקצה (12), הליך מכרזי (9), ייזום (1).
    existingStatuses: ['נפתח לתנועה'],
    idField: 'DP',
    stitchBy: 'name',
    routeNamePrefix: 'אופנידן',
  },
  bicycle_jer_2019: {
    key: 'bicycle_jer_2019',
    title: 'שבילי אופניים בירושלים (2019)',
    sourceType: 'mot_open_data',
    publisher: 'משרד התחבורה',
    license: 'CC-BY-4.0',
    attribution: MOT_ATTRIBUTION,
    datasetUrl: 'https://data.gov.il/dataset/bicycle_jer_2019',
    activity: 'cycling',
    nameField: 'NAME',
    statusField: 'STATUS',
    // Values seen 21.10: קיים (52), שביל בבדיקת תכנון ראשוני (6), שביל שלגביו קיים תכנון (2).
    existingStatuses: ['קיים'],
    idField: 'OBJECTID',
    stitchBy: 'network',
    routeNamePrefix: 'שביל אופניים',
  },
};

export function getDataset(key: string): DatasetSpec {
  const d = DATASETS[key];
  if (!d) throw new Error(`unknown dataset "${key}" — known: ${Object.keys(DATASETS).join(', ')}`);
  return d;
}
