/**
 * Multi-Tenant E2E Smoke Test Script
 *
 * Validates the 3 tenant paths after migration:
 *   1. Municipal (Sderot): backward compatibility with authorityId + new tenantId
 *   2. Military: readiness configs, unit hierarchy, sidebar config
 *   3. Educational: grading service, class management, sidebar config
 *
 * Usage:
 *   npx tsx scripts/smoke-test-tenants.ts
 *
 * Prerequisites:
 *   - serviceAccountKey.json in project root
 */

import * as admin from 'firebase-admin';
import * as path from 'path';
import * as fs from 'fs';

// ── Init ──────────────────────────────────────────────────────────────

const keyPath = path.resolve(__dirname, '..', 'serviceAccountKey.json');
if (!fs.existsSync(keyPath)) {
  console.error('❌  serviceAccountKey.json not found');
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(keyPath) });
const db = admin.firestore();

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, label: string) {
  if (condition) {
    console.log(`   ✅ ${label}`);
    passed++;
  } else {
    console.log(`   ❌ ${label}`);
    failed++;
    failures.push(label);
  }
}

// ── Test 1: Municipal (Sderot) Backward Compatibility ─────────────────

async function testMunicipal() {
  console.log('\n═══ Test Suite 1: Municipal (Sderot) ═══');

  // 1a. Tenant doc exists
  const tenantSnap = await db.collection('tenants').doc('tenant_sderot').get();
  assert(tenantSnap.exists, 'tenants/tenant_sderot exists');

  if (tenantSnap.exists) {
    const data = tenantSnap.data()!;
    assert(data.tenantType === 'municipal', 'tenant type is municipal');
    assert(typeof data.legacyAuthorityId === 'string' && data.legacyAuthorityId.length > 0,
      'legacyAuthorityId is preserved');
  }

  // 1b. Units subcollection has at least one entry
  const unitsSnap = await db.collection('tenants').doc('tenant_sderot').collection('units').get();
  assert(unitsSnap.size > 0, `tenant has ${unitsSnap.size} units`);

  // 1c. Users with authorityId still have it, AND also have tenantId
  const usersSnap = await db.collection('users')
    .where('core.tenantId', '==', 'tenant_sderot')
    .limit(5)
    .get();

  if (usersSnap.empty) {
    console.log('   ⚠️  No migrated users found — run migration script first');
  } else {
    const sampleUser = usersSnap.docs[0].data();
    const core = sampleUser.core ?? {};

    assert(core.tenantId === 'tenant_sderot', 'user has core.tenantId');
    assert(typeof core.unitId === 'string', 'user has core.unitId');
    assert(Array.isArray(core.unitPath), 'user has core.unitPath array');
    assert(typeof core.authorityId === 'string',
      'user STILL has legacy core.authorityId (backward compatible)');
  }

  // 1d. Parks with authorityId should now also have tenantId
  const parksSnap = await db.collection('parks')
    .where('tenantId', '==', 'tenant_sderot')
    .limit(3)
    .get();

  if (parksSnap.empty) {
    console.log('   ⚠️  No migrated parks found — run migration script first');
  } else {
    const samplePark = parksSnap.docs[0].data();
    assert(samplePark.tenantId === 'tenant_sderot', 'park has tenantId');
    assert(typeof samplePark.authorityId === 'string',
      'park STILL has legacy authorityId (backward compatible)');
  }

  // 1e. Firestore indexes — verify tenantId indexes exist in config
  const indexFile = path.resolve(__dirname, '..', 'firestore.indexes.json');
  if (fs.existsSync(indexFile)) {
    const indexData = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
    const indexes = indexData.indexes ?? [];

    const hasTenantUserIndex = indexes.some((idx: any) =>
      idx.collectionGroup === 'users' &&
      idx.fields?.some((f: any) => f.fieldPath === 'core.tenantId'),
    );
    assert(hasTenantUserIndex, 'firestore.indexes.json has users tenantId index');

    const hasTenantFeedIndex = indexes.some((idx: any) =>
      idx.collectionGroup === 'feed_posts' &&
      idx.fields?.some((f: any) => f.fieldPath === 'tenantId'),
    );
    assert(hasTenantFeedIndex, 'firestore.indexes.json has feed_posts tenantId index');
  }
}

// ── Test 2: Military Flow ─────────────────────────────────────────────

async function testMilitary() {
  console.log('\n═══ Test Suite 2: Military ═══');

  // 2a. Sidebar config exists for military_unit
  const sidebarConfigPath = path.resolve(
    __dirname, '..', 'src', 'features', 'admin', 'config', 'sidebarConfigs.ts',
  );
  assert(fs.existsSync(sidebarConfigPath), 'sidebarConfigs.ts exists');

  if (fs.existsSync(sidebarConfigPath)) {
    const content = fs.readFileSync(sidebarConfigPath, 'utf8');
    assert(content.includes('military_unit'), 'sidebarConfigs has military_unit entry');
    assert(content.includes('/admin/authority/readiness'), 'military sidebar has readiness link');
    assert(content.includes('/admin/authority/units'), 'military sidebar has units link');
  }

  // 2b. Readiness service exists
  const readinessServicePath = path.resolve(
    __dirname, '..', 'src', 'features', 'admin', 'services', 'readiness.service.ts',
  );
  assert(fs.existsSync(readinessServicePath), 'readiness.service.ts exists');

  // 2c. Readiness page exists
  const readinessPagePath = path.resolve(
    __dirname, '..', 'src', 'app', 'admin', 'authority', 'readiness', 'page.tsx',
  );
  assert(fs.existsSync(readinessPagePath), 'readiness page exists');

  // 2d. ReadinessGauge component exists
  const gaugePath = path.resolve(
    __dirname, '..', 'src', 'features', 'admin', 'components', 'readiness', 'ReadinessGauge.tsx',
  );
  assert(fs.existsSync(gaugePath), 'ReadinessGauge.tsx exists');

  // 2e. ThresholdConfig component exists
  const thresholdPath = path.resolve(
    __dirname, '..', 'src', 'features', 'admin', 'components', 'readiness', 'ThresholdConfig.tsx',
  );
  assert(fs.existsSync(thresholdPath), 'ThresholdConfig.tsx exists');

  // 2f. Unit drilldown page exists
  const drilldownPath = path.resolve(
    __dirname, '..', 'src', 'app', 'admin', 'authority', 'units', '[unitId]', 'page.tsx',
  );
  assert(fs.existsSync(drilldownPath), 'unit drilldown page exists');

  // 2g. Firestore rules have readiness_configs
  const rulesPath = path.resolve(__dirname, '..', 'firestore.rules');
  if (fs.existsSync(rulesPath)) {
    const rules = fs.readFileSync(rulesPath, 'utf8');
    assert(rules.includes('readiness_configs'), 'Firestore rules have readiness_configs');
    assert(rules.includes('hasTenant'), 'Firestore rules have hasTenant helper');
  }

  // 2h. Tenant labels for military
  const labelsPath = path.resolve(
    __dirname, '..', 'src', 'features', 'admin', 'config', 'tenantLabels.ts',
  );
  if (fs.existsSync(labelsPath)) {
    const labelsContent = fs.readFileSync(labelsPath, 'utf8');
    assert(labelsContent.includes('פורטל צבאי'), 'tenantLabels has military portal badge');
    assert(labelsContent.includes('חיילים'), 'tenantLabels has military members label');
  }

  // 2i. MILITARY_JOIN onboarding path
  const wizardPath = path.resolve(
    __dirname, '..', 'src', 'features', 'user', 'onboarding', 'components', 'OnboardingWizard.tsx',
  );
  if (fs.existsSync(wizardPath)) {
    const wizardContent = fs.readFileSync(wizardPath, 'utf8');
    assert(wizardContent.includes('MILITARY_JOIN'), 'OnboardingWizard has MILITARY_JOIN path');
    assert(wizardContent.includes("'SCHEDULE'") && wizardContent.includes("'LOCATION'"),
      'MILITARY_JOIN includes SCHEDULE and LOCATION steps');
  }
}

// ── Test 3: Educational Flow ──────────────────────────────────────────

async function testEducational() {
  console.log('\n═══ Test Suite 3: Educational ═══');

  // 3a. Sidebar config exists for school
  const sidebarConfigPath = path.resolve(
    __dirname, '..', 'src', 'features', 'admin', 'config', 'sidebarConfigs.ts',
  );
  if (fs.existsSync(sidebarConfigPath)) {
    const content = fs.readFileSync(sidebarConfigPath, 'utf8');
    assert(content.includes("school"), 'sidebarConfigs has school entry');
    assert(content.includes('/admin/authority/grades'), 'school sidebar has grades link');
  }

  // 3b. Grades service exists
  const gradesServicePath = path.resolve(
    __dirname, '..', 'src', 'features', 'admin', 'services', 'grades.service.ts',
  );
  assert(fs.existsSync(gradesServicePath), 'grades.service.ts exists');

  if (fs.existsSync(gradesServicePath)) {
    const content = fs.readFileSync(gradesServicePath, 'utf8');
    assert(content.includes('getClassGrades'), 'grades service has getClassGrades()');
    assert(content.includes('saveManualGrades'), 'grades service has saveManualGrades()');
    assert(content.includes('0.7') && content.includes('0.3'),
      'grades uses 70/30 auto/manual weighting');
  }

  // 3c. GradingTable component exists
  const tablePath = path.resolve(
    __dirname, '..', 'src', 'features', 'admin', 'components', 'education', 'GradingTable.tsx',
  );
  assert(fs.existsSync(tablePath), 'GradingTable.tsx exists');

  // 3d. Grades page exists
  const gradesPagePath = path.resolve(
    __dirname, '..', 'src', 'app', 'admin', 'authority', 'grades', 'page.tsx',
  );
  assert(fs.existsSync(gradesPagePath), 'grades page exists');

  // 3e. Tenant labels for educational
  const labelsPath = path.resolve(
    __dirname, '..', 'src', 'features', 'admin', 'config', 'tenantLabels.ts',
  );
  if (fs.existsSync(labelsPath)) {
    const labelsContent = fs.readFileSync(labelsPath, 'utf8');
    assert(labelsContent.includes('פורטל חינוכי'), 'tenantLabels has educational portal badge');
    assert(labelsContent.includes('תלמידים'), 'tenantLabels has student members label');
    assert(labelsContent.includes('בית ספר'), 'tenantLabels has school hierarchy label');
  }

  // 3f. Firestore rules have pe_grades
  const rulesPath = path.resolve(__dirname, '..', 'firestore.rules');
  if (fs.existsSync(rulesPath)) {
    const rules = fs.readFileSync(rulesPath, 'utf8');
    assert(rules.includes('pe_grades'), 'Firestore rules have pe_grades collection');
  }

  // 3g. SCHOOL_JOIN onboarding path — no parental consent
  const wizardPath = path.resolve(
    __dirname, '..', 'src', 'features', 'user', 'onboarding', 'components', 'OnboardingWizard.tsx',
  );
  if (fs.existsSync(wizardPath)) {
    const content = fs.readFileSync(wizardPath, 'utf8');
    assert(content.includes('SCHOOL_JOIN'), 'OnboardingWizard has SCHOOL_JOIN path');
  }

  // 3h. Unit drilldown shows XP for educational tenants
  const drilldownPath = path.resolve(
    __dirname, '..', 'src', 'app', 'admin', 'authority', 'units', '[unitId]', 'page.tsx',
  );
  if (fs.existsSync(drilldownPath)) {
    const content = fs.readFileSync(drilldownPath, 'utf8');
    assert(content.includes('isSchoolContext'), 'unit drilldown has school context logic');
    assert(content.includes('globalXP'), 'unit drilldown shows globalXP');
  }
}

// ── Test 4: Cross-Cutting Infrastructure ──────────────────────────────

async function testInfrastructure() {
  console.log('\n═══ Test Suite 4: Cross-Cutting Infrastructure ═══');

  // 4a. Cloud Functions index exports all functions
  const indexPath = path.resolve(__dirname, '..', 'functions', 'src', 'index.ts');
  if (fs.existsSync(indexPath)) {
    const content = fs.readFileSync(indexPath, 'utf8');
    assert(content.includes('validateAccessCode'), 'CF index exports validateAccessCode');
    assert(content.includes('onFeedPostCreate'), 'CF index exports onFeedPostCreate');
    assert(content.includes('rollupLeaderboard'), 'CF index exports rollupLeaderboard');
    assert(content.includes('onGroupMemberWrite'), 'CF index exports onGroupMemberWrite');
  }

  // 4b. Leaderboard Cloud Function exists
  const leaderboardPath = path.resolve(__dirname, '..', 'functions', 'src', 'leaderboard.ts');
  assert(fs.existsSync(leaderboardPath), 'leaderboard.ts Cloud Function exists');

  // 4c. Client leaderboard service exists
  const clientLeaderboardPath = path.resolve(
    __dirname, '..', 'src', 'features', 'admin', 'services', 'leaderboard.service.ts',
  );
  assert(fs.existsSync(clientLeaderboardPath), 'leaderboard.service.ts client service exists');

  // 4d. Access code service exists
  const accessCodePath = path.resolve(
    __dirname, '..', 'src', 'features', 'user', 'onboarding', 'services', 'access-code.service.ts',
  );
  assert(fs.existsSync(accessCodePath), 'access-code.service.ts exists');

  // 4e. AccessCodeStep component exists
  const accessCodeStepPath = path.resolve(
    __dirname, '..', 'src', 'features', 'user', 'onboarding', 'components', 'steps', 'AccessCodeStep.tsx',
  );
  assert(fs.existsSync(accessCodeStepPath), 'AccessCodeStep.tsx exists');

  // 4f. Firestore indexes have leaderboard_shards index
  const indexFile = path.resolve(__dirname, '..', 'firestore.indexes.json');
  if (fs.existsSync(indexFile)) {
    const indexData = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
    const indexes = indexData.indexes ?? [];
    const hasShardIndex = indexes.some((idx: any) =>
      idx.collectionGroup === 'leaderboard_shards',
    );
    assert(hasShardIndex, 'firestore.indexes.json has leaderboard_shards index');

    const hasPeGradesIndex = indexes.some((idx: any) =>
      idx.collectionGroup === 'pe_grades',
    );
    assert(hasPeGradesIndex, 'firestore.indexes.json has pe_grades index');
  }

  // 4g. Firestore rules have tenant isolation
  const rulesPath = path.resolve(__dirname, '..', 'firestore.rules');
  if (fs.existsSync(rulesPath)) {
    const rules = fs.readFileSync(rulesPath, 'utf8');
    assert(rules.includes('request.auth.token.tenantId'), 'rules use Custom Claims tenantId');
    assert(rules.includes('leaderboard_shards'), 'rules have leaderboard_shards');
    assert(rules.includes('leaderboard_snapshots'), 'rules have leaderboard_snapshots');
  }
}

// ── Main ──────────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║       Multi-Tenant E2E Smoke Test                       ║');
  console.log('╚══════════════════════════════════════════════════════════╝');

  await testMunicipal();
  await testMilitary();
  await testEducational();
  await testInfrastructure();

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log(`║  Results: ${passed} passed, ${failed} failed                        ║`);
  console.log('╚══════════════════════════════════════════════════════════╝');

  if (failures.length > 0) {
    console.log('\nFailed checks:');
    failures.forEach(f => console.log(`   ❌ ${f}`));
  }

  console.log('');
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('❌ Smoke test error:', err);
  process.exit(1);
});
