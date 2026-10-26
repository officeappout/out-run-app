/**
 * The equipment drawer's key facts (pure), like the exercise page's fact
 * row: the level span from the doc's targetPrograms, and each program's
 * display name (Firestore content via pickText).
 */

import { pickText } from '@/lib/i18n/core/i18n-core';
import type { GymEquipment } from '@/features/content/equipment/gym/core/gym-equipment.types';

export interface LevelSpan { from: number; to: number }

/** min–max of the targetPrograms levels; null when none is set. */
export function equipmentLevelSpan(eq: Pick<GymEquipment, 'targetPrograms'>): LevelSpan | null {
  const levels = (eq.targetPrograms ?? []).map((tp) => tp.level).filter((l): l is number => typeof l === 'number' && l > 0);
  if (levels.length === 0) return null;
  return { from: Math.min(...levels), to: Math.max(...levels) };
}

export interface ProgramChip { programId: string; label: string; level: number | null }

export function equipmentProgramChips(
  eq: Pick<GymEquipment, 'targetPrograms'>,
  programs: readonly { id: string; name?: unknown }[],
  locale: string,
): ProgramChip[] {
  return (eq.targetPrograms ?? []).map((tp) => {
    const prog = programs.find((p) => p.id === tp.programId);
    const label = (prog ? pickText(prog.name as never, locale) : '').trim() || tp.programId;
    return { programId: tp.programId, label, level: typeof tp.level === 'number' ? tp.level : null };
  });
}
