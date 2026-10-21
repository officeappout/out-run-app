/**
 * Week builder — the header numbers: sessions per track (the ratio line "3 כוח · 3 ריצה"),
 * the chips ("דחיפה ×1", "ריצת 10 ק״מ ×3"), and the track filter of the tabs. Pure.
 */
import type { WbTrack, WbWeek } from './types';

export type WbTab = 'all' | WbTrack;

export function trackCounts<P>(week: WbWeek<P>): Record<WbTrack, number> {
  const out: Record<WbTrack, number> = { strength: 0, run: 0, walk: 0 };
  for (const d of week.days) for (const s of d.sessions) if (!s.locked) out[s.track]++;
  return out;
}

/** Tracks that hold a session (locked ones included — they share the week). */
export function tracksOf<P>(week: WbWeek<P>): WbTrack[] {
  const order: WbTrack[] = ['strength', 'run', 'walk'];
  const has = new Set(week.days.flatMap((d) => d.sessions.map((s) => s.track)));
  return order.filter((t) => has.has(t));
}

export interface WbChip {
  key: string;
  track: WbTrack;
  labelHe: string;
  count: number;
}

/**
 * One chip per distinct strength title, one per track for runs / walks (labelled by the
 * host: the plan's name), in week order. Locked sessions are context, not counted.
 */
export function weekChips<P>(week: WbWeek<P>, labels: Partial<Record<'run' | 'walk', string>> = {}): WbChip[] {
  const chips = new Map<string, WbChip>();
  for (const d of week.days) {
    for (const s of d.sessions) {
      if (s.locked) continue;
      const key = s.track === 'strength' ? `strength:${s.titleHe}` : s.track;
      const labelHe = s.track === 'strength' ? s.titleHe : labels[s.track] ?? s.titleHe;
      const cur = chips.get(key);
      if (cur) cur.count++;
      else chips.set(key, { key, track: s.track, labelHe, count: 1 });
    }
  }
  return Array.from(chips.values());
}

/** Is this session shown under the tab? ("all" = משולב shows everything.) */
export const inTab = (tab: WbTab, track: WbTrack): boolean => tab === 'all' || tab === track;

/** Training days (≥1 unlocked session). */
export const trainingDayCount = <P>(week: WbWeek<P>): number =>
  week.days.filter((d) => d.sessions.some((s) => !s.locked)).length;
