import 'server-only';
/**
 * Demo control center — Admin SDK reads/writes for /api/admin/demo/** (super admin only;
 * the routes check that). demo_registry is closed to every client by firestore.rules, so
 * this file is the panel's only path to it. Every read is bounded:
 *   - flags / config / control / qa_summary: 4 single-doc gets
 *   - usage: ONE getAll of the 31 day docs by id (today + the 30 before = any month to date)
 *   - demo users: ONE query on the `demo_` uid range, projected to lastActive, limit 500
 */
import { FieldPath, FieldValue, type Firestore } from 'firebase-admin/firestore';
import { getIsraelDateKey } from '@/lib/israelTime';
import { DEMO_UID_PREFIX } from '@/lib/demo';
import {
  DEFAULT_TESTER_WORKFLOW,
  DEMO_CONFIG_DOC,
  DEMO_CONTROL_DOC,
  DEMO_QA_SUMMARY_DOC,
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

/** The last USAGE_WINDOW_DAYS Israel date keys, newest first (day docs are keyed by date). */
export function usageWindowKeys(now: Date, days = USAGE_WINDOW_DAYS): string[] {
  const keys: string[] = [];
  for (let i = 0; keys.length < days && i < days + 2; i++) {
    const k = getIsraelDateKey(new Date(now.getTime() - i * 86_400_000));
    if (!keys.includes(k)) keys.push(k);
  }
  return keys;
}

/** One failing read must not blank the whole panel — log which part failed, use the fallback. */
async function safeRead<T>(part: string, read: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await read();
  } catch (err) {
    console.error(`[demo-control] status read failed: ${part}`, err instanceof Error ? err.message : err);
    return fallback;
  }
}

export async function loadDemoStatus(db: Firestore, now = new Date()): Promise<DemoStatusPayload> {
  // Usage day docs are keyed YYYY-MM-DD, so read them by id (getAll) — no ordered
  // query on __name__ and no index needed.
  const usageRefs = usageWindowKeys(now).map((k) => usageDays(db).doc(k));
  const [flagsSnap, configSnap, controlSnap, usageSnaps, usersSnap, qaSnap] = await Promise.all([
    safeRead('flags', () => db.collection('system_config').doc('feature_flags').get(), null),
    safeRead('config', () => registry(db).doc(DEMO_CONFIG_DOC).get(), null),
    safeRead('control', () => registry(db).doc(DEMO_CONTROL_DOC).get(), null),
    safeRead('usage', () => db.getAll(...usageRefs), []),
    safeRead(
      'demo-users',
      () =>
        db
          .collection('users')
          .where(FieldPath.documentId(), '>=', DEMO_UID_PREFIX)
          .where(FieldPath.documentId(), '<', DEMO_UID_RANGE_END)
          .select('lastActive')
          .limit(DEMO_USERS_READ_LIMIT)
          .get(),
      null,
    ),
    safeRead('qa-summary', () => registry(db).doc(DEMO_QA_SUMMARY_DOC).get(), null),
  ]);
  const usageDocs = usageSnaps.filter((d) => d.exists).map((d) => ({ id: d.id, data: d.data() ?? {} }));
  const userDocs = usersSnap?.docs ?? [];

  return buildDemoStatus({
    nowMs: now.getTime(),
    todayKey: getIsraelDateKey(now),
    flagsRaw: flagsSnap?.data(),
    configRaw: configSnap?.data(),
    controlRaw: controlSnap?.data(),
    usageDocs,
    demoUserActiveDays: userDocs.map((d) => {
      const ms = millisOf(d.get('lastActive'));
      return ms === null ? null : getIsraelDateKey(new Date(ms));
    }),
    demoUsersCapped: userDocs.length >= DEMO_USERS_READ_LIMIT,
    dispatchConfigured: isDispatchConfigured(),
    qaSummaryRaw: qaSnap?.data(),
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
  // removed in the panel is really removed. update() replaces those two fields whole and
  // keeps the rest of the doc (e.g. `life` — the life engine's model + caps, demoSimulatorTick);
  // a missing doc is created.
  const data = { caps: config.caps, prices: config.prices, updatedAt: FieldValue.serverTimestamp(), updatedBy: uid };
  const ref = registry(db).doc(DEMO_CONFIG_DOC);
  await ref.update(data).catch(async (e: { code?: number }) => {
    if (e?.code !== 5) throw e; // 5 = NOT_FOUND
    await ref.set(data);
  });
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
