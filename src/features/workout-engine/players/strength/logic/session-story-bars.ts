/**
 * Pilot M21 (owner decision 31.10.2026, enable_pilot_decisions_v1): in a combined workout's
 * station, the strength runner's story bars cover the WHOLE session: the legs and stations
 * before and after it (from the session strip, in their own colours) around this station's
 * exercise bars, which stay in focus. PURE.
 */
import type { StoryBarSegment } from '@/components/ui/v2/StoryBars';

interface StripItemLike {
  key: string;
  color: string;
  done: boolean;
}

/** The plan index a strip item belongs to ('leg-3' → 3, 'st-5-1' → 5), or -1. */
export function stripSegmentIndex(key: string): number {
  const n = Number(key.split('-')[1]);
  return Number.isInteger(n) ? n : -1;
}

export function sessionStoryBars(
  inner: readonly StoryBarSegment[],
  strip: { items: readonly StripItemLike[] },
  stationCursor: number,
): { segments: StoryBarSegment[]; offset: number } {
  const outer = (i: StripItemLike): StoryBarSegment => ({ key: `s-${i.key}`, color: i.color, state: i.done ? 'done' : 'upcoming' });
  const before = strip.items.filter((i) => { const n = stripSegmentIndex(i.key); return n >= 0 && n < stationCursor; }).map(outer);
  const after = strip.items.filter((i) => stripSegmentIndex(i.key) > stationCursor).map(outer);
  return { segments: [...before, ...inner, ...after], offset: before.length };
}
