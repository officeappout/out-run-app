/**
 * The focus of a planned (future) strength day for the week preview title
 * (enable_home_v2, owner 20.10.2026) — the same answer the generator will give that day
 * (day-focus.generator.ts), computed from what is stored: the day's strength ids → the
 * domains they cover, kept to the ones the user has a level in (the generator's own
 * "absent = absent" rule). Pure; null = no focus to show.
 */
import { classifyStrengthId } from '@/features/schedule/engine/strengthVocabulary';
import { resolveGeneratorDayFocus, type GeneratorDayFocusInput } from '@/features/workout-engine/services/split-decision/day-focus.generator';
import { expandPoolDomains, type DayFocus } from '@/features/workout-engine/services/split-decision/day-focus.utils';

type Leveled = number | { currentLevel?: number; level?: number } | null | undefined;

const levelOf = (v: Leveled): number => (v == null ? 0 : typeof v === 'number' ? v : v.currentLevel ?? v.level ?? 0);

export interface PlannedDayFocusInput {
  profile: GeneratorDayFocusInput['profile'] & {
    progression?: { tracks?: Record<string, Leveled> | null; domains?: Record<string, Leveled> | null } | null;
  };
  dateISO: string;
  /** The day's stored strength ids (entry programIds / template ids / the active program). */
  programIds: ReadonlyArray<string>;
}

export function plannedDayFocusOf({ profile, dateISO, programIds }: PlannedDayFocusInput): DayFocus | null {
  if (!profile) return null;
  const slugs = programIds
    .map((id) => classifyStrengthId(id).slug)
    .filter((s): s is string => !!s);
  const tracks = profile.progression?.tracks ?? {};
  const domains = profile.progression?.domains ?? {};
  const pool = expandPoolDomains(slugs).filter((d) => levelOf(tracks[d]) > 0 || levelOf(domains[d]) > 0);
  if (pool.length === 0) return null;
  const r = resolveGeneratorDayFocus({ enabled: true, profile, selectedDate: dateISO, pool });
  return r?.focus ?? null;
}
