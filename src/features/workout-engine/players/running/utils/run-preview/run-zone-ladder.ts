/**
 * "איפה הקצב הזה אצלך" — the runner's own zone ladder (pure), built from
 * computeZones() output: easy · long · tempo · interval · sprint, with the
 * workout's main zone highlighted.
 */

import type { RunBlock } from '../../types/run-block.type';
import type { ComputedPaceZone, RunZoneType } from '../../../../core/types/running.types';
import { fmtPace } from '../../lib/planned-rep-results';
import { findMainRep } from './run-estimates';

export type LadderRung = 'easy' | 'long' | 'tempo' | 'interval' | 'sprint';

export interface ZoneLadderItem {
  rung: LadderRung;
  label: string;
  /** "6:20+" for easy (that pace or slower), else the zone's middle "5:15". */
  pace: string;
  color: string;
  active: boolean;
}

const RUNGS: { rung: LadderRung; zone: RunZoneType; label: string; color: string }[] = [
  { rung: 'easy', zone: 'easy', label: 'קל', color: '#84cc16' },
  { rung: 'long', zone: 'long_run', label: 'ארוכה', color: '#a3d96b' },
  { rung: 'tempo', zone: 'tempo', label: 'טמפו', color: '#f97316' },
  { rung: 'interval', zone: 'interval_short', label: 'אינטרוול', color: '#e5484d' },
  { rung: 'sprint', zone: 'sprint', label: 'ספרינט', color: '#b42318' },
];

export function zoneToRung(z: RunZoneType | undefined): LadderRung | null {
  switch (z) {
    case 'easy':
    case 'jogging':
    case 'recovery':
      return 'easy';
    case 'long_run':
      return 'long';
    case 'tempo':
    case 'fartlek_medium':
      return 'tempo';
    case 'interval_long':
    case 'interval_short':
    case 'fartlek_fast':
      return 'interval';
    case 'sprint':
      return 'sprint';
    default:
      return null;
  }
}

/** The zone of the main set (most repeated work block), or null for effort-only runs. */
export function mainZone(blocks: readonly RunBlock[]): RunZoneType | null {
  const rep = findMainRep(blocks);
  if (!rep || (rep.block.blockMode ?? 'pace') === 'effort') return null;
  return rep.block.zoneType ?? null;
}

function mid(z: ComputedPaceZone): number {
  return Math.round((z.minPace + z.maxPace) / 2);
}

/** [] when zones are unknown (no pace profile). */
export function buildZoneLadder(
  zones: Record<RunZoneType, ComputedPaceZone> | null,
  highlight: RunZoneType | null,
): ZoneLadderItem[] {
  if (!zones) return [];
  const active = zoneToRung(highlight ?? undefined);
  const items: ZoneLadderItem[] = [];
  for (const r of RUNGS) {
    const z = zones[r.zone];
    if (!z || !(z.minPace > 0) || !(z.maxPace > 0)) return [];
    items.push({
      rung: r.rung,
      label: r.label,
      pace: r.rung === 'easy' ? `${fmtPace(Math.min(z.minPace, z.maxPace))}+` : fmtPace(mid(z)),
      color: r.color,
      active: r.rung === active,
    });
  }
  return items;
}
