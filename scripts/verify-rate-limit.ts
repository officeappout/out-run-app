#!/usr/bin/env npx tsx
/**
 * scripts/verify-rate-limit.ts
 *
 * Emulator-only verification for src/lib/rateLimit.ts's isRateLimited()
 * and the login-link gate's "check before existence" ordering property.
 * See .claude/plans/rate-limiting-sensitive-endpoints.md part ה.
 *
 * Deliberately has NO --prod mode at all (unlike verify-push-pipeline.ts,
 * whose --prod path this script does not copy) — David's explicit
 * constraint for this task is "never fire deliberate test requests
 * against production, never create production data." Structurally
 * refusing to point at anything but the emulator is cheaper to trust than
 * a flag a future run could forget to omit.
 *
 * Tests:
 *   1. N-1 requests pass, Nth request is blocked (sliding-window count)
 *   2. After the window elapses, a new request passes again
 *   3. Two independent keys (e.g. email vs IP dimension) never interfere
 *   4. isRateLimited fails OPEN when Firestore itself is unreachable
 *
 * The "gate runs before checkAdminEmail" ordering property is covered
 * separately, against the REAL sendAdminMagicLink with its dependencies
 * mocked, in src/features/admin/services/__tests__/passwordless-auth.service.test.ts
 * (npm test) — that one doesn't need the Firestore emulator at all.
 *
 * Usage:
 *   firebase emulators:start --only firestore   (in one terminal)
 *   npx tsx scripts/verify-rate-limit.ts        (in another)
 */

import * as admin from 'firebase-admin';

const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
process.env.FIRESTORE_EMULATOR_HOST = EMULATOR_HOST;
console.log(`🧪  Firestore → emulator ONLY (${EMULATOR_HOST}) — this script never targets production.\n`);

if (!admin.apps.length) {
  admin.initializeApp({ projectId: 'demo-outrun-rate-limit-verify' });
}
const db = admin.firestore();

// ─── Test runner ────────────────────────────────────────────────────────

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

async function cleanup(keys: string[]): Promise<void> {
  await Promise.all(keys.map((k) => db.collection('rate_limits').doc(k).delete().catch(() => {})));
}

async function main() {
  const { isRateLimited } = await import('../src/lib/rateLimit');

  // ── 1 + 2: sliding window count + expiry ──────────────────────────────
  {
    const key = `verify:window:${Date.now()}`;
    const opts = { windowMs: 500, maxRequests: 3 };
    const r1 = await isRateLimited(db, key, opts);
    const r2 = await isRateLimited(db, key, opts);
    const r3 = await isRateLimited(db, key, opts);
    const r4 = await isRateLimited(db, key, opts);
    assert('request 1/3 allowed', r1 === false);
    assert('request 2/3 allowed', r2 === false);
    assert('request 3/3 allowed', r3 === false);
    assert('request 4 (over max) blocked', r4 === true);

    await new Promise((resolve) => setTimeout(resolve, 600));
    const r5 = await isRateLimited(db, key, opts);
    assert('request after window expiry allowed again', r5 === false);

    await cleanup([key]);
  }

  // ── 3: independent keys don't interfere (e.g. email vs IP dimension) ──
  {
    const emailKey = `verify:dim:email:${Date.now()}`;
    const ipKey = `verify:dim:ip:${Date.now()}`;
    const opts = { windowMs: 60_000, maxRequests: 1 };

    const emailFirst = await isRateLimited(db, emailKey, opts);
    const emailSecond = await isRateLimited(db, emailKey, opts); // now over its own limit
    const ipFirst = await isRateLimited(db, ipKey, opts); // independent bucket, still fresh

    assert('email dimension: 1st request allowed', emailFirst === false);
    assert('email dimension: 2nd request blocked (own limit hit)', emailSecond === true);
    assert('IP dimension: unaffected by email dimension being blocked', ipFirst === false);

    await cleanup([emailKey, ipKey]);
  }

  // ── 4: fail-open when Firestore is unreachable ────────────────────────
  {
    // A Firestore client pointed at a port nothing is listening on —
    // every transaction against it will throw (connection refused).
    const deadDb = admin.initializeApp(
      { projectId: 'demo-outrun-rate-limit-verify-unreachable' },
      'unreachable-app',
    ).firestore();
    deadDb.settings({ host: '127.0.0.1:1', ssl: false });

    const key = `verify:fail-open:${Date.now()}`;
    let threw = false;
    let result: boolean | null = null;
    try {
      result = await isRateLimited(deadDb, key, { windowMs: 60_000, maxRequests: 1 });
    } catch {
      threw = true;
    }
    assert('isRateLimited does not throw when Firestore is unreachable', threw === false);
    assert('isRateLimited fails OPEN (returns false = not limited) on failure', result === false);
  }

  console.log(`\n${passed} passed, ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Fatal error running verify-rate-limit:', err);
  process.exit(1);
});
