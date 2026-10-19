/**
 * "Share to social networks" images (home v2, like Strava): a 1080×1920
 * story or a 1080×1080 square, drawn client-side on a canvas
 * (share-image-render.ts) from one of a few templates per activity.
 *
 * This file is the pure half: what a template shows for a given workout —
 * no DOM, no canvas, unit-tested. Every line comes from the post / summary;
 * a template drops what's missing instead of filling it in.
 */
import type { FeedPost } from './feed.service';
import { exerciseLine, formatSecPerKm, type FeedPostDetails, type FeedTopExercise } from './feed-post-details';

export type ShareKind = 'strength' | 'cardio';
export type ShareSize = 'story' | 'square';

export const SHARE_SIZES: Record<ShareSize, { width: number; height: number; label: string }> = {
  story: { width: 1080, height: 1920, label: 'סטורי' },
  square: { width: 1080, height: 1080, label: 'ריבוע' },
};

export interface ShareTemplate {
  id: string;
  label: string;
}

export const SHARE_TEMPLATES: Record<ShareKind, ShareTemplate[]> = {
  strength: [
    { id: 'strength-bold', label: 'בולט' },
    { id: 'strength-list', label: 'תרגילים' },
    { id: 'strength-clean', label: 'נקי' },
  ],
  cardio: [
    { id: 'run-route', label: 'מסלול' },
    { id: 'run-stats', label: 'מספרים' },
    { id: 'run-clean', label: 'נקי' },
  ],
};

/** Everything a template may use. All optional except the basics. */
export interface ShareImageInput {
  kind: ShareKind;
  durationMinutes: number;
  title?: string;
  programName?: string;
  levelIndex?: number;
  levelCount?: number;
  topExercises?: FeedTopExercise[];
  moreExercises?: number;
  personalBest?: string;
  distanceKm?: number;
  /** Seconds per km. */
  paceSecPerKm?: number;
  routeShape?: number[];
  streakDays?: number;
  photoUrl?: string;
  // ── v2 templates (enable_home_v2) — all optional, from data already on
  // the device at share time (the summary or the post); never a new read.
  /** Sets / reps actually done in the whole workout. */
  totalSets?: number;
  totalReps?: number;
  /** Exercises done (top + more when the summary didn't say). */
  exerciseCount?: number;
  /** Exact duration when known ("30:10"); otherwise durationMinutes is used. */
  durationSeconds?: number;
  /** Per-lap pace, seconds per km (FeedPostDetails.paceSplits). */
  paceSplits?: number[];
  /** When the workout happened (epoch ms). */
  dateMs?: number;
  parkName?: string;
}

/** Extra share-only facts a summary can pass along with its workout. */
export interface ShareExtras {
  totalSets?: number;
  totalReps?: number;
  exerciseCount?: number;
  durationSeconds?: number;
  dateMs?: number;
}

export interface ShareStat {
  value: string;
  unit: string;
}

export interface ShareTemplateData {
  templateId: string;
  kind: ShareKind;
  /** Brand colour of the activity (strength #00baf7, cardio #84cc16). */
  accent: string;
  /** Small label above the headline ("כוח · פלג גוף עליון"). */
  eyebrow: string;
  headline: string;
  stats: ShareStat[];
  /** Exercise rows (strength list template) — name + "3 × 8". */
  rows: { name: string; detail: string; setsDone: number; sets: number }[];
  /** "ועוד 4 תרגילים" etc. */
  footnote?: string;
  badge?: string;
  /** Draw the route line (cardio, only when a shape exists). */
  route?: number[];
  /** Big hero route vs. a small inset. */
  routeStyle?: 'hero' | 'inset';
  /** Level progress 0..1, only when the level and the count are known. */
  progress?: number;
}

export const ACCENT: Record<ShareKind, string> = { strength: '#00baf7', cardio: '#84cc16' };

export function shareKindFor(activityCategory: string): ShareKind {
  return activityCategory === 'cardio' ? 'cardio' : 'strength';
}

/** A feed post, or the summary's not-yet-posted workout (ShareableWorkout). */
export type ShareSource = Pick<FeedPost, 'activityCategory' | 'durationMinutes'> &
  Partial<Pick<FeedPost, 'title' | 'distanceKm' | 'paceMinPerKm' | 'paceSecPerKm' | 'routeShape' | 'parkName' | 'createdAt'>> &
  FeedPostDetails &
  ShareExtras;

const posNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;

function paceSec(post: Pick<ShareSource, 'paceSecPerKm' | 'paceMinPerKm'>): number | undefined {
  if (typeof post.paceSecPerKm === 'number' && post.paceSecPerKm > 0) return post.paceSecPerKm;
  if (typeof post.paceMinPerKm === 'number' && post.paceMinPerKm > 0) return Math.round(post.paceMinPerKm * 60);
  return undefined;
}

export function shareInputFromPost(post: ShareSource): ShareImageInput {
  return {
    kind: shareKindFor(post.activityCategory),
    durationMinutes: post.durationMinutes,
    title: post.title || undefined,
    programName: post.programName,
    levelIndex: post.levelIndex,
    levelCount: post.levelCount,
    topExercises: post.topExercises,
    moreExercises: post.moreExercises,
    personalBest: post.personalBest,
    distanceKm: typeof post.distanceKm === 'number' && post.distanceKm > 0 ? post.distanceKm : undefined,
    paceSecPerKm: paceSec(post),
    routeShape: Array.isArray(post.routeShape) && post.routeShape.length >= 6 ? post.routeShape : undefined,
    streakDays: post.streakDays,
    photoUrl: post.photoUrl,
    ...v2Extras(post),
  };
}

/** The v2-only fields (undefined ones left out, so v1 inputs stay identical). */
function v2Extras(post: ShareSource): Partial<ShareImageInput> {
  const out: Partial<ShareImageInput> = {};
  if (posNum(post.totalSets)) out.totalSets = Math.round(post.totalSets);
  if (posNum(post.totalReps)) out.totalReps = Math.round(post.totalReps);
  const exCount = posNum(post.exerciseCount) ? post.exerciseCount : (post.topExercises?.length ?? 0) + (post.moreExercises ?? 0);
  if (exCount > 0) out.exerciseCount = Math.round(exCount);
  // A post only lists its top exercises: their sets are the total only when nothing was left out.
  if (out.totalSets === undefined && post.topExercises?.length && !post.moreExercises) {
    const sets = post.topExercises.reduce((n, e) => n + (e.setsDone || 0), 0);
    if (sets > 0) out.totalSets = sets;
  }
  if (posNum(post.durationSeconds)) out.durationSeconds = Math.round(post.durationSeconds);
  if (Array.isArray(post.paceSplits) && post.paceSplits.length >= 2) out.paceSplits = post.paceSplits;
  const date = posNum(post.dateMs) ? post.dateMs : post.createdAt instanceof Date ? post.createdAt.getTime() : undefined;
  if (date && Number.isFinite(date)) out.dateMs = date;
  if (typeof post.parkName === 'string' && post.parkName.trim()) out.parkName = post.parkName.trim();
  return out;
}

export function formatDurationMin(min: number): ShareStat {
  if (min >= 60) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return { value: `${h}:${String(m).padStart(2, '0')}`, unit: 'שעות' };
  }
  return { value: String(min), unit: 'דקות' };
}

function levelLine(i: ShareImageInput): string | undefined {
  return i.levelIndex && i.levelCount ? `שלב ${i.levelIndex} מתוך ${i.levelCount}` : undefined;
}

function strengthEyebrow(i: ShareImageInput): string {
  const name = i.programName || i.title;
  return name ? `כוח · ${name}` : 'אימון כוח';
}

export function buildShareTemplateData(input: ShareImageInput, templateId: string): ShareTemplateData {
  const kind = input.kind;
  const ids = SHARE_TEMPLATES[kind].map((t) => t.id);
  const id = ids.includes(templateId) ? templateId : ids[0];
  const accent = ACCENT[kind];
  const duration = formatDurationMin(input.durationMinutes);
  const base: ShareTemplateData = { templateId: id, kind, accent, eyebrow: '', headline: '', stats: [], rows: [] };

  if (kind === 'strength') {
    const level = levelLine(input);
    const rows = (input.topExercises ?? []).map((e) => ({ name: e.name, detail: exerciseLine(e), setsDone: e.setsDone, sets: e.sets }));
    const more = input.moreExercises ? `ועוד ${input.moreExercises} תרגילים` : undefined;
    const progress = input.levelIndex && input.levelCount ? Math.min(1, input.levelIndex / input.levelCount) : undefined;
    const streak = input.streakDays ? { value: String(input.streakDays), unit: 'ימים ברצף' } : null;
    const exCount = (input.topExercises?.length ?? 0) + (input.moreExercises ?? 0);
    if (id === 'strength-list') {
      return {
        ...base,
        eyebrow: strengthEyebrow(input),
        headline: level ?? `${duration.value} ${duration.unit}`,
        stats: level ? [duration] : [],
        rows,
        footnote: more,
        badge: input.personalBest,
        progress,
      };
    }
    if (id === 'strength-clean') {
      return { ...base, eyebrow: 'אימון כוח', headline: input.programName || input.title || 'אימון כוח', stats: [duration, ...(streak ? [streak] : [])] };
    }
    // strength-bold
    return {
      ...base,
      eyebrow: strengthEyebrow(input),
      headline: `${duration.value} ${duration.unit}`,
      stats: [
        ...(exCount > 0 ? [{ value: String(exCount), unit: 'תרגילים' }] : []),
        ...(level && input.levelIndex ? [{ value: `${input.levelIndex}/${input.levelCount}`, unit: 'שלב' }] : []),
        ...(streak ? [streak] : []),
      ],
      rows: rows.slice(0, 2),
      badge: input.personalBest,
      progress,
    };
  }

  // cardio
  const km = input.distanceKm ? { value: input.distanceKm.toFixed(1), unit: 'ק״מ' } : null;
  const pace = input.paceSecPerKm ? { value: formatSecPerKm(input.paceSecPerKm), unit: 'דק׳ לק״מ' } : null;
  const stats = [km, pace, duration].filter((s): s is ShareStat => !!s);
  const route = input.routeShape;
  if (id === 'run-stats') {
    return {
      ...base,
      eyebrow: input.title || 'ריצה',
      headline: km ? `${km.value} ק״מ` : `${duration.value} ${duration.unit}`,
      stats: stats.filter((s) => s !== km),
      route,
      routeStyle: route ? 'inset' : undefined,
    };
  }
  if (id === 'run-clean') {
    return { ...base, eyebrow: 'ריצה', headline: km ? `${km.value} ק״מ` : `${duration.value} ${duration.unit}`, stats: km ? [duration] : [] };
  }
  // run-route
  return {
    ...base,
    eyebrow: input.title || 'ריצה',
    headline: km ? `${km.value} ק״מ` : `${duration.value} ${duration.unit}`,
    stats: stats.filter((s) => s !== km),
    route,
    routeStyle: route ? 'hero' : undefined,
    badge: input.streakDays ? `רצף ${input.streakDays} ימים` : undefined,
  };
}

/** Source rect to draw an image "object-fit: cover" into a box. Pure. */
export function coverRect(imgW: number, imgH: number, boxW: number, boxH: number): { sx: number; sy: number; sw: number; sh: number } {
  if (!(imgW > 0 && imgH > 0 && boxW > 0 && boxH > 0)) return { sx: 0, sy: 0, sw: 0, sh: 0 };
  const scale = Math.max(boxW / imgW, boxH / imgH);
  const sw = boxW / scale;
  const sh = boxH / scale;
  return { sx: (imgW - sw) / 2, sy: (imgH - sh) / 2, sw, sh };
}

export function shareFileName(kind: ShareKind, size: ShareSize, now = new Date()): string {
  const d = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  return `out-${kind === 'cardio' ? 'run' : 'strength'}-${size}-${d}.png`;
}
