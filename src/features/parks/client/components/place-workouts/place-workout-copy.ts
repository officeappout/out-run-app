/**
 * PlaceWorkoutSuggestion → the card's words and its mini intensity strip.
 * Pure (the caller passes its useT(map)); numbers go through Intl.
 */

import type { NamespaceKey } from '@/lib/i18n/catalogs';
import type { MessageValues } from '@/lib/i18n/core/i18n-core';
import { formatNumber } from '@/lib/i18n/core/fmt';
import type { Locale } from '@/lib/i18n/locales';
import type { map } from '@/messages/ns/map';
import type { ProfileStripSegment } from '@/components/ui/v2/ProfileStrip';
import type { PlaceWorkoutStyle, PlaceWorkoutSuggestion } from '@/features/workout-engine/place-fit';

export type MapT = ((key: NamespaceKey<typeof map>, values?: MessageValues) => string) & { locale?: Locale };

/** The first card's generated workout, when it's ready (park page). */
export interface GeneratedLead {
  durationMin: number;
  exerciseCount: number;
}

export interface PlaceWorkoutCopy {
  eyebrow: string;
  title: string;
  meta: string | null;
  /** Short title for the sticky CTA ("התחל · גוף מלא 35׳"). */
  shortTitle: string;
  minutes: number | null;
}

const ACCENT: Record<PlaceWorkoutStyle, string> = {
  strength: '#4f46e5',
  strength_short: '#4f46e5',
  hybrid: '#c2410c',
  run_easy: '#0284c7',
  run_hills: '#b45309',
  run_quality: '#be185d',
  walk: '#047857',
};

export function styleAccent(style: PlaceWorkoutStyle): string {
  return ACCENT[style];
}

function num(n: number, t: MapT, digits = 1): string {
  return formatNumber(n, (t.locale ?? 'he') as Locale, { maximumFractionDigits: digits });
}

function aerobicOf(s: PlaceWorkoutSuggestion): 'walking' | 'running' {
  return s.start.kind === 'hybrid' ? s.start.aerobicKind : 'running';
}

function styleTitle(s: PlaceWorkoutSuggestion, t: MapT): string {
  switch (s.style) {
    case 'strength': return t('placeWorkouts.title.strength');
    case 'strength_short': return t('placeWorkouts.title.strengthShort', { min: String(s.durationMin ?? 0) });
    case 'hybrid':
      return s.start.kind === 'hybrid' && s.start.routeId
        ? t('placeWorkouts.title.hybridRoute', { aerobic: aerobicOf(s) })
        : t('placeWorkouts.title.hybridPark', { aerobic: aerobicOf(s) });
    case 'run_easy': return t('placeWorkouts.title.runEasy');
    case 'run_hills': return t('placeWorkouts.title.runHills', { reps: String(s.meta.kind === 'hill_reps' ? s.meta.reps : 0) });
    case 'run_quality': return t('placeWorkouts.title.runQuality');
    case 'walk': return t('placeWorkouts.title.walk');
  }
}

function metaLine(s: PlaceWorkoutSuggestion, t: MapT, lead: GeneratedLead | null | 'loading'): string | null {
  const min = s.durationMin;
  const minStr = min != null ? String(min) : null;
  const m = s.meta;
  switch (m.kind) {
    case 'park_workout':
      if (lead === 'loading') return t('placeWorkouts.meta.preparing');
      if (lead) return t('placeWorkouts.meta.parkWorkout', { min: String(lead.durationMin), count: lead.exerciseCount });
      return minStr ? t('placeWorkouts.meta.min', { min: minStr }) : null;
    case 'equipment':
      return m.names.length ? m.names.join(' · ') : minStr ? t('placeWorkouts.meta.min', { min: minStr }) : null;
    case 'loop':
      return t('placeWorkouts.meta.min', { min: String(m.minutes) });
    case 'distance':
      if (!minStr) return null;
      if (m.laps != null && m.laps > 1) return t('placeWorkouts.meta.laps', { min: minStr, laps: num(m.laps, t) });
      return m.km != null ? t('placeWorkouts.meta.distance', { min: minStr, km: num(m.km, t) }) : t('placeWorkouts.meta.min', { min: minStr });
    case 'hill_reps':
      if (!minStr) return null;
      return m.climbAtKm != null ? t('placeWorkouts.meta.climbAt', { min: minStr, km: num(m.climbAtKm, t) }) : t('placeWorkouts.meta.min', { min: minStr });
    case 'stop_at':
      if (!minStr) return null;
      return m.km != null ? t('placeWorkouts.meta.stopAt', { min: minStr, km: num(m.km, t) }) : t('placeWorkouts.meta.min', { min: minStr });
  }
}

export function placeWorkoutCopy(s: PlaceWorkoutSuggestion, t: MapT, lead: GeneratedLead | null | 'loading' = null): PlaceWorkoutCopy {
  const title = s.planTitle?.trim() || styleTitle(s, t);
  const eyebrow = s.isFromPlan
    ? (s.style === 'walk' ? t('placeWorkouts.eyebrow.walkPlan') : t('placeWorkouts.eyebrow.plan'))
    : t('placeWorkouts.eyebrow.style', { style: s.style, aerobic: aerobicOf(s) });
  const minutes = lead && lead !== 'loading' && s.meta.kind === 'park_workout' ? lead.durationMin : s.durationMin;
  return { eyebrow, title, meta: metaLine(s, t, lead), shortTitle: title, minutes };
}

/** A decorative intensity shape per style (the real profile lives in the workout overview). */
export function styleStrip(style: PlaceWorkoutStyle): ProfileStripSegment[] {
  const seg = (key: string, color: string, flex: number, height: number) => ({ key, color, flex, height });
  const LIME = '#84cc16';
  const INDIGO = '#6366f1';
  const SKY = '#38bdf8';
  const AMBER = '#f59e0b';
  const ROSE = '#f43f5e';
  const GREEN = '#10b981';
  switch (style) {
    case 'hybrid':
      return [0, 1, 2, 3, 4, 5].map((i) => seg(`h${i}`, i % 2 ? INDIGO : LIME, 2, i % 2 ? 90 : 45));
    case 'strength':
    case 'strength_short':
      return [0, 1, 2, 3, 4].map((i) => seg(`s${i}`, INDIGO, 2, i === 0 ? 40 : 85));
    case 'run_hills':
      return [seg('w', SKY, 3, 35), ...[0, 1, 2, 3, 4].flatMap((i) => [seg(`u${i}`, AMBER, 1, 95), seg(`d${i}`, SKY, 1, 30)]), seg('c', SKY, 2, 30)];
    case 'run_quality':
      return [seg('w', SKY, 3, 35), ...[0, 1, 2, 3].flatMap((i) => [seg(`q${i}`, ROSE, 1.5, 90), seg(`r${i}`, SKY, 1, 30)]), seg('c', SKY, 2, 30)];
    case 'walk':
      return [seg('w', GREEN, 10, 40)];
    case 'run_easy':
    default:
      return [seg('e', SKY, 10, 55)];
  }
}
