/**
 * Sderot → Multi-Tenant Migration Script
 *
 * Migrates the legacy Sderot pilot from authorityId-based filtering
 * to the new tenantId / unitPath multi-tenant model.
 *
 * What it does:
 *   1. Creates tenants/tenant_sderot (type: municipal)
 *   2. Maps each Sderot neighborhood (child authority) to a unit
 *   3. Batch-writes core.tenantId, core.unitId, core.unitPath to all Sderot users
 *   4. Stamps tenantId on content docs: parks, routes, groups, events, etc.
 *
 * Usage:
 *   DRY RUN (default — no writes):
 *     npx tsx scripts/migrate-sderot-to-tenant.ts
 *
 *   LIVE RUN (commits changes):
 *     npx tsx scripts/migrate-sderot-to-tenant.ts --commit
 *
 * Prerequisites:
 *   - serviceAccountKey.json in project root
 *   - firebase-admin installed (npm i firebase-admin in project root)
 */

import * as admin from 'firebase-admin';
import * as path from 'path';
import * as fs from 'fs';

// ── Config ────────────────────────────────────────────────────────────

const TENANT_ID = 'tenant_sderot';
const TENANT_TYPE = 'municipal';
const BATCH_SIZE = 500;

const isCommit = process.argv.includes('--commit');
const mode = isCommit ? 'COMMIT' : 'DRY-RUN';

// ── Init Admin SDK ────────────────────────────────────────────────────

const keyPath = path.resolve(__dirname, '..', 'serviceAccountKey.json');
if (!fs.existsSync(keyPath)) {
  console.error('❌  serviceAccountKey.json not found at:', keyPath);
  console.error('   Download from Firebase Console → Project Settings → Service Accounts');
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(keyPath),
});
const db = admin.firestore();

// ── Types ─────────────────────────────────────────────────────────────

interface MigrationStats {
  tenantCreated: boolean;
  unitsCreated: number;
  usersUpdated: number;
  parksUpdated: number;
  officialRoutesUpdated: number;
  curatedRoutesUpdated: number;
  communityGroupsUpdated: number;
  communityEventsUpdated: number;
  facilitiesUpdated: number;
  maintenanceReportsUpdated: number;
  feedPostsUpdated: number;
  userContributionsUpdated: number;
  editRequestsUpdated: number;
  presenceUpdated: number;
}

const stats: MigrationStats = {
  tenantCreated: false,
  unitsCreated: 0,
  usersUpdated: 0,
  parksUpdated: 0,
  officialRoutesUpdated: 0,
  curatedRoutesUpdated: 0,
  communityGroupsUpdated: 0,
  communityEventsUpdated: 0,
  facilitiesUpdated: 0,
  maintenanceReportsUpdated: 0,
  feedPostsUpdated: 0,
  userContributionsUpdated: 0,
  editRequestsUpdated: 0,
  presenceUpdated: 0,
};

// ── Batch Writer ──────────────────────────────────────────────────────

class BatchWriter {
  private batch = db.batch();
  private count = 0;
  private totalWrites = 0;

  async set(ref: admin.firestore.DocumentReference, data: any, options?: admin.firestore.SetOptions) {
    if (isCommit) {
      this.batch.set(ref, data, options ?? {});
      this.count++;
      if (this.count >= BATCH_SIZE) await this.flush();
    }
    this.totalWrites++;
  }

  async update(ref: admin.firestore.DocumentReference, data: any) {
    if (isCommit) {
      this.batch.update(ref, data);
      this.count++;
      if (this.count >= BATCH_SIZE) await this.flush();
    }
    this.totalWrites++;
  }

  async flush() {
    if (this.count > 0 && isCommit) {
      await this.batch.commit();
      console.log(`   ✓ flushed batch (${this.count} writes)`);
      this.batch = db.batch();
      this.count = 0;
    }
  }

  get total() { return this.totalWrites; }
}

// ── Step 1: Discover Sderot Authorities ───────────────────────────────

async function discoverSderotAuthorities(): Promise<{
  sderotId: string;
  neighborhoods: { id: string; name: string }[];
}> {
  console.log('\n📍 Step 1: Discovering Sderot authorities...');

  const authSnap = await db.collection('authorities').get();
  let sderotId = '';
  const neighborhoods: { id: string; name: string }[] = [];

  // Find the main Sderot authority (city type)
  for (const doc of authSnap.docs) {
    const data = doc.data();
    const name = (data.name ?? '').trim();
    const type = data.type ?? '';

    if ((name.includes('שדרות') || name.toLowerCase().includes('sderot')) && type !== 'neighborhood') {
      sderotId = doc.id;
      console.log(`   Found Sderot main authority: ${doc.id} (${name})`);
    }
  }

  if (!sderotId) {
    // Fallback: find any authority that has neighborhoods as children
    for (const doc of authSnap.docs) {
      const data = doc.data();
      if (data.parentAuthorityId) {
        const parent = authSnap.docs.find(d => d.id === data.parentAuthorityId);
        if (parent && !sderotId) {
          sderotId = data.parentAuthorityId;
          console.log(`   Inferred Sderot from parent: ${sderotId}`);
        }
      }
    }
  }

  if (!sderotId) {
    // Last resort: take the first city-type authority
    const cityDoc = authSnap.docs.find(d => d.data().type === 'city');
    if (cityDoc) {
      sderotId = cityDoc.id;
      console.log(`   Fallback: using first city authority: ${sderotId} (${cityDoc.data().name})`);
    }
  }

  if (!sderotId) {
    console.error('❌  Could not find any Sderot/city authority');
    process.exit(1);
  }

  // Find all neighborhoods under Sderot
  for (const doc of authSnap.docs) {
    const data = doc.data();
    if (data.parentAuthorityId === sderotId || data.type === 'neighborhood') {
      neighborhoods.push({ id: doc.id, name: data.name ?? doc.id });
      console.log(`   Neighborhood: ${doc.id} — ${data.name}`);
    }
  }

  console.log(`   Total: 1 city + ${neighborhoods.length} neighborhoods`);
  return { sderotId, neighborhoods };
}

// ── Step 2: Create Tenant + Units ─────────────────────────────────────

async function createTenantAndUnits(
  sderotId: string,
  neighborhoods: { id: string; name: string }[],
  writer: BatchWriter,
) {
  console.log('\n🏗️  Step 2: Creating tenant and units...');

  // Create the tenant doc
  const tenantRef = db.collection('tenants').doc(TENANT_ID);
  const tenantSnap = await tenantRef.get();

  if (tenantSnap.exists) {
    console.log(`   Tenant ${TENANT_ID} already exists — skipping creation`);
  } else {
    await writer.set(tenantRef, {
      name: 'שדרות',
      type: TENANT_TYPE,
      tenantType: 'municipal',
      legacyAuthorityId: sderotId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    stats.tenantCreated = true;
    console.log(`   ${mode}: Create tenant ${TENANT_ID}`);
  }

  // Create unit docs for each neighborhood
  for (const n of neighborhoods) {
    const unitRef = db.collection('tenants').doc(TENANT_ID).collection('units').doc(n.id);
    const unitSnap = await unitRef.get();
    if (unitSnap.exists) {
      console.log(`   Unit ${n.id} already exists — skipping`);
      continue;
    }

    await writer.set(unitRef, {
      name: n.name,
      legacyAuthorityId: n.id,
      unitPath: ['שדרות', n.name],
      memberCount: 0,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    stats.unitsCreated++;
    console.log(`   ${mode}: Create unit ${n.id} (${n.name})`);
  }
}

// ── Step 3: Migrate Users ─────────────────────────────────────────────

async function migrateUsers(
  sderotId: string,
  neighborhoods: { id: string; name: string }[],
  writer: BatchWriter,
) {
  console.log('\n👤 Step 3: Migrating users...');

  const neighborhoodIds = new Set([sderotId, ...neighborhoods.map(n => n.id)]);
  const neighborhoodNameMap = new Map(neighborhoods.map(n => [n.id, n.name]));

  const usersSnap = await db.collection('users').get();
  let migrated = 0;

  for (const userDoc of usersSnap.docs) {
    const core = (userDoc.data().core ?? {}) as Record<string, any>;
    const userAuthorityId = core.authorityId;

    if (!userAuthorityId || !neighborhoodIds.has(userAuthorityId)) continue;

    // Already migrated?
    if (core.tenantId === TENANT_ID) continue;

    const neighborhoodName = neighborhoodNameMap.get(userAuthorityId);
    const unitPath = neighborhoodName ? ['שדרות', neighborhoodName] : ['שדרות'];
    const unitId = neighborhoodName ? userAuthorityId : sderotId;

    await writer.update(userDoc.ref, {
      'core.tenantId': TENANT_ID,
      'core.unitId': unitId,
      'core.unitPath': unitPath,
      'core.tenantType': 'municipal',
    });
    migrated++;
  }

  stats.usersUpdated = migrated;
  console.log(`   ${mode}: ${migrated} users would be updated`);
}

// ── Step 4: Migrate Content Collections ───────────────────────────────

async function migrateCollection(
  collectionName: string,
  sderotId: string,
  neighborhoodIds: Set<string>,
  writer: BatchWriter,
  statsKey: keyof MigrationStats,
) {
  const snap = await db.collection(collectionName).get();
  let count = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    const docAuthorityId = data.authorityId;

    if (!docAuthorityId) continue;
    if (!neighborhoodIds.has(docAuthorityId)) continue;
    if (data.tenantId === TENANT_ID) continue;

    await writer.update(doc.ref, { tenantId: TENANT_ID });
    count++;
  }

  (stats as any)[statsKey] = count;
  if (count > 0) {
    console.log(`   ${mode}: ${collectionName} — ${count} docs`);
  }
}

// ── Step 5: Migrate feed_posts (special: also has authorityId) ────────

async function migrateFeedPosts(
  sderotId: string,
  neighborhoodIds: Set<string>,
  writer: BatchWriter,
) {
  const snap = await db.collection('feed_posts').get();
  let count = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    const docAuthorityId = data.authorityId;

    if (!docAuthorityId) continue;
    if (!neighborhoodIds.has(docAuthorityId)) continue;
    if (data.tenantId === TENANT_ID) continue;

    await writer.update(doc.ref, {
      tenantId: TENANT_ID,
      unitId: docAuthorityId,
    });
    count++;
  }

  stats.feedPostsUpdated = count;
  if (count > 0) {
    console.log(`   ${mode}: feed_posts — ${count} docs`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log(`║  Sderot → Multi-Tenant Migration   [${mode.padEnd(8)}]           ║`);
  console.log('╚══════════════════════════════════════════════════════════╝');

  if (!isCommit) {
    console.log('\n⚠️  DRY-RUN mode — no changes will be written.');
    console.log('   Run with --commit to apply changes.\n');
  }

  const writer = new BatchWriter();

  // Step 1: Discover
  const { sderotId, neighborhoods } = await discoverSderotAuthorities();
  const neighborhoodIds = new Set([sderotId, ...neighborhoods.map(n => n.id)]);

  // Step 2: Create tenant + units
  await createTenantAndUnits(sderotId, neighborhoods, writer);

  // Step 3: Migrate users
  await migrateUsers(sderotId, neighborhoods, writer);

  // Step 4: Migrate content collections
  console.log('\n📦 Step 4: Migrating content collections...');

  const contentCollections: { name: string; key: keyof MigrationStats }[] = [
    { name: 'parks', key: 'parksUpdated' },
    { name: 'official_routes', key: 'officialRoutesUpdated' },
    { name: 'curated_routes', key: 'curatedRoutesUpdated' },
    { name: 'community_groups', key: 'communityGroupsUpdated' },
    { name: 'community_events', key: 'communityEventsUpdated' },
    { name: 'facilities', key: 'facilitiesUpdated' },
    { name: 'maintenance_reports', key: 'maintenanceReportsUpdated' },
    { name: 'user_contributions', key: 'userContributionsUpdated' },
    { name: 'edit_requests', key: 'editRequestsUpdated' },
    { name: 'presence', key: 'presenceUpdated' },
  ];

  for (const col of contentCollections) {
    await migrateCollection(col.name, sderotId, neighborhoodIds, writer, col.key);
  }

  // Step 5: feed_posts (special handling — also sets unitId)
  await migrateFeedPosts(sderotId, neighborhoodIds, writer);

  // Flush remaining batch
  await writer.flush();

  // Report
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║                   MIGRATION REPORT                      ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log(`║  Mode:                    ${mode.padEnd(30)}║`);
  console.log(`║  Tenant created:          ${String(stats.tenantCreated).padEnd(30)}║`);
  console.log(`║  Units created:           ${String(stats.unitsCreated).padEnd(30)}║`);
  console.log(`║  Users updated:           ${String(stats.usersUpdated).padEnd(30)}║`);
  console.log(`║  Parks updated:           ${String(stats.parksUpdated).padEnd(30)}║`);
  console.log(`║  Official routes:         ${String(stats.officialRoutesUpdated).padEnd(30)}║`);
  console.log(`║  Curated routes:          ${String(stats.curatedRoutesUpdated).padEnd(30)}║`);
  console.log(`║  Community groups:        ${String(stats.communityGroupsUpdated).padEnd(30)}║`);
  console.log(`║  Community events:        ${String(stats.communityEventsUpdated).padEnd(30)}║`);
  console.log(`║  Facilities:              ${String(stats.facilitiesUpdated).padEnd(30)}║`);
  console.log(`║  Maintenance reports:     ${String(stats.maintenanceReportsUpdated).padEnd(30)}║`);
  console.log(`║  Feed posts:              ${String(stats.feedPostsUpdated).padEnd(30)}║`);
  console.log(`║  User contributions:      ${String(stats.userContributionsUpdated).padEnd(30)}║`);
  console.log(`║  Edit requests:           ${String(stats.editRequestsUpdated).padEnd(30)}║`);
  console.log(`║  Presence docs:           ${String(stats.presenceUpdated).padEnd(30)}║`);
  console.log(`║  Total batch writes:      ${String(writer.total).padEnd(30)}║`);
  console.log('╚══════════════════════════════════════════════════════════╝');

  if (!isCommit) {
    console.log('\n✅ Dry run complete. Review the report above.');
    console.log('   To apply changes, run:');
    console.log('   npx tsx scripts/migrate-sderot-to-tenant.ts --commit\n');
  } else {
    console.log('\n✅ Migration committed successfully!\n');
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
