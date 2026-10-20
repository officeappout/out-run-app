/**
 * qaRunnerReport — HTTPS function (v2 onRequest): the AI tester runner's ONLY door to Firestore
 * and Storage (owner, 20.10.2026: the qa-runner service account gets no Firestore / Storage role).
 *
 * Same identity gate as mintDemoTesterToken: `invoker: 'private'` (roles/run.invoker granted only
 * to qa-runner) + the in-code Google ID-token check (lib/qa-runner-auth.ts). Then a closed set of
 * ops, each validated by lib/qa-runner-ops.ts and mapped to fixed paths — see the table there.
 * Screenshots: the function hands out a V4 signed PUT URL (10 min, image/png) for one path under
 * qa/{runId}/; the runner uploads straight to Storage with it.
 *
 * Config (functions/.env, optional): QA_RUNNER_SA_EMAIL, QA_REPORT_AUDIENCE (comma list; default
 * this function's cloudfunctions.net URL).
 *
 * Request: POST { op, args }   headers: Authorization: Bearer <id token>, X-Qa-Id-Token: <same>
 */
import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';
import { audiencesFrom, isQaRunnerRequest } from './lib/qa-runner-auth';
import { israelDayKey, testerSwitchesOn } from './lib/demo-tester-token';
import {
  CONTROL_DOC,
  FINDINGS_READ_LIMIT,
  OPS_NEEDING_SWITCHES,
  QA_FINDINGS,
  REGISTRY,
  SUMMARY_DOC,
  UPLOAD_URL_TTL_MS,
  jsonSafe,
  parseFinding,
  parseFindingBump,
  parseHeartbeat,
  parseOp,
  parseRunIdArg,
  parseSummary,
  parseUploadPath,
  parseUsage,
  statusPayload,
  usageDayPath,
  usageWrite,
  type Op,
} from './lib/qa-runner-ops';

if (!admin.apps.length) {
  admin.initializeApp();
}

export const DEFAULT_QA_REPORT_AUDIENCE = 'https://us-central1-appout-1.cloudfunctions.net/qaRunnerReport';
const USAGE_WINDOW_DAYS = 31;

type Result = { status: number; body: Record<string, unknown> };
const fail = (r: Extract<Op<unknown>, { ok: false }>): Result => ({ status: r.status, body: { error: r.error } });

async function handle(op: string, args: Record<string, unknown>): Promise<Result> {
  const db = admin.firestore();
  const FieldValue = admin.firestore.FieldValue;
  const flags = async () => (await db.collection('system_config').doc('feature_flags').get()).data();

  if (OPS_NEEDING_SWITCHES.has(op as never) && !testerSwitchesOn(await flags())) return { status: 409, body: { error: 'switch_off' } };

  switch (op) {
    case 'status': {
      const reg = db.collection(REGISTRY);
      const [flagsSnap, config, control, testers, usage] = await Promise.all([
        db.collection('system_config').doc('feature_flags').get(),
        reg.doc('config').get(),
        reg.doc('control').get(),
        reg.doc('testers').get(),
        reg.doc('usage').collection('days').orderBy(admin.firestore.FieldPath.documentId(), 'desc').limit(USAGE_WINDOW_DAYS).get(),
      ]);
      return {
        status: 200,
        body: statusPayload({
          flagsRaw: flagsSnap.data(),
          configRaw: config.data(),
          controlRaw: control.data(),
          testersRaw: testers.data(),
          usageDocs: usage.docs.map((d) => ({ id: d.id, data: d.data() })),
        }),
      };
    }
    case 'stop': {
      const d = (await db.doc(CONTROL_DOC).get()).data();
      return { status: 200, body: { stopRequested: d?.testersStopRequested === true } };
    }
    case 'heartbeat': {
      const h = parseHeartbeat(args);
      if (!h.ok) return fail(h);
      const v = h.value;
      await db.doc(CONTROL_DOC).set(
        {
          testers: {
            state: v.state,
            runId: v.runId,
            lastSessionAt: v.lastSessionAtMs === null ? null : admin.firestore.Timestamp.fromMillis(v.lastSessionAtMs),
            findingsCount: v.findingsCount,
            spentUsd: v.spentUsd,
            heartbeatAt: FieldValue.serverTimestamp(),
          },
        },
        { merge: true },
      );
      return { status: 200, body: { ok: true } };
    }
    case 'usage': {
      const u = parseUsage(args, israelDayKey(new Date()));
      if (!u.ok) return fail(u);
      await db.doc(usageDayPath(u.value.day)).set(usageWrite(u.value.delta, u.value.sessionStarted, (n) => FieldValue.increment(n), FieldValue.serverTimestamp()), { merge: true });
      return { status: 200, body: { ok: true } };
    }
    case 'finding': {
      const f = parseFinding(args);
      if (!f.ok) return fail(f);
      const ref = db.collection(QA_FINDINGS).doc(f.value.docId);
      const created = await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (snap.exists) {
          tx.update(ref, { count: FieldValue.increment(1) });
          return false;
        }
        tx.set(ref, { ...f.value.data, createdAt: FieldValue.serverTimestamp() });
        return true;
      });
      return { status: 200, body: { ok: true, created } };
    }
    case 'finding_bump': {
      const b = parseFindingBump(args);
      if (!b.ok) return fail(b);
      try {
        await db.collection(QA_FINDINGS).doc(b.value.docId).update({ count: FieldValue.increment(1) });
      } catch {
        return { status: 404, body: { error: 'not_found' } };
      }
      return { status: 200, body: { ok: true } };
    }
    case 'upload_url': {
      const p = parseUploadPath(args);
      if (!p.ok) return fail(p);
      const [url] = await admin
        .storage()
        .bucket()
        .file(p.value.path)
        .getSignedUrl({ version: 'v4', action: 'write', expires: Date.now() + UPLOAD_URL_TTL_MS, contentType: 'image/png' });
      return { status: 200, body: { url, path: p.value.path } };
    }
    case 'findings': {
      const r = parseRunIdArg(args);
      if (!r.ok) return fail(r);
      const snap = await db.collection(QA_FINDINGS).where('runId', '==', r.value.runId).limit(FINDINGS_READ_LIMIT).get();
      return { status: 200, body: { findings: snap.docs.map((d) => jsonSafe(d.data())) } };
    }
    case 'latest_run': {
      const snap = await db.collection(QA_FINDINGS).orderBy('createdAtMs', 'desc').limit(1).get();
      const v = snap.docs[0]?.get('runId');
      return { status: 200, body: { runId: typeof v === 'string' ? v : null } };
    }
    case 'summary_get': {
      const d = (await db.doc(SUMMARY_DOC).get()).data();
      return { status: 200, body: { summary: d ? jsonSafe(d) : null } };
    }
    case 'summary_put': {
      const s = parseSummary(args);
      if (!s.ok) return fail(s);
      await db.doc(SUMMARY_DOC).set({ ...s.value, generatedAt: FieldValue.serverTimestamp() });
      return { status: 200, body: { ok: true } };
    }
    default:
      return { status: 400, body: { error: 'bad_op' } };
  }
}

export const qaRunnerReport = onRequest(
  { region: 'us-central1', invoker: 'private', maxInstances: 2, timeoutSeconds: 30, memory: '256MiB' },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'method_not_allowed' });
      return;
    }
    if (!(await isQaRunnerRequest(req.headers as Record<string, unknown>, audiencesFrom(process.env.QA_REPORT_AUDIENCE, DEFAULT_QA_REPORT_AUDIENCE)))) {
      logger.warn('[qaRunnerReport] caller not allowed');
      res.status(403).json({ error: 'caller_not_allowed' });
      return;
    }
    const parsed = parseOp(req.body);
    if (!parsed.ok) {
      res.status(parsed.status).json({ error: parsed.error });
      return;
    }
    try {
      const r = await handle(parsed.value.op, parsed.value.args);
      res.status(r.status).json(r.body);
    } catch (e) {
      logger.error('[qaRunnerReport] op failed', { op: parsed.value.op, err: e instanceof Error ? e.name : 'unknown' });
      res.status(500).json({ error: 'internal' });
    }
  },
);
