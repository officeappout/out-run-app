/**
 * page-map — the admin assistant's view of src/generated/admin-page-map.json (wave 2).
 * Pure; safe in the browser (local navigation) and on the server (find_admin_page / navigate).
 *
 *   ADMIN_PAGES                  every map entry
 *   pagesVisibleTo(role)         navigable pages the caller may open (root sees root-only links)
 *   buildAdminHref(page, params, query)  the ONLY way a clickable href is made (validated)
 */
import pageMap from '@/generated/admin-page-map.json';
import type { AdminPageEntry, AdminPageMap } from '../../../scripts/admin-page-map/build-page-map';

export type { AdminPageEntry } from '../../../scripts/admin-page-map/build-page-map';

/** v1 callers of the assistant (requireAdminAiCaller). */
export type AdminAssistantRole = 'root' | 'super';

export const ADMIN_PAGES: AdminPageEntry[] = (pageMap as AdminPageMap).pages;

const BY_ID = new Map(ADMIN_PAGES.map((p) => [p.id, p]));

export function adminPageById(id: string): AdminPageEntry | null {
  return BY_ID.get(id) ?? null;
}

/**
 * Root and super admins pass the middleware for every /admin path; the sidebar additionally
 * hides root-only links from a super admin. Local manager links (authorityManagerLink) are a
 * sidebar shortcut for scoped roles — the page itself is open to a super admin, so it stays.
 */
export function canRoleSee(page: AdminPageEntry, role: AdminAssistantRole): boolean {
  if (!page.navigable) return false;
  if (page.audience === 'rootAdmin') return role === 'root';
  return true;
}

export function pagesVisibleTo(role: AdminAssistantRole, pages: AdminPageEntry[] = ADMIN_PAGES): AdminPageEntry[] {
  return pages.filter((p) => canRoleSee(p, role));
}

const PARAM_VALUE = /^[A-Za-z0-9_-]{1,128}$/;
const QUERY_KEY = /^[A-Za-z][A-Za-z0-9_]{0,31}$/;

export type BuildHrefResult = { ok: true; href: string } | { ok: false; error: string };

/**
 * Builds the href for a page. Every [param] must be given and match a safe id shape; the value
 * is URI-encoded anyway. Extra query keys are allowed only with simple names and ≤200-char
 * values. The result always starts with /admin. A page's own ?type= is kept.
 */
export function buildAdminHref(
  page: AdminPageEntry,
  params: Record<string, string> = {},
  query: Record<string, string> = {},
): BuildHrefResult {
  let path = page.path;
  for (const name of page.params) {
    const v = params[name];
    if (typeof v !== 'string' || !PARAM_VALUE.test(v)) return { ok: false, error: `missing or invalid param "${name}"` };
    path = path.replace(`[${name}]`, encodeURIComponent(v));
  }
  if (!path.startsWith('/admin')) return { ok: false, error: 'not an admin path' };
  const own = page.href.includes('?') ? new URLSearchParams(page.href.split('?')[1]) : new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (!QUERY_KEY.test(k) || typeof v !== 'string' || v.length > 200) return { ok: false, error: `invalid query "${k}"` };
    own.set(k, v);
  }
  const qs = own.toString();
  return { ok: true, href: qs ? `${path}?${qs}` : path };
}
