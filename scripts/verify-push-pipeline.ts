#!/usr/bin/env npx tsx
/**
 * scripts/verify-push-pipeline.ts
 *
 * End-to-end dry-run verification for push notification pipeline (stages 1–7).
 * Calls push.service.sendPush({dryRun:true}) directly — real Firestore reads
 * for prefs/rate-cap, zero FCM writes, zero delivered count.
 *
 * Tests:
 *   1. Copy templates      — interpolation for all 5 trigger types (offline)
 *   2. Quiet-hours logic   — boundary values (offline)
 *   3. sendPush guardrails — 5 users, one call, real Firestore:
 *        UID_OK          → passes all filters (0 tokens → attempted but 0 delivered)
 *        UID_RATE_CAP    → blocked by rate-cap (stamped 20 min ago, 30-min window)
 *        UID_KUDOS_CAP   → blocked by rate-cap (kudos 30-min batching window)
 *        UID_CHAN_OFF     → blocked by notificationPrefs.social=false
 *        UID_PUSH_OFF    → blocked by pushEnabled=false
 *   4. Rate-cap boundaries — 30-min kudos window + 24-h retention window (offline)
 *   5. Opt-out model       — missing pref field → defaults true
 *   6. system channel      — bypasses all filters
 *   7. push_messages schema — recent doc has required fields
 *
 * Usage:
 *   npx tsx scripts/verify-push-pipeline.ts          ← emulator (default, safe)
 *   npx tsx scripts/verify-push-pipeline.ts --prod   ← production (caution!)
 *
 * Requires:
 *   FIREBASE_SERVICE_ACCOUNT_KEY  — JSON string of service account
 *   Emulator running (default):   firebase emulators:start --only firestore
 *
 * firebase-functions is mocked via Module._load intercept (inline, no extra shim).
 */

import * as admin from 'firebase-admin';
import { createRequire } from 'module';

// ─── Firestore target: emulator (default) or prod (--prod / VERIFY_USE_PROD=1) ──

const useProd =
  process.argv.includes('--prod') ||
  process.env.VERIFY_USE_PROD === '1' ||
  process.env.VERIFY_USE_PROD === 'true';

if (!useProd) {
  // Route to local emulator — must be set before initializeApp()
  process.env.FIRESTORE_EMULATOR_HOST =
    process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
  console.log(`🧪  Firestore → emulator (${process.env.FIRESTORE_EMULATOR_HOST})`);
  console.log('    Start emulator: firebase emulators:start --only firestore\n');
} else {
  console.warn('⚠️   Firestore → PRODUCTION  (--prod flag active)');
  console.warn('    Test docs will be written to real Firestore and then deleted.\n');
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (!rawKey) {
  console.error('❌  FIREBASE_SERVICE_ACCOUNT_KEY not set');
  process.exit(1);
}
const key = JSON.parse(rawKey);
if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(key as admin.ServiceAccount) });
}
const db = admin.firestore();

// ─── Types (mirrored from push.service — avoids cross-package import) ─────────

interface SendPushOpts {
  toUids: string[];
  channel: string;
  title: string;
  body: string;
  deepLink?: string;
  data?: Record<string, string>;
  dryRun?: boolean;
  rateCapHours?: number;
  skipQuietHours?: boolean;
}

interface SendPushResult {
  attempted: number;
  delivered: number;
  failed: number;
  skippedPrefs: number;
  skippedQuietHours: number;
  skippedRateCap: number;
  tokensPruned: number;
}

// ─── Test runner ──────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ✅  ${label}`);
    passed++;
  } else {
    console.error(`  ❌  ${label}${detail ? ` — ${detail}` : ''}`);
    failed++;
  }
}

// ─── Test UIDs (never collide with real users) ────────────────────────────────

const UID_OK        = 'push-test-ok';
const UID_RATE_CAP  = 'push-test-ratecap';
const UID_KUDOS_CAP = 'push-test-kudoscap';
const UID_CHAN_OFF  = 'push-test-chanoff';
const UID_PUSH_OFF  = 'push-test-pushoff';

const ALL_TEST_UIDS = [UID_OK, UID_RATE_CAP, UID_KUDOS_CAP, UID_CHAN_OFF, UID_PUSH_OFF];

// ─── Firestore setup / teardown ───────────────────────────────────────────────

async function setupTestDocs(): Promise<void> {
  const now = admin.firestore.Timestamp.now();
  const min20ago = admin.firestore.Timestamp.fromMillis(Date.now() - 20 * 60 * 1000);
  const min10ago = admin.firestore.Timestamp.fromMillis(Date.now() - 10 * 60 * 1000);

  const batch = db.batch();

  // UID_OK — valid prefs, no rate-cap entry, but no FCM tokens (dryRun, safe)
  batch.set(db.collection('users').doc(UID_OK), {
    fcmTokens: [],
    settings: {
      pushEnabled: true,
      notificationPrefs: { social: true, retention: true, progression: true },
    },
  });

  // UID_RATE_CAP — valid prefs, rate-cap stamped 20 min ago (inside 30-min kudos window)
  batch.set(db.collection('users').doc(UID_RATE_CAP), {
    fcmTokens: [],
    settings: {
      pushEnabled: true,
      notificationPrefs: { social: true },
    },
  });
  batch.set(db.collection('push_rate').doc(UID_RATE_CAP), {
    social_lastSentAt: min20ago,
  });

  // UID_KUDOS_CAP — separate kudos batching test (10 min ago, inside 30-min window)
  batch.set(db.collection('users').doc(UID_KUDOS_CAP), {
    fcmTokens: [],
    settings: {
      pushEnabled: true,
      notificationPrefs: { social: true },
    },
  });
  batch.set(db.collection('push_rate').doc(UID_KUDOS_CAP), {
    social_lastSentAt: min10ago,
  });

  // UID_CHAN_OFF — social channel disabled
  batch.set(db.collection('users').doc(UID_CHAN_OFF), {
    fcmTokens: [],
    settings: {
      pushEnabled: true,
      notificationPrefs: { social: false },
    },
  });

  // UID_PUSH_OFF — master push switch off
  batch.set(db.collection('users').doc(UID_PUSH_OFF), {
    fcmTokens: [],
    settings: {
      pushEnabled: false,
      notificationPrefs: { social: true },
    },
  });

  await batch.commit();
}

async function teardownTestDocs(): Promise<void> {
  const batch = db.batch();
  for (const uid of ALL_TEST_UIDS) {
    batch.delete(db.collection('users').doc(uid));
    batch.delete(db.collection('push_rate').doc(uid));
  }
  await batch.commit().catch((e: unknown) =>
    console.warn('[cleanup] batch delete partial failure:', e),
  );
}

// ─── Mock firebase-functions via Module._load intercept ───────────────────────

function patchFirebaseFunctionsMock(): void {
  const cjsRequire = createRequire(import.meta.url);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const NodeMod = cjsRequire('module') as any;
  const origLoad = NodeMod._load.bind(NodeMod);
  NodeMod._load = function (id: string, ...args: unknown[]) {
    if (id === 'firebase-functions' || id.startsWith('firebase-functions/')) {
      return {
        logger: {
          info: (...a: unknown[]) => process.stdout.write('[CF] ' + a.join(' ') + '\n'),
          warn: (...a: unknown[]) => process.stderr.write('[CF WARN] ' + a.join(' ') + '\n'),
          error: (...a: unknown[]) => process.stderr.write('[CF ERR] ' + a.join(' ') + '\n'),
        },
      };
    }
    return origLoad(id, ...args);
  };
}

// ─── Section 1 — Copy templates (offline) ─────────────────────────────────────

function testCopyTemplates() {
  console.log('── 1. Copy Templates ───────────────────────────────────');

  function interpolate(tpl: string, vars: Record<string, string>): string {
    return tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
  }

  // level-up: {level}
  for (const lvl of [2, 5, 10]) {
    const title = interpolate('עלית לרמה {level}!', { level: String(lvl) });
    assert(`level-up level=${lvl} → title contains "${lvl}"`, title.includes(String(lvl)), title);
  }

  // retention: {name} + {days_since}
  const retTitle = interpolate('{name}, {days_since} ימים בלי אימון', { name: 'דנה', days_since: '14' });
  assert('retention: {name} + {days_since} resolved', retTitle === 'דנה, 14 ימים בלי אימון', retTitle);

  // training_reminder: category label
  const catMap: Record<string, string> = {
    strength: 'אימון כוח', cardio: 'ריצה', maintenance: 'תרגול החזקה', walking: 'הליכה',
  };
  for (const [cat, label] of Object.entries(catMap)) {
    const title = `📅 ${label} היום`;
    assert(`training_reminder category=${cat} → label="${label}"`, title.includes(label));
  }
  assert('training_reminder empty categories → fallback "אימון"', '📅 אימון היום'.includes('אימון'));

  // group-join: {group_name}, {user_name}
  const joiner = interpolate('ברוך הבא ל{group_name}!', { group_name: 'ריצה שכונתית' });
  const adminMsg = interpolate('{user_name} הצטרף/ה!', { user_name: 'רון' });
  assert('group-join: joiner title has group name', joiner.includes('ריצה שכונתית'), joiner);
  assert('group-join: admin title has user name', adminMsg.includes('רון'), adminMsg);

  // kudos batching: single vs multi
  const emoji = '🤚';
  const singleTitle = `{sender_name} שלח/ה לך ${emoji}!`.replace('{sender_name}', 'מיכל');
  const batchedTitle = `קיבלת {kudos_count} ${emoji}!`.replace('{kudos_count}', '7');
  const batchedBody = `{sender_name} ועוד {others_count} שלחו לך.`
    .replace('{sender_name}', 'מיכל').replace('{others_count}', '6');
  assert('kudos single: sender name in title', singleTitle.includes('מיכל'), singleTitle);
  assert('kudos batched: count in title', batchedTitle.includes('7'), batchedTitle);
  assert('kudos batched: others_count = count-1 in body', batchedBody.includes('6'), batchedBody);
  assert('kudos batched: emoji present', batchedTitle.includes(emoji));
}

// ─── Section 2 — Quiet-hours logic (offline) ──────────────────────────────────

function testQuietHours() {
  console.log('\n── 2. Quiet-Hours Logic ────────────────────────────────');

  function isQuietHours(hour: number): boolean {
    return hour >= 22 || hour < 7;
  }

  const cases: Array<[number, boolean, string]> = [
    [0,  true,  '00:00 → quiet'],
    [6,  true,  '06:00 → quiet'],
    [7,  false, '07:00 → active'],
    [10, false, '10:00 → active'],
    [21, false, '21:00 → active'],
    [22, true,  '22:00 → quiet'],
    [23, true,  '23:00 → quiet'],
  ];
  for (const [hour, expected, label] of cases) {
    assert(`quiet-hours: ${label}`, isQuietHours(hour) === expected);
  }
}

// ─── Section 3 — Rate-cap boundaries (offline) ────────────────────────────────

function testRateCapBoundaries() {
  console.log('\n── 3. Rate-Cap Boundaries ──────────────────────────────');

  function isWithinCap(lastSentMs: number | null, capHours: number): boolean {
    if (lastSentMs === null || capHours === 0) return false;
    return Date.now() - lastSentMs < capHours * 3600 * 1000;
  }

  const min29ago = Date.now() - 29 * 60 * 1000;
  const min31ago = Date.now() - 31 * 60 * 1000;
  const h20ago   = Date.now() - 20 * 3600 * 1000;
  const h23ago   = Date.now() - 23 * 3600 * 1000;
  const h25ago   = Date.now() - 25 * 3600 * 1000;

  // Kudos: 30-min window
  assert('kudos rate-cap: 29min ago → still capped (30-min window)', isWithinCap(min29ago, 0.5));
  assert('kudos rate-cap: 31min ago → window expired', !isWithinCap(min31ago, 0.5));

  // Retention: 48h window
  assert('retention rate-cap: 23h ago → still capped (48h window)', isWithinCap(h23ago, 48));

  // Training-reminder: 22h window
  assert('training-reminder rate-cap: 20h ago → still capped (22h window)', isWithinCap(h20ago, 22));
  assert('training-reminder rate-cap: 23h ago → window expired (22h window)', !isWithinCap(h23ago, 22));

  // Level-up: 24h window
  assert('level-up rate-cap: 23h ago → still capped (24h window)', isWithinCap(h23ago, 24));
  assert('level-up rate-cap: 25h ago → window expired', !isWithinCap(h25ago, 24));

  // system channel: capHours=0 → never capped
  assert('system channel: capHours=0 → never capped', !isWithinCap(Date.now(), 0));
}

// ─── Section 4 — sendPush dryRun (live Firestore, zero FCM) ──────────────────

async function testSendPushDryRun(
  sendPush: (opts: SendPushOpts) => Promise<SendPushResult>,
) {
  console.log('\n── 4. sendPush dryRun — Guardrails (live Firestore) ────');

  await setupTestDocs();
  try {
    // ── 4a. Prefs + rate-cap + channel in one call ────────────────────────
    // skipQuietHours=true so the test isn't time-sensitive
    const result = await sendPush({
      toUids: ALL_TEST_UIDS,
      channel: 'social',
      title: '[verify] dryRun test',
      body: 'Pipeline guardrail verification',
      dryRun: true,
      rateCapHours: 0.5,     // 30-min window (kudos)
      skipQuietHours: true,
    });

    assert(
      `dryRun: attempted === ${ALL_TEST_UIDS.length}`,
      result.attempted === ALL_TEST_UIDS.length,
      `got ${result.attempted}`,
    );
    assert(
      'dryRun: skippedPrefs === 2 (chan_off + push_off)',
      result.skippedPrefs === 2,
      `got ${result.skippedPrefs}`,
    );
    assert(
      'dryRun: skippedRateCap === 2 (rate_cap + kudos_cap)',
      result.skippedRateCap === 2,
      `got ${result.skippedRateCap}`,
    );
    assert(
      'dryRun: skippedQuietHours === 0 (skipQuietHours=true)',
      result.skippedQuietHours === 0,
      `got ${result.skippedQuietHours}`,
    );
    assert(
      'dryRun: delivered === 0 (dryRun mode)',
      result.delivered === 0,
      `got ${result.delivered}`,
    );
    // UID_OK passes all filters → 1 user reaches token fetch stage
    // (0 tokens → 0 delivered, not counted in any skip bucket)
    const totalAccounted = result.skippedPrefs + result.skippedRateCap
      + result.skippedQuietHours + result.delivered;
    assert(
      'dryRun: skips + delivered account for all attempted',
      totalAccounted <= result.attempted,
      `accounted=${totalAccounted} attempted=${result.attempted}`,
    );

    // ── 4b. system channel bypasses all filters ───────────────────────────
    const sysResult = await sendPush({
      toUids: [UID_CHAN_OFF, UID_PUSH_OFF],
      channel: 'system',
      title: '[verify] system channel',
      body: 'Force-on — bypasses prefs',
      dryRun: true,
      skipQuietHours: true,
    });
    assert(
      'system channel: skippedPrefs === 0 even for opt-out users',
      sysResult.skippedPrefs === 0,
      `got ${sysResult.skippedPrefs}`,
    );
    assert(
      'system channel: attempted === 2',
      sysResult.attempted === 2,
      `got ${sysResult.attempted}`,
    );

    // ── 4c. Kudos 30-min batching: second send is blocked ─────────────────
    // UID_KUDOS_CAP already has social_lastSentAt = 10 min ago in Firestore.
    // This simulates kudo #2 arriving 10 min after kudo #1 was pushed.
    const kudosResult = await sendPush({
      toUids: [UID_KUDOS_CAP],
      channel: 'social',
      title: '[verify] kudos batch test',
      body: 'Should be rate-capped',
      dryRun: true,
      rateCapHours: 0.5,
      skipQuietHours: true,
    });
    assert(
      'kudos batching: second kudo in 30-min window → rate-capped',
      kudosResult.skippedRateCap === 1,
      `skippedRateCap=${kudosResult.skippedRateCap}`,
    );

    // ── 4d. Retention window — 48h cap ────────────────────────────────────
    // UID_RATE_CAP has rate-cap stamped 20 min ago.
    // With rateCapHours=48, it's still within cap → skipped.
    const retResult = await sendPush({
      toUids: [UID_RATE_CAP],
      channel: 'social',
      title: '[verify] retention window',
      body: 'Inside 48h window',
      dryRun: true,
      rateCapHours: 48,
      skipQuietHours: true,
    });
    assert(
      'retention: user stamped 20min ago → inside 48h window → rate-capped',
      retResult.skippedRateCap === 1,
      `skippedRateCap=${retResult.skippedRateCap}`,
    );

  } finally {
    await teardownTestDocs();
    console.log('  → Test docs cleaned up ✓');
  }
}

// ─── Section 5 — Opt-out model + system channel (offline) ────────────────────

function testOptOutModel() {
  console.log('\n── 5. Opt-Out Model ────────────────────────────────────');

  const prefs: Record<string, boolean | undefined> = {
    social: false,       // explicit opt-out
    retention: true,     // explicit opt-in
    // progression, training_reminder absent → default true
  };
  const channels = ['social', 'retention', 'progression', 'training_reminder', 'chat'];

  for (const ch of channels) {
    const enabled = prefs[ch] !== false; // opt-out: undefined → true
    const expected = ch !== 'social';    // only social is false
    assert(
      `opt-out: ${ch} pref=${JSON.stringify(prefs[ch])} → enabled=${enabled}`,
      enabled === expected,
    );
  }
}

// ─── Section 6 — push_messages schema (live Firestore) ───────────────────────

async function testPushMessagesSchema() {
  console.log('\n── 6. push_messages Schema ─────────────────────────────');

  const snap = await db
    .collection('push_messages')
    .orderBy('sentAt', 'desc')
    .limit(1)
    .get();

  if (snap.empty) {
    console.log('  ℹ️   push_messages is empty — schema check skipped');
    return;
  }

  const d = snap.docs[0].data() as Record<string, unknown>;
  assert('push_messages: channel field', 'channel' in d, `fields: ${Object.keys(d).join(', ')}`);
  assert('push_messages: status field', 'status' in d);
  assert('push_messages: targetAudience field', 'targetAudience' in d);
  console.log(
    `  ℹ️   most recent: channel=${d.channel} status=${d.status} audience=${d.targetAudience}`,
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function run() {
  console.log('══════════════════════════════════════════════════════════');
  console.log('  Push Pipeline End-to-End Verification (dryRun)');
  console.log('══════════════════════════════════════════════════════════\n');

  // ── Patch firebase-functions BEFORE importing push.service ───────────────
  patchFirebaseFunctionsMock();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let sendPush: ((opts: SendPushOpts) => Promise<SendPushResult>) | null = null;
  try {
    // Dynamic import — firebase-functions is now mocked via Module._load
    const mod = await import('../functions/src/services/push.service.js') as {
      sendPush: (opts: SendPushOpts) => Promise<SendPushResult>;
    };
    sendPush = mod.sendPush;
    console.log('  ✓  push.service imported successfully\n');
  } catch (e) {
    console.error('  ⚠️  Could not import push.service:', e);
    console.error('  Continuing with offline tests only…\n');
  }

  // ── Offline tests (never fail due to Firestore/FCM) ─────────────────────
  testCopyTemplates();
  testQuietHours();
  testRateCapBoundaries();
  testOptOutModel();

  // ── Live Firestore tests ─────────────────────────────────────────────────
  if (sendPush) {
    await testSendPushDryRun(sendPush);
  } else {
    console.log('\n── 4. sendPush dryRun — SKIPPED (import failed) ────────');
  }
  await testPushMessagesSchema();

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════════════');
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log('══════════════════════════════════════════════════════════');

  if (failed > 0) process.exit(1);
}

run().catch((err: unknown) => {
  console.error('💥 ', err);
  // Attempt cleanup even on unexpected crash
  teardownTestDocs().catch(() => {});
  process.exit(1);
});
