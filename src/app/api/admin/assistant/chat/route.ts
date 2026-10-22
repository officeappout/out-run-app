/**
 * POST /api/admin/assistant/chat — one question to the admin-panel assistant, answered as a
 * Server-Sent-Events stream (src/lib/ai/admin-assistant/sse.ts). Plan:
 * docs/admin/ADMIN-AI-ASSISTANT-PLAN.md (wave 3).
 *
 * Gate order (every step fails closed):
 *   requireAdminAiCaller  — a PERSON who is root or super admin + flag admin_ai_assistant_v1
 *   prepareAdminModelCall — priced model, ANTHROPIC_API_KEY_ADMIN, kill switch, global + admin
 *                           daily budget, per-admin rate limit
 * Body: { question: string (1..1000), localKind?: 'data_question'|'no_match'|'empty'|'forced',
 *         currentPath?: string|null (an /admin path, context only) }
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminDb } from '@/lib/firebase-admin';
import { requireAdminAiCaller } from '@/lib/ai/admin-assistant/gate.server';
import { prepareAdminModelCall } from '@/lib/ai/admin-assistant/budget.server';
import { AdminAiUnavailableError, ADMIN_AI_UNAVAILABLE_HE, adminAiStatusOf } from '@/lib/ai/admin-assistant/errors';
import { ADMIN_AI_QUESTION_MAX_CHARS } from '@/lib/ai/admin-assistant/limits';
import { runChatTurn } from '@/lib/ai/admin-assistant/chat-turn.server';
import { encodeSse, type AdminAssistantEvent } from '@/lib/ai/admin-assistant/sse';
import { writeAdminAudit } from '@/lib/ai/admin-assistant/audit.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const Body = z
  .object({
    question: z.string().trim().min(1).max(ADMIN_AI_QUESTION_MAX_CHARS),
    localKind: z.enum(['data_question', 'no_match', 'empty', 'forced']).default('no_match'),
    currentPath: z
      .string()
      .max(200)
      .regex(/^\/admin(?:[/?#][^\s]*)?$/)
      .nullable()
      .optional(),
  })
  .strict();

export async function POST(request: NextRequest) {
  const caller = await requireAdminAiCaller(request);
  if (caller instanceof NextResponse) return caller;

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await request.json());
  } catch {
    return NextResponse.json({ error: 'bad_request', message: 'שאלה לא תקינה (1-1000 תווים).' }, { status: 400 });
  }

  const db = getAdminDb();
  let grant;
  try {
    grant = await prepareAdminModelCall(caller.uid, { db });
  } catch (err) {
    if (err instanceof AdminAiUnavailableError) {
      return NextResponse.json(
        { error: 'unavailable', code: err.reason, message: ADMIN_AI_UNAVAILABLE_HE[err.reason] },
        { status: adminAiStatusOf(err.reason), ...(err.retryAfterSec ? { headers: { 'Retry-After': String(err.retryAfterSec) } } : {}) },
      );
    }
    console.error('[admin-ai] prepare failed', err);
    return NextResponse.json({ error: 'unavailable', code: 'config_unavailable', message: ADMIN_AI_UNAVAILABLE_HE.config_unavailable }, { status: 503 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (ev: AdminAssistantEvent) => {
        try {
          controller.enqueue(encoder.encode(encodeSse(ev)));
        } catch {
          /* client went away — the turn still completes and is saved */
        }
      };
      try {
        await runChatTurn(db, grant, { uid: caller.uid, role: caller.role, question: body.question, localKind: body.localKind, currentPath: body.currentPath ?? null }, emit);
      } catch (err) {
        console.error('[admin-ai] turn failed', err);
        await writeAdminAudit(db, { uid: caller.uid, question: body.question, route: 'error', tools: [], model: grant.model, usage: null, modelCalls: 0, costUsd: 0, guardFailed: null, errorCode: 'turn_failed' });
        emit({ type: 'error', code: 'turn_failed', message: 'משהו השתבש. נסה שוב.' });
      } finally {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
