/**
 * v2 program-path goal photos (enable_home_v2) — ONE place for the owner to
 * change which image each goal card / hero shows, per gender.
 *
 *  • `library` — resolved at runtime from the exercise library: the first
 *    exercise tagged with `{ programId, level }` in targetPrograms that has
 *    an image (Bunny thumbnail / method image, via resolveImageForLocation).
 *    `programIds` are tried in order (program slug or Firestore id).
 *    Falls back to `fallback` (a bundled photo) or, when null, a soft tint
 *    panel.
 *  • `bundled` — a photo shipped in /public.
 *
 * Bundled crops: bg-2 / bg-3 are 9:16 marketing frames with UI baked into
 * their lower half — the object-positions below keep the crop on the
 * person, above that UI, at hero (≈390×250) and thumbnail (52×52) sizes.
 */
import type { ProgramCardId } from '../utils/program-card-selection';

export interface BundledGoalPhoto {
  src: string;
  alt: string;
  /** CSS object-position for the wide hero crop. */
  heroPosition: string;
  /** CSS object-position for the square thumbnail crop. */
  thumbPosition: string;
  /** Optional zoom for the thumbnail (a 9:16 frame is too tall for a square). */
  thumbZoom?: number;
}

export type GoalImageSource =
  | { kind: 'library'; programIds: string[]; level: number; alt: string; fallback: BundledGoalPhoto | null }
  | { kind: 'bundled'; photo: BundledGoalPhoto };

export const BUNDLED_GOAL_PHOTOS = {
  womanPullUp: {
    src: '/images/landing/bg-2.jpg',
    alt: 'מתח',
    heroPosition: '50% 20%',
    thumbPosition: '50% 12%',
    thumbZoom: 1.4,
  },
  womanPistolSquat: {
    src: '/images/landing/bg-3.jpg',
    alt: 'פיסטול סקוואט',
    heroPosition: '50% 17%',
    thumbPosition: '50% 8%',
    thumbZoom: 1.4,
  },
  manLSit: {
    src: '/images/onboarding/strength/goal-lsit.jpg', // web-sized copy of gateway/card-strength.png (1.9 MB)
    alt: 'L-sit על מקבילים',
    heroPosition: '62% 30%',
    thumbPosition: '62% 45%',
  },
} satisfies Record<string, BundledGoalPhoto>;

export const GOAL_IMAGE_CONFIG: Record<'male' | 'female', Record<ProgramCardId, GoalImageSource>> = {
  female: {
    // A simple squat — lower-body program, level 1.
    health: { kind: 'library', programIds: ['lower_body', 'legs'], level: 1, alt: 'סקוואט', fallback: null },
    body_focus: { kind: 'bundled', photo: BUNDLED_GOAL_PHOTOS.womanPullUp },
    skills: { kind: 'bundled', photo: BUNDLED_GOAL_PHOTOS.womanPistolSquat },
  },
  male: {
    // An incline push-up — push program, level 2.
    health: { kind: 'library', programIds: ['push'], level: 2, alt: 'שכיבת סמיכה בשיפוע', fallback: null },
    // A pull-up — pull program, level 10.
    body_focus: { kind: 'library', programIds: ['pull'], level: 10, alt: 'מתח', fallback: null },
    skills: { kind: 'bundled', photo: BUNDLED_GOAL_PHOTOS.manLSit },
  },
};

/** What the view renders for one goal. src null → tint panel. */
export interface ResolvedGoalImage {
  src: string | null;
  alt: string;
  heroPosition: string;
  thumbPosition: string;
  thumbZoom?: number;
}

export function initialGoalImage(source: GoalImageSource): ResolvedGoalImage {
  if (source.kind === 'bundled') {
    const { src, alt, heroPosition, thumbPosition, thumbZoom } = source.photo;
    return { src, alt, heroPosition, thumbPosition, thumbZoom };
  }
  const fb = source.fallback;
  return fb
    ? { src: fb.src, alt: fb.alt, heroPosition: fb.heroPosition, thumbPosition: fb.thumbPosition, thumbZoom: fb.thumbZoom }
    : { src: null, alt: source.alt, heroPosition: '50% 50%', thumbPosition: '50% 50%' };
}

/**
 * Pure picker over already-loaded exercises: the first (by id, so it's
 * stable) exercise tagged with one of `candidateProgramIds` at exactly
 * `level` whose resolved image is non-empty.
 */
export function pickExerciseImageForProgramLevel<E extends { id: string; targetPrograms?: { programId: string; level: number }[] }>(
  exercises: E[],
  candidateProgramIds: string[],
  level: number,
  resolveImage: (ex: E) => string,
): string | null {
  const ids = new Set(candidateProgramIds.filter(Boolean));
  const matches = exercises
    .filter((ex) => ex.targetPrograms?.some((tp) => ids.has(tp.programId) && tp.level === level))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const ex of matches) {
    const url = resolveImage(ex);
    if (url) return url;
  }
  return null;
}
