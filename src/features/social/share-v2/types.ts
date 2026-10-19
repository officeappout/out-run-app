/**
 * Share images v2 (enable_home_v2) — the approved SH-1…SH-4 boards.
 *
 * Shapes shared by the pure model / layout code and the canvas renderer.
 * Design units: every template draws on a 390-wide frame (the boards' own
 * coordinates); the renderer scales that to 1080 px (or a small preview).
 *
 * Extending: a new template set (e.g. the transparent "sticker" boards
 * SH-5a/b) is one more ShareFormat + ShareBackground value and one more
 * entry in templates/registry.ts — nothing here or in render.ts changes shape.
 */
import type { ShareKind } from '../services/share-image';
import type { KmMark } from './route-geometry';

export type { ShareKind };

/** Output format. 'sticker' = transparent PNG to lay over a photo (SH-5a/b). */
export type ShareFormat = 'story' | 'square' | 'sticker';

/** Sticker ink (SH-5d "צבע הסטיקר"): white with a soft shadow is the default. */
export type ShareInk = 'white' | 'dark' | 'brand';

/**
 * The picture behind the template — its own setting, independent of the
 * template. 'brand' = the template's OUT-colours look (cyan / navy / night).
 */
export type ShareBackground = 'photo' | 'brand' | 'plain' | 'none';

/** How a template's 'brand' background looks. */
export type BrandStyle = 'cyan' | 'navy' | 'night';

/** Text/ink family the background calls for — text colour flips with it. */
export type ShareTone = 'dark' | 'cyan' | 'light' | 'ink-white' | 'ink-dark' | 'ink-brand';

export interface ShareFrame {
  format: ShareFormat;
  /** Design units (always 390 wide). */
  w: number;
  h: number;
}

export const DESIGN_W = 390;

export const SHARE_PX: Record<ShareFormat, { width: number; height: number }> = {
  story: { width: 1080, height: 1920 },
  square: { width: 1080, height: 1080 },
  sticker: { width: 1080, height: 1080 },
};

export function frameFor(format: ShareFormat): ShareFrame {
  const px = SHARE_PX[format];
  return { format, w: DESIGN_W, h: (px.height / px.width) * DESIGN_W };
}

export interface ShareStatV2 {
  value: string;
  unit: string;
}

export interface ShareSetRow {
  name: string;
  /** One entry per set (max 5): the reps/seconds shown in the box, null = not done. */
  boxes: (string | null)[];
}

export interface ShareSplits {
  /** Bar heights 0.35–1 (faster = taller). */
  heights: number[];
  fastestIndex: number;
  fastestLabel: string;
}

/** Everything a template may draw — derived once, pure (model.ts). */
export interface ShareModel {
  kind: ShareKind;
  /** "יום ב׳ · 19.10" (strength) / "יום ב׳ · 06:40" (run). */
  dateLabel?: string;
  /** Chip / eyebrow: "אימון כוח · גינת מאיר", "ריצת בוקר · פארק הירקון". */
  chip: string;
  /** The workout's name (program / title / fallback). */
  name: string;
  level?: { index: number; count: number; frac: number };
  duration: ShareStatV2;
  /** Strength: up to 4, best first (duration, sets, reps, exercises, streak). */
  stats: ShareStatV2[];
  rows: ShareSetRow[];
  /** "ועוד 4 תרגילים". */
  moreLine?: string;
  /** "מתח · מקבילים · שכיבות סמיכה" (square, when rows don't fit). */
  exerciseNames?: string;
  streakDays?: number;
  /** The one big number of the minimal templates. */
  hero: ShareStatV2;
  /** Run: "5.2" (km), pace "5:48", fastest lap "5:31". */
  distance?: string;
  pace?: string;
  fastest?: string;
  splits?: ShareSplits;
  route?: number[];
  /** Where each (marked) whole km falls along the drawn route. */
  kmMarks?: KmMark[];
  /** Live group / pair run only (SH-5c). */
  together?: ShareTogetherModel;
}

export interface ShareTogetherPerson {
  name: string;
  initials: string;
  /** "5.2" — only when > 0. */
  km?: string;
  /** 0..1 of the longest distance (bar length). */
  frac?: number;
  pace?: string;
  isMe?: boolean;
}

export interface ShareTogetherModel {
  /** "נועה ודניאל" / "נועה, דניאל ועוד 3". */
  names: string;
  /** "רצנו יחד · קבוצת הבוקר". */
  subline: string;
  /** Up to 4 avatars (initials only) + how many more. */
  avatars: string[];
  moreCount: number;
  /** Joint distance ("12.4"), when known. */
  jointKm?: string;
  participantCount: number;
  /** Per-person rows (max 4), only people with a distance. */
  people: ShareTogetherPerson[];
}
