/**
 * route-score — the unified route score (NATIONWIDE-PLAN.md §3.3) and the
 * per-authority top-N selection (§3.7). Pure, except route-scores-doc's
 * small store helpers, which take any Firestore-shaped db.
 */
export * from './types';
export * from './weights';
export { scoreSurface, scoreGeometry, scoreSafety, scoreSource, scoreComfort, scoreExperience } from './components';
export { routeScore, scoreBand } from './score';
export { routeScoreInputFromDoc, parsePath, deriveShape, deriveSourceTier, deriveUrbanKind, type FromDocOptions } from './from-route-doc';
export { quotaForAuthority, authoritySizeClass, QUOTAS, type AuthorityQuota, type AuthoritySizeClass, type Range } from './quota';
export {
  selectTopN, urbanFloorBlocker, anchorKey, gridCell, lengthBucket, isParkLoop, isCycling,
  MAX_PER_ANCHOR, MAX_PER_CELL,
  type ScoredRoute, type SelectionDecision, type SelectionResult, type SelectionRow, type LengthBucket, type SelectOptions,
} from './select';
export {
  ROUTE_SCORES_COLLECTION, buildRouteScoreDoc, routeScoreDocFromStored, toDateLike,
  writeRouteScoreDocs, readRouteScoreDoc, type RouteScoreDoc, type ScoreStoreDb,
} from './route-scores-doc';
export { scoreAuthorityRoutes, type AuthorityScoreRun } from './score-authority';
export {
  SURFACE_CLASSES, PAVED_SURFACES, UNPAVED_SURFACES, sharesFromMix, surfaceSharesFromDoc, classifySurface,
  buildSegmentIndex, surfaceMixFromSegments,
  type SurfaceClass, type SurfaceShares, type SurfaceSource, type SurfaceSegment, type SegmentIndex,
} from './surface-class';
