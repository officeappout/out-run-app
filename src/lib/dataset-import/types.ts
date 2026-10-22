/**
 * dataset-import — stage 1 of NATIONWIDE-PLAN.md §3.1: regulated open
 * datasets (government / municipal) → named, continuous routes. Pure except
 * read-shapefile.ts (parses a local zip buffer; no network).
 */
import type { LngLat } from '../route-quality/types';

export type { LngLat };

export type DatasetSourceType = 'mot_open_data' | 'municipal_open_data';

/** One dataset we are licensed to import (owner decision Q11: CC-BY / ODbL only for now). */
export interface DatasetSpec {
  key: string;
  /** Human title (Hebrew), used in route names and the credit line. */
  title: string;
  sourceType: DatasetSourceType;
  publisher: string;
  /** SPDX-ish licence id, e.g. 'CC-BY-4.0'. */
  license: string;
  /** Credit line shown in the route detail sheet (route-attribution.ts). */
  attribution: string;
  datasetUrl: string;
  activity: 'cycling' | 'walking' | 'running';
  /** Property holding the route / street name. */
  nameField: string;
  /** Property holding the build status; null = every feature counts. */
  statusField: string | null;
  /** Status values meaning "exists on the ground" — planned / under construction are never imported. */
  existingStatuses: string[];
  /** Property holding a stable per-feature id (falls back to the feature index). */
  idField: string | null;
  /**
   * 'name'    — stitch only features sharing a name (named corridors, e.g. Ofnidan routes);
   * 'network' — stitch any touching features (street-named fragments, e.g. Jerusalem).
   */
  stitchBy: 'name' | 'network';
  /** Route-name prefix, e.g. 'אופנידן'. */
  routeNamePrefix: string;
  /** Used when `nameField` is empty on a feature (e.g. MoT: STREETNAME, else ROADNAME). */
  nameFallbackField?: string;
  /** Features whose `field` holds one of `values` are not lines of the network (e.g. MoT bike crossings) — skipped. */
  excludeWhere?: { field: string; values: string[] };
  /** Attribute fields copied onto each DatasetLine (`attrs`) for later stages (tree shade hint, walkway beside). */
  keepFields?: string[];
  /**
   * End-to-end join tolerance when stitching (default JOIN_TOLERANCE_M = 30).
   * The MoT layer cuts every section at a road crossing (crossings are their
   * own, excluded features), so its gaps are a carriageway wide — 50 m.
   */
  joinToleranceM?: number;
  /** Licence clearance: 'live' (default) or 'pending_licence' (never imported). */
  licenceStatus?: 'live' | 'pending_licence';
}

/** One line feature after reading + reprojection + status filter. */
export interface DatasetLine {
  featureId: string;
  name: string;
  status: string | null;
  coords: LngLat[];
  /** The spec's keepFields, as trimmed strings (absent fields omitted). */
  attrs?: Record<string, string>;
}

/** A continuous stitched corridor (one route candidate). */
export interface Corridor {
  name: string;
  /** Ordered feature ids that make up the corridor. */
  featureIds: string[];
  coords: LngLat[];
  lengthM: number;
  closed: boolean;
}
