/**
 * Server-side GraphHopper client (self-hosted on Cloud Run, me-west1 —
 * infra/graphhopper/). Pure builders/mappers + one fetch client.
 */
export * from './types';
export { buildCustomModel, PARKS_AREA_ID } from './custom-model';
export { buildRoundTripRequest, buildViaRequest, profileForActivity, GH_DETAILS, type OutActivity, type RoundTripParams } from './request-builder';
export { mapGhPath, crossingKind, maxGradePct } from './map-response';
export { createGraphHopperClient, GraphHopperError, type GraphHopperClient, type ClientOptions } from './client';
export { readGraphHopperConfig, readFootProfile, isLocalUrl, type GraphHopperConfig } from './config';
export { createIdTokenProvider, invokerKeyFromEnv, parseServiceAccountKey, tokenExpiryMs, type IdTokenProvider, type ServiceAccountKey } from './id-token';
export { getServerGraphHopperClient } from './server-client';
