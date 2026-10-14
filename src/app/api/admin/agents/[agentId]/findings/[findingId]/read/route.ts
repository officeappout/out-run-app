/**
 * POST /api/admin/agents/[agentId]/findings/[findingId]/read — root-only.
 * Marks one finding as read. No body is read: the finding is identified by
 * the path alone.
 * Security contract: src/lib/agentsPanelServer.ts header.
 * Audit: FAIL-CLOSED — the audit row and the readAt update commit in one
 * transaction (markFindingRead); if it fails, nothing is written → 500.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import {
  GENERIC_FORBIDDEN,
  gateAgentsRequest,
  isAgentsPanelRateLimited,
  isValidAgentId,
  isValidFindingId,
  markFindingRead,
} from '@/lib/agentsPanelServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };

export async function POST(
  request: NextRequest,
  { params }: { params: { agentId: string; findingId: string } },
) {
  try {
    const gate = await gateAgentsRequest(request.headers.get('Authorization'), (t) =>
      getAdminAuth().verifyIdToken(t, true),
    );
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status, headers: NO_STORE });
    if (!isValidAgentId(params.agentId) || !isValidFindingId(params.findingId)) {
      return NextResponse.json({ error: GENERIC_FORBIDDEN }, { status: 403, headers: NO_STORE });
    }

    const db = getAdminDb();
    const rl = await isAgentsPanelRateLimited(db, gate.caller.uid);
    if (rl.blocked) {
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: { ...NO_STORE, 'Retry-After': String(rl.retryAfterSec) } },
      );
    }

    const result = await markFindingRead(db, gate.caller, params.agentId, params.findingId);
    return NextResponse.json(result.body, { status: result.status, headers: NO_STORE });
  } catch (err) {
    console.error('[api/admin/agents/findings/read] failed', err instanceof Error ? err.name : 'unknown');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: NO_STORE });
  }
}
