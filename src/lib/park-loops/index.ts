/** park-loops — loops around big parks, offline (NATIONWIDE-PLAN.md W5, §2.5). */
export * from './types';
export { ringAreaM2, pointInRing, distToLineM, resample } from './geometry';
export { selectBigParks, mergeSameName, isBigPark, toPark, parkKind, BIG_PARK_MIN_AREA_M2, BIG_PARK_MIN_PERIMETER_M, MERGE_GAP_M, type RawArea } from './select-parks';
export { buildPathIndex, type PathIndex } from './path-index';
export {
  knownLoops, perimeterLoop, sameLoopShare, innerLoop, innerViaPoints, loopsForPark, fitnessStopsAlong,
  SNAP_M, PERIMETER_MIN_COVERAGE, PERIMETER_MAX_GAP_M, FITNESS_STOP_MAX_M,
  type ViaRouter, type PerimeterResult, type ParkLoopsResult,
} from './loops';
export { parkLoopDoc, parkLoopId, parkLoopName, PARK_LOOPS_PIPELINE } from './to-route-doc';
