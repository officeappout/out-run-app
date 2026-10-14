/**
 * GET /api/admin/agents/[agentId]/findings?status=unread|all&limit=N
 * Root-only. Findings for one registered agent, newest first.
 * Security contract: src/lib/agentsPanelServer.ts header.
 * Audit: best-effort READ row (a failed audit write does not fail the read).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import {
  DEFAULT_FINDINGS_LIMIT,
  GENERIC_FORBIDDEN,
  auditFindingsListBestEffort,
  computeAgentFindings,
  gateAgentsRequest,
  isAgentsPanelRateLimited,
  isValidAgentId,
} from '@/lib/agentsPanelServer';
import type { FindingsStatusFilter } from '@/features/admin/agents/agent-findings.types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };

export async function GET(request: NextRequest, { params }: { params: { agentId: string } }) {
  try {
    const gate = await gateAgentsRequest(request.headers.get('Authorization'), (t) =>
      getAdminAuth().verifyIdToken(t, true),
    );
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status, headers: NO_STORE });
    if (!isValidAgentId(params.agentId)) {
      return NextResponse.json({ error: GENERIC_FORBIDDEN }, { status: 403, headers: NO_STORE });
    }

    const url = new URL(request.url);
    const status: FindingsStatusFilter = url.searchParams.get('status') === 'all' ? 'all' : 'unread';
    const limit = Number(url.searchParams.get('limit') ?? DEFAULT_FINDINGS_LIMIT);

    const db = getAdminDb();
    const rl = await isAgentsPanelRateLimited(db, gate.caller.uid);
    if (rl.blocked) {
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: { ...NO_STORE, 'Retry-After': String(rl.retryAfterSec) } },
      );
    }

    const findings = await computeAgentFindings(db, params.agentId, { status, limit });
    await auditFindingsListBestEffort(db, gate.caller, params.agentId, status, findings.length);
    return NextResponse.json({ findings }, { headers: NO_STORE });
  } catch (err) {
    console.error('[api/admin/agents/findings] failed', err instanceof Error ? err.name : 'unknown');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: NO_STORE });
  }
}
