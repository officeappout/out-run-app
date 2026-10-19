/**
 * route-quality — pure, I/O-free measurement of a generated route line
 * (U-turns/spurs, retrace, self-crossings, compactness, distance error,
 * major-road share and crossings) + the v1 loop acceptance bars and the
 * spur trimmer. The only I/O helper is fetchOsmRoadLayer (Overpass), kept
 * separate in osm-layer.ts / osm-layer-cache.ts.
 */
export * from './types';
export { haversineM, pathLengthM } from './geo';
export { detectUTurns, SPUR_MIN_M } from './uturns';
export { retracedFraction } from './retrace';
export { compactness, countSelfIntersections } from './shape';
export { majorRoadCrossings, majorRoadShare } from './major-roads';
export { computeRouteQualityMetrics, type MetricsOptions } from './metrics';
export { evaluateLoopQuality, LOOP_QUALITY_THRESHOLDS, type QualityVerdict, type QualityRejectReason } from './acceptance';
export { trimSpurs } from './trim-spurs';
export { bboxAround, buildOverpassQuery, crossingControlFromTags, fetchOsmRoadLayer, isMajorHighway, parseOverpassLayer, MAJOR_HIGHWAYS, type Bbox } from './osm-layer';
