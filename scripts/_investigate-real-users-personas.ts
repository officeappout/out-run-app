import * as dotenv from 'dotenv';
dotenv.config({ path: '/Users/calisthenicsltd/Development/appout-1/.env.local' });
import * as admin from 'firebase-admin';
function init() {
  if (admin.apps.length) return;
  const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
}
function fmtTs(ts: any): string | null {
  if (!ts) return null;
  if (typeof ts._seconds === 'number') return new Date(ts._seconds * 1000).toISOString();
  if (typeof ts.seconds === 'number') return new Date(ts.seconds * 1000).toISOString();
  if (ts instanceof Date) return ts.toISOString();
  if (typeof ts === 'string') return ts;
  return null;
}
function getEmail(u: any): string | undefined {
  return u.email ?? u.core?.email ?? undefined;
}
function getAuthorityId(u: any): string | undefined {
  return u.core?.authorityId ?? u.authorityId ?? undefined;
}
// A real Firebase Auth uid is a 28-char base62-ish random string.
// Seed/demo uids in this codebase are human-readable (contain '-' or spell a word).
function looksLikeRealUid(uid: string): boolean {
  return /^[A-Za-z0-9]{20,36}$/.test(uid) && !/-/.test(uid);
}

async function main() {
  init();
  const db = admin.firestore();

  const allUsers = await db.collection('users').get();
  console.log(`total users: ${allUsers.size}`);

  console.log('\n=== uid shape: real-Firebase-Auth-looking vs human-readable/seed-looking ===');
  let realShape = 0, seedShape = 0;
  const seedShapeSamples: string[] = [];
  allUsers.docs.forEach(d => {
    if (looksLikeRealUid(d.id)) realShape++;
    else { seedShape++; if (seedShapeSamples.length < 15) seedShapeSamples.push(d.id); }
  });
  console.log(`real-looking uid: ${realShape}, seed/demo-looking uid: ${seedShape}`);
  console.log('seed-looking samples:', seedShapeSamples);

  console.log('\n=== email domain distribution (checking core.email OR top-level email) ===');
  const domains: Record<string, number> = {};
  let noEmail = 0;
  allUsers.docs.forEach(d => {
    const email = getEmail(d.data());
    if (!email || !email.includes('@')) { noEmail++; return; }
    const dom = email.split('@')[1].toLowerCase();
    domains[dom] = (domains[dom] ?? 0) + 1;
  });
  console.log('no email at all:', noEmail);
  console.log(JSON.stringify(domains, null, 2));

  console.log('\n=== loginCount / lastLoginAt signal (real usage vs never-logged-in seed) ===');
  let neverLoggedIn = 0, hasLoginActivity = 0;
  const loginCounts: number[] = [];
  allUsers.docs.forEach(d => {
    const u: any = d.data();
    const lc = u.loginCount ?? u.core?.loginCount;
    if (!lc || lc === 0) neverLoggedIn++;
    else { hasLoginActivity++; loginCounts.push(lc); }
  });
  console.log(`never logged in (loginCount 0/undefined): ${neverLoggedIn}, has login activity: ${hasLoginActivity}`);
  if (loginCounts.length) console.log('loginCount range among active:', Math.min(...loginCounts), '-', Math.max(...loginCounts));

  console.log('\n=== createdAt distribution — cluster into day-buckets to see burst-seeding vs organic spread ===');
  const dayBuckets: Record<string, number> = {};
  let noCreatedAt = 0;
  allUsers.docs.forEach(d => {
    const iso = fmtTs((d.data() as any).createdAt);
    if (!iso) { noCreatedAt++; return; }
    const day = iso.slice(0, 10);
    dayBuckets[day] = (dayBuckets[day] ?? 0) + 1;
  });
  console.log('users with no createdAt at all:', noCreatedAt);
  const sortedDays = Object.entries(dayBuckets).sort((a, b) => b[1] - a[1]);
  console.log('top 15 single-day creation bursts (day: count):');
  sortedDays.slice(0, 15).forEach(([day, count]) => console.log(`  ${day}: ${count}`));
  console.log(`total distinct creation-days: ${Object.keys(dayBuckets).length}`);

  console.log('\n=== persona breakdown, cross-referenced with uid shape (real vs seed) ===');
  const personaByShape: Record<string, { real: number; seed: number }> = {};
  allUsers.docs.forEach(d => {
    const u: any = d.data();
    const p = u.personaId;
    if (!p) return;
    personaByShape[p] ??= { real: 0, seed: 0 };
    if (looksLikeRealUid(d.id)) personaByShape[p].real++; else personaByShape[p].seed++;
  });
  console.log(JSON.stringify(personaByShape, null, 2));

  console.log('\n=== the specific 7 military-persona users (soldier/reservist) — full detail ===');
  for (const persona of ['soldier', 'reservist']) {
    const snap = await db.collection('users').where('personaId', '==', persona).get();
    for (const d of snap.docs) {
      const u: any = d.data();
      console.log(`  uid=${d.id} realUidShape=${looksLikeRealUid(d.id)} email=${getEmail(u)} name=${u.name ?? u.core?.name} loginCount=${u.loginCount ?? u.core?.loginCount} lastLoginAt=${fmtTs(u.lastLoginAt ?? u.core?.lastLoginAt)} createdAt=${fmtTs(u.createdAt)} authorityId=${getAuthorityId(u)}`);
    }
  }

  console.log('\n=== any user at all with real-looking uid AND real login activity AND a non-seed email domain? (strongest "real user" candidates) ===');
  let strongCandidates = 0;
  const strongSamples: string[] = [];
  allUsers.docs.forEach(d => {
    const u: any = d.data();
    const email = getEmail(u);
    const lc = u.loginCount ?? u.core?.loginCount ?? 0;
    if (looksLikeRealUid(d.id) && lc > 5 && email && !email.includes('appout') && !email.includes('test') && !email.includes('demo')) {
      strongCandidates++;
      if (strongSamples.length < 10) strongSamples.push(`${d.id} | ${email} | loginCount=${lc} | personaId=${u.personaId}`);
    }
  });
  console.log(`strong real-user candidates: ${strongCandidates}`);
  strongSamples.forEach(s => console.log('  ', s));

  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
