#!/usr/bin/env npx tsx
/**
 * scripts/mark-test-accounts.ts
 *
 * Stage 2 of the test-account identification task (approved criteria +
 * absolute protection rules, agreed with David 23.09.2026 — see chat).
 * Writes core.isTestData=true + core.testDataReason (array of the
 * specific criterion keys that matched, so a single wrong criterion can
 * be unmarked later without touching the rest) + core.testDataMarkedAt
 * to production `users` docs.
 *
 * Deliberately a SEPARATE flag from core.isMockData (Sderot demo seed) —
 * never touches or reads isMockData=true docs except to skip them via
 * protection rule (d). Never a delete, in Firestore or Auth.
 *
 * ── Approved marking criteria (a doc is a candidate if it matches ANY) ──
 *   teamOrLocalEmail            — email domain is appout.co.il/outrun.co.il, or *.local
 *   noEmailNoWorkouts           — no email AND zero workout docs
 *   anonymousIncompleteOnboarding — core.isAnonymous===true AND onboardingStatus !== 'COMPLETED'
 *   suspiciousName:keyword      — name contains test/בדיקה/ניסיון/דמו/demo
 *   suspiciousName:repeatedChar — name is the same character repeated 3+ times
 *   suspiciousName:digitsOnly   — name is digits only
 *   suspiciousName:placeholder  — name is a generic placeholder (user/unknown/אנונימי/משתמש + optional digits)
 * (Explicitly rejected: "empty name" alone, and a createdAt cutoff — no
 * data-driven basis for either; an empty-name doc still gets caught if it
 * ALSO matches one of the above, e.g. anonymousIncompleteOnboarding.)
 *
 * ── Absolute protection rules (checked FIRST; override every criterion) ──
 *   authorityManager  — uid appears in managerIds of any authorities/{id} doc
 *   hasAdminRole      — core.isSuperAdmin/isSystemAdmin/isVerticalAdmin/isTenantOwner
 *                        true, OR core.role==='system_admin', OR core.allowedSections
 *                        is a non-empty array (platform_member — role.-derivation
 *                        logic mirrors src/features/admin/services/auth.service.ts)
 *   realEngagedUser   — has >=1 workout AND has an email
 *   isMockData        — core.isMockData===true (Sderot demo — never touched)
 *
 * SAFE BY DEFAULT: dry-run (no flags) prints counts only — no uid, email,
 * or name is ever logged, matching Stage 1's constraint. --confirm is
 * required to write anything, and even then re-checks each doc's live
 * state immediately before writing (idempotent — a doc already marked is
 * skipped, not re-written) and takes a fresh full-collection backup to
 * scripts/_backups/ before the first write.
 *
 * Usage:
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/mark-test-accounts.ts             # dry-run
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/mark-test-accounts.ts --confirm    # REAL WRITE
 */
import * as admin from 'firebase-admin';

const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (!rawKey) {
  console.error('FIREBASE_SERVICE_ACCOUNT_KEY not set');
  process.exit(1);
}
if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(rawKey)) });
}
const db = admin.firestore();

const TEAM_DOMAINS = new Set(['appout.co.il', 'outrun.co.il']);
function isTeamOrLocalEmail(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase() ?? '';
  return TEAM_DOMAINS.has(domain) || domain.endsWith('.local');
}

const NAME_PATTERNS: Array<{ key: string; re: RegExp }> = [
  { key: 'suspiciousName:keyword', re: /test|בדיקה|ניסיון|דמו|demo/i },
  { key: 'suspiciousName:repeatedChar', re: /^(.)\1{2,}$/ },
  { key: 'suspiciousName:digitsOnly', re: /^\d+$/ },
  { key: 'suspiciousName:placeholder', re: /^(user|unknown|אנונימי|משתמש)\s*\d*$/i },
];

async function main() {
  const confirm = process.argv.includes('--confirm');

  console.log('Fetching authorities (for the authorityManager protection rule)...');
  const authoritiesSnap = await db.collection('authorities').get();
  const managerUids = new Set<string>();
  authoritiesSnap.docs.forEach((d) => {
    const ids = d.data().managerIds;
    if (Array.isArray(ids)) ids.forEach((uid) => typeof uid === 'string' && managerUids.add(uid));
  });
  console.log(`  ${managerUids.size} distinct manager uids across ${authoritiesSnap.size} authorities.\n`);

  console.log('Fetching users...');
  const usersSnap = await db.collection('users').get();
  console.log(`  ${usersSnap.size} docs.\n`);

  console.log('Fetching workouts userId field...');
  const workoutsSnap = await db.collection('workouts').select('userId').get();
  const usersWithWorkout = new Set<string>();
  workoutsSnap.docs.forEach((d) => {
    const uid = d.data().userId;
    if (typeof uid === 'string') usersWithWorkout.add(uid);
  });
  console.log(`  ${workoutsSnap.size} docs, ${usersWithWorkout.size} distinct users.\n`);

  interface Plan {
    id: string;
    reasons: string[];
  }
  const toMark: Plan[] = [];
  let protectedAuthorityManager = 0;
  let protectedAdminRole = 0;
  let protectedRealEngaged = 0;
  let protectedMockData = 0;
  let noCriteriaMatch = 0;

  for (const doc of usersSnap.docs) {
    const data = doc.data();
    const core = (data.core ?? {}) as Record<string, unknown>;
    const email = typeof core.email === 'string' ? core.email.trim().toLowerCase() : '';
    const name = typeof core.name === 'string' ? core.name.trim() : '';
    const isAnonymous = core.isAnonymous === true;
    const isMockData = core.isMockData === true;
    const onboardingStatus = data.onboardingStatus;
    const hasWorkout = usersWithWorkout.has(doc.id);
    const allowedSections = core.allowedSections;
    const hasAdminRole =
      core.isSuperAdmin === true ||
      core.isSystemAdmin === true ||
      core.role === 'system_admin' ||
      core.isVerticalAdmin === true ||
      core.isTenantOwner === true ||
      (Array.isArray(allowedSections) && allowedSections.length > 0);

    // ── Protection rules first — any one of these ends evaluation for this doc.
    if (isMockData) { protectedMockData++; continue; }
    if (managerUids.has(doc.id)) { protectedAuthorityManager++; continue; }
    if (hasAdminRole) { protectedAdminRole++; continue; }
    if (hasWorkout && email) { protectedRealEngaged++; continue; }

    // ── Approved criteria — any match makes this doc a candidate.
    const reasons: string[] = [];
    if (email && isTeamOrLocalEmail(email)) reasons.push('teamOrLocalEmail');
    if (!email && !hasWorkout) reasons.push('noEmailNoWorkouts');
    if (isAnonymous && onboardingStatus !== 'COMPLETED') reasons.push('anonymousIncompleteOnboarding');
    for (const pattern of NAME_PATTERNS) {
      if (pattern.re.test(name)) reasons.push(pattern.key);
    }

    if (reasons.length > 0) {
      toMark.push({ id: doc.id, reasons });
    } else {
      noCriteriaMatch++;
    }
  }

  console.log('── Protection rules (never marked, regardless of criteria) ──');
  console.log(`  isMockData:        ${protectedMockData}`);
  console.log(`  authorityManager:  ${protectedAuthorityManager}`);
  console.log(`  hasAdminRole:      ${protectedAdminRole}`);
  console.log(`  realEngagedUser:   ${protectedRealEngaged}`);

  console.log('\n── Reason-key breakdown (a doc can carry more than one) ──');
  const reasonCounts: Record<string, number> = {};
  for (const p of toMark) for (const r of p.reasons) reasonCounts[r] = (reasonCounts[r] ?? 0) + 1;
  for (const [key, count] of Object.entries(reasonCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${key}: ${count}`);
  }

  console.log(`\nTo be marked isTestData=true: ${toMark.length}`);
  console.log(`Matches no criterion (left untouched): ${noCriteriaMatch}`);
  console.log(`Already core.isMockData=true (untouched, separate flag): ${protectedMockData}`);
  console.log(`Total users docs: ${usersSnap.size}`);

  if (!confirm) {
    console.log('\nDry run only — no writes performed. Re-run with --confirm to apply.');
    return;
  }

  console.log('\n--confirm passed. Taking a fresh backup before writing...');
  const fs = await import('node:fs');
  const path = await import('node:path');
  const backupDir = path.join(__dirname, '_backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const backupData = usersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const backupPath = path.join(backupDir, `users-backup-pre-mark-${Date.now()}.json`);
  fs.writeFileSync(backupPath, JSON.stringify(backupData, null, 2));
  fs.chmodSync(backupPath, 0o600);
  console.log(`Backup written: ${backupPath}`);

  let marked = 0;
  let skippedAlreadyMarked = 0;
  for (const p of toMark) {
    // Idempotency: re-check live state right before writing.
    const fresh = await db.collection('users').doc(p.id).get();
    if (fresh.data()?.core?.isTestData === true) {
      skippedAlreadyMarked++;
      continue;
    }
    await db.collection('users').doc(p.id).update({
      'core.isTestData': true,
      'core.testDataReason': p.reasons,
      'core.testDataMarkedAt': admin.firestore.FieldValue.serverTimestamp(),
    });
    marked++;
  }

  console.log(`\nDone. ${marked} docs marked. ${skippedAlreadyMarked} already marked (skipped, idempotent).`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
