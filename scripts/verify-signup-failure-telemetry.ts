#!/usr/bin/env npx tsx
/**
 * scripts/verify-signup-failure-telemetry.ts
 *
 * Emulator-only (no --prod, by design — see scripts/verify-unit-join-
 * requests.ts for the same convention) verification of the signup-failure
 * telemetry feature (David, 24.09.2026 — "eyes for launch day" part ב,
 * see docs/audit-2026-09/00-MASTER-PLAN.md §13.18/§13.19).
 *
 * Covers the negatives David explicitly required:
 *   - a write with no uid at all (many failures happen before any auth
 *     session exists — this must succeed, uid stored as null).
 *   - rate-limiting (reusing isRateLimited exactly as-is, David's
 *     standing preference — no new algorithm).
 *   - a failure in the recording itself must be swallowed, never thrown
 *     upward (a user already stuck must never get a SECOND error because
 *     our own diagnostic logging broke).
 * Plus: an unknown/invalid stage is rejected (closed list, not written),
 * the read side (computeSignupFailuresList) returns the right shape and
 * respects ordering/limit, and isRootAdmin correctly distinguishes root
 * from a non-root email (the actual authorization gate the read route
 * uses — "root only, not even super_admin/authority_manager/tenant_owner/
 * unit_admin", per David's exact wording).
 *
 * Usage:
 *   firebase emulators:start --only firestore
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/verify-signup-failure-telemetry.ts
 */
import * as admin from 'firebase-admin';
import { createRequire } from 'module';

function neutralizeServerOnly(): void {
  const cjsRequire = createRequire(import.meta.url);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const NodeMod = cjsRequire('module') as any;
  const origLoad = NodeMod._load.bind(NodeMod);
  NodeMod._load = function (id: string, ...args: unknown[]) {
    if (id === 'server-only') return {};
    return origLoad(id, ...args);
  };
}
neutralizeServerOnly();

const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
process.env.FIRESTORE_EMULATOR_HOST = EMULATOR_HOST;
console.log(`🧪  Firestore → emulator ONLY (${EMULATOR_HOST}) — this script never targets production.\n`);

if (!admin.apps.length) {
  admin.initializeApp({ projectId: 'demo-outrun-signup-failure-telemetry-verify' });
}
const db = admin.firestore();

let passed = 0;
let failed = 0;
function assert(label: string, condition: boolean, detail?: string) {
  if (condition) { console.log(`  ✅  ${label}`); passed++; }
  else { console.error(`  ❌  ${label}${detail ? ` — ${detail}` : ''}`); failed++; }
}

async function main() {
  const { logSignupFailure, SIGNUP_FAILURE_STAGES } = await import('../src/lib/signupFailureLog');
  const { computeSignupFailuresList } = await import('../src/app/api/admin/signup-failures/route');
  const { isRateLimited } = await import('../src/lib/rateLimit');
  const { RATE_LIMITS } = await import('../src/lib/rateLimitConfig');
  const { isRootAdmin } = await import('../src/config/feature-flags');

  const run = Date.now();

  // ══════════════════════════════════════════════════════════════════════
  console.log('── logSignupFailure: positive cases ────────────────────────');
  {
    const uid = `real-uid-${run}`;
    await logSignupFailure(db, { uid, stage: 'AUTH_GOOGLE', reason: 'auth/network-request-failed' });
    const snap = await db.collection('signup_failures').where('uid', '==', uid).get();
    assert('write WITH a uid: exactly 1 doc, correct fields', snap.size === 1);
    if (snap.size === 1) {
      const data = snap.docs[0].data();
      assert('  stage stored correctly', data.stage === 'AUTH_GOOGLE');
      assert('  reason stored correctly', data.reason === 'auth/network-request-failed');
      assert('  timestamp is a real Firestore Timestamp', typeof data.timestamp?.toMillis === 'function');
    }
  }
  {
    // THE required negative: no uid at all — the majority of the earliest,
    // most severe failures (e.g. anonymous sign-in itself failing) happen
    // before any auth session exists.
    await logSignupFailure(db, { uid: null, stage: 'GATEWAY_EXPLORE', reason: 'unknown' });
    const snap = await db.collection('signup_failures').where('stage', '==', 'GATEWAY_EXPLORE').where('reason', '==', 'unknown').get();
    assert('write WITHOUT a uid (uid=null): succeeds, stored as null, not rejected', snap.size >= 1 && snap.docs[0].data().uid === null);
  }

  console.log('\n── logSignupFailure: unknown stage is rejected (closed list) ──');
  {
    const before = (await db.collection('signup_failures').get()).size;
    // @ts-expect-error — deliberately an invalid stage, to prove the
    // runtime check (not just the TS type) rejects it.
    await logSignupFailure(db, { uid: null, stage: 'NOT_A_REAL_STAGE', reason: 'whatever' });
    const after = (await db.collection('signup_failures').get()).size;
    assert('an unknown stage writes NOTHING (defense in depth beyond the TS type)', after === before);
  }
  assert('SIGNUP_FAILURE_STAGES is a real, non-empty closed list', Array.isArray(SIGNUP_FAILURE_STAGES) && SIGNUP_FAILURE_STAGES.length > 0);

  console.log('\n── logSignupFailure: THE required negative — failure in the recording itself is swallowed ──');
  {
    // Simulate the write itself throwing (missing index, Firestore outage,
    // anything) — patched at the shared prototype level so it also
    // intercepts calls made via getAdminDb() internally elsewhere, same
    // technique already established in this build (Stage 0's fail-closed
    // test for resolveUnitPermissionScope).
    const proto = Object.getPrototypeOf(db);
    const originalCollection = proto.collection;
    proto.collection = function simulateFirestoreOutage() {
      throw new Error('simulated: Firestore unavailable');
    };
    let threw = false;
    try {
      await logSignupFailure(db, { uid: `will-fail-${run}`, stage: 'HEALTH_SYNC', reason: 'unknown' });
    } catch {
      threw = true;
    } finally {
      proto.collection = originalCollection;
    }
    assert('a failure inside the write itself is swallowed — logSignupFailure NEVER throws (a stuck user must not get a SECOND error)', threw === false);

    // Restored correctly — a normal call works again afterward.
    const uid = `after-restore-${run}`;
    await logSignupFailure(db, { uid, stage: 'HEALTH_SYNC', reason: 'unknown' });
    const snap = await db.collection('signup_failures').where('uid', '==', uid).get();
    assert('after restoring the write path: a normal call succeeds again', snap.size === 1);
  }

  // ══════════════════════════════════════════════════════════════════════
  console.log('\n── Rate limit: IP-based, reusing isRateLimited as-is ────────');
  {
    const ip = `203.0.113.${run % 256}`;
    const window = RATE_LIMITS.signupFailureTelemetry.ip();
    const results: boolean[] = [];
    for (let i = 0; i < window.maxRequests + 1; i++) {
      results.push(await isRateLimited(db, `signup-failure-telemetry:ip:${ip}`, window));
    }
    const allButLastAllowed = results.slice(0, -1).every((blocked) => blocked === false);
    const lastBlocked = results[results.length - 1] === true;
    assert(`attempts 1-${window.maxRequests} are NOT rate-limited`, allButLastAllowed);
    assert(`attempt ${window.maxRequests + 1} (over the cap, same window) IS rate-limited`, lastBlocked);
  }

  // ══════════════════════════════════════════════════════════════════════
  console.log('\n── computeSignupFailuresList: read side, ordering + limit ──');
  {
    // Clean slate for a deterministic ordering check.
    const existing = await db.collection('signup_failures').get();
    await Promise.all(existing.docs.map((d) => d.ref.delete()));

    const t0 = admin.firestore.Timestamp.fromMillis(run);
    const t1 = admin.firestore.Timestamp.fromMillis(run + 1000);
    const t2 = admin.firestore.Timestamp.fromMillis(run + 2000);
    await db.collection('signup_failures').add({ uid: 'a', stage: 'AUTH_GOOGLE', reason: 'r1', timestamp: t0 });
    await db.collection('signup_failures').add({ uid: 'b', stage: 'AUTH_APPLE', reason: 'r2', timestamp: t1 });
    await db.collection('signup_failures').add({ uid: null, stage: 'IDENTITY_SUBMIT', reason: 'r3', timestamp: t2 });

    const rows = await computeSignupFailuresList(db);
    assert('returns all 3 seeded rows', rows.length === 3);
    assert('ordered newest-first (timestamp desc)', rows[0].reason === 'r3' && rows[1].reason === 'r2' && rows[2].reason === 'r1');
    assert('a null uid round-trips as null, not a crash', rows[0].uid === null);
    assert('non-null uid round-trips correctly', rows[1].uid === 'b');

    const limited = await computeSignupFailuresList(db, 2);
    assert('limit parameter is respected', limited.length === 2);
  }

  // ══════════════════════════════════════════════════════════════════════
  console.log('\n── Authorization gate the read route actually uses: isRootAdmin ──');
  {
    assert('isRootAdmin(david@appout.co.il) → true', isRootAdmin('david@appout.co.il'));
    assert('isRootAdmin(office@appout.co.il) → true', isRootAdmin('office@appout.co.il'));
    assert('isRootAdmin(some-super-admin@appout.co.il) → false — root is narrower than admin:true, by design', isRootAdmin('some-super-admin@appout.co.il') === false);
    assert('isRootAdmin(null) → false', isRootAdmin(null) === false);
  }

  console.log(`\n${passed} passed, ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Fatal error running verify-signup-failure-telemetry:', err);
  process.exit(1);
});
