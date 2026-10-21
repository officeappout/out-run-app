/**
 * Normalize one Technion street-shade layer (ArcGIS `f=geojson`, WGS84) into
 * LineString street segments.
 *
 * The lab publishes each street segment as a POLYGON (the street's
 * right-of-way between intersections — sidewalks + road). Routing and route
 * scoring need a line, so each polygon is reduced to its principal axis:
 * PCA over the outer-ring vertices gives the main direction, and the
 * vertices' extent along that direction gives the two endpoints. For the
 * typical elongated segment this is the centreline; for compact pieces
 * (squares, wide junctions) it is a short line through the middle, which is
 * still the right thing for 15 m buffer matching. `widthM` keeps the extent
 * across the axis so consumers can widen the match for wide boulevards.
 *
 * Pure, deterministic, no I/O.
 */
import { isLonLat, makeFrame, toLonLat, toXY } from './geometry';
import type {
  LayerFieldMapping,
  LonLat,
  RawFeature,
  RawFeatureCollection,
  ShadeSegmentCollection,
  ShadeSegmentFeature,
} from './types';

export interface NormalizeContext {
  city: string;
  sourceLayer: string;
  fetchedAt: string;
  mapping: LayerFieldMapping;
}

export interface NormalizeStats {
  input: number;
  output: number;
  skippedNoGeometry: number;
  skippedBadIndex: number;
}

const round = (n: number, d: number) => {
  const k = 10 ** d;
  return Math.round(n * k) / k;
};

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Outer rings of a Polygon / MultiPolygon as LonLat arrays. */
export function outerRings(geom: RawFeature['geometry']): LonLat[][] {
  if (!geom) return [];
  const rings: LonLat[][] = [];
  const pushRing = (r: unknown) => {
    if (!Array.isArray(r)) return;
    const pts = r.filter(isLonLat).map((p) => [p[0], p[1]] as LonLat);
    if (pts.length >= 3) rings.push(pts);
  };
  if (geom.type === 'Polygon' && Array.isArray(geom.coordinates)) {
    pushRing((geom.coordinates as unknown[])[0]);
  } else if (geom.type === 'MultiPolygon' && Array.isArray(geom.coordinates)) {
    for (const poly of geom.coordinates as unknown[]) {
      if (Array.isArray(poly)) pushRing(poly[0]);
    }
  }
  return rings;
}

/**
 * Principal axis of one or more closed rings → [start, end] LonLat plus the
 * width across it (m). The direction comes from the PERIMETER-weighted second
 * moments (each ring edge integrated along its length), so it does not
 * depend on how densely the source digitised each side. Returns null for
 * degenerate input.
 */
export function principalAxis(rings: LonLat[] | LonLat[][]): { line: [LonLat, LonLat]; lengthM: number; widthM: number } | null {
  const rs: LonLat[][] = (rings.length && Array.isArray((rings as LonLat[][])[0]?.[0]) ? rings : [rings]) as LonLat[][];
  const pts = rs.flat();
  if (pts.length < 2) return null;
  let sx = 0;
  let sy = 0;
  for (const p of pts) {
    sx += p[0];
    sy += p[1];
  }
  const frame = makeFrame(sx / pts.length, sy / pts.length);
  // Integrals over every edge (closing edge included) of 1, x, y, x², y², xy.
  let L = 0;
  let ix = 0;
  let iy = 0;
  let ixx = 0;
  let iyy = 0;
  let ixy = 0;
  const xyRings = rs.map((r) => r.map((p) => toXY(frame, p)));
  for (const r of xyRings) {
    for (let i = 0; i < r.length; i++) {
      const [px, py] = r[i];
      const [qx, qy] = r[(i + 1) % r.length];
      const l = Math.hypot(qx - px, qy - py);
      if (l === 0) continue;
      L += l;
      ix += (l * (px + qx)) / 2;
      iy += (l * (py + qy)) / 2;
      ixx += (l * (px * px + px * qx + qx * qx)) / 3;
      iyy += (l * (py * py + py * qy + qy * qy)) / 3;
      ixy += (l * (2 * px * py + px * qy + qx * py + 2 * qx * qy)) / 6;
    }
  }
  if (!(L > 0)) return null;
  const mx = ix / L;
  const my = iy / L;
  const cxx = ixx / L - mx * mx;
  const cyy = iyy / L - my * my;
  const cxy = ixy / L - mx * my;
  // Major eigenvector angle of the 2x2 covariance matrix.
  const theta = 0.5 * Math.atan2(2 * cxy, cxx - cyy);
  const ux = Math.cos(theta);
  const uy = Math.sin(theta);
  let tMin = Infinity;
  let tMax = -Infinity;
  let sMin = Infinity;
  let sMax = -Infinity;
  for (const r of xyRings) {
    for (const [x, y] of r) {
      const t = x * ux + y * uy;
      const s = -x * uy + y * ux;
      if (t < tMin) tMin = t;
      if (t > tMax) tMax = t;
      if (s < sMin) sMin = s;
      if (s > sMax) sMax = s;
    }
  }
  const lengthM = tMax - tMin;
  if (!(lengthM > 0.01)) return null;
  // Centre the line across the axis (midpoint of the width extent).
  const sMid = (sMin + sMax) / 2;
  const ox = -uy * sMid;
  const oy = ux * sMid;
  const a = toLonLat(frame, tMin * ux + ox, tMin * uy + oy);
  const b = toLonLat(frame, tMax * ux + ox, tMax * uy + oy);
  return { line: [a, b], lengthM, widthM: sMax - sMin };
}

export function normalizeFeature(f: RawFeature, ctx: NormalizeContext): ShadeSegmentFeature | 'no-geometry' | 'bad-index' {
  const props = f.properties ?? {};
  const si = numOrNull(props[ctx.mapping.shadeField]);
  if (si === null || si < 0 || si > 1) return 'bad-index';
  const rings = outerRings(f.geometry);
  if (!rings.length) return 'no-geometry';
  const axis = principalAxis(rings);
  if (!axis) return 'no-geometry';
  const rawId = ctx.mapping.idField ? props[ctx.mapping.idField] : undefined;
  const sourceFeatureId = (rawId as number | string | undefined) ?? f.id ?? -1;
  const tcc = ctx.mapping.tccField ? numOrNull(props[ctx.mapping.tccField]) : null;
  const siNoTrees = ctx.mapping.siNoTreesField ? numOrNull(props[ctx.mapping.siNoTreesField]) : null;
  return {
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: axis.line.map((p) => [round(p[0], 7), round(p[1], 7)] as LonLat),
    },
    properties: {
      shadeIndex: si,
      indexType: ctx.mapping.indexType,
      city: ctx.city,
      sourceLayer: ctx.sourceLayer,
      sourceFeatureId,
      fetchedAt: ctx.fetchedAt,
      ...(ctx.mapping.tccField ? { tcc } : {}),
      ...(ctx.mapping.siNoTreesField ? { siNoTrees } : {}),
      widthM: round(axis.widthM, 1),
    },
  };
}

export function normalizeLayer(
  fc: RawFeatureCollection,
  ctx: NormalizeContext,
): { collection: ShadeSegmentCollection; stats: NormalizeStats } {
  const stats: NormalizeStats = { input: 0, output: 0, skippedNoGeometry: 0, skippedBadIndex: 0 };
  const features: ShadeSegmentFeature[] = [];
  for (const f of fc.features ?? []) {
    stats.input++;
    const r = normalizeFeature(f, ctx);
    if (r === 'no-geometry') stats.skippedNoGeometry++;
    else if (r === 'bad-index') stats.skippedBadIndex++;
    else features.push(r);
  }
  stats.output = features.length;
  return { collection: { type: 'FeatureCollection', features }, stats };
}
