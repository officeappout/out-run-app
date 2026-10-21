/**
 * shade-hourly — shade by hour of day (RC7 step 1).
 *
 * Sun position (NOAA) → per-point shadow test against building / tree-crown
 * prisms → per-street-segment profile on a 12 reference days × 14 hours grid
 * → 1-byte cells → compact city file. Pure, no I/O.
 * See docs/routes/HOURLY-SHADE.md.
 */
export { sunPosition, julianDay } from './sun';
export type { SunPosition } from './sun';
export { israelLocalToUtc, utcToIsraelLocal, israelUtcOffsetHours, isIsraelSummerTime, lastSundayOfMonth } from './israel-time';
export {
  REFERENCE_DAY_OF_MONTH,
  FIRST_HOUR,
  LAST_HOUR,
  HOURS,
  MONTHS,
  HOURS_PER_DAY,
  GRID_CELLS,
  DEFAULT_SAMPLE_MINUTE,
  buildSunTable,
  cellIndex,
  cellForInstant,
} from './time-grid';
export type { SunCell } from './time-grid';
export {
  LEVEL_HEIGHT_M,
  DEFAULT_BUILDING_HEIGHT_M,
  DEFAULT_TREE_HEIGHT_M,
  TREE_CANOPY_OPACITY,
  BUILDING_TYPE_DEFAULT_HEIGHT_M,
  parseHeightM,
  resolveBuildingHeight,
} from './heights';
export type { HeightSource, HeightInput } from './heights';
export { createObstacleIndexBuilder, DEFAULT_CELL_M } from './obstacles';
export type { ObstacleIndex, ObstacleIndexBuilder, ObstacleKind } from './obstacles';
export { shadeAtPoint, sunRay, MAX_SHADOW_M } from './shadow';
export type { SunRay } from './shadow';
export { segmentShadeProfile, samplePoints, sunRays, SUN_DOWN, DEFAULT_SAMPLE_STEP_M } from './profile';
export type { ProfileOptions } from './profile';
export { quantizeCell, dequantizeCell, quantizeProfile, radiationWeightedMean, Q_SCALE, Q_SUN_DOWN } from './quantize';
export { createCityFileWriter, decodeCityFile, CITY_FILE_MAGIC, CITY_FILE_VERSION } from './city-file';
export type { HourlySegment, CityFileHeader } from './city-file';
export { HOURLY_SHADE_CITIES, HOURLY_SHADE_STORAGE_PREFIX, hourlyShadeCity, hourlyShadeObjectPath } from './cities';
export type { HourlyShadeCity } from './cities';
export { SHADE_SOURCES, shadeSource } from './sources';
export type { ShadeSource, SourceKind, SourceLicenceStatus } from './sources';
export { splitLine, pieceId, isWalkableHighway, WALKABLE_HIGHWAYS, MAX_PIECE_M } from './segments';
export { crownRing, crownRadiusFromTags, pointsAlong, DEFAULT_CROWN_RADIUS_M, TREE_ROW_SPACING_M } from './crowns';
export { pearson, spearman, ranks, quantile } from './stats';
export { buildHourlyCity, hourShadeForLine, hourlyProfileSummary, HOURLY_MIN_COVERAGE, HOURLY_MATCH } from './route-hourly';
export type { HourlyCity, HourShade, HourlyProfileSummary } from './route-hourly';
export { createHourlyShadeLoader } from './loader';
export type { HourlyShadeLoader, BytesFetcher } from './loader';
