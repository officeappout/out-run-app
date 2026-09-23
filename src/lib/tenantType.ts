/**
 * tenantType.ts — maps an Authority's raw `type` field to one of the 3
 * verticals (municipal/military/educational) used for vertical_admin
 * scoping (core.managedVertical). Originally inline in
 * src/app/api/admin/authorities/route.ts; extracted 23.09.2026 so
 * src/lib/adminAnalyticsScope.ts (imported by plain Node test/verify
 * scripts, not just Next.js route handlers) doesn't have to pull in that
 * route file's full transitive dependency graph just for this one pure
 * function.
 */
export function tenantTypeOf(type: string): string {
  const t = (type ?? '').toLowerCase();
  if (t === 'military' || t === 'military_unit') return 'military';
  if (t === 'educational' || t === 'school') return 'educational';
  return 'municipal';
}
