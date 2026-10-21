export * from './types';
export { haversineM, lineLengthM } from './geometry';
export { normalizeLayer, normalizeFeature, principalAxis, outerRings } from './normalize';
export type { NormalizeContext, NormalizeStats } from './normalize';
export { buildShadeIndex, shadeShareForLine } from './match';
export type { ShadeSpatialIndex, ShadeShareOptions, ShadeShareResult } from './match';
export { TECHNION_SHADE_LAYERS, TECHNION_ATTRIBUTION, TECHNION_PERMISSION, TECHNION_SOURCE } from './technion-layers';
export type { TechnionLayer } from './technion-layers';
