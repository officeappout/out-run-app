/**
 * Workout insights — the dedicated prompt of POST /api/insights/workout. Pure.
 *
 * Deliberately NOT Kelly's chat persona (src/lib/ai/coach/persona.ts is untouched): a short,
 * stable system prompt for two lines, and a user message built ONLY from workout facts. The
 * model sees no name, no uid, no bodyweight, no location: the grammar for the user's gender,
 * exercise names from the catalog, sets, durations and the server-computed volume /
 * comparisons (the math is done here, never by the model).
 */
import type { CoachGender } from '@/lib/ai/coach/persona';
import type { WorkoutInsightRequest } from './schema';
import { funnyComparisons } from './volume';

export const INSIGHT_MAX_TOKENS = 220;

export const INSIGHT_SYSTEM = [
  'You write two short Hebrew lines for Kelly (קלי), a male fitness coach in the OUT app, shown right after the user finished a workout.',
  'Line "insight": praise plus ONE smart conclusion from the facts (what improved, what was strong, what it means). At most 22 words.',
  'Line "funny": one playful, light line about the workout, ideally using one of the given comparisons. At most 16 words.',
  'Use only numbers that appear in the facts, written exactly as given. Never invent records, weights, distances or comparisons.',
  'Hebrew only, warm and upbeat, no questions, no emoji, no slash forms (never "את/ה"), no medical or weight-loss claims, never guilt.',
  'Kelly speaks about himself in the masculine. Address the user in the grammar given.',
  'Reply with JSON only: {"insight":"…","funny":"…"}. Use null for a line you cannot write from the facts.',
].join('\n');

const GRAMMAR: Record<CoachGender, string> = {
  male: 'Address the user in masculine singular.',
  female: 'Address the user in feminine singular.',
  other: 'Gender unknown: impersonal wording only. Never address the user in the singular (no אתה, את, לך, שלך, no singular command).',
};

function minutes(sec: number): number {
  return Math.max(1, Math.round(sec / 60));
}

function paceText(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** The facts, one per line ("- …"). Exported for the tests. */
export function insightFacts(req: WorkoutInsightRequest, volumeKg: number | null): string[] {
  const f: string[] = [];
  f.push(`workout type: ${req.kind === 'run' ? 'run' : 'strength'}`);
  f.push(`duration: ${minutes(req.durationSec)} minutes`);
  if (req.first) f.push('this was the user’s first workout');
  if (req.recovery) f.push('this was a light recovery workout (it does not move the level)');
  for (const e of req.exercises.slice(0, 12)) {
    const done = e.sets.filter((v) => v > 0);
    if (done.length === 0) continue;
    const unit = e.unit === 'seconds' ? 'seconds' : 'reps';
    const imp = e.improvedBy ? `, +${e.improvedBy} ${unit} vs last time (best set)` : '';
    f.push(`exercise "${e.name}": ${done.length} sets (${done.join(', ')} ${unit})${imp}`);
  }
  if (req.run) {
    f.push(`distance: ${req.run.distanceKm.toFixed(1)} km`);
    if (req.run.paceSecPerKm) f.push(`average pace: ${paceText(req.run.paceSecPerKm)} per km`);
  }
  if (req.level) {
    if (req.level.leveledUp) f.push(`level up: reached level ${req.level.after}`);
    else if (req.level.gainPercent > 0) f.push(`level progress: +${Math.round(req.level.gainPercent)}% toward level ${req.level.before + 1}`);
  }
  if (volumeKg != null) {
    f.push(`estimated bodyweight volume moved: ${volumeKg.toLocaleString('en-US')} kg`);
    const comps = funnyComparisons(volumeKg);
    if (comps.length) f.push(`that is about: ${comps.join(' / ')}`);
  }
  return f;
}

export function insightUserContent(req: WorkoutInsightRequest, gender: CoachGender, volumeKg: number | null): string {
  return [GRAMMAR[gender], 'Facts:', ...insightFacts(req, volumeKg).map((x) => `- ${x}`)].join('\n');
}
