/**
 * Workout insights (enable_workout_insights_v1) — bodyweight-relative strength volume. Pure.
 *
 * The app never logs an external load, so "how much did I lift" is estimated from the user's
 * bodyweight (owner decision 22.10.2026):
 *
 *   volume kg = Σ reps × bodyweight kg × the exercise's load factor
 *
 * The factor is the share of bodyweight a movement moves (pull-up / dip ≈ 1.0, push-up ≈ 0.64,
 * squat ≈ 0.7 …). It is a CONFIG map: match by keyword on the exercise name (Hebrew catalog
 * names, English fallbacks). Timed holds (seconds) and unknown movements count 0 — no invented
 * weight. The result is rounded for copy ("≈3,200 ק״ג"), never shown as a measurement.
 */

export interface LoadFactorRule {
  /** Lower-case substrings; the first rule with any match wins (order matters: specific first). */
  match: readonly string[];
  factor: number;
}

/** First match wins — keep narrower names (one-arm, archer, knee) above the generic ones. */
export const LOAD_FACTOR_RULES: readonly LoadFactorRule[] = [
  { match: ['שכיבות סמיכה על הברכיים', 'שכיבות שמיכה על הברכיים', 'knee push'], factor: 0.49 },
  { match: ['שכיבות סמיכה בשיפוע', 'incline push'], factor: 0.41 },
  { match: ['שכיבות סמיכה מוגבהות', 'decline push'], factor: 0.74 },
  { match: ['ספידר', 'pike push'], factor: 0.7 },
  { match: ['עמידת ידיים', 'handstand push'], factor: 0.95 },
  { match: ['שכיבות סמיכה', 'שכיבות שמיכה', 'push-up', 'push up', 'pushup'], factor: 0.64 },
  { match: ['מקבילים', 'דיפס', 'dip'], factor: 1.0 },
  { match: ['מתח אוסטרלי', 'חתירה אוסטרלית', 'australian', 'inverted row', 'row'], factor: 0.55 },
  { match: ['מתח', 'עליות', 'pull-up', 'pull up', 'pullup', 'chin-up', 'chin up', 'muscle up', 'מאסל'], factor: 1.0 },
  { match: ['סקוואט על רגל אחת', 'pistol', 'בולגרי', 'bulgarian'], factor: 0.85 },
  { match: ['סקוואט', 'כפיפות ברכיים', 'squat'], factor: 0.7 },
  { match: ['לאנג', 'מכרע', 'lunge'], factor: 0.7 },
  { match: ['גשר', 'hip thrust', 'glute bridge'], factor: 0.6 },
  { match: ['עליות על הבהונות', 'calf'], factor: 0.9 },
  { match: ['הרמות רגליים', 'leg raise', 'knee raise'], factor: 0.35 },
  { match: ['בטן', 'כפיפות בטן', 'crunch', 'sit-up', 'sit up'], factor: 0.3 },
  { match: ['בורפי', 'burpee'], factor: 0.7 },
];

export function loadFactorFor(name: string | null | undefined): number {
  const n = (name ?? '').toLowerCase().trim();
  if (!n) return 0;
  for (const r of LOAD_FACTOR_RULES) if (r.match.some((m) => n.includes(m))) return r.factor;
  return 0;
}

export interface VolumeExercise {
  name: string;
  unit: 'reps' | 'seconds';
  /** Performed value per set. */
  sets: readonly number[];
}

/** A plausible adult bodyweight, else null (the copy then skips the kg comparison). */
export function usableBodyweightKg(raw: unknown): number | null {
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
  return Number.isFinite(n) && n >= 30 && n <= 250 ? n : null;
}

/** Σ reps × bodyweight × factor, rounded to 10 kg. null without a usable bodyweight or any counted rep. */
export function bodyweightVolumeKg(exercises: readonly VolumeExercise[], bodyweightKg: unknown): number | null {
  const bw = usableBodyweightKg(bodyweightKg);
  if (bw == null) return null;
  let kg = 0;
  for (const e of exercises) {
    if (e.unit !== 'reps') continue;
    const f = loadFactorFor(e.name);
    if (f <= 0) continue;
    const reps = e.sets.reduce((s, v) => s + (Number.isFinite(v) && v > 0 ? v : 0), 0);
    kg += reps * bw * f;
  }
  if (kg <= 0) return null;
  return Math.round(kg / 10) * 10;
}

/** Funny reference weights (kg) the model may compare to — the math is done here, not by the model. */
export const FUNNY_REFERENCES: readonly { he: string; kg: number }[] = [
  { he: 'גורי פילים', kg: 100 },
  { he: 'למורים', kg: 3 },
  { he: 'פסנתרים', kg: 300 },
  { he: 'אופנועים', kg: 200 },
  { he: 'מקררים', kg: 80 },
  { he: 'אבטיחים', kg: 8 },
];

/** "N גורי פילים" style facts, only for references that give a readable count (2–999). */
export function funnyComparisons(volumeKg: number | null): string[] {
  if (volumeKg == null || volumeKg <= 0) return [];
  const out: string[] = [];
  for (const r of FUNNY_REFERENCES) {
    const n = Math.round(volumeKg / r.kg);
    if (n >= 2 && n <= 999) out.push(`${n} ${r.he}`);
  }
  return out;
}
