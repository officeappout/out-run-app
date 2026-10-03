#!/usr/bin/env npx tsx
/**
 * scripts/export-ghost-review.ts
 *
 * DRY-RUN, READ-ONLY. No writes to Firestore, no writes to Firebase Auth.
 * The only write anywhere in this file is the local CSV at the very end
 * (scripts/_backups/ — gitignored, chmod 600).
 *
 * Context: scripts/mark-test-accounts.ts already ran against production
 * (23-24.09.2026, approved with David) and set core.isTestData=true on 606
 * docs (+ core.isMockData=true, pre-existing, on 10 Sderot-demo docs) — see
 * that script's own header for the full approved criteria + protection
 * rules. isTestOrMockUser() (src/lib/testAccountFilter.ts) already excludes
 * both flags from statistics-summary/insights-summary/analytics.service.
 *
 * This script does NOT re-review those 616 already-handled docs. It looks
 * ONLY at docs that are NEITHER core.isTestData NOR core.isMockData, and
 * checks them against two criteria NOT covered by the approved pass:
 *
 *   emptyGhostAccount       — no core.name AND no program
 *                             (progression.activePrograms empty AND
 *                             progression.tracks empty) AND 0 completed
 *                             workouts (progression.workoutCount AND the
 *                             real `workouts` collection, cross-checked)
 *                             AND onboardingStatus !== 'COMPLETED' AND
 *                             globalLevel <= 1 with no domain level > 1.
 *   emailContainsDemoTest   — core.email OR the Firebase Auth email contains
 *                             demo / test / example / +test (case-insensitive).
 *                             Checks BOTH sources because core.email can be
 *                             blank/stale while Auth still has the real one.
 *
 * Same protection rules as mark-test-accounts.ts, re-applied here (never
 * skip these, regardless of which criterion matched):
 *   authorityManager  — uid in managerIds of any authorities/{id} doc
 *   hasAdminRole      — core.isSuperAdmin/isSystemAdmin/isVerticalAdmin/
 *                       isTenantOwner, core.role==='system_admin', or a
 *                       non-empty core.allowedSections
 *   realEngagedUser   — has >=1 workout AND has an email (Firestore or Auth)
 *
 * Apple-relay / "other signs of a real user" check (required by this task,
 * on top of mark-test-accounts.ts's original scope): for every
 * emptyGhostAccount match with no core.email, this script looks up the
 * Firebase Auth record directly. If Auth shows ANY of — a real email
 * (including a privaterelay.appleid.com relay address), apple.com/google.com
 * in providerData, or a lastSignInTime meaningfully after creationTime
 * (>1hr gap, i.e. they came back at least once) — the doc is pulled OUT of
 * the ghost-candidate group into appleRelaySuspect and excluded from any
 * recommended flagging, for manual review instead.
 *
 * Output:
 *   - Console: counts only (matches the privacy posture mark-test-accounts.ts
 *     established — no uid/email/name printed to stdout).
 *   - CSV: scripts/_backups/ghost-review-<timestamp>.csv — full PII-bearing
 *     review data (uid, email, displayName, authProvider, createdAt,
 *     lastActive, workoutCount, onboardingCompleted, hasEmail, matchedGroup,
 *     matchReason) for every one of the NOT-already-flagged docs, local file
 *     only, chmod 600, same treatment as scripts/backup-users-collection.ts.
 *
 * Usage:
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/export-ghost-review.ts
 */
import * as admin from 'firebase-admin';
import * as fs from 'node:fs';
import * as path from 'node:path';

const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (!rawKey) {
  console.error('FIREBASE_SERVICE_ACCOUNT_KEY not set');
  process.exit(1);
}
if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(rawKey)) });
}
const db = admin.firestore();
const auth = admin.auth();

const DEMO_TEST_PATTERNS = ['demo', 'test', 'example', '+test'];
function matchesDemoTestEmail(email: string): string[] {
  const lower = email.toLowerCase();
  return DEMO_TEST_PATTERNS.filter((p) => lower.includes(p));
}

function csvEscape(value: unknown): string {
  const str = value === null || value === undefined ? '' : String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

const CSV_HEADERS = [
  'uid', 'email', 'displayName', 'authProvider', 'createdAt', 'lastActive',
  'workoutCount', 'onboardingCompleted', 'hasEmail', 'matchedGroup', 'matchReason',
];

interface AuthInfo {
  email?: string;
  providerIds: string[];
  createdAtMs?: number;
  lastSignInAtMs?: number;
}

function toIso(value: unknown): string {
  if (!value) return '';
  if (value instanceof admin.firestore.Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return '';
}

async function main() {
  console.log('Fetching authorities (for the authorityManager protection rule)...');
  const authoritiesSnap = await db.collection('authorities').get();
  const managerUids = new Set<string>();
  authoritiesSnap.docs.forEach((d) => {
    const ids = d.data().managerIds;
    if (Array.isArray(ids)) ids.forEach((uid) => typeof uid === 'string' && managerUids.add(uid));
  });

  console.log('Fetching users...');
  const usersSnap = await db.collection('users').get();
  console.log(`  ${usersSnap.size} total docs.\n`);

  console.log('Fetching workouts userId field (for real per-user workout counts)...');
  const workoutsSnap = await db.collection('workouts').select('userId').get();
  const workoutCountByUid = new Map<string, number>();
  workoutsSnap.docs.forEach((d) => {
    const uid = d.data().userId;
    if (typeof uid === 'string') workoutCountByUid.set(uid, (workoutCountByUid.get(uid) ?? 0) + 1);
  });
  console.log(`  ${workoutsSnap.size} workout docs, ${workoutCountByUid.size} distinct users.\n`);

  const candidates = usersSnap.docs.filter((d) => {
    const core = (d.data().core ?? {}) as Record<string, unknown>;
    return core.isTestData !== true && core.isMockData !== true;
  });
  console.log(`${usersSnap.size - candidates.length} docs already core.isTestData/core.isMockData — skipped (already handled).`);
  console.log(`${candidates.length} docs remain to review.\n`);

  console.log('Looking up Firebase Auth records for the remaining docs (batched, read-only)...');
  const authInfoByUid = new Map<string, AuthInfo>();
  const uids = candidates.map((d) => d.id);
  for (let i = 0; i < uids.length; i += 100) {
    const chunk = uids.slice(i, i + 100);
    const result = await auth.getUsers(chunk.map((uid) => ({ uid })));
    result.users.forEach((u) => {
      authInfoByUid.set(u.uid, {
        email: u.email,
        providerIds: (u.providerData ?? []).map((p) => p.providerId),
        createdAtMs: u.metadata.creationTime ? new Date(u.metadata.creationTime).getTime() : undefined,
        lastSignInAtMs: u.metadata.lastSignInTime ? new Date(u.metadata.lastSignInTime).getTime() : undefined,
      });
    });
  }
  console.log(`  Matched ${authInfoByUid.size}/${uids.length} docs to a live Auth record.\n`);

  interface Row {
    uid: string;
    email: string;
    displayName: string;
    authProvider: string;
    createdAt: string;
    lastActive: string;
    workoutCount: number;
    onboardingCompleted: boolean;
    hasEmail: boolean;
    matchedGroup: string;
    matchReason: string;
  }
  const rows: Row[] = [];

  let protectedAuthorityManager = 0;
  let protectedAdminRole = 0;
  let protectedRealEngaged = 0;
  let ghostCandidate = 0;
  let appleRelaySuspect = 0;
  let demoEmailCandidate = 0;
  let noMatchNeedsReview = 0;

  for (const doc of candidates) {
    const data = doc.data();
    const core = (data.core ?? {}) as Record<string, unknown>;
    const progression = (data.progression ?? {}) as Record<string, unknown>;
    const authInfo = authInfoByUid.get(doc.id);

    const firestoreEmail = typeof core.email === 'string' ? core.email.trim() : '';
    const authEmail = authInfo?.email?.trim() ?? '';
    const email = firestoreEmail || authEmail;
    const hasEmail = email.length > 0;

    const name = typeof core.name === 'string' ? core.name.trim() : '';
    const allowedSections = core.allowedSections;
    const hasAdminRole =
      core.isSuperAdmin === true ||
      core.isSystemAdmin === true ||
      core.role === 'system_admin' ||
      core.isVerticalAdmin === true ||
      core.isTenantOwner === true ||
      (Array.isArray(allowedSections) && allowedSections.length > 0);

    const realWorkoutCount = workoutCountByUid.get(doc.id) ?? 0;
    const fieldWorkoutCount = typeof progression.workoutCount === 'number' ? progression.workoutCount : 0;
    const workoutCount = Math.max(realWorkoutCount, fieldWorkoutCount);
    const hasWorkout = workoutCount > 0;

    const onboardingStatus = data.onboardingStatus;
    const onboardingCompleted = onboardingStatus === 'COMPLETED';

    const activePrograms = progression.activePrograms;
    const tracks = progression.tracks;
    const hasProgram =
      (Array.isArray(activePrograms) && activePrograms.length > 0) ||
      (tracks && typeof tracks === 'object' && Object.keys(tracks as object).length > 0);

    let globalLevel = typeof progression.globalLevel === 'number' ? progression.globalLevel : 1;
    const domains = progression.domains;
    if (domains && typeof domains === 'object') {
      const domainLevels = Object.values(domains as Record<string, any>).map((d) => d?.currentLevel ?? 0);
      globalLevel = Math.max(globalLevel, ...domainLevels, 0);
    }

    const authProvider = typeof core.accountMethod === 'string' && core.accountMethod
      ? core.accountMethod
      : authInfo?.providerIds[0] ?? 'unknown';

    const createdAt = toIso(data.createdAt) || (authInfo?.createdAtMs ? new Date(authInfo.createdAtMs).toISOString() : '');
    const lastActive = toIso(data.lastActive) || (authInfo?.lastSignInAtMs ? new Date(authInfo.lastSignInAtMs).toISOString() : '');

    const baseRow = {
      uid: doc.id,
      email,
      displayName: name,
      authProvider,
      createdAt,
      lastActive,
      workoutCount,
      onboardingCompleted,
      hasEmail,
    };

    // ── Protection rules first — any one ends evaluation for this doc.
    if (managerUids.has(doc.id)) {
      protectedAuthorityManager++;
      rows.push({ ...baseRow, matchedGroup: 'protected', matchReason: 'authorityManager' });
      continue;
    }
    if (hasAdminRole) {
      protectedAdminRole++;
      rows.push({ ...baseRow, matchedGroup: 'protected', matchReason: 'hasAdminRole' });
      continue;
    }
    if (hasWorkout && hasEmail) {
      protectedRealEngaged++;
      rows.push({ ...baseRow, matchedGroup: 'protected', matchReason: 'realEngagedUser' });
      continue;
    }

    // ── emailContainsDemoTest — checked before the ghost criterion since an
    // email match is a stronger/more specific signal than an empty profile.
    const demoTestHits = matchesDemoTestEmail(email);
    if (hasEmail && demoTestHits.length > 0) {
      demoEmailCandidate++;
      rows.push({ ...baseRow, matchedGroup: 'demo-email-candidate', matchReason: `emailContainsDemoTest:${demoTestHits.join('+')}` });
      continue;
    }

    // ── emptyGhostAccount
    const isGhost = !name && !hasProgram && !hasWorkout && !onboardingCompleted && globalLevel <= 1;
    if (isGhost) {
      // Apple-relay / "other signs of a real user" check — only relevant
      // when Firestore has no email (if it did, hasEmail would be true and
      // realEngagedUser or demo-email would already have caught it above,
      // or this doc simply isn't a ghost per the hasWorkout condition).
      const signs: string[] = [];
      if (authEmail) signs.push('authEmail-present');
      if (authInfo?.providerIds.some((p) => p === 'apple.com' || p === 'google.com')) signs.push('realAuthProvider');
      if (authInfo?.createdAtMs && authInfo?.lastSignInAtMs && authInfo.lastSignInAtMs - authInfo.createdAtMs > 60 * 60 * 1000) {
        signs.push('returnedAfterSignup');
      }
      if (signs.length > 0) {
        appleRelaySuspect++;
        rows.push({ ...baseRow, matchedGroup: 'apple-relay-suspect-excluded', matchReason: `emptyGhostAccount;${signs.join(';')}` });
      } else {
        ghostCandidate++;
        rows.push({ ...baseRow, matchedGroup: 'ghost-candidate', matchReason: 'emptyGhostAccount' });
      }
      continue;
    }

    noMatchNeedsReview++;
    rows.push({ ...baseRow, matchedGroup: 'no-match-needs-review', matchReason: '' });
  }

  console.log('── Protection rules (never recommended for flagging) ──');
  console.log(`  authorityManager:  ${protectedAuthorityManager}`);
  console.log(`  hasAdminRole:      ${protectedAdminRole}`);
  console.log(`  realEngagedUser:   ${protectedRealEngaged}`);
  console.log('\n── New candidate groups (NOT yet flagged core.isTestData/isMockData) ──');
  console.log(`  ghost-candidate (Group A):            ${ghostCandidate}`);
  console.log(`  demo-email-candidate (Group B):       ${demoEmailCandidate}`);
  console.log(`  apple-relay-suspect-excluded:         ${appleRelaySuspect}  ← excluded from any recommendation, your manual review`);
  console.log(`  no-match-needs-review:                ${noMatchNeedsReview}`);
  console.log(`\nTotal reviewed (not already isTestData/isMockData): ${candidates.length}`);
  console.log('\nNo writes performed anywhere — read-only. CSV below is for your manual review.');

  const backupDir = path.join(__dirname, '_backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const csvLines = [CSV_HEADERS.join(',')];
  for (const row of rows) {
    csvLines.push(CSV_HEADERS.map((h) => csvEscape((row as any)[h])).join(','));
  }
  const csvPath = path.join(backupDir, `ghost-review-${Date.now()}.csv`);
  fs.writeFileSync(csvPath, '﻿' + csvLines.join('\r\n'), 'utf8');
  fs.chmodSync(csvPath, 0o600);
  console.log(`\nCSV written: ${csvPath}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
