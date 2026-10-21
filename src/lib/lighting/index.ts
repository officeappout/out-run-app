/**
 * lighting — lamp posts + OSM `lit` → per-street lit answer → route litShare
 * (RC7 step 3). Pure, no I/O. See docs/routes/HOURLY-SHADE.md §lighting.
 */
export * from './constants';
export { LAMP_DATASETS, lampDataset } from './registry';
export type { LampDataset, LampFormat, LampLicenceStatus } from './registry';
export { buildLampIndex, hasLampWithin, lampShare, classifyLitPiece } from './lamps';
export type { LampIndex, LitState, LitBasis } from './lamps';
export { makeLightingFile, parseLightingFile } from './file';
export type { LightingCityFile, LightingPiece, LightingSourceRef, LightingSummary } from './file';
export { buildLitIndex, measureRouteLighting, LIT_MATCH_BUFFER_M } from './route-lighting';
export type { LitIndex, RouteLighting, RouteLightingStatus } from './route-lighting';
export { createLightingLoader } from './loader';
export type { LightingLoader } from './loader';
