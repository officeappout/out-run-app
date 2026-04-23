/**
 * Tenant Query Utilities
 *
 * Provides dual-path query resolution for the authorityId → tenantId migration.
 *
 * During the transition period, some documents have only `authorityId`,
 * some have both `authorityId` and `tenantId`, and new documents may
 * only have `tenantId`. These helpers ensure queries work in all cases.
 *
 * Post-migration, all documents will have `tenantId` and these helpers
 * can be simplified to always use `tenantId`.
 */

import { where, type QueryFieldFilterConstraint } from 'firebase/firestore';

export interface ScopeIdentifier {
  tenantId?: string | null;
  authorityId?: string | null;
}

/**
 * Returns the appropriate Firestore `where()` constraint for scoping
 * content documents (parks, routes, groups, etc.) to a tenant.
 *
 * Priority: tenantId > authorityId.
 * If neither is provided, returns null (caller should handle).
 */
export function contentScopeConstraint(
  scope: ScopeIdentifier,
): QueryFieldFilterConstraint | null {
  if (scope.tenantId) {
    return where('tenantId', '==', scope.tenantId);
  }
  if (scope.authorityId) {
    return where('authorityId', '==', scope.authorityId);
  }
  return null;
}

/**
 * Returns the appropriate constraint for scoping user documents.
 * User docs use `core.tenantId` or `core.authorityId`.
 */
export function userScopeConstraint(
  scope: ScopeIdentifier,
): QueryFieldFilterConstraint | null {
  if (scope.tenantId) {
    return where('core.tenantId', '==', scope.tenantId);
  }
  if (scope.authorityId) {
    return where('core.authorityId', '==', scope.authorityId);
  }
  return null;
}

/**
 * Build a scope identifier from an authority document.
 * If the authority has a linked tenantId, it takes priority.
 */
export function scopeFromAuthority(
  authorityId: string,
  authorityData?: Record<string, any> | null,
): ScopeIdentifier {
  const tenantId = authorityData?.tenantId ?? authorityData?.linkedTenantId ?? null;
  return { tenantId, authorityId };
}
