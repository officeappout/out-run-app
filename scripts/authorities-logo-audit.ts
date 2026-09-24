// Read-only audit: which authorities currently have a populated logoUrl,
// and what gating fields they carry (isActiveClient / status / coBrandingEnabled
// / tenantType). Used to verify no "orphan logo" before gating the co-logo.
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import * as admin from 'firebase-admin';

function initFirebase() {
  if (admin.apps.length) return;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY not set (.env.local)');
  const c = JSON.parse(raw);
  admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
}

async function main() {
  initFirebase();
  const db = admin.firestore();
  const snap = await db.collection('authorities').get();

  const withLogo: any[] = [];
  snap.forEach((doc) => {
    const d = doc.data() || {};
    const logoUrl = d.logoUrl;
    if (logoUrl && String(logoUrl).trim() !== '') {
      withLogo.push({
        id: doc.id,
        name: d.name ?? d.displayName ?? '(no name)',
        isActiveClient: d.isActiveClient ?? false,
        status: d.status ?? '(none)',
        coBrandingEnabled: 'coBrandingEnabled' in d ? d.coBrandingEnabled : '(field absent)',
        tenantType: d.tenantType ?? '(none)',
        logoUrl: String(logoUrl),
      });
    }
  });

  console.log(`\n=== authorities collection: ${snap.size} docs total ===`);
  console.log(`=== WITH populated logoUrl: ${withLogo.length} ===\n`);
  withLogo
    .sort((a, b) => Number(b.isActiveClient) - Number(a.isActiveClient))
    .forEach((r) => {
      console.log(
        `- ${r.id} | ${r.name} | isActiveClient=${r.isActiveClient} | status=${r.status} | coBrandingEnabled=${r.coBrandingEnabled} | tenantType=${r.tenantType}`,
      );
      console.log(`    logoUrl: ${r.logoUrl.slice(0, 120)}`);
    });

  const orphans = withLogo.filter((r) => r.isActiveClient !== true);
  console.log(`\n=== POTENTIAL ORPHAN LOGOS (logoUrl set but isActiveClient !== true): ${orphans.length} ===`);
  orphans.forEach((r) => console.log(`- ${r.id} | ${r.name} | isActiveClient=${r.isActiveClient} | status=${r.status}`));
  process.exit(0);
}

main().catch((e) => {
  console.error('audit failed:', e?.message || e);
  process.exit(1);
});
