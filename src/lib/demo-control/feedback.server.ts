import 'server-only';
/**
 * "משוב דמו" — Admin SDK reads/writes for /api/admin/demo/feedback/** (super admin only; the
 * routes check that). demo_registry and qa_findings are closed to every client by
 * firestore.rules, so this file is the tab's only path to them. Bounded:
 *   - page: per source ONE query (orderBy createdAt desc, limit SCAN_LIMIT) + ONE personas doc get
 *   - status: one update on the item's own doc (doc must exist); a tester finding's update runs in
 *     a transaction with demo_registry/owner_rules (the dismissal list the testers learn from)
 *   - screenshot: one doc get + a 10-minute signed READ url for its qa/… path
 *     (a finding by id, or a "ציוני עיצוב" screen by its key in demo_registry/qa_summary.design)
 */
import { getApps } from 'firebase-admin/app';
import { FieldValue, Timestamp, type Firestore, type Query } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { DEMO_LIFE_DOC, DEMO_LIFE_FEEDBACK, DEMO_PERSONAS_DOC, DEMO_QA_SUMMARY_DOC, DEMO_REGISTRY, QA_FINDINGS } from './paths';
import { parseQaDesign } from './qa-summary';
import { OWNER_RULES_DOC, applyTriageToDismissals, dismissalFromFinding, parseOwnerRulesDoc } from './owner-rules-model';
import { mapLifeFeedback, mapQaFinding, personaNames, type FeedbackSource, type TriageStatus } from './feedback-model';
import {
  SCAN_LIMIT,
  buildFeedbackPage,
  dateWindow,
  scanUpperMs,
  sourcesFor,
  isQaScreenshotPath,
  type FeedbackCursor,
  type FeedbackFilters,
  type FeedbackPage,
  type SourceScan,
} from './feedback-query';

export const SCREENSHOT_URL_TTL_MS = 10 * 60_000;

function collectionOf(db: Firestore, source: FeedbackSource) {
  return source === 'life'
    ? db.collection(DEMO_REGISTRY).doc(DEMO_LIFE_DOC).collection(DEMO_LIFE_FEEDBACK)
    : db.collection(QA_FINDINGS);
}

export async function loadFeedbackPage(db: Firestore, f: FeedbackFilters, cursor: FeedbackCursor | null): Promise<FeedbackPage> {
  const sources = sourcesFor(f);
  if (!sources.length) return { items: [], nextCursor: null };
  const { fromMs, toMs } = dateWindow(f);
  const upper = scanUpperMs(cursor, toMs);

  const scanQuery = (source: FeedbackSource) => {
    let q: Query = collectionOf(db, source);
    if (fromMs !== null) q = q.where('createdAt', '>=', Timestamp.fromMillis(fromMs));
    if (upper !== null) q = q.where('createdAt', '<=', Timestamp.fromMillis(upper));
    return q.orderBy('createdAt', 'desc').limit(SCAN_LIMIT).get();
  };

  const [personasSnap, ...snaps] = await Promise.all([
    sources.includes('life') ? db.collection(DEMO_REGISTRY).doc(DEMO_PERSONAS_DOC).get() : Promise.resolve(null),
    ...sources.map(scanQuery),
  ]);
  const names = personaNames(personasSnap?.data());
  const scans: SourceScan[] = sources.map((source, i) => {
    const docs = snaps[i].docs;
    return {
      full: docs.length >= SCAN_LIMIT,
      items: docs.map((d) => (source === 'life' ? mapLifeFeedback(d.id, d.data(), names) : mapQaFinding(d.id, d.data()))),
    };
  });
  return buildFeedbackPage(scans, f, cursor);
}

/**
 * Marks one item. false = no such doc. A tester finding's "לא רלוונטי" (+ optional reason) also
 * lands in demo_registry/owner_rules.dismissals in the same transaction (the testers learn from
 * it); any other status removes the finding's dismissal row ("טופל" keeps the rule).
 */
export async function setFeedbackStatus(
  db: Firestore,
  uid: string,
  source: FeedbackSource,
  id: string,
  status: TriageStatus,
  reason: string | null = null,
): Promise<boolean> {
  const triage = { status, by: uid, at: FieldValue.serverTimestamp(), ...(status === 'irrelevant' && reason ? { reason } : {}) };
  if (source === 'testers') return setTesterFindingStatus(db, id, triage, status, reason);
  try {
    await collectionOf(db, source).doc(id).update({ triage });
    return true;
  } catch (err) {
    // NOT_FOUND (gRPC 5) — the doc is gone (purged demo world / old run).
    if ((err as { code?: unknown })?.code === 5) return false;
    throw err;
  }
}

async function setTesterFindingStatus(db: Firestore, id: string, triage: Record<string, unknown>, status: TriageStatus, reason: string | null): Promise<boolean> {
  const findingRef = db.collection(QA_FINDINGS).doc(id);
  const rulesRef = db.collection(DEMO_REGISTRY).doc(OWNER_RULES_DOC);
  return db.runTransaction(async (tx) => {
    const [finding, rules] = await Promise.all([tx.get(findingRef), tx.get(rulesRef)]);
    if (!finding.exists) return false;
    const current = parseOwnerRulesDoc(rules.data());
    const row = status === 'irrelevant' ? dismissalFromFinding(id, finding.data(), reason ?? '', Date.now()) : null;
    const had = current.dismissals.some((d) => d.findingId === id);
    tx.update(findingRef, { triage });
    if (row || had) {
      tx.set(rulesRef, { dismissals: applyTriageToDismissals(current.dismissals, id, row), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
    return true;
  });
}

export type ScreenshotResult = { ok: true; url: string } | { ok: false; status: number; error: string };

/** A short-lived signed read URL for a finding's screenshot (path read from the doc, never from the caller). */
export async function signFindingScreenshot(db: Firestore, findingId: string): Promise<ScreenshotResult> {
  const snap = await db.collection(QA_FINDINGS).doc(findingId).get();
  if (!snap.exists) return { ok: false, status: 404, error: 'not_found' };
  return signQaPath(snap.data()?.screenshot);
}

/** The same for a screen of the last summary's design block (path read from the summary doc). */
export async function signDesignScreenshot(db: Firestore, screen: string): Promise<ScreenshotResult> {
  const snap = await db.collection(DEMO_REGISTRY).doc(DEMO_QA_SUMMARY_DOC).get();
  const row = parseQaDesign(snap.data()?.design)?.screens.find((s) => s.screen === screen);
  if (!row) return { ok: false, status: 404, error: 'not_found' };
  return signQaPath(row.screenshot);
}

async function signQaPath(path: unknown): Promise<ScreenshotResult> {
  if (!isQaScreenshotPath(path)) return { ok: false, status: 404, error: 'no_screenshot' };
  const app = getApps()[0];
  if (!app) return { ok: false, status: 503, error: 'sign_failed' };
  const bucketName = process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'appout-1.firebasestorage.app';
  try {
    const [url] = await getStorage(app)
      .bucket(bucketName)
      .file(path)
      .getSignedUrl({ version: 'v4', action: 'read', expires: Date.now() + SCREENSHOT_URL_TTL_MS });
    return { ok: true, url };
  } catch (err) {
    console.error('[demo feedback] screenshot sign failed', err instanceof Error ? err.message : err);
    return { ok: false, status: 503, error: 'sign_failed' };
  }
}
