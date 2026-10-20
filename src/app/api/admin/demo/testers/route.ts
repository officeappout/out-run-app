/**
 * POST /api/admin/demo/testers — the AI tester run buttons on /admin/demo. Super admin only.
 *
 *   { action: 'run', workflow?: 'qa-testers.yml' }
 *       → both switches on + no cap reached → clears the stop flag and triggers the
 *         GitHub Actions workflow_dispatch. Clear errors when it can't:
 *         409 switch_off | cap_reached, 503 dispatch_not_configured (no GITHUB_DISPATCH_TOKEN),
 *         404 workflow_not_found (the workflow file isn't on main yet), 502 other GitHub errors.
 *   { action: 'stop' }
 *       → demo_registry/control.testersStopRequested = true; the runner polls it and exits.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdminApi, resolveAdminUid } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { requestTesterStop, startTesterRun } from '@/lib/demo-control/demo-control.server';
import { DEFAULT_TESTER_WORKFLOW, DISPATCHABLE_WORKFLOWS, type DispatchableWorkflow } from '@/lib/demo-control/paths';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isDispatchable(w: unknown): w is DispatchableWorkflow {
  return typeof w === 'string' && (DISPATCHABLE_WORKFLOWS as readonly string[]).includes(w);
}

export async function POST(request: NextRequest) {
  const denied = await requireSuperAdminApi(request);
  if (denied) return denied;
  const body = (await request.json().catch(() => null)) as { action?: unknown; workflow?: unknown } | null;
  const action = body?.action;
  if (action !== 'run' && action !== 'stop') return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  if (body?.workflow !== undefined && !isDispatchable(body.workflow)) {
    return NextResponse.json({ error: 'bad_workflow' }, { status: 400 });
  }
  const workflow = isDispatchable(body?.workflow) ? body.workflow : DEFAULT_TESTER_WORKFLOW;

  try {
    const db = getAdminDb();
    const uid = (await resolveAdminUid(request)) ?? 'agent';
    if (action === 'stop') {
      await requestTesterStop(db, uid);
      return NextResponse.json({ ok: true });
    }
    const result = await startTesterRun(db, uid, workflow);
    return result.ok
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: result.error }, { status: result.status });
  } catch (err) {
    console.error('[/api/admin/demo/testers] failed', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'action_failed' }, { status: 500 });
  }
}
