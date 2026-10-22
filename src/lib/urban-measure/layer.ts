/**
 * One authority's measurement layer: spatial indexes over the OSM ways,
 * lamps, amenity points and major roads, built once and reused for every
 * route candidate of that authority. Pure.
 */
import { buildWayGrid, segsFromWays, pathLenM, type WayCategory, type WayInfo } from '../../../scripts/lib/route-composition-classify';
import { buildLampIndex, type LampIndex } from '../lighting/lamps';
import { makeProjector, type Projector, type XY } from '../route-quality/geo';
import { SegmentGrid } from '../route-quality/grid';
import { isMajorHighway } from '../route-quality/osm-layer';
import type { CrossingNode, MajorRoad } from '../route-quality/types';
import { AMENITY_RADIUS_M, COMPOSITION_HIGHWAYS, COMPOSITION_ROAD_HIGHWAYS, SEPARATED_WALKWAY_HIGHWAYS } from './constants';
import type { LngLat, UrbanAmenityKind, UrbanLayerInput, UrbanWay } from './types';

export interface UrbanLayer {
  proj: Projector;
  ways: UrbanWay[];
  /** All highway ways, projected — "which way is the route on here". Data = index into `ways`. */
  wayGrid: SegmentGrid<number>;
  lamps: LampIndex;
  /** Any lamp or any lit=* tag in the layer (otherwise lighting is never measurable here). */
  hasLightingData: boolean;
  /** Amenity points per AMENITY_RADIUS_M cell, projected. */
  amenityCells: Map<string, Array<{ kind: UrbanAmenityKind; xy: XY }>>;
  amenityCount: number;
  majorRoads: MajorRoad[];
  /** Q-D: tertiary+ road segments, projected. Data = index into `ways` (tags: sidewalk=*). */
  majorGrid: SegmentGrid<number>;
  /** Q-D: walkway segments (footway / path / pedestrian / cycleway … with foot not "no"), projected. Data = index into `ways`. */
  walkwayGrid: SegmentGrid<number>;
  crossings: CrossingNode[];
  composition: {
    waysById: Map<number, WayInfo>;
    allGrid: ReturnType<typeof buildWayGrid>;
    roadGrid: ReturnType<typeof buildWayGrid>;
    categoryCache: Map<number, WayCategory>;
  };
}

export const amenityCellKey = (xy: XY) => `${Math.floor(xy[0] / AMENITY_RADIUS_M)}:${Math.floor(xy[1] / AMENITY_RADIUS_M)}`;

function layerOrigin(input: UrbanLayerInput): LngLat {
  let n = 0, lng = 0, lat = 0;
  for (const w of input.ways) for (const c of w.coords) { lng += c[0]; lat += c[1]; n++; }
  return n ? [lng / n, lat / n] : [35, 32];
}

export function buildUrbanLayer(input: UrbanLayerInput): UrbanLayer {
  const proj = makeProjector(layerOrigin(input));
  const ways = input.ways.filter((w) => w.coords.length >= 2);
  const wayGrid = new SegmentGrid<number>(50);
  const majorGrid = new SegmentGrid<number>(50);
  const walkwayGrid = new SegmentGrid<number>(50);
  ways.forEach((w, i) => {
    const xy = w.coords.map(proj.toXY);
    const major = isMajorHighway(w.highway);
    const walkway = SEPARATED_WALKWAY_HIGHWAYS.has(w.highway) && w.tags.foot !== 'no';
    for (let k = 1; k < xy.length; k++) {
      wayGrid.add(xy[k - 1], xy[k], i);
      if (major) majorGrid.add(xy[k - 1], xy[k], i);
      if (walkway) walkwayGrid.add(xy[k - 1], xy[k], i);
    }
  });

  const amenityCells = new Map<string, Array<{ kind: UrbanAmenityKind; xy: XY }>>();
  for (const a of input.amenities) {
    const xy = proj.toXY(a.coord);
    const k = amenityCellKey(xy);
    const arr = amenityCells.get(k);
    if (arr) arr.push({ kind: a.kind, xy }); else amenityCells.set(k, [{ kind: a.kind, xy }]);
  }

  const waysById = new Map<number, WayInfo>();
  const allWays: WayInfo[] = [];
  const roadWays: WayInfo[] = [];
  for (const w of ways) {
    if (!COMPOSITION_HIGHWAYS.has(w.highway)) continue;
    const pts = w.coords.map(([lng, lat]) => [lat, lng] as [number, number]);
    const info: WayInfo = { id: w.id, highway: w.highway, footwayTag: w.tags.footway ?? null, isSidepath: w.tags.is_sidepath === 'yes', pts, lenM: pathLenM(pts) };
    waysById.set(w.id, info);
    allWays.push(info);
    if (COMPOSITION_ROAD_HIGHWAYS.has(w.highway)) roadWays.push(info);
  }

  return {
    proj,
    ways,
    wayGrid,
    lamps: buildLampIndex(input.lamps),
    hasLightingData: input.lamps.length > 0 || ways.some((w) => !!w.tags.lit),
    amenityCells,
    amenityCount: input.amenities.length,
    majorRoads: ways.filter((w) => isMajorHighway(w.highway)).map((w) => ({ id: w.id, highway: w.highway, ...(w.tags.name ? { name: w.tags.name } : {}), coords: w.coords })),
    majorGrid,
    walkwayGrid,
    crossings: input.crossings,
    composition: {
      waysById,
      allGrid: buildWayGrid(segsFromWays(allWays)),
      roadGrid: buildWayGrid(segsFromWays(roadWays)),
      categoryCache: new Map(),
    },
  };
}
