/** Shared helpers for the rules. Pure. */
import type { Activity, ExerciseSummary, GenerationOutput } from '../types';

export type PatternGroup = 'push' | 'pull' | 'legs' | 'core' | 'other';

/** Any pattern / movement-group spelling in the app → push / pull / legs / core / other. */
export function patternGroup(pattern: string | null | undefined): PatternGroup | null {
  if (!pattern) return null;
  const p = pattern.toLowerCase();
  if (p.includes('push') || p === 'planche' || p.startsWith('handstand') || p === 'dip') return 'push';
  if (p.includes('pull') || p === 'front_lever' || p === 'back_lever' || p === 'muscle_up' || p === 'row') return 'pull';
  if (p === 'legs' || p === 'squat' || p === 'hinge' || p === 'lunge' || p.includes('leg')) return 'legs';
  if (p.startsWith('core') || p === 'abs') return 'core';
  return 'other';
}

/** Every strength exercise of the session, with where it sits (top-level block or leg index). */
export function allExercises(out: GenerationOutput): Array<{ ex: ExerciseSummary; block: string }> {
  const list: Array<{ ex: ExerciseSummary; block: string }> = (out.exercises ?? []).map((ex) => ({ ex, block: 'main' }));
  (out.legs ?? []).forEach((leg, i) => {
    for (const ex of leg.exercises ?? []) list.push({ ex, block: `leg${i}` });
  });
  return list;
}

export const AEROBIC: ReadonlySet<Activity> = new Set<Activity>(['walk', 'run', 'cycle']);

export const ACTIVITY_LABEL_HE: Record<Activity, string> = {
  walk: 'הליכה',
  run: 'ריצה',
  cycle: 'רכיבה',
  strength: 'כוח',
  rest: 'מנוחה',
  other: 'אחר',
};

/** Which aerobic activity a Hebrew plan label names ("ריצה + כוח" → run). */
export function activityFromLabel(label: string | null | undefined): Activity | null {
  if (!label) return null;
  if (label.includes('ריצה') || /\brun/i.test(label)) return 'run';
  if (label.includes('רכיבה') || label.includes('אופניים') || /\b(cycl|bike)/i.test(label)) return 'cycle';
  if (label.includes('הליכה') || /\bwalk/i.test(label)) return 'walk';
  return null;
}

export function isBodyweightOnly(equipment: string[] | undefined | null): boolean {
  return !equipment || equipment.length === 0 || equipment.every((e) => e === 'none' || e === 'bodyweight' || e === 'floor');
}
