/**
 * content-links.server — the buttons shown next to a route / park answer. Only pages the
 * caller may open; every href goes through buildAdminHref.
 *   route → approval center (when it waits for approval) or "מיקומים ומסלולים", + the city-mapping
 *           hub focused on its authority (plain city-mapping page when the hub flag is off)
 *   park  → the park edit page, + the same hub link
 */
import 'server-only';
import { adminPageById, buildAdminHref, canRoleSee } from '@/lib/admin-nav/page-map';
import { getServerFeatureFlags } from '@/lib/ai/entitlement.server';
import type { AdminToolContext, AdminToolLink } from './execute.server';

async function hubLink(ctx: AdminToolContext, authorityId: string | null, authorityName: string | null): Promise<AdminToolLink | null> {
  if (!authorityId) return null;
  const hubOn = (await getServerFeatureFlags(ctx.db)).enableCityMappingHub === true;
  const page = adminPageById(hubOn ? 'admin/city-mapping/hub' : 'admin/city-mapping');
  if (!page || !canRoleSee(page, ctx.role)) return null;
  const built = buildAdminHref(page, {}, hubOn ? { authority: authorityId } : {});
  if (!built.ok) return null;
  return { href: built.href, title: hubOn && authorityName ? `מרכז מיפוי · ${authorityName}` : page.title, pageId: page.id };
}

function plain(ctx: AdminToolContext, pageId: string, params: Record<string, string> = {}, title?: (t: string) => string): AdminToolLink | null {
  const page = adminPageById(pageId);
  if (!page || !canRoleSee(page, ctx.role)) return null;
  const built = buildAdminHref(page, params);
  if (!built.ok) return null;
  return { href: built.href, title: title ? title(page.title) : page.title, pageId: page.id };
}

export async function routeLinks(ctx: AdminToolContext, r: { status: string; authorityId: string | null; authority: string | null }): Promise<AdminToolLink[]> {
  const main = r.status === 'pending' ? plain(ctx, 'admin/approval-center') : plain(ctx, 'admin/locations');
  return [main, await hubLink(ctx, r.authorityId, r.authority)].filter((x): x is AdminToolLink => x !== null);
}

export async function parkLinks(ctx: AdminToolContext, p: { id: string; name: string; authorityId: string | null; authority: string | null }): Promise<AdminToolLink[]> {
  const main = plain(ctx, 'admin/parks/[id]/edit', { id: p.id }, () => `עריכת פארק · ${p.name}`);
  return [main, await hubLink(ctx, p.authorityId, p.authority)].filter((x): x is AdminToolLink => x !== null);
}
