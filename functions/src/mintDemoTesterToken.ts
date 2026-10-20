/**
 * mintDemoTesterToken — HTTPS function (v2 onRequest), B2 of agent-briefs/ai-testers-design.md
 * §2.3 (owner-approved 20.10.2026). Issues a Firebase custom token for an AI tester
 * (`demo_qa_*`) so the tester runner can sign in to the real app inside the closed demo world.
 *
 * Not a callable and not public:
 *   - `invoker: 'private'` — Cloud Run only lets in principals holding roles/run.invoker on
 *     this function. The owner grants it to ONE principal: the qa-runner service account,
 *     which GitHub Actions impersonates through Workload Identity Federation (no JSON key).
 *   - The handler verifies the caller AGAIN (defence in depth): its Google ID token is checked
 *     by Google's tokeninfo (signature) and must carry iss=Google, aud=this function, the
 *     qa-runner email, unexpired (lib/demo-tester-token.ts verifyCallerIdentity).
 * Then the pure rules in lib/demo-tester-token.ts: both switches on, ^demo_qa_ uid, registered
 * in demo_registry, daily quota (transaction). Every mint writes an audit_logs row. The token
 * itself is never logged.
 *
 * Config (functions/.env, optional — defaults match project appout-1):
 *   QA_RUNNER_SA_EMAIL   qa-runner@appout-1.iam.gserviceaccount.com
 *   QA_MINT_AUDIENCE     comma list of accepted ID-token audiences (default: this function's
 *                        cloudfunctions.net URL; add the run.app URL if the runner uses it)
 *
 * Request:  POST { uid: "demo_qa_…", runId }   headers: Authorization: Bearer <id token>,
 *                                                       X-Qa-Id-Token: <same id token>
 * Response: 200 { token, uid, expiresInSec: 3600 } | 4xx { error: <code> }
 */
import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';
import {
  DEFAULT_QA_MINT_AUDIENCE,
  DEFAULT_QA_RUNNER_SA_EMAIL,
  dailyMintLimit,
  decideMint,
  extractIdToken,
  israelDayKey,
  nextQuota,
  parseMintRequest,
  registeredUids,
  verifyCallerIdentity,
} from './lib/demo-tester-token';

if (!admin.apps.length) {
  admin.initializeApp();
}

const REGISTRY = 'demo_registry';
const QUOTA_DOC = 'tester_token_quota';
const TOKENINFO_URL = 'https://oauth2.googleapis.com/tokeninfo';

async function fetchTokenInfo(idToken: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(TOKENINFO_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ id_token: idToken }).toString(),
    });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function audiences(): string[] {
  const raw = process.env.QA_MINT_AUDIENCE?.trim();
  return raw ? raw.split(',').map((s) => s.trim()).filter(Boolean) : [DEFAULT_QA_MINT_AUDIENCE];
}

export const mintDemoTesterToken = onRequest(
  {
    region: 'us-central1',
    invoker: 'private',
    maxInstances: 1,
    concurrency: 1,
    timeoutSeconds: 30,
    memory: '256MiB',
  },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'method_not_allowed' });
      return;
    }

    // 1. Caller = the qa-runner service account (Cloud Run IAM already said yes; check again).
    const idToken = extractIdToken(req.headers as Record<string, unknown>);
    const info = idToken ? await fetchTokenInfo(idToken) : null;
    const expectedEmail = process.env.QA_RUNNER_SA_EMAIL?.trim() || DEFAULT_QA_RUNNER_SA_EMAIL;
    if (!verifyCallerIdentity(info, { email: expectedEmail, audiences: audiences() }, Math.floor(Date.now() / 1000))) {
      logger.warn('[mintDemoTesterToken] caller not allowed');
      res.status(403).json({ error: 'caller_not_allowed' });
      return;
    }

    const parsed = parseMintRequest(req.body);
    if (!parsed.ok) {
      res.status(parsed.status).json({ error: parsed.code });
      return;
    }
    const { uid, runId } = parsed.value;

    const db = admin.firestore();
    const [flagsSnap, testersSnap, personasSnap, configSnap] = await Promise.all([
      db.collection('system_config').doc('feature_flags').get(),
      db.collection(REGISTRY).doc('testers').get(),
      db.collection(REGISTRY).doc('personas').get(),
      db.collection(REGISTRY).doc('config').get(),
    ]);

    // 2–4. Switches, uid shape, registry.
    const decision = decideMint(parsed.value, {
      flagsRaw: flagsSnap.data(),
      registered: registeredUids(testersSnap.data(), personasSnap.data()),
    });
    if (!decision.ok) {
      logger.info('[mintDemoTesterToken] refused', { code: decision.code });
      res.status(decision.status).json({ error: decision.code });
      return;
    }

    // 5. Daily quota (Israel day), reserved atomically before signing.
    const today = israelDayKey(new Date());
    const limit = dailyMintLimit(configSnap.data());
    const quotaRef = db.collection(REGISTRY).doc(QUOTA_DOC);
    const quota = await db.runTransaction(async (tx) => {
      const snap = await tx.get(quotaRef);
      const next = nextQuota(snap.data(), today, limit);
      if (next.ok) tx.set(quotaRef, { ...next.value, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      return next;
    });
    if (!quota.ok) {
      res.status(quota.status).json({ error: quota.code });
      return;
    }

    const token = await admin.auth().createCustomToken(uid, decision.value.claims);

    try {
      await db.collection('audit_logs').add({
        adminId: expectedEmail,
        adminName: 'qa-runner',
        actionType: 'CREATE',
        targetEntity: 'DemoTesterToken',
        targetId: uid,
        details: `Minted AI tester token (run ${runId}, ${quota.value.count}/${limit} today)`,
        oldValue: null,
        newValue: { uid, runId },
        timestamp: new Date(),
      });
    } catch (e) {
      logger.error('[mintDemoTesterToken] audit failed (best-effort)', e instanceof Error ? e.name : 'unknown');
    }

    logger.info('[mintDemoTesterToken] minted', { uid, runId, count: quota.value.count });
    res.status(200).json({ token, uid, expiresInSec: 3600 });
  },
);
