export { buildValidatedDoc, stripUndefined, RouteDocValidationError, type ValidateContext } from './validate';
export { SCHEMA_REGISTRY, CITY_ONLY_COLLECTIONS, type RouteCollectionName } from './schemas';
export {
  isPointInPolygon,
  resolveAuthorityForPoint,
  resolveAuthorityForPath,
  findAuthorityByCityName,
  normalizeCityName,
  type AuthorityBoundary,
  type AuthorityResolution,
} from './authority-resolution';
export {
  ALL_SURFACE_TYPES,
  SURFACE_TYPE_LABELS,
  mapOsmSurfaceToType,
  type SurfaceType,
} from './surface-type';
export {
  ROUTE_GENERATOR_LABELS,
  classifyRouteGenerator,
  type RouteGenerator,
} from './route-generator';
export {
  ROUTE_DISPLAY_ROLES,
  isConnectorRoute,
  hideConnectorRoutes,
  classifyConnectors,
  CONNECTOR_NAME_PATTERN,
  CONNECTOR_MIN_OPEN_GAP_M,
  CONNECTOR_ATTACH_M,
  type RouteDisplayRole,
  type ConnectorCandidate,
  type ConnectorVerdict,
} from './display-role';
