/**
 * v2-review-export.ts — failing / warned v2 matrix cells → generation-review regression
 * fixtures (src/lib/generation-review/review/fixture-export.ts, the same shape the admin
 * "הפוך לבדיקת רגרסיה" button downloads), so the /admin/generation-review LLM reviewer can
 * judge them later. Writes local files only; NEVER calls an LLM.
 *
 * The fixture's `input` / `output` are the review summaries (GenerationInput / Output);
 * `findings` = the panel's own deterministic rules on that summary; `qa` = the matrix
 * violations (H and V ids) that made the cell interesting.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { buildRegressionFixture } from '@/lib/generation-review/review/fixture-export';
import { runInvariants } from '@/lib/generation-review/invariants';
import type { ExerciseSummary, GenerationInput, GenerationOutput, GenerationType } from '@/lib/generation-review/types';
import type { WorkoutExercise } from '@/features/workout-engine/logic/workout-generator.types';
import { exName } from '../hard-invariants';
import type { V2Run } from './v2-runner';

const isMain = (e: WorkoutExercise) => (e.exerciseRole ?? 'main') !== 'warmup' && e.exerciseRole !== 'cooldown';

function exerciseSummary(e: WorkoutExercise): ExerciseSummary & { name: string } {
  return {
    id: e.exercise?.id ?? '?', name: exName(e), pattern: (e.exercise?.movementGroup as string) ?? null, sets: e.sets ?? null,
    reps: e.isTimeBased ? null : e.reps ?? null, durationSec: e.isTimeBased ? e.reps ?? null : null, level: e.programLevel ?? null,
  };
}

export function reviewSessionOf(r: V2Run): { type: GenerationType; input: GenerationInput; output: GenerationOutput } {
  const s = r.scenario;
  const hybrid = s.group === 'hybrid' || s.group === 'route_stops';
  const type: GenerationType = s.group === 'route_stops' ? 'hybrid_route_stops' : s.group === 'hybrid' ? 'hybrid_smart_walk' : 'home_strength';
  const loc = s.loc.startsWith('home') ? 'home' : s.loc === 'gym' ? 'gym' : 'park';
  const exercises = r.workout.exercises.filter(isMain).map(exerciseSummary);
  return {
    type,
    input: {
      requestedActivity: hybrid ? 'walk' : 'strength', targetMinutes: s.minutes || null,
      focus: (r.meta.expectedFocus as string | null) ?? s.domain ?? null, location: loc, equipment: r.hardCtx.availableGear,
      levels: { push: s.level, pull: s.level, legs: s.level, core: s.level }, personaIds: [],
      flags: { enable_home_v2: true },
    },
    output: {
      title: r.workout.title ?? null, whyHe: (r.meta.whyLine as string | null) ?? null, planActivity: hybrid ? 'walk' : 'strength',
      totalMinutes: (r.workout as { estimatedDuration?: number }).estimatedDuration ?? null,
      exercises: hybrid ? [] : exercises,
      legs: hybrid ? [{ activity: 'strength', distanceM: null, minutes: s.minutes || null, exercises }] : [],
      stations: [], route: null,
    },
  };
}

export function exportReviewFixtures(cells: { run: V2Run; hard: string[]; evidence: string[] }[], dir: string): number {
  fs.mkdirSync(dir, { recursive: true });
  let n = 0;
  for (const c of cells) {
    const session = reviewSessionOf(c.run);
    const findings = runInvariants(session);
    const logId = `qa-${c.run.scenario.id}-b${c.run.bolt}`.replace(/[^\w.-]+/g, '_');
    const fx = buildRegressionFixture({ logId, day: '2026-10-21', type: session.type, generator: `v2-matrix:${c.run.scenario.group}`, input: session.input, output: session.output, findings });
    const out = { ...fx, qa: { scenario: c.run.scenario, bolt: c.run.bolt, hard: c.hard, evidence: c.evidence, meta: c.run.meta } };
    fs.writeFileSync(path.join(dir, `${logId}.json`), `${JSON.stringify(out, null, 1)}\n`);
    n++;
  }
  return n;
}
