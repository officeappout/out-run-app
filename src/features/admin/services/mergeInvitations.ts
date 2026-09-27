import { AdminInvitation } from '@/types/invitation.type';

/**
 * Merge two invitation lists (by-authorityId and by-tenantId results) into
 * one, de-duplicated by id (a doc can in principle satisfy both queries —
 * a real anomalous production doc does, see docs/audit-2026-09/00-MASTER-
 * PLAN.md §13.34 finding 5), sorted by createdAt descending.
 *
 * Kept in its own file with no Firebase/DB imports (unlike invitation.
 * service.ts, which pulls in a chain that vitest's node-only config can't
 * transform — see .claude/knowledge memory "Vitest Node-Only, No jsdom")
 * so it stays unit-testable in isolation. See
 * src/features/admin/services/__tests__/mergeAndSortInvitations.test.ts.
 */
export function mergeAndSortInvitations(
  byAuthority: AdminInvitation[],
  byTenant: AdminInvitation[]
): AdminInvitation[] {
  const byId = new Map<string, AdminInvitation>();
  for (const inv of byAuthority) byId.set(inv.id, inv);
  for (const inv of byTenant) byId.set(inv.id, inv);
  return Array.from(byId.values()).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}
