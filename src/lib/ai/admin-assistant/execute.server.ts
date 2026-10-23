/**
 * execute.server — runs ONE model-requested tool for a verified caller (plan §6.2).
 *   - the name must be in ADMIN_TOOLS (unknown → error, never executed)
 *   - the input is zod-validated again
 *   - the caller's role is re-checked against the tool's minRole BEFORE any read
 *   - scope comes from ctx (the verified session), never from the model
 *   - failures become an error result (is_error), never a fake 0
 */
import 'server-only';
import type { Firestore } from 'firebase-admin/firestore';
import { adminPageById, buildAdminHref, canRoleSee, pagesVisibleTo, type AdminAssistantRole } from '@/lib/admin-nav/page-map';
import { searchAdminPages } from '@/lib/admin-nav/fuzzy-search';
import { getAiCosts, getAttentionQueue, getCrmPipeline, getPendingApprovals } from '@/lib/admin-analytics/ops-metrics.server';
import type { MetricResult } from '@/lib/admin-analytics/meta';
import {
  getNorthStar,
  getOnboardingStall,
  getPushFunnel,
  getPushPerformance,
  getRetentionCohorts,
  getRetentionDrivers,
} from '@/lib/admin-analytics/product-metrics.server';
import type { NorthStarFilters } from '@/lib/admin-analytics/north-star.server';
import { getAuthorityOverview } from '@/lib/admin-analytics/authority-overview.server';
import { compareAuthorities, resolveOneAuthority } from '@/lib/admin-analytics/authority-compare.server';
import { getAuthoritiesRanking, type RankingDirection, type RankingKind, type RankingMetric } from '@/lib/admin-analytics/authority-ranking.server';
import { computeCrmTimeline } from '@/lib/admin-analytics/crm-timeline.server';
import { getFinanceOverview } from '@/lib/admin-analytics/finance-overview.server';
import { getSignupsOverview, getWorkoutsOverview } from '@/lib/admin-analytics/users-activity.server';
import { getUserLookup } from '@/lib/admin-analytics/user-lookup.server';
import { getRouteOverview } from '@/lib/admin-analytics/route-overview.server';
import { getParkOverview } from '@/lib/admin-analytics/park-overview.server';
import { getContentLeaderboard, type LeaderboardBy, type LeaderboardKind } from '@/lib/admin-analytics/content-leaderboard.server';
import type { ContentLookup } from '@/lib/admin-analytics/content-common.server';
import { parkLinks, routeLinks } from './content-links.server';
import { getServerFeatureFlags } from '@/lib/ai/entitlement.server';
import { validateAdminToolInput } from './tools';
import { capToolResult, numbersIn, wrapToolData } from './tool-result';
import type { EvidenceItem } from './sse';

export interface AdminToolContext {
  uid: string;
  role: AdminAssistantRole;
  db: Firestore;
  now: Date;
}

export interface AdminToolLink {
  href: string;
  title: string;
  pageId: string;
}

export interface AdminToolExecution {
  /** the tool_result content (already wrapped in <tool_data>) */
  content: string;
  isError: boolean;
  /** a clickable link for the drawer (navigate) */
  link?: AdminToolLink;
  /** several clickable links (get_authority_overview) */
  links?: AdminToolLink[];
  evidence?: EvidenceItem;
  resultChars: number;
  truncated: boolean;
}

function errorResult(message: string): AdminToolExecution {
  const json = JSON.stringify({ error: message });
  return { content: wrapToolData(json), isError: true, resultChars: json.length, truncated: false };
}

/**
 * Buttons for one authority: the city-mapping hub focused on it (?authority=<id>) when the hub
 * flag is on, else the plain city-mapping page; and its CRM detail page. Only pages the
 * caller may open; every href goes through buildAdminHref.
 */
export async function authorityLinks(ctx: AdminToolContext, authorityId: string, name: string): Promise<AdminToolLink[]> {
  const out: AdminToolLink[] = [];
  const hubOn = (await getServerFeatureFlags(ctx.db)).enableCityMappingHub === true;
  const mapping = adminPageById(hubOn ? 'admin/city-mapping/hub' : 'admin/city-mapping');
  if (mapping && canRoleSee(mapping, ctx.role)) {
    const built = buildAdminHref(mapping, {}, hubOn ? { authority: authorityId } : {});
    if (built.ok) out.push({ href: built.href, title: hubOn ? `מרכז מיפוי · ${name}` : mapping.title, pageId: mapping.id });
  }
  const crm = adminPageById('admin/authorities/[id]');
  if (crm && canRoleSee(crm, ctx.role)) {
    const built = buildAdminHref(crm, { id: authorityId });
    if (built.ok) out.push({ href: built.href, title: `ניהול רשות · ${name}`, pageId: crm.id });
  }
  return out;
}

function plainResult(obj: unknown): AdminToolExecution {
  const json = JSON.stringify(obj);
  return { content: wrapToolData(json), isError: false, resultChars: json.length, truncated: false };
}

function dataResult(tool: string, res: MetricResult<unknown>): AdminToolExecution {
  if (res.value === null) return errorResult(`${tool}: could not be computed right now (this is NOT zero)`);
  const { json, truncated } = capToolResult(res);
  return {
    content: wrapToolData(json),
    isError: false,
    resultChars: json.length,
    truncated,
    evidence: {
      tool,
      definitionId: res.meta.definitionId,
      period: res.meta.period,
      n: res.meta.n,
      belowThreshold: res.meta.belowThreshold,
      caveats: res.meta.caveats,
      numbers: [...numbersIn(res.value), ...(res.meta.minSample !== null ? [res.meta.minSample] : [])],
    },
  };
}

export async function executeAdminTool(ctx: AdminToolContext, name: string, rawInput: unknown): Promise<AdminToolExecution> {
  const v = validateAdminToolInput(name, rawInput);
  if (!v.ok) return errorResult(v.error);
  if (v.spec.minRole === 'root' && ctx.role !== 'root') return errorResult('not allowed for this admin');
  try {
    switch (name) {
      case 'find_admin_page': {
        const { query } = v.input as { query: string };
        const results = searchAdminPages(query, pagesVisibleTo(ctx.role), 5).map((r) => ({
          pageId: r.page.id,
          title: r.page.title,
          section: r.page.sectionLabel,
          needsId: r.page.params.length > 0,
          score: r.score,
        }));
        const json = JSON.stringify({ results });
        return { content: wrapToolData(json), isError: false, resultChars: json.length, truncated: false };
      }
      case 'navigate': {
        const { pageId, id } = v.input as { pageId: string; id: string | null };
        const page = adminPageById(pageId);
        if (!page || !canRoleSee(page, ctx.role)) return errorResult('unknown page id — call find_admin_page first');
        const built = buildAdminHref(page, page.params.length ? { [page.params[0]]: id ?? '' } : {});
        if (!built.ok) return errorResult(built.error);
        const json = JSON.stringify({ ok: true, title: page.title, shownToUser: true });
        return { content: wrapToolData(json), isError: false, resultChars: json.length, truncated: false, link: { href: built.href, title: page.title, pageId: page.id } };
      }
      case 'get_attention_queue':
        return dataResult(name, await getAttentionQueue(ctx.db, { isRoot: ctx.role === 'root', now: ctx.now }));
      case 'get_pending_approvals':
        return dataResult(name, await getPendingApprovals(ctx.db, { now: ctx.now }));
      case 'get_crm_pipeline':
        return dataResult(name, await getCrmPipeline(ctx.db, { now: ctx.now }));
      case 'get_ai_costs':
        return dataResult(name, await getAiCosts(ctx.db, { now: ctx.now }));
      case 'get_north_star':
        return dataResult(name, await getNorthStar(ctx.db, v.input as NorthStarFilters, { now: ctx.now }));
      case 'get_retention_cohorts':
        return dataResult(name, await getRetentionCohorts(ctx.db, { now: ctx.now }));
      case 'get_retention_drivers':
        return dataResult(name, await getRetentionDrivers(ctx.db, { now: ctx.now }));
      case 'get_onboarding_stall': {
        const { days } = v.input as { days: number | null };
        return dataResult(name, await getOnboardingStall(ctx.db, { days: days ?? undefined }, { now: ctx.now }));
      }
      case 'get_push_performance': {
        const { channel, days } = v.input as { channel: string | null; days: number | null };
        return dataResult(name, await getPushPerformance(ctx.db, { channel, days }, { now: ctx.now }));
      }
      case 'get_authority_overview': {
        const { query } = v.input as { query: string };
        const found = await getAuthorityOverview(ctx.db, query, { now: ctx.now });
        if (found.kind === 'unavailable') return errorResult(`${name}: could not be computed right now (this is NOT zero)`);
        if (found.kind !== 'resolved') {
          const json = JSON.stringify(
            found.kind === 'ambiguous'
              ? { resolved: false, candidates: found.candidates, note: 'several authorities match — ask the admin which one, or call again with the id' }
              : { resolved: false, candidates: [], note: 'no authority with this name — ask the admin to check the spelling' },
          );
          return { content: wrapToolData(json), isError: false, resultChars: json.length, truncated: false };
        }
        const ov = found.result.value!;
        const links = await authorityLinks(ctx, ov.authority.id, ov.authority.name).catch(() => [] as AdminToolLink[]);
        const r = dataResult(name, {
          ...found.result,
          value: { matchedBy: found.matchedBy, ...ov, buttonsShownToUser: links.map((l) => l.title) },
        });
        return links.length ? { ...r, links } : r;
      }
      case 'get_signups_overview': {
        const i = v.input as { days: number; groupBy: 'day' | 'week'; authorityId: string | null; source: string | null };
        return dataResult(name, await getSignupsOverview(ctx.db, i, { now: ctx.now }));
      }
      case 'get_workouts_overview': {
        const i = v.input as { days: number; authorityId: string | null };
        return dataResult(name, await getWorkoutsOverview(ctx.db, i, { now: ctx.now }));
      }
      case 'get_user_lookup': {
        const { query } = v.input as { query: string };
        const found = await getUserLookup(ctx.db, query, { now: ctx.now });
        if (found.kind === 'unavailable') return errorResult(`${name}: could not be computed right now (this is NOT zero)`);
        if (found.kind !== 'resolved') {
          const json = JSON.stringify(
            found.kind === 'ambiguous'
              ? { resolved: false, candidates: found.candidates, moreMatchesExist: found.more, note: 'several users match — ask the admin which one (by masked email / city), or call again with the uid' }
              : { resolved: false, candidates: [], note: 'no user found — email must be the full address, a name must be the start of the display name' },
          );
          return { content: wrapToolData(json), isError: false, resultChars: json.length, truncated: false };
        }
        const profile = found.result.value!;
        const page = adminPageById('admin/users/[uid]');
        let link: AdminToolLink | undefined;
        if (page && canRoleSee(page, ctx.role)) {
          const built = buildAdminHref(page, { uid: profile.uid });
          if (built.ok) link = { href: built.href, title: `משתמש · ${profile.displayName ?? profile.uid}`, pageId: page.id };
        }
        const r = dataResult(name, { ...found.result, value: { matchedBy: found.matchedBy, ...profile, ...(link ? { buttonShownToUser: link.title } : {}) } });
        return link ? { ...r, link } : r;
      }
      case 'get_route_overview':
      case 'get_park_overview': {
        const { query } = v.input as { query: string };
        const isRoute = name === 'get_route_overview';
        const found: ContentLookup<any> = isRoute ? await getRouteOverview(ctx.db, query, { now: ctx.now }) : await getParkOverview(ctx.db, query, { now: ctx.now });
        if (found.kind === 'unavailable') return errorResult(`${name}: could not be computed right now (this is NOT zero)`);
        if (found.kind !== 'resolved') {
          const json = JSON.stringify(
            found.kind === 'ambiguous'
              ? { resolved: false, candidates: found.candidates, note: 'several records match — ask the admin which one, or call again with the id' }
              : { resolved: false, candidates: [], note: `no ${isRoute ? 'route' : 'park'} with this name — ask the admin to check the spelling` },
          );
          return { content: wrapToolData(json), isError: false, resultChars: json.length, truncated: false };
        }
        const ov = found.result.value!;
        const links = await (isRoute ? routeLinks(ctx, ov.route) : parkLinks(ctx, ov.park)).catch(() => [] as AdminToolLink[]);
        const r = dataResult(name, { ...found.result, value: { matchedBy: found.matchedBy, ...ov, buttonsShownToUser: links.map((l) => l.title) } });
        return links.length ? { ...r, links } : r;
      }
      case 'get_content_leaderboard':
        return dataResult(name, await getContentLeaderboard(ctx.db, v.input as { kind: LeaderboardKind; by: LeaderboardBy; authorityId: string | null; limit: number | null }, { now: ctx.now }));
      case 'get_push_funnel':
        return dataResult(name, await getPushFunnel(ctx.db, { now: ctx.now }));
      case 'compare_authorities': {
        const { ids_or_names } = v.input as { ids_or_names: string[] };
        const found = await compareAuthorities(ctx.db, ids_or_names, { now: ctx.now });
        if (found.kind === 'unavailable') return errorResult(`${name}: could not be computed right now (this is NOT zero)`);
        if (found.kind === 'too_few') return plainResult({ compared: false, note: found.note });
        if (found.kind === 'unresolved') {
          return plainResult({ compared: false, problems: found.problems, note: 'some names are ambiguous or unknown — ask the admin which authority they mean (use the candidates), then call again with ids' });
        }
        return dataResult(name, found.result);
      }
      case 'get_authorities_ranking': {
        const a = v.input as { by: RankingMetric; kind: RankingKind | null; direction: RankingDirection | null; limit: number | null };
        return dataResult(name, await getAuthoritiesRanking(ctx.db, a, { now: ctx.now }));
      }
      case 'get_crm_authority_timeline': {
        const { query } = v.input as { query: string };
        const r = await resolveOneAuthority(ctx.db, query);
        if (r.kind === 'ambiguous') return plainResult({ resolved: false, candidates: r.candidates, note: 'several authorities match — ask the admin which one, or call again with the id' });
        if (r.kind === 'none') return plainResult({ resolved: false, candidates: [], note: 'no authority with this name — ask the admin to check the spelling' });
        const res = await computeCrmTimeline(ctx.db, r.row.id, ctx.now);
        if (!res) return plainResult({ resolved: false, candidates: [], note: 'no authority with this name — ask the admin to check the spelling' });
        const links = (await authorityLinks(ctx, r.row.id, r.row.name).catch(() => [] as AdminToolLink[])).filter((l) => l.pageId === 'admin/authorities/[id]');
        const out = dataResult(name, { ...res, value: { matchedBy: r.matchedBy, ...res.value!, buttonsShownToUser: links.map((l) => l.title) } });
        return links.length ? { ...out, links } : out;
      }
      case 'get_finance_overview': {
        const { months } = v.input as { months: number | null };
        const out = dataResult(name, await getFinanceOverview(ctx.db, months, { now: ctx.now }));
        const page = adminPageById('admin/finance/expenses');
        const built = page && canRoleSee(page, ctx.role) ? buildAdminHref(page, {}) : null;
        return !out.isError && page && built?.ok ? { ...out, links: [{ href: built.href, title: page.title, pageId: page.id }] } : out;
      }
      default:
        return errorResult(`unknown tool ${name}`);
    }
  } catch (err) {
    console.error(`[admin-ai] tool ${name} failed`, err);
    return errorResult(`${name} failed`);
  }
}
