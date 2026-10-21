/** dataset-import — regulated open datasets → named continuous routes (NATIONWIDE-PLAN.md W1.5). */
export * from './types';
export { DATASETS, getDataset } from './registry';
export { ITM_PROJ, itmToWgs84, looksLikeItm, looksLikeWgs84Israel } from './itm';
export { collectFeatures, normalizeFeatures, type NormalizeReport } from './normalize';
export { readShapefileZip, arcgisQueryUrl } from './read-shapefile';
export { stitchCorridors, JOIN_TOLERANCE_M, MIN_CORRIDOR_M, type StitchReport } from './stitch';
export { overlapShare, isDuplicate, DEDUP_BUFFER_M, DEDUP_MIN_SHARE } from './overlap';
export { assignAuthority, boundaryFromStored, pointInBoundary, samplePoints, MIN_MAJORITY, type AuthorityBoundary, type Assignment } from './authority-assign';
export { datasetRouteDoc, datasetRouteId, corridorRouteName, stableHash, DATASET_PIPELINE, type DatasetDocContext } from './to-route-doc';
export { planDatasetImport, type DatasetPlan, type PlannedRoute, type SkippedCorridor, type ExistingRoute } from './plan';
