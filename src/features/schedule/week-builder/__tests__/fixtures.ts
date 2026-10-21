/** Hand-built weeks for the week-builder tests (Sunday = 0). */
import type { RunSlot } from '../../engine-v2/types';
import type { WbSession, WbWeek } from '../types';

export const OPEN_SUN_FRI = [0, 1, 2, 3, 4, 5];

export function week(open: readonly number[], placed: Array<[number, WbSession]>): WbWeek {
  const days = Array.from({ length: 7 }, (_, dow) => ({
    dow,
    open: open.includes(dow),
    window: 'evening' as const,
    sessions: [] as WbSession[],
    whyHe: null,
  }));
  for (const [dow, s] of placed) days[dow].sessions.push(s);
  return { days, warningsHe: [] };
}

export const run = (id: string, slot: RunSlot): WbSession => ({ id, track: 'run', slot, titleHe: slot, detailHe: null, homeDow: null });
export const strength = (id: string, slug: string): WbSession => ({ id, track: 'strength', slug, titleHe: slug, detailHe: null, homeDow: null });
export const walk = (id: string): WbSession => ({ id, track: 'walk', titleHe: 'הליכה', detailHe: null, homeDow: null });
