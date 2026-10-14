/**
 * seed-agents-panel-emulator.ts — fills the Firestore EMULATOR with sample
 * agents-panel data (agents/oncall + findings) so /admin/agents can be seen
 * with real-looking cards before the on-call agent exists.
 *
 * EMULATOR ONLY. Refuses to run unless FIRESTORE_EMULATOR_HOST points at
 * localhost/127.0.0.1 — it can never write to production. Every value is
 * synthetic (no real Sentry issue, PR, user or PII).
 *
 * Usage (3 terminals):
 *   1. firebase emulators:start --only firestore                 # 127.0.0.1:8080 (firebase.json)
 *   2. FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npx tsx scripts/seed-agents-panel-emulator.ts
 *   3. FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npm run dev         # then open /admin/agents as root
 *
 * In step 3 EVERY Admin-SDK server route of that dev session reads the
 * (mostly empty) emulator instead of production — fine for previewing this
 * panel, not for anything else. Firebase Auth stays real (sign in as root as
 * usual); client-SDK reads elsewhere in the admin panel still go to
 * production, read-only as always.
 *
 * Options:
 *   --project <id>   default appout-1 (must match the dev server's Admin SDK project)
 *   --clear          delete existing agents/oncall findings first
 */
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const host = process.env.FIRESTORE_EMULATOR_HOST ?? '';
if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) {
  console.error(
    `Refusing to run: FIRESTORE_EMULATOR_HOST must be localhost/127.0.0.1 (got "${host || 'unset'}"). ` +
      'This script only ever writes to the local emulator.',
  );
  process.exit(2);
}

const projectId = arg('--project') ?? 'appout-1';
const db = getFirestore(initializeApp({ projectId }, `seed-agents-panel-${Date.now()}`));

const minutesAgo = (m: number) => Timestamp.fromMillis(Date.now() - m * 60_000);

type Seed = {
  id: string;
  kind: 'new' | 'escalating' | 'regressed';
  topic: string;
  title: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  platform: 'web' | 'server' | 'ios' | 'android' | 'unknown';
  counts: { lastHour: number; last24h: number; total: number };
  confidence: 'high' | 'medium' | 'low' | 'none';
  pr: { number: number; title: string; deployedMinAgo: number } | null;
  suggestion: string;
  createdMinAgo: number;
  readMinAgo: number | null;
};

const SEEDS: Seed[] = [
  {
    id: 'sentry-demo-1001-escalating', kind: 'escalating', topic: '/map', severity: 'critical', platform: 'web',
    title: "TypeError: Cannot read properties of undefined (reading 'coordinates')",
    counts: { lastHour: 84, last24h: 210, total: 640 }, confidence: 'high',
    pr: { number: 9001, title: 'feat(parks): demo route-card change', deployedMinAgo: 95 },
    suggestion: 'הקובץ בראש הסטאק (src/features/parks/demo/RouteCard.tsx) השתנה ב-PR #9001 — לבדוק גישה ל-geometry לפני שהמסלול נטען.',
    createdMinAgo: 20, readMinAgo: null,
  },
  {
    id: 'sentry-demo-1002-new', kind: 'new', topic: '/map', severity: 'medium', platform: 'ios',
    title: 'Error: Map style not loaded',
    counts: { lastHour: 6, last24h: 6, total: 6 }, confidence: 'medium',
    pr: { number: 9001, title: 'feat(parks): demo route-card change', deployedMinAgo: 95 },
    suggestion: 'הופיע לראשונה כשעה אחרי הדיפלוי של PR #9001 — קרבה בזמן בלבד, לבדוק אם קשור.',
    createdMinAgo: 50, readMinAgo: null,
  },
  {
    id: 'sentry-demo-1003-new', kind: 'new', topic: 'api/user/*', severity: 'high', platform: 'server',
    title: 'FirebaseError: [code=deadline-exceeded] Deadline exceeded',
    counts: { lastHour: 31, last24h: 31, total: 31 }, confidence: 'low',
    pr: null,
    suggestion: 'אין דיפלוי חשוד בחלון — כנראה תקלת רשת/עומס. לבדוק את Firestore status ואת זמני התגובה של הנתיב.',
    createdMinAgo: 35, readMinAgo: null,
  },
  {
    id: 'sentry-demo-1004-regressed', kind: 'regressed', topic: '/active', severity: 'high', platform: 'android',
    title: 'ChunkLoadError: Loading chunk 812 failed',
    counts: { lastHour: 12, last24h: 40, total: 1200 }, confidence: 'medium',
    pr: { number: 9002, title: 'chore(demo): bundle split change', deployedMinAgo: 180 },
    suggestion: 'issue שנסגר וחזר אחרי PR #9002 — לבדוק אם ה-chunk ההוא עדיין נטען ב-WebView אחרי רולאובר.',
    createdMinAgo: 170, readMinAgo: 120,
  },
  {
    id: 'sentry-demo-1005-new', kind: 'new', topic: 'api/admin/*', severity: 'low', platform: 'server',
    title: 'Error: Missing auth token',
    counts: { lastHour: 3, last24h: 9, total: 9 }, confidence: 'none',
    pr: null,
    suggestion: 'רעש צפוי (קריאה בלי טוקן ל-route מוגן). אם עולה — לבדוק מי קורא.',
    createdMinAgo: 600, readMinAgo: 500,
  },
];

async function main() {
  const agentRef = db.collection('agents').doc('oncall');
  const findings = agentRef.collection('findings');

  if (process.argv.includes('--clear')) {
    const existing = await findings.get();
    const batch = db.batch();
    existing.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    console.log(`cleared ${existing.size} existing findings`);
  }

  const batch = db.batch();
  batch.set(agentRef, {
    lastRunAt: minutesAgo(12),
    lastSuccessAt: minutesAgo(12),
    lastError: { at: minutesAgo(180), code: 'SENTRY_HTTP_503' },
    consecutiveFailures: 0,
    schemaVersion: 1,
  });
  for (const s of SEEDS) {
    batch.set(findings.doc(s.id), {
      kind: s.kind,
      topic: s.topic,
      title: s.title,
      severity: s.severity,
      platform: s.platform,
      counts: s.counts,
      confidence: s.confidence,
      suspectedPr: s.pr
        ? {
            number: s.pr.number,
            title: s.pr.title,
            sha: 'demo0000',
            url: `https://github.com/officeappout/out-run-app/pull/${s.pr.number}`,
            deployedAt: minutesAgo(s.pr.deployedMinAgo),
          }
        : null,
      suggestion: s.suggestion,
      sourceUrl: 'https://sentry.io/',
      firstSeenAt: minutesAgo(s.createdMinAgo + 5),
      lastSeenAt: minutesAgo(2),
      createdAt: minutesAgo(s.createdMinAgo),
      updatedAt: minutesAgo(s.createdMinAgo),
      // Always explicit — `where('readAt','==',null)` ignores absent fields (axioms §33).
      readAt: s.readMinAgo === null ? null : minutesAgo(s.readMinAgo),
      schemaVersion: 1,
    });
  }
  await batch.commit();

  const unread = SEEDS.filter((s) => s.readMinAgo === null).length;
  console.log(`seeded agents/oncall + ${SEEDS.length} findings (${unread} unread) into ${host} project=${projectId}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.name : 'unknown');
  process.exit(1);
});
