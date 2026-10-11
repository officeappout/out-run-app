/**
 * LAYER-2 SECURITY FIX — feed_posts #2 (partial), 11.10.2026.
 * firestore.rules only, create path only, NO DEPLOY.
 *
 * feed.service.ts stamps groupIds/authorityId/neighborhoodId/schoolId/
 * parkId/ageGroup/gender/programId onto every feed_posts doc for
 * leaderboard/scope queries. None were ever checked against the caller's
 * own profile. This fix closes exactly the 4 that are provable in pure
 * rules against a value already sitting flat on the caller's own
 * users/{uid} doc:
 *   groupIds       — every claimed id must be in the caller's own
 *                     social.groupIds (hasAll).
 *   neighborhoodId — must equal the caller's own core.neighborhoodId.
 *   ageGroup       — must equal the caller's own core.ageGroup.
 *   gender         — must equal the caller's own core.gender.
 *
 * NOT touched (see the write-up): authorityId, schoolId, programId,
 * parkId — and the update path (a separate, wider gap: the author can
 * still rewrite any of these 8 fields freely post-creation).
 *
 * Run: isolated emulator on 127.0.0.1:8089 (NOT the shared 8080 instance
 * another concurrent session may be using) — start with:
 *   firebase emulators:start --only firestore --config firebase-audit.json --project appout-1-audit-test
 */
import { describe, beforeAll, afterAll, it as vitestIt } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { doc, setDoc } from 'firebase/firestore';

let pass = 0;
let fail = 0;
const failures: string[] = [];

async function it(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    pass++;
  } catch (e: any) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${e?.message ?? e}`);
    fail++;
    failures.push(name);
  }
}

const PROJECT_ID = 'appout-1-audit-test';
const rules = readFileSync('firestore.rules', 'utf8');
let env: RulesTestEnvironment;

async function setup() {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules, host: '127.0.0.1', port: 8089 },
  });

  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users', 'author1'), {
      core: { name: 'Author One', neighborhoodId: 'neigh_real', ageGroup: 'adult', gender: 'female' },
      social: { groupIds: ['groupReal1', 'groupReal2'] },
    });
    // A second real profile to prove the check is against the CALLER's own
    // doc, not some other hardcoded value.
    await setDoc(doc(db, 'users', 'author2'), {
      core: { neighborhoodId: 'neigh_other', ageGroup: 'minor', gender: 'male' },
      social: { groupIds: [] },
    });
  });
}

/**
 * Defaults to author1's REAL, honest scope (matches the seeded profile
 * exactly) on all 4 checked fields — a DENY test overrides exactly the
 * ONE field under test to a forged value, leaving the other 3 honest, so
 * a failure is unambiguously attributable to that one field. Without this,
 * a CONTROL test that only sets the field it cares about (leaving the
 * other 3 at some unrelated default) would be denied for the WRONG
 * reason — every one of the 4 conditions below is AND'd together, so all
 * 4 must be honest simultaneously for any create to succeed.
 */
function basePost(overrides: Record<string, unknown> = {}) {
  return {
    authorUid: 'author1',
    authorName: 'Author One',
    type: 'workout',
    audience: 'public',
    createdAt: new Date(),
    groupIds: ['groupReal1'],
    neighborhoodId: 'neigh_real',
    ageGroup: 'adult',
    gender: 'female',
    ...overrides,
  };
}

async function testGroupIds() {
  console.log('\ngroupIds — must be a subset of the caller\'s own social.groupIds');

  await it('[CONTROL] post claims a group the caller is REALLY in → ALLOWED', async () => {
    const ctx = env.authenticatedContext('author1');
    await assertSucceeds(setDoc(doc(ctx.firestore(), 'feed_posts', 'post_g_ok'), basePost({ groupIds: ['groupReal1'] })));
  });

  await it('[DENY] post claims a group the caller is NOT in → DENIED', async () => {
    const ctx = env.authenticatedContext('author1');
    await assertFails(setDoc(doc(ctx.firestore(), 'feed_posts', 'post_g_forged'), basePost({ groupIds: ['groupForged'] })));
  });

  await it('[DENY] post claims a REAL group, but one belonging to a DIFFERENT user (author2), not the caller → DENIED', async () => {
    const ctx = env.authenticatedContext('author2');
    // Every OTHER field is author2's own honest value — isolates the
    // failure to groupIds specifically, not a side effect of the other 3
    // checks also being wrong for this caller.
    await assertFails(setDoc(doc(ctx.firestore(), 'feed_posts', 'post_g_cross'), basePost({
      authorUid: 'author2', groupIds: ['groupReal1'],
      neighborhoodId: 'neigh_other', ageGroup: 'minor', gender: 'male',
    })));
  });
}

async function testNeighborhoodId() {
  console.log('\nneighborhoodId — must equal the caller\'s own core.neighborhoodId');

  await it('[CONTROL] post\'s neighborhoodId matches the caller\'s real one → ALLOWED', async () => {
    const ctx = env.authenticatedContext('author1');
    await assertSucceeds(setDoc(doc(ctx.firestore(), 'feed_posts', 'post_n_ok'), basePost({ neighborhoodId: 'neigh_real' })));
  });

  await it('[DENY] post claims a DIFFERENT neighborhoodId than the caller\'s real one → DENIED', async () => {
    const ctx = env.authenticatedContext('author1');
    await assertFails(setDoc(doc(ctx.firestore(), 'feed_posts', 'post_n_forged'), basePost({ neighborhoodId: 'neigh_other' })));
  });
}

async function testAgeGroup() {
  console.log('\nageGroup — must equal the caller\'s own core.ageGroup');

  await it('[CONTROL] post\'s ageGroup matches the caller\'s real one → ALLOWED', async () => {
    const ctx = env.authenticatedContext('author1');
    await assertSucceeds(setDoc(doc(ctx.firestore(), 'feed_posts', 'post_a_ok'), basePost({ ageGroup: 'adult' })));
  });

  await it('[DENY] post claims ageGroup "minor" while the caller\'s real core.ageGroup is "adult" → DENIED', async () => {
    const ctx = env.authenticatedContext('author1');
    await assertFails(setDoc(doc(ctx.firestore(), 'feed_posts', 'post_a_forged'), basePost({ ageGroup: 'minor' })));
  });
}

async function testGender() {
  console.log('\ngender — must equal the caller\'s own core.gender');

  await it('[CONTROL] post\'s gender matches the caller\'s real one → ALLOWED', async () => {
    const ctx = env.authenticatedContext('author1');
    await assertSucceeds(setDoc(doc(ctx.firestore(), 'feed_posts', 'post_s_ok'), basePost({ gender: 'female' })));
  });

  await it('[DENY] post claims gender "male" while the caller\'s real core.gender is "female" → DENIED', async () => {
    const ctx = env.authenticatedContext('author1');
    await assertFails(setDoc(doc(ctx.firestore(), 'feed_posts', 'post_s_forged'), basePost({ gender: 'male' })));
  });
}

async function testNoProfileDoc() {
  console.log('\nregression guard — caller has NO users/{uid} doc at all (not just a missing field)');

  await it('[REGRESSION GUARD] a real authenticated user with no users/{uid} profile doc at all posts with no scope fields → still ALLOWED (getUserDocSafe() must default to {} instead of throwing — this broke the existing WC6 cumulative test on the first pass of this fix, caught here and fixed)', async () => {
    const ctx = env.authenticatedContext('no_profile_user');
    await assertSucceeds(setDoc(doc(ctx.firestore(), 'feed_posts', 'post_no_profile'), {
      authorUid: 'no_profile_user', audience: 'public', createdAt: new Date(),
    }));
  });
}

async function testUnaffectedFields() {
  console.log('\nunaffected fields — authorityId/schoolId/programId/parkId pass through untouched (out of scope for this fix)');

  await it('[CONTROL] a real post with arbitrary authorityId/schoolId/programId/parkId values (NOT validated by this fix) still succeeds, as long as the 4 fixed fields are honest', async () => {
    const ctx = env.authenticatedContext('author1');
    await assertSucceeds(setDoc(doc(ctx.firestore(), 'feed_posts', 'post_unaffected_ok'), basePost({
      groupIds: ['groupReal1'], neighborhoodId: 'neigh_real', ageGroup: 'adult', gender: 'female',
      authorityId: 'anything_unchecked', schoolId: 'anything_unchecked',
      programId: 'anything_unchecked', parkId: 'anything_unchecked',
    })));
  });
}

function wrapSuite(name: string, fn: () => Promise<void>) {
  describe(name, () => {
    vitestIt('runs', async () => {
      const before = fail;
      await fn();
      if (fail > before) {
        throw new Error(`${fail - before} case(s) failed in "${name}" — see console output above for details`);
      }
    }, 60_000);
  });
}

beforeAll(async () => {
  await setup();
}, 30_000);

afterAll(async () => {
  console.log(`\n=== firestore-fix-feed-posts-scope-fields.rules.test.ts: ${pass} passed, ${fail} failed ===`);
  if (failures.length) console.log('Failed:', failures.join(', '));
  if (env) await env.cleanup();
});

wrapSuite('groupIds', testGroupIds);
wrapSuite('neighborhoodId', testNeighborhoodId);
wrapSuite('ageGroup', testAgeGroup);
wrapSuite('gender', testGender);
wrapSuite('no profile doc', testNoProfileDoc);
wrapSuite('unaffected fields', testUnaffectedFields);
