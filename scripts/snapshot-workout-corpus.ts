/**
 * snapshot-workout-corpus.ts — freezes the workout-engine data corpus to JSON.
 *
 * WHY: the invariants gate runs generateHomeWorkoutTrio() hermetically (no live
 * Firestore) so it catches LOGIC regressions, not data drift. This reads the
 * corpus ONCE via the Admin SDK (Node-safe), applies the SAME normalizers the
 * live client providers use, and writes tests/invariants/fixtures/*.json. The
 * runner's provider mocks replay these files.
 *
 * The fixture is a FROZEN SNAPSHOT — re-run when content changes materially:
 *     npm run snapshot:corpus
 *
 * Requires FIREBASE_SERVICE_ACCOUNT_KEY in .env.local (Admin credentials).
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = join(process.cwd(), 'tests/invariants/fixtures');

/** Recursively convert Admin Firestore Timestamps → ISO strings for stable JSON. */
function serialize(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'object') {
    const v = value as Record<string, unknown>;
    if (typeof (v as { toDate?: unknown }).toDate === 'function') {
      return (v as { toDate(): Date }).toDate().toISOString();
    }
    if (Array.isArray(value)) return value.map(serialize);
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) out[k] = serialize(val);
    return out;
  }
  return value;
}

/** Init Admin SDK directly — bypasses src/lib/firebase-admin.ts (imports `server-only`). */
async function initAdminDb() {
  const { initializeApp, cert, getApps } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const parsed = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  const app = getApps()[0] ?? initializeApp({
    credential: cert({
      projectId: parsed.project_id,
      clientEmail: parsed.client_email,
      privateKey: String(parsed.private_key).replace(/\\n/g, '\n'),
    }),
    projectId: parsed.project_id,
  });
  return getFirestore(app);
}

async function main() {
  const { normalizeExercise } = await import('@/features/content/exercises/services/exercise-mapping.utils');
  const db = await initAdminDb();

  const dump = async (collection: string) => {
    const snap = await db.collection(collection).get();
    return snap.docs.map(d => ({ id: d.id, data: serialize(d.data()) as Record<string, unknown> }));
  };

  const t0 = Date.now();
  const [rawExercises, rawGym, rawPrograms, rawLevelSettings] = await Promise.all([
    dump('exercises'),
    dump('gym_equipment'),
    dump('programs'),
    dump('program_level_settings'),
  ]);
  console.log(`[snapshot] read from Firestore in ${Date.now() - t0}ms`);

  // Exercises: apply the real normalizer so the fixture === getAllExercises() output.
  const exercises = rawExercises.map(({ id, data }) => normalizeExercise(id, data));
  // Programs / gym-equipment / level-settings: providers only spread { id, ...data }
  // (+ date coercion, already handled by serialize). Replay that shape.
  const programs = rawPrograms.map(({ id, data }) => ({ id, ...data }));
  const gymEquipment = rawGym.map(({ id, data }) => ({ id, ...data }));
  const programLevelSettings = rawLevelSettings.map(({ id, data }) => ({ id, ...data }));

  const write = (name: string, arr: unknown[]) => {
    writeFileSync(join(OUT, `${name}.json`), JSON.stringify(arr));
    const kb = (JSON.stringify(arr).length / 1024).toFixed(0);
    console.log(`  ✓ ${name}.json  (${arr.length} docs, ${kb}kb)`);
  };

  write('exercises', exercises);
  write('programs', programs);
  write('gym_equipment', gymEquipment);
  write('program_level_settings', programLevelSettings);
  console.log('[snapshot] done →', OUT);
  process.exit(0);
}

main().catch(e => { console.error('[snapshot] FAILED:', e?.stack || e?.message || e); process.exit(1); });
