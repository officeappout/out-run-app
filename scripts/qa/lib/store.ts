/**
 * Everything the runner and the overseer read / write on the server (Admin SDK, credentials from
 * the environment — on GitHub Actions the qa-runner service account through Workload Identity
 * Federation; never a JSON key). Bounded reads only, and EVERY write passes assertRunnerWrite:
 * the runner can only touch its own docs —
 *   qa_findings/{id}                          findings (server-only collection)
 *   demo_registry/control                     testers.* heartbeat (merge)
 *   demo_registry/usage/days/{YYYY-MM-DD}     usage increments (+ bySource.testers)
 *   demo_registry/qa_summary                  the overseer's summary for the control center
 *   Storage qa/{runId}/…                       screenshots
 */
import type { App } from 'firebase-admin/app';
import type { Firestore } from 'firebase-admin/firestore';
import {
  DEMO_CONFIG_DOC,
  DEMO_CONTROL_DOC,
  DEMO_QA_SUMMARY_DOC,
  DEMO_REGISTRY,
  DEMO_TESTERS_DOC,
  DEMO_USAGE_DAYS,
  DEMO_USAGE_DOC,
  USAGE_WINDOW_DAYS,
} from '@/lib/demo-control/paths';
import { parseConfig, parseUsageDay, type DemoConfig, type UsageDay } from '@/lib/demo-control/usage-cost';
import { FINDINGS_COLLECTION, SCREENSHOT_PREFIX } from './config';
import type { UsageDelta } from './budget';
import type { Finding } from './findings';

const WRITE_RULES: RegExp[] = [
  new RegExp(`^${FINDINGS_COLLECTION}/[A-Za-z0-9_-]{1,120}$`),
  new RegExp(`^${DEMO_REGISTRY}/${DEMO_CONTROL_DOC}$`),
  new RegExp(`^${DEMO_REGISTRY}/${DEMO_USAGE_DOC}/${DEMO_USAGE_DAYS}/\\d{4}-\\d{2}-\\d{2}$`),
  new RegExp(`^${DEMO_REGISTRY}/${DEMO_QA_SUMMARY_DOC}$`),
];
const STORAGE_RULE = new RegExp(`^${SCREENSHOT_PREFIX}/[A-Za-z0-9._-]{1,64}/[A-Za-z0-9._/-]{1,160}\\.(png|jpg)$`);

export const FINDINGS_READ_LIMIT = 500;

export class RunnerWriteError extends Error {}

export function assertRunnerWrite(path: string): void {
  if (!WRITE_RULES.some((r) => r.test(path))) throw new RunnerWriteError(`[qa runner] refusing to write ${path}`);
}

export function assertRunnerUpload(path: string): void {
  if (!STORAGE_RULE.test(path) || path.includes('..')) throw new RunnerWriteError(`[qa runner] refusing to upload ${path}`);
}

/** The increments for one usage day (shared doc: increments only, never set). */
export function usageIncrements(delta: UsageDelta, sessionStarted: boolean, inc: (n: number) => unknown, now: unknown): Record<string, unknown> {
  const own = {
    llmCalls: inc(delta.llmCalls),
    inputTokens: inc(delta.inputTokens),
    outputTokens: inc(delta.outputTokens),
    cachedTokens: inc(delta.cachedTokens),
    usdEstimate: inc(delta.usd),
    model: delta.model,
  };
  return {
    llmCalls: inc(delta.llmCalls),
    inputTokens: inc(delta.inputTokens),
    outputTokens: inc(delta.outputTokens),
    cachedTokens: inc(delta.cachedTokens),
    usdEstimate: inc(delta.usd),
    ...(sessionStarted ? { testerSessions: inc(1) } : {}),
    bySource: { testers: own },
    updatedAt: now,
  };
}

export interface Store {
  db: Firestore;
  readFlags(): Promise<Record<string, unknown> | undefined>;
  readConfig(): Promise<DemoConfig>;
  readControlRaw(): Promise<Record<string, unknown> | undefined>;
  readUsageWindow(): Promise<UsageDay[]>;
  readTesterRoster(): Promise<Set<string>>;
  heartbeat(testers: Record<string, unknown>): Promise<void>;
  addUsage(dayKey: string, delta: UsageDelta, sessionStarted: boolean): Promise<void>;
  addSessionCount(dayKey: string): Promise<void>;
  saveFinding(docId: string, f: Finding): Promise<void>;
  bumpFinding(docId: string): Promise<void>;
  uploadScreenshot(path: string, png: Buffer): Promise<string | null>;
  /** Overseer: the run's findings (bounded), the newest run id, the summary doc. */
  readFindings(runId: string): Promise<Finding[]>;
  latestRunId(): Promise<string | null>;
  readQaSummaryRaw(): Promise<Record<string, unknown> | undefined>;
  writeQaSummary(doc: Record<string, unknown>): Promise<void>;
  close(): Promise<void>;
}

export async function openStore(opts: { projectId: string; bucket: string }): Promise<Store> {
  if (process.env.FIRESTORE_EMULATOR_HOST) throw new Error('FIRESTORE_EMULATOR_HOST is set — the runner talks to the real demo world only; unset it.');
  const { initializeApp, applicationDefault, deleteApp } = await import('firebase-admin/app');
  const { getFirestore, FieldValue, FieldPath } = await import('firebase-admin/firestore');
  const { getStorage } = await import('firebase-admin/storage');
  const app: App = initializeApp({ credential: applicationDefault(), projectId: opts.projectId, storageBucket: opts.bucket }, `qa-runner-${Date.now()}`);
  const db = getFirestore(app);
  const reg = db.collection(DEMO_REGISTRY);
  const doc = (path: string) => {
    assertRunnerWrite(path);
    return db.doc(path);
  };
  const dayPath = (k: string) => `${DEMO_REGISTRY}/${DEMO_USAGE_DOC}/${DEMO_USAGE_DAYS}/${k}`;

  return {
    db,
    readFlags: async () => (await db.collection('system_config').doc('feature_flags').get()).data(),
    readConfig: async () => parseConfig((await reg.doc(DEMO_CONFIG_DOC).get()).data()),
    readControlRaw: async () => (await reg.doc(DEMO_CONTROL_DOC).get()).data(),
    async readUsageWindow() {
      const snap = await reg.doc(DEMO_USAGE_DOC).collection(DEMO_USAGE_DAYS).orderBy(FieldPath.documentId(), 'desc').limit(USAGE_WINDOW_DAYS).get();
      return snap.docs.map((d) => parseUsageDay(d.id, d.data()));
    },
    async readTesterRoster() {
      const d = (await reg.doc(DEMO_TESTERS_DOC).get()).data();
      return new Set(Array.isArray(d?.uids) ? (d!.uids as unknown[]).filter((u): u is string => typeof u === 'string') : []);
    },
    async heartbeat(testers) {
      await doc(`${DEMO_REGISTRY}/${DEMO_CONTROL_DOC}`).set({ testers: { ...testers, heartbeatAt: FieldValue.serverTimestamp() } }, { merge: true });
    },
    async addUsage(dayKey, delta, sessionStarted) {
      await doc(dayPath(dayKey)).set(usageIncrements(delta, sessionStarted, (n) => FieldValue.increment(n), FieldValue.serverTimestamp()), { merge: true });
    },
    async addSessionCount(dayKey) {
      await doc(dayPath(dayKey)).set({ testerSessions: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    },
    async saveFinding(docId, f) {
      await doc(`${FINDINGS_COLLECTION}/${docId}`).set({ ...f, createdAt: FieldValue.serverTimestamp() }, { merge: true });
    },
    async bumpFinding(docId) {
      await doc(`${FINDINGS_COLLECTION}/${docId}`).set({ count: FieldValue.increment(1) }, { merge: true });
    },
    async uploadScreenshot(path, png) {
      try {
        assertRunnerUpload(path);
        await getStorage(app).bucket().file(path).save(png, { contentType: 'image/png', resumable: false, metadata: { cacheControl: 'private, max-age=0' } });
        return path;
      } catch (e) {
        if (e instanceof RunnerWriteError) throw e;
        return null;
      }
    },
    async readFindings(runId) {
      const snap = await db.collection(FINDINGS_COLLECTION).where('runId', '==', runId).limit(FINDINGS_READ_LIMIT).get();
      return snap.docs.map((d) => d.data() as Finding);
    },
    async latestRunId() {
      const snap = await db.collection(FINDINGS_COLLECTION).orderBy('createdAtMs', 'desc').limit(1).get();
      const v = snap.docs[0]?.get('runId');
      return typeof v === 'string' ? v : null;
    },
    readQaSummaryRaw: async () => (await reg.doc(DEMO_QA_SUMMARY_DOC).get()).data(),
    async writeQaSummary(summary) {
      await doc(`${DEMO_REGISTRY}/${DEMO_QA_SUMMARY_DOC}`).set({ ...summary, generatedAt: FieldValue.serverTimestamp() });
    },
    close: () => deleteApp(app),
  };
}
