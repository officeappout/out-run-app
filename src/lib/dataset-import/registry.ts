/**
 * The datasets cleared for import (owner decision Q11, 21.10.2026): CC-BY or
 * ODbL. Owner decision 22.10.2026 (RC9): the MoT national bike-path layer
 * `bph_infra_exist` is IN — its data.gov.il licence_id is `other-open`
 * ("אחר (פתוח)"), the portal's open category (distinct from other-nc /
 * other-closed). Be'er Sheva and Tel Aviv GIS stay OUT until a written
 * licence approval exists. Licence + attribute schema checked against the
 * CKAN API (package_show, datastore_search) on 21.10.2026 / 22.10.2026.
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
  /**
   * שבילי אופניים — תשתית רכיבה קיימת (MoT national layer, updated 2025-03,
   * ~10.5k sections in ~100 authorities). Schema read 22.10.2026 from the
   * CSV resource's datastore and confirmed on the downloaded zip
   * (BPH_Infra_Exist.shp, .prj → WGS84; 10,476 features: 7,763 שביל (ג),
   * 169 נתיב (ב), 2,489 מעבר חציה, 55 other/blank; USABLE 10,385 שמיש): BPHType ∈ {שביל (ג), נתיב (ב), מעבר חציה}, USABLE='שמיש',
   * STREETNAME / ROADNAME, BPHPLACE (where the path sits: מיסעה /
   * בין המיסעה לרצועת ההליכה / בין רצועת ההליכה לדופן הדרך / שדרה/מדרחוב /
   * מחוץ לזכות הדרך), DIV_Walk (separation from walkers), Trees
   * (בשני צדדים / בצד אחד / אין / לא רלוונטי), INFRA (surface).
   */
  bph_infra_exist: {
    key: 'bph_infra_exist',
    title: 'שבילי אופניים — תשתית רכיבה קיימת',
    sourceType: 'mot_open_data',
    publisher: 'משרד התחבורה והבטיחות בדרכים',
    license: 'other-open (data.gov.il)',
    attribution: 'משרד התחבורה והבטיחות בדרכים — data.gov.il',
    datasetUrl: 'https://data.gov.il/dataset/bph_infra_exist',
    activity: 'cycling',
    nameField: 'STREETNAME',
    nameFallbackField: 'ROADNAME',
    statusField: 'USABLE',
    existingStatuses: ['שמיש'],
    idField: 'ID',
    stitchBy: 'name',
    routeNamePrefix: 'שביל אופניים',
    excludeWhere: { field: 'BPHType', values: ['מעבר חציה'] },
    // Measured 22.10.2026 on the 2025-03 zip: ≥2 km same-street corridors 27 at 30 m → 40 at 50 m (70 m starts joining unrelated streets).
    joinToleranceM: 50,
    keepFields: ['BPHType', 'BPHPLACE', 'DIV_Walk', 'Trees', 'INFRA', 'AUTHORITY'],
    licenceStatus: 'live',
  },
};

export function getDataset(key: string): DatasetSpec {
  const d = DATASETS[key];
  if (!d) throw new Error(`unknown dataset "${key}" — known: ${Object.keys(DATASETS).join(', ')}`);
  return d;
}
