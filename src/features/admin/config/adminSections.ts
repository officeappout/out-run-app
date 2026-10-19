/**
 * Which admin screens belong to which sidebar section — ONE source for both
 * the platform-member route allowlist and the sidebar's "active section"
 * highlight in src/app/admin/layout.tsx. They used to be two hand-copied
 * maps that drifted (audit 15.10.2026): a link the sidebar lit up but the
 * allowlist bounced, and '/admin/users' (dev) silently granting
 * '/admin/users/all' and '/admin/users/[uid]' (product) by prefix.
 *
 * The scoped roles (authority manager / tenant owner / unit admin / chief
 * fitness officer) are gated server-side in src/middleware.ts, not here.
 */

export type AdminSectionId =
  | 'strategy'
  | 'crm'
  | 'marketing'
  | 'product'
  | 'dev'
  | 'finance'
  | 'municipal'
  | 'military'
  | 'educational';

/** what a platform member with the section may open */
export const SECTION_PATHS: Record<AdminSectionId, string[]> = {
  strategy: ['/admin', '/admin/roadmap', '/admin/master-roadmap'],
  crm: ['/admin/authorities', '/admin/organizations', '/admin/admin-directory'],
  marketing: [
    '/admin/marketing-hub', '/admin/web-traffic', '/admin/links',
    '/admin/messages', '/admin/workout-settings', '/admin/notifications',
    '/admin/content-matrix', '/admin/content-status', '/admin/media-library',
    '/admin/simulator', '/admin/workout-simulator', '/admin/unreachable-exercises',
  ],
  // analytics/statistics/insights redirect to the journey (next.config.mjs)
  product: ['/admin/journey', '/admin/analytics', '/admin/statistics', '/admin/insights', '/admin/users/all'],
  dev: [
    '/admin/locations', '/admin/parks', '/admin/routes', '/admin/exercises', '/admin/programs',
    '/admin/levels', '/admin/progression-manager', '/admin/level-equivalence', '/admin/gym-equipment',
    '/admin/brands', '/admin/gear-definitions', '/admin/questionnaire', '/admin/visual-assessment',
    '/admin/assessment-rules', '/admin/program-thresholds', '/admin/demo-seed', '/admin/schools',
    '/admin/running',
    '/admin/admins-management', '/admin/users', '/admin/audit-logs', '/admin/system-settings', '/admin/access-codes',
  ],
  finance: ['/admin/finance'],
  municipal: ['/admin/authorities', '/admin/approval-center', '/admin/authority-manager', '/admin/pressure-messages', '/admin/authority/reports', '/admin/heatmap'],
  military: ['/admin/authority/readiness'],
  educational: ['/admin/authority/grades', '/admin/photo-release'],
};

/**
 * Screens that belong to a section for the sidebar highlight only — linked
 * there for super/root admins, never granted to a platform member.
 */
const HIGHLIGHT_ONLY: Partial<Record<AdminSectionId, string[]>> = {
  product: ['/admin/community-groups-overview', '/admin/goal-notes'],
  dev: ['/admin/agents', '/admin/signup-failures', '/admin/ai-coach', '/admin/costs'],
};

/** Legacy Firestore section keys still stored on some members (backward compat). */
export const LEGACY_SECTION_PATHS: Record<string, string[]> = {
  platform: ['/admin/organizations', '/admin/admin-directory', '/admin/access-codes'],
  appCore: [
    '/admin/locations', '/admin/parks', '/admin/routes', '/admin/exercises', '/admin/programs', '/admin/levels',
    '/admin/progression-manager', '/admin/level-equivalence', '/admin/gym-equipment', '/admin/brands',
    '/admin/gear-definitions', '/admin/questionnaire', '/admin/visual-assessment', '/admin/assessment-rules',
    '/admin/program-thresholds', '/admin/demo-seed',
  ],
  running: ['/admin/running'],
  production: ['/admin/content-matrix', '/admin/unreachable-exercises', '/admin/content-status', '/admin/media-library'],
  brandComm: ['/admin/messages', '/admin/workout-settings', '/admin/simulator', '/admin/workout-simulator', '/admin/links'],
  system: ['/admin/admins-management', '/admin/users', '/admin/audit-logs', '/admin/system-settings', '/admin/journey', '/admin/analytics', '/admin/users/all', '/admin/statistics', '/admin/insights'],
};

/** Paths matched exactly — a prefix would swallow sibling screens of another section. */
const EXACT_PATHS = new Set(['/admin', '/admin/users']);

export function pathMatches(sectionPath: string, pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  if (EXACT_PATHS.has(sectionPath)) return pathname === sectionPath;
  return pathname === sectionPath || pathname.startsWith(`${sectionPath}/`) || pathname.startsWith(`${sectionPath}?`);
}

/** every path a member with these section keys (new or legacy) may open */
export function allowedPathsFor(sectionKeys: string[]): string[] {
  return sectionKeys.flatMap((k) => SECTION_PATHS[k as AdminSectionId] ?? LEGACY_SECTION_PATHS[k] ?? []);
}

export function isPathAllowed(sectionKeys: string[], pathname: string | null | undefined): boolean {
  return allowedPathsFor(sectionKeys).some((p) => pathMatches(p, pathname));
}

/** sidebar highlight: does this section own the current screen? */
export function sectionOwnsPath(section: AdminSectionId, pathname: string | null | undefined): boolean {
  return [...SECTION_PATHS[section], ...(HIGHLIGHT_ONLY[section] ?? [])].some((p) => pathMatches(p, pathname));
}
