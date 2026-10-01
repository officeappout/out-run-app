/**
 * audit-prerequisite-derivation.test.ts — Progression System v2, Phase 0
 * RECON TASK 2: for each of the 6 skill programs, does its level-1 (lowest
 * observed level) target-exercise carry a targetPrograms tag in a broad
 * domain program (משיכה / דחיפה / ליבה / רגליים)? If so, that domain+level
 * is the DERIVED prerequisite for the skill under the v2 target model
 * ("Prerequisites are derived from targetPrograms — a skill's level-1
 * target-exercise carries a domain-level tag = the requirement").
 *
 * READ-ONLY: fetches `exercises` and `programs` once (beforeAll), runs them
 * through the REAL app pipeline — buildSkillTree, imported directly, not
 * reimplemented — for each skill. Writes nothing to Firestore.
 *
 * Domain program IDs: משיכה (UPDBtTdCvX748dtBlWYj) and דחיפה
 * (J0fLpmJhG0KDN2tQouxh) were given directly. ליבה/רגליים IDs were NOT
 * given — resolved dynamically at run time by matching the live `programs`
 * collection's `name` field against DOMAIN_NAME_PATTERNS, rather than
 * guessing/hardcoding an unconfirmed id. If a live program's name doesn't
 * match any pattern exactly, it simply won't resolve — reported as a gap,
 * not silently assumed.
 *
 * Gated on live credentials: this suite is SKIPPED (not failed) whenever
 * FIREBASE_SERVICE_ACCOUNT_KEY isn't set — true for this recon worktree
 * (no .env.local here; the credential wasn't copied from the other
 * worktree on purpose — see the recon report). To actually run it, from an
 * environment with FIREBASE_SERVICE_ACCOUNT_KEY (e.g. the main checkout,
 * or the progression-map-phase0 worktree, which already has one):
 *
 *   npx vitest run src/features/progression-map/services/__tests__/audit-prerequisite-derivation.test.ts --reporter=verbose
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import { describe, it, expect, beforeAll } from 'vitest';
import * as admin from 'firebase-admin';
import { buildSkillTree } from '../build-skill-tree.service';
import type { Exercise } from '@/features/content/exercises/core/exercise.types';

const SKILLS: { id: string; name: string }[] = [
  { id: 'mFcuYlNgKXLqWVUFo0zt', name: 'פרונט לבר (front lever)' },
  { id: 'pCI5NHXpowu2ySucqDn8', name: 'פלאנץ׳ (planche)' },
  { id: 'cC0BOmm6KIqYAyQynEIo', name: 'מתח יד אחת (one-arm pull-up)' },
  { id: 'PAxprHuT7HjqrWU4wl0T', name: 'HSPU' },
  { id: 'IOfBZFeorTTDkcz3tOA6', name: 'עמידת ידיים (handstand)' },
  { id: 'EtY8YCol0qpF6DzgcTx1', name: 'דגל אנושי (human flag)' },
];

/** Given directly in the brief — not derived. */
const KNOWN_DOMAIN_IDS: Record<string, string> = {
  משיכה: 'UPDBtTdCvX748dtBlWYj',
  דחיפה: 'J0fLpmJhG0KDN2tQouxh',
};
/** ליבה/רגליים ids were NOT given — resolved from live program names instead of guessed. */
const DOMAIN_NAME_PATTERNS = ['משיכה', 'דחיפה', 'ליבה', 'רגליים'];

const hasCredentials = !!process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

type LocalizedTextLike = { he?: string; en?: string; es?: string } | string | undefined;
function nameOf(value: LocalizedTextLike, fallback: string): string {
  if (!value) return fallback;
  if (typeof value === 'string') return value || fallback;
  return value.he || value.en || value.es || fallback;
}

function initFb(): admin.firestore.Firestore {
  const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
  }
  return admin.firestore();
}

describe.skipIf(!hasCredentials)('progression-v2 Phase 0 — prerequisite-derivation audit (real Firestore, read-only)', () => {
  let allExercises: Exercise[] = [];
  let domainIdToName: Map<string, string> = new Map();

  beforeAll(async () => {
    const db = initFb();

    const exSnap = await db.collection('exercises').get();
    allExercises = exSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as unknown as Exercise);
    console.log(`\nLoaded ${allExercises.length} exercises total.`);

    const progSnap = await db.collection('programs').get();
    domainIdToName = new Map();
    // Seed with the two given ids first (authoritative), then resolve
    // ליבה/רגליים (and re-confirm משיכה/דחיפה) by live name match.
    for (const [name, id] of Object.entries(KNOWN_DOMAIN_IDS)) {
      domainIdToName.set(id, name);
    }
    for (const d of progSnap.docs) {
      const data = d.data() as Record<string, unknown>;
      const name = String(data.name ?? '');
      if (DOMAIN_NAME_PATTERNS.includes(name)) {
        domainIdToName.set(d.id, name);
      }
    }
    console.log(`Loaded ${progSnap.docs.length} programs. Resolved domain program ids:`);
    domainIdToName.forEach((name, id) => {
      console.log(`  ${name} -> ${id}`);
    });
    const resolvedNames = Array.from(domainIdToName.values());
    const missingDomains = DOMAIN_NAME_PATTERNS.filter((n) => !resolvedNames.includes(n));
    if (missingDomains.length) {
      console.log(`  ⚠️  NOT resolved from live program names (no exact match): ${missingDomains.join(', ')}`);
    }
  });

  it.each(SKILLS)('$name ($id) — level-1 target-exercise: derived domain prerequisite?', (skill) => {
    console.log(`\n${'='.repeat(70)}\n${skill.name} (${skill.id})\n${'='.repeat(70)}`);

    const tree = buildSkillTree(allExercises, skill.id);
    if (!tree) {
      console.log('  ❌ NO TREE — zero exercises resolve a level for this program. Cannot derive a prerequisite.');
      expect(tree, `${skill.name}: no tree at all`).not.toBeNull();
      return;
    }

    const level1Rung = tree.rungs.find((r) => r.level === tree.minLevel);
    console.log(`  Tree levels ${tree.minLevel}-${tree.maxLevel}. Using level ${tree.minLevel} as "level 1" (lowest observed).`);

    if (!level1Rung || level1Rung.isGap || !level1Rung.representative) {
      console.log(`  ❌ Level ${tree.minLevel} is a GAP — no target-exercise to derive a prerequisite from.`);
      expect(level1Rung?.representative, `${skill.name}: level-1 rung has no representative`).toBeTruthy();
      return;
    }

    const ex = level1Rung.representative;
    const exName = nameOf(ex.name as LocalizedTextLike, ex.id);
    console.log(`  Level-1 target-exercise: "${exName}" (${ex.id})`);

    const allTags = (ex.targetPrograms ?? []).map((tp) => ({
      programId: tp.programId,
      level: tp.level,
      domainName: domainIdToName.get(tp.programId) ?? null,
    }));
    console.log(`  Full targetPrograms: ${JSON.stringify(allTags)}`);

    const domainTags = allTags.filter((t) => t.programId !== skill.id && t.domainName);
    if (domainTags.length === 0) {
      console.log(`  ⚠️  GAP — no broad-domain tag found on this exercise. A manual prerequisite override would be needed for ${skill.name}.`);
    } else {
      for (const t of domainTags) {
        console.log(`  ✅ DERIVED PREREQUISITE: ${t.domainName} level ${t.level}`);
      }
      if (domainTags.length > 1) {
        console.log(`  ⚠️  Tagged to MORE THAN ONE domain (${domainTags.map((t) => t.domainName).join(', ')}) — ambiguous which one is "the" prerequisite without a tie-break rule.`);
      }
    }

    expect(tree).not.toBeNull();
  });
});
