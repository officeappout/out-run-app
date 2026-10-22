/**
 * chat-turn.server — one question through the assistant, from a verified caller to stream
 * events. Called by POST /api/admin/assistant/chat (which owns auth + the HTTP stream).
 *
 * Path (cheapest first, plan §2.1):
 *   1. the drawer already tried local navigation; if it said "data question" we go straight to
 *      the model, else Haiku routes: nav → find_admin_page buttons (no Sonnet) | quick → a chip
 *      card (no Sonnet) | out → a fixed line | model
 *   2. Sonnet 5.5 loop (turn.ts) with the wave-3 tools
 * Every path writes one audit row; the model path also stores both messages in the thread.
 */
import 'server-only';
import type Anthropic from '@anthropic-ai/sdk';
import type { Firestore } from 'firebase-admin/firestore';
import { getIsraelDateKey } from '@/lib/israelTime';
import { withPromptCaching } from '@/lib/ai/anthropic.server';
import { pagesVisibleTo, buildAdminHref, type AdminAssistantRole } from '@/lib/admin-nav/page-map';
import { searchAdminPages } from '@/lib/admin-nav/fuzzy-search';
import type { AdminModelGrant } from './budget.server';
import { adminAssistantSystemPrompt, sessionContextText } from './prompt';
import { adminToolDefinitions } from './tools';
import { executeAdminTool } from './execute.server';
import { runAdminTurn } from './turn';
import { routeQuestion } from './router.server';
import { computeQuickCard } from './quick-metrics.server';
import { appendAdminMessage, historyMessages, loadAdminThread, maybeRollAdminSummary } from './thread-store.server';
import { writeAdminAudit } from './audit.server';
import { streamAdminModelCall } from './model-call.server';
import type { AdminAssistantEvent } from './sse';

export const OUT_OF_SCOPE_TEXT_HE =
  'אני עוזר של פאנל הניהול של OUT: למצוא עמודים, לענות על מספרים מהפאנל ולעזור להבין אותם. על זה אשמח לעזור.';
export const NAV_FOUND_TEXT_HE = 'אלה העמודים שמצאתי:';

export interface ChatTurnRequest {
  uid: string;
  role: AdminAssistantRole;
  question: string;
  /** what the drawer's local navigation decided before sending */
  localKind: 'data_question' | 'no_match' | 'empty' | 'forced';
  currentPath: string | null;
}

export async function runChatTurn(
  db: Firestore,
  grant: AdminModelGrant,
  req: ChatTurnRequest,
  emit: (ev: AdminAssistantEvent) => void,
  now: Date = new Date(),
): Promise<void> {
  const { uid, role, question } = req;
  let routerCost = 0;

  // ── 1. router (only when the drawer didn't already call it a data question) ──
  if (req.localKind !== 'data_question') {
    const { decision, costUsd } = await routeQuestion(grant.client, uid, question);
    routerCost = costUsd;
    if (decision.kind === 'nav') {
      const pages = searchAdminPages(question, pagesVisibleTo(role), 3);
      const links = pages
        .map((p) => ({ built: buildAdminHref(p.page), page: p.page }))
        .filter((x): x is { built: { ok: true; href: string }; page: typeof x.page } => x.built.ok)
        .map((x) => ({ href: x.built.href, title: x.page.title, pageId: x.page.id }));
      if (links.length) {
        emit({ type: 'text', delta: NAV_FOUND_TEXT_HE });
        links.forEach((l) => emit({ type: 'link', ...l }));
        const auditId = await writeAdminAudit(db, { uid, question, route: 'router_nav', tools: [], model: null, usage: null, modelCalls: 1, costUsd: routerCost, guardFailed: null }, now);
        emit({ type: 'done', route: 'router_nav', auditId, costUsd: routerCost, unverified: false });
        return;
      }
    } else if (decision.kind === 'quick') {
      const card = await computeQuickCard(db, decision.metric, role, { now });
      emit({ type: 'quick', card });
      const auditId = await writeAdminAudit(db, { uid, question, route: 'router_quick', tools: [{ name: `quick:${decision.metric}`, input: '{}', resultChars: JSON.stringify(card).length, isError: !!card.unavailable, truncated: false }], model: null, usage: null, modelCalls: 1, costUsd: routerCost, guardFailed: null }, now);
      emit({ type: 'done', route: 'router_quick', auditId, costUsd: routerCost, unverified: false });
      return;
    } else if (decision.kind === 'out_of_scope') {
      emit({ type: 'text', delta: OUT_OF_SCOPE_TEXT_HE });
      const auditId = await writeAdminAudit(db, { uid, question, route: 'out_of_scope', tools: [], model: null, usage: null, modelCalls: 1, costUsd: routerCost, guardFailed: null }, now);
      emit({ type: 'done', route: 'out_of_scope', auditId, costUsd: routerCost, unverified: false });
      return;
    }
  }

  // ── 2. the main model ──
  const thread = await loadAdminThread(db, uid);
  const cached = withPromptCaching({ system: adminAssistantSystemPrompt(), tools: adminToolDefinitions() });
  const system: Anthropic.TextBlockParam[] = [
    ...cached.system,
    { type: 'text', text: sessionContextText({ todayKey: getIsraelDateKey(now), role, currentPath: null, summary: thread.summary }) },
  ];
  const userText = req.currentPath ? `${question}\n\n(עמוד נוכחי: ${req.currentPath})` : question;
  const messages: Anthropic.MessageParam[] = [...historyMessages(thread), { role: 'user', content: [{ type: 'text', text: userText }] }];

  await appendAdminMessage(db, uid, { role: 'user', text: question, links: [] }, now);
  const outcome = await runAdminTurn(
    { model: grant.model, system, tools: cached.tools ?? [], messages },
    {
      callModel: (params, onText) => streamAdminModelCall(grant.client, uid, params, onText),
      executeTool: (name, input) => executeAdminTool({ uid, role, db, now }, name, input),
      emit,
    },
  );

  // The "number not from a tool" guard lands in wave 4; until then nothing is checked.
  const guard = { checked: false, ok: true };
  if (outcome.evidence.length) emit({ type: 'evidence', items: outcome.evidence });
  const costUsd = outcome.costUsd + routerCost;
  const auditId = await writeAdminAudit(
    db,
    {
      uid,
      question,
      route: 'model',
      tools: outcome.tools,
      model: grant.model,
      usage: outcome.usage,
      modelCalls: outcome.modelCalls + (req.localKind === 'data_question' ? 0 : 1),
      costUsd,
      guardFailed: guard.checked ? !guard.ok : null,
      stoppedBy: outcome.stoppedBy,
    },
    now,
  );
  await appendAdminMessage(
    db,
    uid,
    { role: 'assistant', text: outcome.text.trim(), links: outcome.links, evidence: outcome.evidence, auditId, unverified: guard.checked && !guard.ok },
    now,
  );
  emit({ type: 'done', route: 'model', auditId, costUsd, unverified: guard.checked && !guard.ok });
  await maybeRollAdminSummary(db, grant.client, uid, thread);
}
