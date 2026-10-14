/**
 * GET /api/admin/agents — root-only. Health + unread count for every agent
 * in the registry (src/features/admin/agents/agent-registry.ts).
 * Security contract: src/lib/agentsPanelServer.ts header. No audit row —
 * this returns counts/health only, no finding content.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import {
  computeAgentsOverview,
  gateAgentsRequest,
  isAgentsPanelRateLimited,
} from '@/lib/agentsPanelServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };

export async function GET(request: NextRequest) {
  try {
    const gate = await gateAgentsRequest(request.headers.get('Authorization'), (t) =>
      getAdminAuth().verifyIdToken(t, true),
    );
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status, headers: NO_STORE });

    const db = getAdminDb();
    const rl = await isAgentsPanelRateLimited(db, gate.caller.uid);
    if (rl.blocked) {
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: { ...NO_STORE, 'Retry-After': String(rl.retryAfterSec) } },
      );
    }

    const agents = await computeAgentsOverview(db);
    return NextResponse.json({ agents }, { headers: NO_STORE });
  } catch (err) {
    console.error('[api/admin/agents] failed', err instanceof Error ? err.name : 'unknown');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: NO_STORE });
  }
}
