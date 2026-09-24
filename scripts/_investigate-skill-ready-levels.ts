/**
 * INVESTIGATION (24.09.2026, "Gate not-yet-ready skills" build brief) — read-only.
 *
 * Replicates VisualSlider's own readiness check (getOnboardingLevelsForCategory ->
 * getOnboardingLevels) for every skill in the onboarding SKILL_PROGRAMS roster, to
 * determine which skills have < 2 authored onboarding levels (= NOT ready, falls
 * into the degraded/continuous-slider fallback per VisualSlider.tsx's own isSimple
 * derivation: `isSimple = !!steps && steps.length > 1`).
 *
 * Mirrors the real query exactly:
 *  - resolveCategoryToProgramId: MASTER_PROGRAM_SLUG_TO_ID[category] first (master
 *    programs), else programs collection's movementPattern/slug map, else the
 *    category string itself.
 *  - getOnboardingLevels: visual_assessment_content where category in
 *    [rawSlug, resolvedProgramId], filtered to showInOnboarding===true, level>0.
 *
 * Run: npx tsx scripts/_investigate-skill-ready-levels.ts
 */
import * as dotenv from 'dotenv'; dotenv.config({ path: '.env.local' }); dotenv.config();
import * as admin from 'firebase-admin';

const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
const db = admin.firestore();

const MASTER_PROGRAM_SLUG_TO_ID: Record<string, string> = {
  full_body: 'H2279XsRGDg9G370J7S9',
  upper_body: '47smw26hUyG5ZbE1bhr3',
  calisthenics_upper: 'JCac76p48XGZ5MVahLI2',
  muscle_up: 'fTLWzjP9gH2VNpamyCZF',
};

const SKILL_ROSTER = ['calisthenics_upper', 'front_lever', 'muscle_up', 'planche', 'handstand', 'hspu', 'one_arm_pullup'];

async function loadCategoryMap(): Promise<Map<string, string>> {
  const snap = await db.collection('programs').get();
  const map = new Map<string, string>();
  for (const doc of snap.docs) {
    const p = doc.data();
    if (p.isMaster) continue;
    if (p.movementPattern && !map.has(p.movementPattern)) map.set(p.movementPattern, doc.id);
    if (p.slug && !map.has(p.slug)) map.set(p.slug, doc.id);
  }
  return map;
}

const CANONICAL_SLUG_ALIASES: Record<string, string> = {
  hspu: 'handstand_pushup',
};

async function resolveCategoryToProgramId(category: string, categoryMap: Map<string, string>): Promise<string> {
  const masterHash = MASTER_PROGRAM_SLUG_TO_ID[category];
  if (masterHash) return masterHash;
  if (categoryMap.has(category)) return categoryMap.get(category)!;
  const alias = CANONICAL_SLUG_ALIASES[category];
  if (alias && categoryMap.has(alias)) return categoryMap.get(alias)!;
  return category;
}

async function getOnboardingLevels(candidateIds: string[]): Promise<number[]> {
  const ids = [...new Set(candidateIds)].filter(Boolean);
  if (ids.length === 0) return [];
  const snap = await db.collection('visual_assessment_content').where('category', 'in', ids).get();
  const levels = snap.docs
    .filter((d) => d.data().showInOnboarding === true)
    .map((d) => (d.data().level as number) ?? 0)
    .filter((l) => l > 0);
  return levels.sort((a, b) => a - b);
}

async function main() {
  const categoryMap = await loadCategoryMap();
  console.log('Category map entries relevant to skill roster:');
  for (const skill of SKILL_ROSTER) {
    if (categoryMap.has(skill)) console.log(`  ${skill} -> ${categoryMap.get(skill)}`);
  }
  console.log('');

  for (const skill of SKILL_ROSTER) {
    const programId = await resolveCategoryToProgramId(skill, categoryMap);
    const candidateIds = [...new Set([skill, programId])];
    const levels = await getOnboardingLevels(candidateIds);
    const unique = [...new Set(levels)];
    const ready = unique.length >= 2;
    console.log(
      `${skill.padEnd(20)} candidateIds=${JSON.stringify(candidateIds).padEnd(45)} levels=${JSON.stringify(unique).padEnd(30)} count=${unique.length}  ${ready ? 'READY' : '*** NOT READY ***'}`
    );
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
