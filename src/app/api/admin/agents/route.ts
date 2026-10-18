/**
 * GET /api/admin/agents — root-only. Health + unread count for every agent
 * with findings, plus a read-only "last run" for every automation in the
 * registry (src/features/admin/agents/agent-registry.ts) — newest doc of
 * its status source, whitelisted fields only.
 * Security contract: src/lib/agentsPanelServer.ts header. No audit row —
 * this returns counts/health/timestamps only, no finding or user content.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import {
  computeAgentsOverview,
  computeAutomationStatuses,
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

    const [agents, automations] = await Promise.all([
      computeAgentsOverview(db),
      computeAutomationStatuses(db),
    ]);
    return NextResponse.json({ agents, automations }, { headers: NO_STORE });
  } catch (err) {
    console.error('[api/admin/agents] failed', err instanceof Error ? err.name : 'unknown');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: NO_STORE });
  }
}
