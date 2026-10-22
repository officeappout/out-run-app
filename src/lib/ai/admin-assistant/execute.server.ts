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
import { validateAdminToolInput } from './tools';
import { capToolResult, numbersIn, wrapToolData } from './tool-result';
import type { EvidenceItem } from './sse';

export interface AdminToolContext {
  uid: string;
  role: AdminAssistantRole;
  db: Firestore;
  now: Date;
}

export interface AdminToolExecution {
  /** the tool_result content (already wrapped in <tool_data>) */
  content: string;
  isError: boolean;
  /** a clickable link for the drawer (navigate only) */
  link?: { href: string; title: string; pageId: string };
  evidence?: EvidenceItem;
  resultChars: number;
  truncated: boolean;
}

function errorResult(message: string): AdminToolExecution {
  const json = JSON.stringify({ error: message });
  return { content: wrapToolData(json), isError: true, resultChars: json.length, truncated: false };
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
      numbers: numbersIn(res.value),
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
      default:
        return errorResult(`unknown tool ${name}`);
    }
  } catch (err) {
    console.error(`[admin-ai] tool ${name} failed`, err);
    return errorResult(`${name} failed`);
  }
}
