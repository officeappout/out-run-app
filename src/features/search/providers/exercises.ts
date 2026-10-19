/**
 * Exercises provider — the same cached catalog the library loads (getAllExercisesCached), name
 * match in he / en (like the library's own query) + a muscle word ("בטן" → primary muscle abs,
 * like tapping the library's muscle chip). Ranking is pure.
 */
import { getAllExercisesCached } from '@/features/content/exercises/core/exercise.service';
import { MUSCLE_GROUP_LABELS, type Exercise, type MuscleGroup } from '@/features/content/exercises/core/exercise.types';
import { norm, scoreFields } from '../core/text';
import type { ExerciseHit } from '../core/types';

const MUSCLE_SCORE = 50;

/** The muscle a query names ("בטן", "חזה", "Abs"), or null. Exact label, or a 3+ letter prefix. */
export function muscleForQuery(query: string): MuscleGroup | null {
  const q = norm(query);
  if (q.length < 2) return null;
  for (const [m, l] of Object.entries(MUSCLE_GROUP_LABELS) as Array<[MuscleGroup, { he: string; en: string }]>) {
    const he = norm(l.he);
    const en = norm(l.en);
    if (q === he || q === en || (q.length >= 3 && (he.startsWith(q) || en.startsWith(q)))) return m;
  }
  return null;
}

export function rankExercises(list: readonly Exercise[], query: string, max = 60): ExerciseHit[] {
  const muscle = muscleForQuery(query);
  const out: ExerciseHit[] = [];
  for (const ex of list) {
    const he = ex.name?.he ?? '';
    const en = ex.name?.en ?? '';
    let score = scoreFields([[he, 1], [en, 0.9]], query);
    if (muscle && ex.primaryMuscle === muscle) score = Math.max(score, MUSCLE_SCORE);
    if (score <= 0) continue;
    const muscleLabel = ex.primaryMuscle ? MUSCLE_GROUP_LABELS[ex.primaryMuscle]?.he : undefined;
    out.push({ kind: 'exercise', key: `exercise:${ex.id}`, title: he || en, subtitle: muscleLabel, score, exercise: ex });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, max);
}

export async function searchExercises(query: string): Promise<ExerciseHit[]> {
  return rankExercises(await getAllExercisesCached(), query);
}

/** Names for "אולי חיפשת". */
export async function exerciseNames(): Promise<string[]> {
  return (await getAllExercisesCached()).map((e) => e.name?.he ?? '').filter(Boolean);
}
