/**
 * recommendCombos: the engine's choice (vision stage 2B, owner decisions 31.10.2026). PURE.
 *
 * The user picks only a category (recommended / strength / aerobic / hybrid), the minutes, the
 * 3-star difficulty and the place; the ENGINE picks the format (sets / tabata / EMOM / AMRAP and
 * its variant) and the order, and offers 1-3 ranked options, each a full ComboRequest with a
 * reason key the UI can show. The same function serves the map and the strength builder.
 *
 *   hybrid    run / walk + strength. Outdoors with push AND pull ≥ 8 and 2+ stars: AMRAP with a
 *             run inside each round leads. Short (≤ 20 min): aerobic, then tabata (core at 1 star).
 *             Otherwise aerobic first, then sets (AMRAP at 3 stars).
 *   strength  short (≤ 15 min): tabata (1-2 stars) or EMOM (3); else sets, with an AMRAP option at
 *             2+ stars (strength-only at home, cardio moves elsewhere).
 *   aerobic   a walk (1 star) or a run (2-3 stars), with a core finisher option at 3 stars.
 *   recommended  the category today calls for (strength day → strength, rest → aerobic, else hybrid).
 */

import { amrapWithRunAllowed, normalizeComboRequest, type ComboLevels, type ComboPlace, type ComboRequest } from './combo-request';

export type ComboCategory = 'recommended' | 'strength' | 'aerobic' | 'hybrid';
export type ComboStars = 1 | 2 | 3;

export interface ComboIntent {
  category: ComboCategory;
  minutes: number;
  stars: ComboStars;
  place: ComboPlace;
  /** The place lets the user run outside (a park / route / sportek, not indoors). */
  outdoor: boolean;
}

export interface ComboContext {
  levels: ComboLevels;
  /** Today's schedule (drives "recommended"). */
  today?: 'strength' | 'run' | 'walk' | 'rest' | 'none';
}

export type ComboReason =
  | 'amrap_run' | 'aerobic_then_tabata' | 'aerobic_then_core' | 'aerobic_then_sets' | 'aerobic_then_amrap'
  | 'short_tabata' | 'short_emom' | 'sets' | 'amrap_strength' | 'amrap_cardio'
  | 'walk' | 'run' | 'run_then_core';

export interface ComboOption {
  request: ComboRequest;
  reason: ComboReason;
}

const MAX_OPTIONS = 3;

export function resolveCategory(i: ComboIntent, ctx: ComboContext): Exclude<ComboCategory, 'recommended'> {
  if (i.category !== 'recommended') return i.category;
  if (ctx.today === 'strength') return 'strength';
  if (ctx.today === 'rest') return 'aerobic';
  return 'hybrid';
}

function hybridOptions(i: ComboIntent, ctx: ComboContext): ComboOption[] {
  const base = { place: i.place, timeMin: i.minutes };
  const aer = i.stars === 1 ? 'walk' : 'run';
  const out: ComboOption[] = [];
  if (i.outdoor && i.stars >= 2 && amrapWithRunAllowed(ctx.levels)) {
    out.push({ reason: 'amrap_run', request: { ...base, aerobic: 'run', strength: 'amrap', order: 'inside', amrapVariant: 'run' } });
  }
  if (i.minutes <= 20) {
    const core = i.stars === 1;
    out.push({ reason: core ? 'aerobic_then_core' : 'aerobic_then_tabata', request: { ...base, aerobic: aer, strength: core ? 'core' : 'tabata', order: 'aerobic_first' } });
  } else {
    const amrap = i.stars === 3;
    out.push({
      reason: amrap ? 'aerobic_then_amrap' : 'aerobic_then_sets',
      request: { ...base, aerobic: aer, strength: amrap ? 'amrap' : 'sets', order: 'aerobic_first', ...(amrap ? { amrapVariant: i.place === 'home' ? 'strength' as const : 'cardio' as const } : {}) },
    });
    out.push({ reason: 'aerobic_then_tabata', request: { ...base, aerobic: aer, strength: 'tabata', order: 'aerobic_first' } });
  }
  return out;
}

function strengthOptions(i: ComboIntent): ComboOption[] {
  const base = { place: i.place, timeMin: i.minutes, aerobic: 'none' as const, order: 'strength_first' as const };
  if (i.minutes <= 15) {
    return i.stars === 3
      ? [{ reason: 'short_emom', request: { ...base, strength: 'emom' } }, { reason: 'short_tabata', request: { ...base, strength: 'tabata' } }]
      : [{ reason: 'short_tabata', request: { ...base, strength: 'tabata' } }];
  }
  const out: ComboOption[] = [{ reason: 'sets', request: { ...base, strength: 'sets' } }];
  if (i.stars >= 2) {
    const home = i.place === 'home';
    out.push({ reason: home ? 'amrap_strength' : 'amrap_cardio', request: { ...base, strength: 'amrap', amrapVariant: home ? 'strength' : 'cardio' } });
  }
  return out;
}

function aerobicOptions(i: ComboIntent): ComboOption[] {
  const base = { place: i.place, timeMin: i.minutes, order: 'aerobic_first' as const };
  const out: ComboOption[] = [{ reason: i.stars === 1 ? 'walk' : 'run', request: { ...base, aerobic: i.stars === 1 ? 'walk' : 'run', strength: 'none' } }];
  if (i.stars === 3) out.push({ reason: 'run_then_core', request: { ...base, aerobic: 'run', strength: 'core' } });
  return out;
}

/** 1-3 ranked options; every request already normalized (the owner gate, time clamp). */
export function recommendCombos(i: ComboIntent, ctx: ComboContext): ComboOption[] {
  const cat = resolveCategory(i, ctx);
  const raw = cat === 'hybrid' ? hybridOptions(i, ctx) : cat === 'strength' ? strengthOptions(i) : aerobicOptions(i);
  const seen = new Set<string>();
  const out: ComboOption[] = [];
  for (const o of raw) {
    const request = normalizeComboRequest(o.request, ctx.levels).request;
    const key = `${request.aerobic}|${request.strength}|${request.order}|${request.amrapVariant ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ reason: o.reason, request });
    if (out.length === MAX_OPTIONS) break;
  }
  return out;
}
