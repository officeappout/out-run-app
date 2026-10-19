/**
 * Overview leg model (pure) — the content of the ONE overview drawer
 * (owner, 19.10.2026). Every route / workout-on-route case is a list of legs:
 *
 *   transport — getting to / from the route (walk there / back), dotted
 *   aerobic   — a walk / run / ride leg (one card; may expand to details)
 *   station   — a stop on the route (strength / stretch …); the consumer
 *               renders its card (route + stops: HybridStationCard)
 *   group     — a repeated block (e.g. "6 × 400 מ׳"): ONE enclosure with a
 *               header + child rows (work / recovery pairs with pace), never
 *               one card per rep. Used next by planned-run-on-route and the
 *               run workout overview.
 *
 * Producers: hybrid route + stops (hybrid-legs.ts), plain route
 * (route/route-overview.ts). Renderers: OverviewLegAxis (vertical) and
 * JourneyStrip (horizontal, via journeyItemsFromLegs).
 */

import type { ReactNode } from 'react';
import type { JourneyStripItem } from '@/components/ui/v2/journey-strip';
import { HYBRID_AER as AER, HYBRID_STR as STR } from '../hybrid/hybrid-colors';

export interface TransportLeg {
  kind: 'transport';
  key: string;
  /** 'there' renders before "תחילת המסלול", 'back' after "סיום המסלול". */
  phase: 'there' | 'back';
  label: string;
  minutes: number;
}

export type AerobicMetaIcon = 'activity' | 'distance' | 'time';

export interface AerobicMetaItem {
  key: string;
  icon: AerobicMetaIcon;
  text: ReactNode;
}

export interface AerobicLeg {
  kind: 'aerobic';
  key: string;
  /** Glyph subtype on the axis ('walking' | 'running' | 'cycling'); undefined → default glyph. */
  activity?: string;
  /** Strip glyph subtype when it differs from `activity` (hybrid falls back to the session kind). */
  stripActivity?: string;
  durationSec?: number;
  distanceKm?: number;
  /**
   * 'destination' — Moovit-style: the title is where you go, one meta line.
   * 'standard'    — title row + badge, then distance / time metas.
   */
  layout: 'destination' | 'standard';
  title: ReactNode;
  /** Standard layout: the badge beside the title (zone / activity). */
  badge?: string;
  meta: AerobicMetaItem[];
  paceSecPerKm?: number;
  /** Pace pill text instead of `paceSecPerKm` (a band, e.g. "6:10–6:40"; the card adds "/ק״מ"). */
  paceText?: string;
  /** Run overview (M-7a): the pace's edit target — the axis' `renderPace` makes it tappable. */
  paceKey?: string;
  /** The pace was edited for this workout ("מותאם"). */
  paceEdited?: boolean;
  /** "מסלול מעגלי — חוזר לנקודת ההתחלה" under the metas (standard layout). */
  loopNote?: boolean;
  /** The card's header toggles a details panel (OverviewLegAxis.renderLegDetail). */
  expandable?: boolean;
  /**
   * Run overview: technique drills / exercises inside this leg (strides,
   * mobility in the warm-up / cool-down) — the axis' `onDrillTap` makes each
   * a chip that opens its video.
   */
  drills?: OverviewDrill[];
}

/** A drill / exercise reference on a leg; `key` is the consumer's own id (run: the block index). */
export interface OverviewDrill {
  key: string;
  label: string;
}

export interface StationLeg {
  kind: 'station';
  key: string;
  /** Glyph subtype (strength: the station's domainFocus). */
  subtype?: string;
  durationSec?: number;
  /** Consumer reference back to its own data (hybrid: the segment index). */
  ref: number;
}

export type GroupRowTone = 'warmup' | 'work' | 'recovery' | 'cooldown';

export interface GroupLegRow {
  key: string;
  tone: GroupRowTone;
  /** "400 מ׳ מהיר" */
  label: string;
  /** Pace / range in brand blue, e.g. "4:50–5:05 /ק״מ". */
  paceText?: string;
  /** Row bar colour (the block's own); default by tone. */
  color?: string;
  /** Run overview (M-7a): the pace's edit target — the axis' `renderPace` makes it tappable. */
  paceKey?: string;
  /** The pace was edited for this workout ("מותאם"). */
  paceEdited?: boolean;
  /** The row's block has a drill / exercise video — the axis' `onDrillTap` makes the row tappable. */
  drillKey?: string;
}

export interface GroupLeg {
  kind: 'group';
  key: string;
  /** "העיקר" */
  title: string;
  /** Repetitions — renders the "6×" badge. */
  repeat?: number;
  activity?: string;
  durationSec?: number;
  /** Strip text, e.g. "6 × 400 מ׳". */
  stripLabel?: string;
  /** ONE repetition's rows (work / recovery pair …). */
  rows: GroupLegRow[];
  /** Distance / time metas under the title (run overview: "~3.0 ק״מ" · "~21 דק׳"). */
  meta?: AerobicMetaItem[];
  /** Work colour — fills the repeat badge ("6 ×" + "חזרות") and tints the metas (board M-6a). */
  color?: string;
}

export type OverviewLeg = TransportLeg | AerobicLeg | StationLeg | GroupLeg;

/** Spine colour of a leg's node (stations cyan, everything that moves green). */
export function legColor(leg: OverviewLeg | undefined): string {
  return leg?.kind === 'station' ? STR : AER;
}

/** The legs between the two dividers (no transport). */
export function routeLegs(legs: readonly OverviewLeg[]): Exclude<OverviewLeg, TransportLeg>[] {
  return legs.filter((l): l is Exclude<OverviewLeg, TransportLeg> => l.kind !== 'transport');
}

export function transportMinutes(legs: readonly OverviewLeg[], phase: TransportLeg['phase']): number {
  const t = legs.find((l): l is TransportLeg => l.kind === 'transport' && l.phase === phase);
  return t && t.minutes > 0 ? t.minutes : 0;
}

/** The horizontal (Moovit) strip for the same legs — one item per leg, in order. */
export function journeyItemsFromLegs(legs: readonly OverviewLeg[]): JourneyStripItem[] {
  const items: JourneyStripItem[] = [];
  for (const leg of legs) {
    if (leg.kind === 'transport') {
      if (leg.minutes > 0) items.push({ key: leg.key, kind: 'transport', seconds: leg.minutes * 60 });
    } else if (leg.kind === 'aerobic') {
      items.push({ key: leg.key, kind: 'aerobic', subtype: leg.stripActivity ?? leg.activity, seconds: leg.durationSec });
    } else if (leg.kind === 'station') {
      items.push({ key: leg.key, kind: 'strength', subtype: leg.subtype, seconds: leg.durationSec });
    } else {
      items.push({
        key: leg.key, kind: 'repeat', subtype: leg.activity, seconds: leg.durationSec,
        label: leg.stripLabel ?? (leg.repeat ? `${leg.repeat}×` : undefined),
      });
    }
  }
  return items;
}
