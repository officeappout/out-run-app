/**
 * Registry of the Technion (Aleksandrowicz / BDAR lab) public street
 * summer-Shade-Index layers, one per city.
 *
 * Discovered 21.10.2026 from the lab's ArcGIS Online content
 * (owner `oraleks@technion.ac.il_Technion_GIS`, org `yAQXemoDSgzdfV2A`):
 * each city's "<City> Shade and Tree Maps" web map → its
 * "<CODE> street summer shade index" operational layer. All are public
 * polygon layers (one polygon per street segment, CRS 2039 except Netivot
 * 3857 — the fetcher always requests outSR=4326).
 *
 * The index is the lab's daily summer Shade Index (0..1, share of daily
 * summer radiation blocked), NOT the Derech Tzel SAI. Field: `summer_SI`
 * everywhere except TLV 2019 (`Shade_Index`).
 */
import type { LayerFieldMapping } from './types';

export const TECHNION_SOURCE = 'Aleksandrowicz lab, Technion — shade maps';
export const TECHNION_PERMISSION = 'verbal, via David Shachar Movshovitz, 21.10.2026 — written confirmation pending';
export const TECHNION_ATTRIBUTION =
  'Shade data: Dr. Or Aleksandrowicz, Faculty of Architecture and Town Planning, Technion';

const BASE = 'https://services1.arcgis.com/yAQXemoDSgzdfV2A/arcgis/rest/services';

export interface TechnionLayer {
  /** City slug used in file/object names. */
  city: string;
  /** Hebrew display name. */
  cityHe: string;
  /** Lab's 3-letter code. */
  code: string;
  /** FeatureServer layer URL. */
  url: string;
  /** Data year as stated in the item description (when stated). */
  dataYear?: number;
  /** Web map the layer was found in. */
  webMapId: string;
  mapping: LayerFieldMapping;
}

const SI: LayerFieldMapping = {
  shadeField: 'summer_SI',
  indexType: 'SI_daily',
  idField: 'FID',
  tccField: 'TCC',
  siNoTreesField: 'SI_no_tree',
};
const SI_TCC: LayerFieldMapping = { shadeField: 'summer_SI', indexType: 'SI_daily', idField: 'FID', tccField: 'TCC' };

export const TECHNION_SHADE_LAYERS: TechnionLayer[] = [
  { city: 'tel-aviv', cityHe: 'תל אביב-יפו', code: 'TLV', url: `${BASE}/TLV_street_summer_shade_index_2022/FeatureServer/222`, dataYear: 2022, webMapId: '(standalone item e1bdc14928744b3f88c62086679906bf)', mapping: SI },
  { city: 'beer-sheva', cityHe: 'באר שבע', code: 'BSV', dataYear: 2022, url: `${BASE}/BSV_street_SI/FeatureServer/83`, webMapId: '5a4641254bac48f0a77e56072decb27a', mapping: { shadeField: 'summer_SI', indexType: 'SI_daily', idField: 'FID' } },
  { city: 'petah-tikva', cityHe: 'פתח תקווה', code: 'PTV', url: `${BASE}/PTV_street_summer_shade_index/FeatureServer/778`, dataYear: 2022, webMapId: '4fa3d640c5374d7abf0fec6fe543f52e', mapping: SI },
  { city: 'haifa', cityHe: 'חיפה', code: 'HAI', dataYear: 2022, url: `${BASE}/HAI_street_SI_and_TCC/FeatureServer/15`, webMapId: '001659d1b79e4da5a6ff4ef872373c25', mapping: SI_TCC },
  { city: 'eilat', cityHe: 'אילת', code: 'ELT', url: `${BASE}/ELT_street_summer_shade_index/FeatureServer/301`, webMapId: '36106990a2b442e1a5729f8723654b25', mapping: SI_TCC },
  { city: 'herzliya', cityHe: 'הרצליה', code: 'HRZ', url: `${BASE}/HRZ_street_summer_shade_index/FeatureServer/710`, webMapId: 'ef0af6aa165c45aa97d42eb57324f5a1', mapping: SI_TCC },
  { city: 'raanana', cityHe: 'רעננה', code: 'RAN', url: `${BASE}/RAN_street_summer_shade_index/FeatureServer/298`, webMapId: '554c2ac4decd48fb993be3bf4dc261a7', mapping: SI_TCC },
  { city: 'hod-hasharon', cityHe: 'הוד השרון', code: 'HDS', url: `${BASE}/HDS_street_summer_shade_index/FeatureServer/746`, webMapId: '514d39285dc947c98cd5467e795a2a0b', mapping: SI_TCC },
  { city: 'ness-ziona', cityHe: 'נס ציונה', code: 'NSZ', dataYear: 2022, url: `${BASE}/NSZ_street_summer_shade_index/FeatureServer/738`, webMapId: 'bb5cf2b48d1747e5b48f7bf98f861be1', mapping: { ...SI_TCC, siNoTreesField: 'SI_NT' } },
  { city: 'sderot', cityHe: 'שדרות', code: 'SDR', dataYear: 2023, url: `${BASE}/SDR_street_summer_shade_index/FeatureServer/821`, webMapId: '17f589c1697044828c15af828df0dd27', mapping: SI },
  { city: 'pardes-hanna-karkur', cityHe: 'פרדס חנה-כרכור', code: 'PHK', url: `${BASE}/PHK_street_summer_shade_index/FeatureServer/778`, webMapId: 'a7c9d7e87473457fbe8d5d174dd26c9a', mapping: SI },
  { city: 'beitar-illit', cityHe: 'ביתר עילית', code: 'BTR', url: `${BASE}/BTR_street_summer_shade_index/FeatureServer/352`, webMapId: 'a81158c1cef3452bba2890232cac2d32', mapping: SI_TCC },
  { city: 'netivot', cityHe: 'נתיבות', code: 'NTV', dataYear: 2021, url: `${BASE}/NTV_street_summer_shade_index/FeatureServer/74`, webMapId: 'ec2cb57f7b164d2b97ad83ced4db8349', mapping: SI_TCC },
];
