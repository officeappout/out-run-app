/**
 * Park machine station, one machine at a time (enable_park_live_v2, pilot M15 / M16). PURE.
 *
 *   find  "מצאו את המתקן": a popup with the machine's big photo → found / not here, swap
 *   watch the machine's full video (the brand video IS the full explanation), with a sound
 *         button, the piston line and "put the phone on the floor" → "צפיתי"
 *   ready "טיימר 20 שניות, מוכנים?" → "מוכנים"
 *   count 3-2-1, then the tabata timer runs
 *
 * Each machine gets this before ITS first interval (never between its own intervals), unlike the
 * generic tabata flow that shows one combined screen before the block. The video plays whole while
 * the player is held, so it is not cut into the 20 s work pieces.
 */

import type { FindScreen } from './find-equipment';

export type ParkMachineStep = 'ready' | 'count' | 'done';
export const PARK_COUNTDOWN_SEC = 3;

/** First interval of the current machine (the right side for a unilateral one). */
export function isMachineFirstInterval(i: { parkMachine: boolean; currentRound: number; currentSide: string | null }): boolean {
  return i.parkMachine && i.currentRound === 1 && i.currentSide !== 'left';
}

const live = (s: string) => s === 'PREPARING' || s === 'ACTIVE';

/** The find popup for the current machine, or null (already found, not its first interval). */
export function parkMachineFindScreen(i: {
  enabled: boolean;
  seen: { has: (id: string) => boolean } | null | undefined;
  workoutState: string;
  firstInterval: boolean;
  exIdx: number;
  exercise: { id?: string; name?: string; imageUrl?: string } | undefined;
}): FindScreen | null {
  if (!i.enabled || !i.seen || !i.firstInterval || !live(i.workoutState)) return null;
  const ex = i.exercise;
  if (!ex?.id || i.seen.has(ex.id)) return null;
  return { kind: 'single', items: [{ exIdx: i.exIdx, exerciseId: ex.id, exerciseName: ex.name ?? '', equipmentIds: [], imageUrl: ex.imageUrl ?? null }] };
}

/** The watch step (the machine's video) is due for the current machine. */
export function parkMachineNeedsWatch(i: {
  enabled: boolean;
  seen: { has: (id: string) => boolean } | null | undefined;
  workoutState: string;
  firstInterval: boolean;
  exerciseId: string | undefined;
}): boolean {
  return i.enabled && !!i.seen && i.firstInterval && live(i.workoutState) && !!i.exerciseId && !i.seen.has(i.exerciseId);
}

/** The ready / countdown step still holds the player for this interval. */
export const parkStepHolds = (step: { key: string; step: ParkMachineStep } | null, key: string) =>
  !!step && step.key === key && step.step !== 'done';
