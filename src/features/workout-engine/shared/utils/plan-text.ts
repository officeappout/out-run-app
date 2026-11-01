/**
 * Text the strength runner plan carries (built once, when the workout is composed): the exercise name and
 * the reps / seconds line. Pure; reads the app language at call time (makeLiveT / content language).
 *
 * Names: `name` is what the player SHOWS (English in English mode when the exercise has one), `nameHe` the
 * Hebrew the save paths keep writing (exercise logs, completed exercises), so history stays as before.
 * Hebrew mode: `name` is exactly the old getLocalizedText(name) and the reps / seconds text is byte-identical.
 */
import { makeLiveT } from '@/lib/i18n/live-t';
import { player } from '@/messages/ns/player';
import { getLocalizedText, type LocalizedText } from '@/features/content/shared/localized-text.types';
import { getContentLanguage } from '@/features/content/shared/useContentLanguage';

const tPlayer = makeLiveT(player);

export function planRepsText(n: number): string {
  return tPlayer('planVolume.reps', { n });
}

export function planRepsRangeText(min: number, max: number): string {
  return tPlayer('planVolume.repsRange', { min: String(min), max });
}

export function planSecsText(n: number): string {
  return tPlayer('planVolume.secs', { n });
}

export function planSecsRangeText(min: number, max: number): string {
  return tPlayer('planVolume.secsRange', { min: String(min), max });
}

/** The reps unit after an already-formatted value ("3×8-12", "10"). */
export function planRepsUnitText(v: string | number, n: number = Number.parseFloat(String(v).split(/[^0-9.]/).pop() || '2') || 2): string {
  return tPlayer('planVolume.repsUnit', { v: String(v), n });
}

/** The seconds unit after an already-formatted value. */
export function planSecsUnitText(v: string | number, n: number = Number.parseFloat(String(v).split(/[^0-9.]/).pop() || '2') || 2): string {
  return tPlayer('planVolume.secsUnit', { v: String(v), n });
}

/** The widened 1-rep peak-pyramid window (PresentationFormatter). */
export function planPeakSetText(): string {
  return tPlayer('planVolume.peakSet');
}

/** Pyramid section header: the up-and-down wave or the peak set. */
export function planPyramidText(shape: 'wave' | 'peak'): string {
  return tPlayer('planVolume.pyramid', { shape });
}

/** Title of the tabata finisher segment appended to a strength plan. */
export function planTabataFinisherTitle(): string {
  return tPlayer('planSection.tabataFinisher');
}

/** The per-side suffix (leading space included). */
export function planPerSideText(): string {
  return tPlayer('planVolume.perSide');
}

/**
 * `{ name, nameHe }` for a plan exercise. `nameHe` is set only when it differs from `name` (English mode),
 * so Hebrew plans keep their exact old shape.
 */
export function planExerciseNames(
  value: LocalizedText | string | null | undefined,
  lang: string = getContentLanguage(),
): { name: string; nameHe?: string } {
  const he = getLocalizedText(value as LocalizedText);
  if (lang !== 'en' || typeof value !== 'object' || !value) return { name: he };
  const en = getLocalizedText(value, 'en');
  return en && en !== he ? { name: en, nameHe: he } : { name: he };
}

/** The name the save paths write: the Hebrew one when the plan carries both. */
export function savedExerciseName(ex: { name?: string | null; nameHe?: string | null } | null | undefined): string {
  return ex?.nameHe || ex?.name || '';
}
