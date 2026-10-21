/**
 * Data sources the hourly shade build can read, with their licence status.
 *
 * `live` — open licence confirmed; may feed a file that ships to Storage.
 * `pending_licence` — the importer supports it, but its output may be used
 *   only for local testing until written approval arrives. The build script
 *   refuses `--apply` when any pending source contributed (docs/routes/HOURLY-SHADE.md).
 *
 * Pure. Field mappings say how to read heights from each source's attributes.
 */

export type SourceLicenceStatus = 'live' | 'pending_licence';
export type SourceKind = 'buildings' | 'canopy' | 'trees' | 'streets';

export interface ShadeSource {
  id: string;
  kind: SourceKind;
  label: string;
  licence: string;
  status: SourceLicenceStatus;
  url: string;
  /** Attribute holding a measured height in metres (buildings: roof; canopy: crown top). */
  heightField?: string;
  /** Attribute holding storeys. */
  levelsField?: string;
  note?: string;
}

export const SHADE_SOURCES: readonly ShadeSource[] = [
  {
    id: 'osm',
    kind: 'buildings',
    label: 'OpenStreetMap buildings (Geofabrik israel-and-palestine)',
    licence: 'ODbL-1.0 (© OpenStreetMap contributors)',
    status: 'live',
    url: 'https://download.geofabrik.de/asia/israel-and-palestine-latest.osm.pbf',
    heightField: 'height',
    levelsField: 'building:levels',
  },
  {
    id: 'osm_trees',
    kind: 'trees',
    label: 'OpenStreetMap natural=tree / tree_row, natural=wood, landuse=forest',
    licence: 'ODbL-1.0 (© OpenStreetMap contributors)',
    status: 'live',
    url: 'https://download.geofabrik.de/asia/israel-and-palestine-latest.osm.pbf',
    heightField: 'height',
  },
  {
    id: 'osm_streets',
    kind: 'streets',
    label: 'OpenStreetMap walkable highways',
    licence: 'ODbL-1.0 (© OpenStreetMap contributors)',
    status: 'live',
    url: 'https://download.geofabrik.de/asia/israel-and-palestine-latest.osm.pbf',
  },
  {
    id: 'soi_canopy_otb',
    kind: 'canopy',
    label: 'Survey of Israel national tree canopy 2021 (processed, Open Tree Base)',
    licence: 'ODbL-1.0 (Open Tree Base / הסדנא לידע ציבורי)',
    status: 'live',
    url: 'https://opentreebase-public.s3.eu-west-2.wasabisys.com/processed/canopies/canopies.gpkg',
    note: '2D crowns, no height → DEFAULT_TREE_HEIGHT_M. Read a city slice with ogr2ogr -spat (GPKG R-tree, range requests).',
  },
  {
    id: 'overture_buildings',
    kind: 'buildings',
    label: 'Overture Maps buildings (height merged from OSM / Esri / Microsoft / Google)',
    licence: 'ODbL-1.0',
    status: 'live',
    url: 'https://docs.overturemaps.org/guides/buildings',
    heightField: 'height',
    levelsField: 'num_floors',
    note: 'GeoParquet on S3; pass a city slice exported to GeoJSONSeq with --file buildings:overture_buildings:<path>.',
  },
  {
    id: 'meta_chm',
    kind: 'canopy',
    label: 'Meta / WRI global canopy height (CHM v1/v2)',
    licence: 'CC BY 4.0',
    status: 'live',
    url: 'https://registry.opendata.aws/dataforgood-fb-forests/',
    heightField: 'height',
    note: 'Raster. Not ingested in v1: crown heights default to DEFAULT_TREE_HEIGHT_M. A per-crown zonal height can be added to a canopy file as `height`.',
  },
  {
    id: 'tlv_buildings_iview2',
    kind: 'buildings',
    label: 'Tel Aviv-Yafo GIS — buildings with roof height (IView2 layer 513)',
    licence: 'unclear for IView2 layers — written approval requested (tlvopendata@tel-aviv.gov.il)',
    status: 'pending_licence',
    url: 'https://gisn.tel-aviv.gov.il/arcgis/rest/services/IView2/MapServer/513',
    // max_height / min_height are absolute (roof / ground elevation); gova_simplex_2019 is their difference.
    heightField: 'gova_simplex_2019',
    levelsField: 'ms_komot',
  },
  {
    id: 'tlv_canopy_2024',
    kind: 'canopy',
    label: 'Tel Aviv-Yafo GIS — tree canopy 2024 (IView2 layer 574)',
    licence: 'unclear for IView2 layers — written approval requested',
    status: 'pending_licence',
    url: 'https://gisn.tel-aviv.gov.il/arcgis/rest/services/IView2/MapServer/574',
  },
  {
    id: 'beer_sheva_buildings',
    kind: 'buildings',
    label: "Be'er Sheva buildings with floors (data.gov.il buildings-br7)",
    licence: 'data.gov.il "Other (Open)" — terms text not found, written approval requested',
    status: 'pending_licence',
    url: 'https://data.gov.il/dataset/buildings-br7',
    levelsField: 'floors',
  },
];

export function shadeSource(id: string): ShadeSource | undefined {
  return SHADE_SOURCES.find((s) => s.id === id);
}
