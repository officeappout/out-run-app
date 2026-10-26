/**
 * Pilot P11: the walk signup's combined week showed walking but not strength, while the
 * schedule did show strength. The walk flow read strength days from the recurring
 * template only; the schedule (materializePlanned) also reads this week's userSchedule
 * day docs. This merges the schedule's own strength days into the template ones so the
 * combined week shows what the schedule shows. Pure.
 */
import type { PlannedEntry } from '../advisor/types';
import { classifyStrengthId } from '../engine/strengthVocabulary';
import type { ExistingStrengthDay } from './addTrackProfile';

export function mergePlannedStrengthDays(
  planned: readonly PlannedEntry[],
  templateDays: readonly ExistingStrengthDay[],
): ExistingStrengthDay[] {
  const byDow = new Map<number, ExistingStrengthDay>();
  for (const d of templateDays) byDow.set(d.dow, d);
  for (const p of planned) {
    if (p.kind !== 'strength' || byDow.has(p.dayOfWeek)) continue;
    const slug =
      p.strengthSlugs[0] ?? (p.strengthIds[0] ? classifyStrengthId(p.strengthIds[0]).slug : null) ?? 'full_body';
    const ids = p.strengthSlugs.length ? [...p.strengthSlugs] : p.strengthIds.length ? [...p.strengthIds] : [slug];
    byDow.set(p.dayOfWeek, { dow: p.dayOfWeek, slug, ids });
  }
  return Array.from(byDow.values()).sort((a, b) => a.dow - b.dow);
}
