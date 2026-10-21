/**
 * Shade layer types — Technion (Aleksandrowicz lab) street shade maps.
 *
 * Pure types, no I/O. See docs/routes/TECHNION-SHADE-IMPORT.md.
 */

/** [lon, lat] in WGS84. */
export type LonLat = [number, number];

/**
 * Which index a value carries.
 * - `SI_daily`: the lab's summer Shade Index (0..1) — share of daily summer
 *   solar radiation blocked before reaching the ground, averaged over the
 *   street-segment polygon (sidewalks + road). This is what every public
 *   street layer carries today (`summer_SI` / TLV 2019 `Shade_Index`).
 * - `SAI`: Derech Tzel "Shade Availability Index" — share of 10 hourly checks
 *   08:00-17:00 with ≥50% sidewalk shaded. Not published as a layer yet;
 *   kept in the union so a future layer can be mapped without a type change.
 */
export type ShadeIndexType = 'SI_daily' | 'SAI';

export interface ShadeSegmentProps {
  /** 0..1 */
  shadeIndex: number;
  indexType: ShadeIndexType;
  /** City slug, e.g. `petah-tikva`. */
  city: string;
  /** Source layer URL (FeatureServer/<id>). */
  sourceLayer: string;
  /** Source object id (FID / OBJECTID) — stable only within one layer version. */
  sourceFeatureId: number | string;
  /** ISO timestamp of the fetch. */
  fetchedAt: string;
  /** Tree canopy cover ratio 0..1 when the layer carries it (`TCC`). */
  tcc?: number | null;
  /** Shade Index without trees (buildings only) when the layer carries it. */
  siNoTrees?: number | null;
  /** Approximate segment polygon width across the derived axis, metres. */
  widthM?: number;
}

export interface ShadeSegmentFeature {
  type: 'Feature';
  geometry: { type: 'LineString'; coordinates: LonLat[] };
  properties: ShadeSegmentProps;
}

export interface ShadeSegmentCollection {
  type: 'FeatureCollection';
  features: ShadeSegmentFeature[];
}

/** Minimal GeoJSON input shape (what ArcGIS `f=geojson` returns). */
export interface RawFeature {
  type: 'Feature';
  id?: number | string;
  geometry: {
    type: string;
    coordinates: unknown;
  } | null;
  properties: Record<string, unknown> | null;
}

export interface RawFeatureCollection {
  type: 'FeatureCollection';
  features: RawFeature[];
}

/** How one source layer's attributes map onto ShadeSegmentProps. */
export interface LayerFieldMapping {
  /** Attribute holding the 0..1 index (e.g. `summer_SI`, `Shade_Index`). */
  shadeField: string;
  indexType: ShadeIndexType;
  /** Object-id attribute (e.g. `FID`, `OBJECTID`). Falls back to feature.id. */
  idField?: string;
  tccField?: string;
  siNoTreesField?: string;
}
