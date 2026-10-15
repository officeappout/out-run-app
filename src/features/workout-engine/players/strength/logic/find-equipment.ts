/**
 * find-equipment — guided "מצא את המתקן" screen decisions (PR-B3). Pure; StrengthRunner applies.
 *
 * Same hold mechanism as the demo gate (logic/demo-gate.ts): the player sits in its existing
 * pause while the screen is up. Order inside a station: welcome → find-equipment → demo gate →
 * set — the gate is only considered once no find screen is pending for the exercise.
 *
 * Machine/equipment exercises only: a plan exercise with a non-empty `equipment` (normalized gear
 * ids, carried by strength-block-to-plan since B3). Bodyweight exercises never get the screen.
 */
import type { DemoSeenStore } from './demo-gate';

export interface FindItem {
  /** Index of the exercise inside the current segment (for the per-machine swap). */
  exIdx: number;
  exerciseId: string;
  exerciseName: string;
  equipmentIds: string[];
}

export interface FindScreen {
  /** 'single' — one machine exercise; 'tabata' — every machine of the block on one screen. */
  kind: 'single' | 'tabata';
  items: FindItem[];
}

interface SegmentLike {
  exercises?: ReadonlyArray<{ id?: string; name?: string; equipment?: string[] }>;
}

export interface FindInput {
  /** Guided layer on — the caller passes a seen-store only then. */
  enabled: boolean;
  seen: Pick<DemoSeenStore, 'has'> | null | undefined;
  workoutState: string;
  exerciseType: string | undefined;
  segment: SegmentLike | null | undefined;
  exIdx: number;
  isTabataBlock: boolean;
  isFirstTabataInterval: boolean;
}

const hasEquipment = (ex: { equipment?: string[] } | undefined): boolean => (ex?.equipment?.length ?? 0) > 0;

/**
 * The find screen to show now, or null. Non-tabata: before the first set of a machine exercise
 * not yet found this session. Tabata: ONE combined screen before the block's first interval
 * listing the block's machines not yet found (never between intervals).
 */
export function findEquipmentScreen(input: FindInput): FindScreen | null {
  if (!input.enabled || !input.seen) return null;
  if (input.workoutState !== 'PREPARING' && input.workoutState !== 'ACTIVE') return null;
  if (input.exerciseType === 'follow-along') return null;
  const exercises = input.segment?.exercises ?? [];

  if (input.isTabataBlock) {
    if (!input.isFirstTabataInterval) return null;
    const items: FindItem[] = [];
    exercises.forEach((ex, exIdx) => {
      if (!ex?.id || !hasEquipment(ex) || input.seen!.has(ex.id)) return;
      items.push({ exIdx, exerciseId: ex.id, exerciseName: ex.name ?? '', equipmentIds: ex.equipment! });
    });
    return items.length > 0 ? { kind: 'tabata', items } : null;
  }

  const ex = exercises[input.exIdx];
  if (!ex?.id || !hasEquipment(ex) || input.seen.has(ex.id)) return null;
  return {
    kind: 'single',
    items: [{ exIdx: input.exIdx, exerciseId: ex.id, exerciseName: ex.name ?? '', equipmentIds: ex.equipment! }],
  };
}

/**
 * Finding equipment depends on WHERE the user is: the same machine exercise at a later station
 * (a different park) needs the screen again. Scope a session-wide store to one station location
 * (StationContext.locationKey) — repeated sets / exercises at the same place stay "found".
 */
export function scopedFoundStore(store: DemoSeenStore, locationKey: string): DemoSeenStore {
  const key = (id: string) => `${locationKey}::${id}`;
  return { has: (id) => store.has(key(id)), add: (id) => store.add(key(id)) };
}

/** Exercise ids to mark as found on "מצאתי ✓" — the screen's items (a tabata block: all of them). */
export function idsToMarkFound(screen: FindScreen): string[] {
  return screen.items.map((i) => i.exerciseId);
}
