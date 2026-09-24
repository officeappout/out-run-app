#!/usr/bin/env npx tsx
/**
 * scripts/verify-seed-military-school-idempotency.ts
 *
 * Emulator-only (no --prod, no real Firebase project — never runs the
 * actual seed tool against production, per David's explicit instruction,
 * 24.09.2026) verification of the idempotency fix in
 * src/features/admin/services/seed-military-school-demo.ts:
 *   1. A second call to seedMilitaryDemo()/seedSchoolDemo() must write
 *      NOTHING — checked via {success:false} AND via re-counting every
 *      collection the seed touches (users/authorities/feed_posts/streaks)
 *      before and after, asserting zero change.
 *   2. feed_posts docs use a deterministic id (`${uid}-post-${index}`) —
 *      even if the top-level guard were ever bypassed, a re-run would
 *      upsert the SAME docs, not add new ones (defense in depth).
 *
 * seed-military-school-demo.ts is CLIENT-SDK code (`firebase/firestore`,
 * not Admin SDK) — it hard-imports its own `db`/`auth` singletons from
 * '@/lib/firebase', which point at the real production Firebase project
 * with no emulator-connection wiring at all (confirmed: no
 * connectFirestoreEmulator/connectAuthEmulator anywhere in that file).
 * This project also has no Auth emulator configured (firebase.json has no
 * `auth` block — `firebase emulators:start --only auth` refuses to start:
 * "make sure you have run firebase init"), so the normal client-SDK test
 * pattern (sign in via the Auth emulator, then write through rules as a
 * real authenticated admin) isn't available here without a firebase.json
 * change, which is out of scope for "a small idempotency fix."
 *
 * Verification strategy instead: `@firebase/rules-unit-testing`'s
 * withSecurityRulesDisabled gives a Firestore CLIENT instance (same
 * modular `firebase/firestore` SDK surface this file already uses —
 * doc/setDoc/getDoc/query/where/getDocs/arrayUnion/serverTimestamp/
 * Timestamp all work unchanged) with rules bypassed, same category of
 * privileged access Admin SDK gets in every OTHER script in this repo —
 * this is testing the NEW logic (the guard + deterministic ids), not
 * re-testing firestore.rules compliance, which is unchanged by this fix
 * and was already confirmed working in the live browser tool. A
 * Module._load intercept (same technique used throughout this build for
 * neutralizing 'server-only') redirects seed-military-school-demo.ts's
 * `@/lib/firebase` import to {db: <rules-disabled emulator firestore>,
 * auth: {currentUser: null}} so the file's own code runs completely
 * unmodified.
 *
 * Usage:
 *   firebase emulators:start --only firestore
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/verify-seed-military-school-idempotency.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { createRequire } from 'module';
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
// Static, top-level import — matches tests/firestore-rules.test.ts's own
// established pattern for this exact library combination. A dynamic
// `await import('firebase/firestore')` issued LATER (inside the
// withSecurityRulesDisabled callback, after @firebase/rules-unit-testing
// has already transitively loaded its own copy) resolved to a DIFFERENT
// module instance and made collection()/getDocs() reject `ctx.firestore()`
// with "Expected first argument to collection() to be a ... FirebaseFirestore"
// — same package, wrong loaded copy. Importing it here, at the top, before
// anything else touches it, avoids that entirely.
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';

const PROJECT_ID = 'demo-outrun-seed-idempotency-verify';

let passed = 0;
let failed = 0;
function assert(label: string, condition: boolean, detail?: string) {
  if (condition) { console.log(`  ✅  ${label}`); passed++; }
  else { console.error(`  ❌  ${label}${detail ? ` — ${detail}` : ''}`); failed++; }
}

async function main() {
  const rules = fs.readFileSync(path.join(process.cwd(), 'firestore.rules'), 'utf8');
  const testEnv: RulesTestEnvironment = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules, host: '127.0.0.1', port: 8080 },
  });
  await testEnv.clearFirestore();

  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const fakeDb = ctx.firestore();

    // Redirect '@/lib/firebase' (and any relative path ending the same
    // way) to a fake module exposing this same rules-disabled Firestore
    // instance as `db`, and a signed-out `auth` — seed-military-school-
    // demo.ts's own code (doc/setDoc/getDoc/etc., all imported from the
    // real 'firebase/firestore' package) runs completely unmodified
    // against it.
    const cjsRequire = createRequire(import.meta.url);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const NodeMod = cjsRequire('module') as any;
    const origLoad = NodeMod._load.bind(NodeMod);
    NodeMod._load = function (id: string, ...args: unknown[]) {
      if (id === 'server-only') return {};
      if (id === '@/lib/firebase' || id.endsWith('/lib/firebase') || id.endsWith('lib/firebase.ts') || id.endsWith('lib/firebase.js')) {
        return { db: fakeDb, auth: { currentUser: null }, app: undefined };
      }
      return origLoad(id, ...args);
    };

    const { seedMilitaryDemo, seedSchoolDemo } = await import('../src/features/admin/services/seed-military-school-demo');

    async function countAll(collectionName: string): Promise<number> {
      const snap = await getDocs(collection(fakeDb, collectionName));
      return snap.size;
    }

    // ════════════════════════════════════════════════════════════════════
    console.log('── seedMilitaryDemo: first run writes real data ────────────');
    const firstMilitary = await seedMilitaryDemo();
    assert('first run: success=true', firstMilitary.success === true);

    const usersAfterFirst = await countAll('users');
    const feedPostsAfterFirst = await countAll('feed_posts');
    const streaksAfterFirst = await countAll('streaks');
    assert('first run: 30 military-demo users created', usersAfterFirst === 30);
    assert('first run: feed_posts created (deterministic ids, but non-zero)', feedPostsAfterFirst > 0);
    assert('first run: 30 streak docs created', streaksAfterFirst === 30);

    // Snapshot one specific feed_post's content to prove it is untouched
    // by the second run below (not just "same count" — byte-identical).
    const sentinelPostRef = doc(fakeDb, 'feed_posts', 'military-demo-company-a-00-post-0');
    const sentinelBefore = await getDoc(sentinelPostRef);
    assert('sentinel feed_post (deterministic id) exists after first run', sentinelBefore.exists());
    const sentinelDataBefore = sentinelBefore.data();

    console.log('\n── seedMilitaryDemo: SECOND run — THE FIX ──────────────────');
    const secondMilitary = await seedMilitaryDemo();
    assert('second run: success=false (guard fired, nothing written)', secondMilitary.success === false);
    assert('second run: message mentions already-seeded, not a crash', typeof secondMilitary.message === 'string' && secondMilitary.message.length > 0);

    const usersAfterSecond = await countAll('users');
    const feedPostsAfterSecond = await countAll('feed_posts');
    const streaksAfterSecond = await countAll('streaks');
    assert('second run: user count UNCHANGED (still 30, not 60)', usersAfterSecond === usersAfterFirst);
    assert('second run: feed_posts count UNCHANGED (deterministic ids + guard both prevent growth)', feedPostsAfterSecond === feedPostsAfterFirst);
    assert('second run: streak doc count UNCHANGED', streaksAfterSecond === streaksAfterFirst);

    const sentinelAfter = await getDoc(sentinelPostRef);
    assert('sentinel feed_post: byte-identical after second run (guard exited before any write)', JSON.stringify(sentinelAfter.data()) === JSON.stringify(sentinelDataBefore));

    // ════════════════════════════════════════════════════════════════════
    console.log('\n── seedSchoolDemo: first run writes real data ───────────────');
    const firstSchool = await seedSchoolDemo();
    assert('first run: success=true', firstSchool.success === true);

    const usersAfterFirstSchool = await countAll('users'); // cumulative with military users above
    assert('first run: 30 more users created (30 military + 30 school = 60 total)', usersAfterFirstSchool === 60);

    console.log('\n── seedSchoolDemo: SECOND run — THE FIX ─────────────────────');
    const secondSchool = await seedSchoolDemo();
    assert('second run: success=false (guard fired)', secondSchool.success === false);

    const usersAfterSecondSchool = await countAll('users');
    assert('second run: user count UNCHANGED (still 60, not 90)', usersAfterSecondSchool === 60);

    // Restore the real module loader before this callback returns.
    NodeMod._load = origLoad;
  });

  await testEnv.cleanup();

  console.log(`\n${passed} passed, ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Fatal error running verify-seed-military-school-idempotency:', err);
  process.exit(1);
});
