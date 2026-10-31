/**
 * Combo generator UI model (vision stage 2, enable_combo_generator_v1, generator board 1). PURE.
 *
 * The builder sends only category + minutes + stars + place; the engine (recommendCombos)
 * picks the format and the order. This file turns the builder's state into that intent, an
 * engine option into a card, and a picked request into what opens next:
 *   strength only  → the builder's own generate → the existing WorkoutPreviewDrawer
 *   aerobic only   → the map's free run drawer (/map?openRun=)
 *   aerobic + strength → the map's hybrid overview (useMapStore.pendingHybridIntent)
 */
import type { PlanKind } from '@/features/home/utils/day-plan';
import type { ComboContext, ComboIntent, ComboOption, ComboReason, ComboStars } from '@/features/workout-engine/logic/combo/combo-recommend';
import { comboTimeSplit, type ComboLevels, type ComboPlace, type ComboRequest, type ComboStrength } from '@/features/workout-engine/logic/combo/combo-request';
import {
  AEROBIC_SHARE_MAX, AEROBIC_SHARE_MIN, type HybridStartIntent,
} from '@/features/workout-engine/hybrid/build-hybrid-input';

export type ComboCategory = ComboIntent['category'];
export const COMBO_CATEGORIES: readonly ComboCategory[] = ['recommended', 'strength', 'aerobic', 'hybrid'];

/** Today's plan (home's plannedTodayKinds) → the engine's "recommended" input. */
export function comboTodayOf(kinds: readonly PlanKind[] | undefined): ComboContext['today'] {
  if (!kinds) return undefined;
  const strength = kinds.includes('strength');
  const aerobic = kinds.includes('run') || kinds.includes('walk');
  if (strength && aerobic) return 'none';
  if (strength) return 'strength';
  if (kinds.includes('run')) return 'run';
  if (kinds.includes('walk')) return 'walk';
  return 'rest';
}

/** The user's program levels (keys may be hash ids) → push / pull for the owner gate. */
export function comboLevelsOf(levels: ReadonlyMap<string, number>, toSlug: (id: string) => string | null | undefined): ComboLevels {
  const out: ComboLevels = {};
  levels.forEach((level, key) => {
    const slug = toSlug(key) || key;
    if (slug === 'push' || slug === 'pull') out[slug] = Math.max(out[slug] ?? 0, level);
  });
  return out;
}

/** Pilot AH25: the running questionnaire is filled (a run plan or a pace profile) → runs may be offered. */
export function comboCanRunOf(profile: {
  running?: { activeProgram?: { schedule?: unknown[] } | null; paceProfile?: { basePace?: unknown } | null } | null;
} | null | undefined): boolean {
  const r = profile?.running;
  return (Array.isArray(r?.activeProgram?.schedule) && r!.activeProgram!.schedule!.length > 0) || !!r?.paceProfile?.basePace;
}

export function comboIntentOf(i: { category: ComboCategory; minutes: number; stars: number; location: string }): ComboIntent {
  const place: ComboPlace = i.location === 'home' ? 'home' : 'park';
  const stars = (i.stars === 1 || i.stars === 3 ? i.stars : 2) as ComboStars;
  return { category: i.category, minutes: i.minutes, stars, place, outdoor: place === 'park' };
}

export type ComboPartKind = 'walk' | 'run' | Exclude<ComboStrength, 'none'>;

export interface ComboCardPart {
  kind: ComboPartKind;
  minutes: number;
  /** AMRAP with a run inside every round (order 'inside'). */
  withRun?: boolean;
}

export interface ComboCardModel {
  parts: ComboCardPart[];
  totalMin: number;
  place: ComboPlace;
  reason: ComboReason;
}

export function comboCardModel(o: ComboOption): ComboCardModel {
  const r = o.request;
  const split = comboTimeSplit(r);
  const parts: ComboCardPart[] = [];
  if (r.order === 'inside' && r.strength !== 'none') {
    parts.push({ kind: r.strength, minutes: r.timeMin, withRun: true });
  } else {
    const aer: ComboCardPart | null = r.aerobic === 'none' ? null : { kind: r.aerobic, minutes: split.aerobicMin };
    const str: ComboCardPart | null = r.strength === 'none' ? null : { kind: r.strength, minutes: split.strengthMin };
    const ordered = r.order === 'strength_first' ? [str, aer] : [aer, str];
    for (const p of ordered) if (p) parts.push(p);
  }
  return { parts, totalMin: r.timeMin, place: r.place, reason: o.reason };
}

export type ComboLaunch =
  | { kind: 'strength'; minutes: number; intentMode?: 'blast' }
  | { kind: 'aerobic'; href: string }
  | { kind: 'hybrid'; intent: HybridStartIntent };

export function comboLaunchOf(r: ComboRequest, stars: ComboStars): ComboLaunch {
  if (r.aerobic === 'none') {
    const short = r.strength === 'tabata' || r.strength === 'emom';
    return { kind: 'strength', minutes: r.timeMin, ...(short ? { intentMode: 'blast' as const } : {}) };
  }
  const aerobicKind = r.aerobic === 'run' ? 'running' : 'walking';
  if (r.strength === 'none') return { kind: 'aerobic', href: `/map?openRun=${aerobicKind}` };
  const { aerobicMin } = comboTimeSplit(r);
  const raw = r.order === 'inside' ? 0.5 : aerobicMin / Math.max(1, r.timeMin);
  const aerobicShare = Math.round(Math.max(AEROBIC_SHARE_MIN, Math.min(AEROBIC_SHARE_MAX, raw)) * 100) / 100;
  const emphasis = aerobicShare >= 0.6 ? 'aerobic' : aerobicShare <= 0.4 ? 'strength' : 'balanced';
  return { kind: 'hybrid', intent: { timeBudgetMin: r.timeMin, aerobicShare, emphasis, aerobicKind, difficulty: stars } };
}

// ── Aerobic / hybrid forms (generator boards 1 aerobic, 2) ────────────────

export type ComboAerobicKind = 'walking' | 'running' | 'cycling';
export const COMBO_AEROBIC_KINDS: readonly ComboAerobicKind[] = ['running', 'walking', 'cycling'];
export const HYBRID_AEROBIC_MIN_OPTIONS = [15, 20, 25, 30, 45] as const;
export const HYBRID_STRENGTH_MIN_OPTIONS = [10, 15, 20, 30] as const;

/** The aerobic tab: the map's free run drawer holds the goal and the route. */
export function aerobicHrefOf(kind: ComboAerobicKind): string {
  return `/map?openRun=${kind}`;
}

export interface HybridFormState {
  aerobicKind: ComboAerobicKind;
  aerobicMin: number;
  strengthMin: number;
  stars: ComboStars;
}

function nearest(options: readonly number[], v: number): number {
  return options.reduce((best, o) => (Math.abs(o - v) < Math.abs(best - v) ? o : best), options[0]);
}

/** Preset settings of the hybrid form = the engine's top hybrid option, snapped to the pills. */
export function hybridFormDefaults(top: ComboOption | undefined, stars: ComboStars): HybridFormState {
  const r = top?.request;
  const split = r ? comboTimeSplit(r) : { aerobicMin: 25, strengthMin: 15 };
  const inside = r?.order === 'inside';
  return {
    aerobicKind: r?.aerobic === 'walk' ? 'walking' : r ? 'running' : 'walking',
    aerobicMin: nearest(HYBRID_AEROBIC_MIN_OPTIONS, inside ? r.timeMin / 2 : split.aerobicMin),
    strengthMin: nearest(HYBRID_STRENGTH_MIN_OPTIONS, inside ? r.timeMin / 2 : split.strengthMin),
    stars,
  };
}

export function hybridIntentOfForm(f: HybridFormState): HybridStartIntent {
  const total = f.aerobicMin + f.strengthMin;
  const raw = f.aerobicMin / Math.max(1, total);
  const aerobicShare = Math.round(Math.max(AEROBIC_SHARE_MIN, Math.min(AEROBIC_SHARE_MAX, raw)) * 100) / 100;
  const emphasis = aerobicShare >= 0.6 ? 'aerobic' : aerobicShare <= 0.4 ? 'strength' : 'balanced';
  return { timeBudgetMin: total, aerobicShare, emphasis, aerobicKind: f.aerobicKind, difficulty: f.stars };
}
