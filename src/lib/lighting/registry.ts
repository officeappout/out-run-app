/**
 * Lamp-post datasets the lighting importer can read, with licence status.
 *
 * `live` — open licence; may ship to Storage. `pending_licence` — importer
 * supported, output for local testing only until written approval arrives;
 * the build script refuses `--apply` when one contributed. Later cities just
 * add an entry here and run the build with their file. Pure.
 */
export type LampFormat = 'osm' | 'geojson' | 'shapefile_zip' | 'arcgis';
export type LampLicenceStatus = 'live' | 'pending_licence';

export interface LampDataset {
  key: string;
  title: string;
  /** City slug the dataset covers; null = national (OSM). */
  city: string | null;
  format: LampFormat;
  url: string;
  licence: string;
  status: LampLicenceStatus;
  attribution: string;
  /** Stable object-id attribute for paged ArcGIS queries (orderByFields). */
  idField?: string;
  /** Attribute with the number of lamps on the post (informational). */
  lampCountField?: string;
  note?: string;
}

export const LAMP_DATASETS: readonly LampDataset[] = [
  {
    key: 'osm_street_lamps',
    title: 'OpenStreetMap highway=street_lamp',
    city: null,
    format: 'osm',
    url: 'https://download.geofabrik.de/asia/israel-and-palestine-latest.osm.pbf',
    licence: 'ODbL-1.0',
    status: 'live',
    attribution: '© OpenStreetMap contributors',
    note: '~6k nodes nationwide (21.10.2026) — sparse.',
  },
  {
    key: 'beer_sheva_street_lights',
    title: "Be'er Sheva street-light poles (עמודי תאורה)",
    city: 'beer-sheva',
    format: 'geojson',
    url: 'https://data.gov.il/dataset/street-light-br7',
    licence: 'data.gov.il "Other (Open)" — terms text not found, written approval requested',
    status: 'pending_licence',
    attribution: 'עיריית באר שבע — data.gov.il',
    note: '29,856 poles, monthly. GeoJSON/CSV/SHP, WGS84 + ITM.',
  },
  {
    key: 'tel_aviv_lamps',
    title: 'Tel Aviv-Yafo GIS — street lamps (IView2 layer 997, פנסים)',
    city: 'tel-aviv',
    format: 'arcgis',
    url: 'https://gisn.tel-aviv.gov.il/arcgis/rest/services/IView2/MapServer/997',
    licence: 'unclear for IView2 layers — written approval requested (tlvopendata@tel-aviv.gov.il)',
    status: 'pending_licence',
    attribution: 'עיריית תל אביב-יפו',
    idField: 'oid_amud',
    lampCountField: 'ms_panasim',
    note: '3,295 poles (21.10.2026) — looks partial for the city (many lamps hang on IEC poles).',
  },
];

export function lampDataset(key: string): LampDataset | undefined {
  return LAMP_DATASETS.find((d) => d.key === key);
}
