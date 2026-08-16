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
