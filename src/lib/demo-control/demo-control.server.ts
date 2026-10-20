import 'server-only';
/**
 * Demo control center — Admin SDK reads/writes for /api/admin/demo/** (super admin only;
 * the routes check that). demo_registry is closed to every client by firestore.rules, so
 * this file is the panel's only path to it. Every read is bounded:
 *   - flags / config / control: 3 single-doc gets
 *   - usage: ONE query, newest 31 day docs (today + the 30 before = any month to date)
 *   - demo users: ONE query on the `demo_` uid range, projected to lastActive, limit 500
 */
import { FieldPath, FieldValue, type Firestore } from 'firebase-admin/firestore';
import { getIsraelDateKey } from '@/lib/israelTime';
import { DEMO_UID_PREFIX } from '@/lib/demo';
import {
  DEFAULT_TESTER_WORKFLOW,
  DEMO_CONFIG_DOC,
  DEMO_CONTROL_DOC,
  DEMO_REGISTRY,
  DEMO_USAGE_DAYS,
  DEMO_USAGE_DOC,
  USAGE_WINDOW_DAYS,
  type DispatchableWorkflow,
} from './paths';
import { buildDemoStatus, type DemoStatusPayload } from './status';
import type { DemoConfig } from './usage-cost';
import { dispatchWorkflow, type DispatchErrorCode } from './github-dispatch';

export const DEMO_USERS_READ_LIMIT = 500;
/** First code point after '_' — the `demo_` uid range is [demo_, demo`). */
const DEMO_UID_RANGE_END = `${DEMO_UID_PREFIX.slice(0, -1)}\``;

function millisOf(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (v instanceof Date) return v.getTime();
  const maybe = v as { toMillis?: () => number } | null;
  return maybe && typeof maybe.toMillis === 'function' ? maybe.toMillis() : null;
}

const registry = (db: Firestore) => db.collection(DEMO_REGISTRY);
const usageDays = (db: Firestore) => registry(db).doc(DEMO_USAGE_DOC).collection(DEMO_USAGE_DAYS);

export function isDispatchConfigured(): boolean {
  return !!process.env.GITHUB_DISPATCH_TOKEN?.trim();
}

export async function loadDemoStatus(db: Firestore, now = new Date()): Promise<DemoStatusPayload> {
  const [flagsSnap, configSnap, controlSnap, usageSnap, usersSnap] = await Promise.all([
    db.collection('system_config').doc('feature_flags').get(),
    registry(db).doc(DEMO_CONFIG_DOC).get(),
    registry(db).doc(DEMO_CONTROL_DOC).get(),
    usageDays(db).orderBy(FieldPath.documentId(), 'desc').limit(USAGE_WINDOW_DAYS).get(),
    db
      .collection('users')
      .where(FieldPath.documentId(), '>=', DEMO_UID_PREFIX)
      .where(FieldPath.documentId(), '<', DEMO_UID_RANGE_END)
      .select('lastActive')
      .limit(DEMO_USERS_READ_LIMIT)
      .get(),
  ]);

  return buildDemoStatus({
    nowMs: now.getTime(),
    todayKey: getIsraelDateKey(now),
    flagsRaw: flagsSnap.data(),
    configRaw: configSnap.data(),
    controlRaw: controlSnap.data(),
    usageDocs: usageSnap.docs.map((d) => ({ id: d.id, data: d.data() })),
    demoUserActiveDays: usersSnap.docs.map((d) => {
      const ms = millisOf(d.get('lastActive'));
      return ms === null ? null : getIsraelDateKey(new Date(ms));
    }),
    demoUsersCapped: usersSnap.size >= DEMO_USERS_READ_LIMIT,
    dispatchConfigured: isDispatchConfigured(),
  });
}

/** Best-effort audit row (same shape as the other admin routes); never blocks the action. */
async function audit(db: Firestore, uid: string, details: string, newValue: unknown): Promise<void> {
  try {
    await db.collection('audit_logs').add({
      adminId: uid,
      adminName: 'super_admin',
      actionType: 'UPDATE',
      targetEntity: 'DemoControl',
      targetId: DEMO_REGISTRY,
      details,
      oldValue: null,
      newValue: newValue ?? null,
      timestamp: new Date(),
    });
  } catch (err) {
    console.error('[demo-control] audit failed (best-effort)', err instanceof Error ? err.name : 'unknown');
  }
}

export async function saveDemoConfig(db: Firestore, uid: string, config: DemoConfig): Promise<void> {
  // Full replace of caps + prices (the panel always sends the whole table), so a model
  // removed in the panel is really removed.
  await registry(db).doc(DEMO_CONFIG_DOC).set(
    { caps: config.caps, prices: config.prices, updatedAt: FieldValue.serverTimestamp(), updatedBy: uid },
    { merge: false },
  );
  await audit(db, uid, 'Saved demo caps / price table via /admin/demo', config);
}

export async function requestTesterStop(db: Firestore, uid: string): Promise<void> {
  await registry(db).doc(DEMO_CONTROL_DOC).set(
    { testersStopRequested: true, stopRequestedAt: FieldValue.serverTimestamp(), stopRequestedBy: uid },
    { merge: true },
  );
  await audit(db, uid, 'Requested AI testers stop via /admin/demo', { testersStopRequested: true });
}

export type StartRunResult =
  | { ok: true }
  | { ok: false; status: number; error: 'switch_off' | 'cap_reached' | DispatchErrorCode };

/**
 * A tester run starts only when BOTH switches are on and no money / session cap is
 * reached (checked here, again by the runner). Clears the stop flag, then dispatches.
 */
export async function startTesterRun(
  db: Firestore,
  uid: string,
  workflow: DispatchableWorkflow = DEFAULT_TESTER_WORKFLOW,
  fetchImpl?: typeof fetch,
): Promise<StartRunResult> {
  const status = await loadDemoStatus(db);
  if (!status.switches.enable_demo_users || !status.switches.enable_ai_testers) {
    return { ok: false, status: 409, error: 'switch_off' };
  }
  if (status.caps.blocksTesterRun) return { ok: false, status: 409, error: 'cap_reached' };
  if (!isDispatchConfigured()) return { ok: false, status: 503, error: 'dispatch_not_configured' };

  const control = registry(db).doc(DEMO_CONTROL_DOC);
  await control.set({ testersStopRequested: false }, { merge: true });

  const result = await dispatchWorkflow({
    token: process.env.GITHUB_DISPATCH_TOKEN,
    repo: process.env.GITHUB_DISPATCH_REPO,
    ref: process.env.GITHUB_DISPATCH_REF,
    workflow,
    inputs: { requested_by: uid },
    fetchImpl,
  });

  await control.set(
    {
      lastDispatch: {
        at: FieldValue.serverTimestamp(),
        by: uid,
        workflow,
        ok: result.ok,
        error: result.ok ? null : result.code,
      },
    },
    { merge: true },
  );
  await audit(db, uid, `Dispatched ${workflow} via /admin/demo (${result.ok ? 'ok' : result.code})`, null);

  if (result.ok) return { ok: true };
  const httpStatus = result.code === 'dispatch_not_configured' ? 503 : result.code === 'workflow_not_found' ? 404 : 502;
  return { ok: false, status: httpStatus, error: result.code };
}
