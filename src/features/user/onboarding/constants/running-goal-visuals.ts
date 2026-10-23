/**
 * v2 running-goal picker (enable_home_v2) — ONE place that maps each
 * running goal answer (q_run_goal) to a photo and a "who it's for" line.
 *
 * Keyed by the answer's metadata.goalPath (what actually gets saved), with
 * the draft answer ids as a fallback, so it keeps working if the Firestore
 * answer ids differ from the draft file.
 *
 * Photos are the app's own bundled ones, as web-sized JPEG copies under
 * /images/onboarding/running (the gateway PNGs are 1.7 MB and 11.4 MB —
 * the 11 MB one painted in late and in strips on phones: the picker's
 * flicker). The size guard in running-goal-visuals.test.ts keeps them small. Where none fits, `src` is null and
 * the view draws a soft tint panel — never a stand-in photo:
 *  • improve_time    → card-running (gateway) (a real race start line)
 *    Zoomed onto the runners so the arch's sponsor panels stay out.
 *  • maintain_fitness → card-map (gateway) (a runner on a park path).
 *    Its bottom-right corner carries a small generator mark, so the hero
 *    zooms 1.25× around the runner, which keeps that corner out of frame.
 *  • start_running   → no fitting photo (landing/bg-* are strength frames
 *    with UI baked in) → tint panel.
 */

import type { NamespaceKey } from '@/lib/i18n/catalogs';
import type { MessageValues } from '@/lib/i18n/core/i18n-core';
import type { onboarding } from '@/messages/ns/onboarding';

/** A translator bound to the `onboarding` namespace (useT / makeT / getT). Copy lives in `runningGoals.*`. */
export type RunningT = (key: NamespaceKey<typeof onboarding>, values?: MessageValues) => string;

export type RunningGoalPath = 'start_running' | 'improve_time' | 'maintain_fitness';

export interface RunningGoalVisual {
  goalPath: RunningGoalPath | null;
  src: string | null;
  alt: string;
  /** CSS object-position for the wide hero crop. */
  heroPosition: string;
  /** Zoom applied to the hero image, anchored at heroPosition. */
  heroZoom?: number;
  /** CSS object-position for the square thumbnail crop. */
  thumbPosition: string;
  /** Zoom applied to the thumbnail, anchored at thumbPosition. */
  thumbZoom?: number;
  /** Tint-panel colours when there is no photo. */
  tint: { from: string; to: string; ink: string };
}

/** Web-sized copies of gateway/card-running.png and gateway/card-map.png. */
export const RUNNING_GOAL_PHOTOS = {
  race: '/images/onboarding/running/goal-race.jpg',
  park: '/images/onboarding/running/goal-park.jpg',
} as const;

/** `alt` is filled from the catalog in resolveRunningGoalVisual. */
const VISUALS: Record<RunningGoalPath, Omit<RunningGoalVisual, 'goalPath' | 'alt'>> = {
  start_running: {
    src: null,
    heroPosition: '50% 50%',
    thumbPosition: '50% 50%',
    tint: { from: '#f3f9e9', to: '#e2f2c8', ink: '#65a30d' },
  },
  improve_time: {
    src: RUNNING_GOAL_PHOTOS.race,
    // Zoomed onto the runners, below the start arch and its sponsor panels.
    heroPosition: '50% 100%',
    heroZoom: 2,
    thumbPosition: '50% 100%',
    thumbZoom: 1.8,
    tint: { from: '#eef8fc', to: '#d9f1fb', ink: '#0284c7' },
  },
  maintain_fitness: {
    src: RUNNING_GOAL_PHOTOS.park,
    heroPosition: '60% 60%',
    heroZoom: 1.25,
    thumbPosition: '63% 63%',
    thumbZoom: 2.4,
    tint: { from: '#eef8fc', to: '#d9f1fb', ink: '#0284c7' },
  },
};

const ANSWER_ID_TO_PATH: Record<string, RunningGoalPath> = {
  a_run_goal_start: 'start_running',
  a_run_goal_improve: 'improve_time',
  a_run_goal_maintain: 'maintain_fitness',
};

const NEUTRAL: Omit<RunningGoalVisual, 'goalPath'> = {
  src: null,
  alt: '',
  heroPosition: '50% 50%',
  thumbPosition: '50% 50%',
  tint: { from: '#eef8fc', to: '#d9f1fb', ink: '#0284c7' },
};

function isGoalPath(v: unknown): v is RunningGoalPath {
  return v === 'start_running' || v === 'improve_time' || v === 'maintain_fitness';
}

/** Photo description: only the two goals that have a photo. */
function goalAlt(goalPath: RunningGoalPath, t: RunningT): string {
  switch (goalPath) {
    case 'improve_time':
      return t('runningGoals.alt.race');
    case 'maintain_fitness':
      return t('runningGoals.alt.park');
    default:
      return '';
  }
}

/** The goal path an answer saves (metadata first, then the known draft id). */
export function runningGoalPathOf(answer: { id: string; metadata?: Record<string, unknown> | null }): RunningGoalPath | null {
  const fromMeta = answer.metadata?.goalPath;
  if (isGoalPath(fromMeta)) return fromMeta;
  return ANSWER_ID_TO_PATH[answer.id] ?? null;
}

/**
 * Visual for one answer. An unknown answer with its own Firestore imageUrl
 * shows that image; otherwise a neutral tint panel.
 */
export function resolveRunningGoalVisual(
  answer: {
    id: string;
    metadata?: Record<string, unknown> | null;
    imageUrl?: string | null;
  },
  t: RunningT,
): RunningGoalVisual {
  const goalPath = runningGoalPathOf(answer);
  if (goalPath) return { goalPath, ...VISUALS[goalPath], alt: goalAlt(goalPath, t) };
  if (answer.imageUrl) {
    return { goalPath: null, ...NEUTRAL, src: answer.imageUrl };
  }
  return { goalPath: null, ...NEUTRAL };
}

/** "Who it's for" line under each goal card. Gendered by the caller's `isFemale` (explicit, not the profile's). */
export function runningGoalSubtitle(goalPath: RunningGoalPath | null, isFemale: boolean, t: RunningT): string | null {
  const gender = isFemale ? 'female' : 'male';
  switch (goalPath) {
    case 'start_running':
      return t('runningGoals.subtitle.start');
    case 'improve_time':
      return t('runningGoals.subtitle.improve');
    case 'maintain_fitness':
      return t('runningGoals.subtitle.maintain', { gender });
    default:
      return null;
  }
}

// ── Ability (q_run_*_ability) ─────────────────────────────────────

export type AbilityTier = 'none' | '5_15' | '15_30' | '30_45' | '45_plus';

/** 0–4 filled bars on the 4-step level glyph. */
export const ABILITY_LEVEL: Record<AbilityTier, number> = {
  none: 0,
  '5_15': 1,
  '15_30': 2,
  '30_45': 3,
  '45_plus': 4,
};

export function abilityTierOf(answer: { metadata?: Record<string, unknown> | null }): AbilityTier | null {
  const t = answer.metadata?.abilityTier;
  return t === 'none' || t === '5_15' || t === '15_30' || t === '30_45' || t === '45_plus' ? t : null;
}

export function abilityCopy(tier: AbilityTier, isFemale: boolean, t: RunningT): { title: string | null; sub: string } {
  const gender = isFemale ? 'female' : 'male';
  switch (tier) {
    case 'none':
      return { title: t('runningGoals.ability.none.title'), sub: t('runningGoals.ability.none.sub', { gender }) };
    case '5_15':
      return { title: null, sub: t('runningGoals.ability.5_15.sub') };
    case '15_30':
      return { title: null, sub: t('runningGoals.ability.15_30.sub') };
    case '30_45':
      return { title: null, sub: t('runningGoals.ability.30_45.sub', { gender }) };
    case '45_plus':
      return { title: null, sub: t('runningGoals.ability.45_plus.sub') };
  }
}

/**
 * Training-experience hint under each ability card (enable_home_v2, owner 20.10.2026):
 * helps the user place themselves without an extra "experience" question.
 * null = no hint (the "not running yet" card already says it).
 */
export function abilityExperienceHe(tier: AbilityTier, isFemale: boolean, t: RunningT): string | null {
  const gender = isFemale ? 'female' : 'male';
  switch (tier) {
    case 'none':
      return null;
    case '5_15':
      return t('runningGoals.experience.5_15', { gender });
    case '15_30':
      return t('runningGoals.experience.15_30', { gender });
    case '30_45':
      return t('runningGoals.experience.30_45', { gender });
    case '45_plus':
      return t('runningGoals.experience.45_plus', { gender });
  }
}
