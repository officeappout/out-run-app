/**
 * strip-item — one entry of the live "session strip": the cart ring around
 * the list button (CartProgressIcon) and the story bars (StoryBars) read the
 * same list, so they can never disagree. Pure.
 */
import type { CartRingItem } from '@/components/ui/v2/cart-ring';

/** Activity colours of the design language (strength / cardio). */
export const STRIP_COLORS = { strength: '#00baf7', cardio: '#84cc16' } as const;

export interface StripItem {
  key: string;
  kind: 'run' | 'set' | 'round_item' | 'interval' | 'minute';
  color: string;
  done: boolean;
}

export interface StripModel {
  items: StripItem[];
  /** Index of the current item; items.length = all done. */
  currentIndex: number;
  /** 0–1 fill of the current item (story bar). */
  progress: number;
  /** Badge count. */
  doneCount: number;
}

export function stripModel(items: StripItem[], currentIndex: number, progress: number): StripModel {
  const p = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
  return { items, currentIndex: Math.max(0, Math.min(items.length, currentIndex)), progress: p, doneCount: items.filter((i) => i.done).length };
}

/** CartProgressIcon `items`. */
export function toCartItems(m: StripModel): CartRingItem[] {
  return m.items.map((i) => ({ color: i.color, done: i.done }));
}

/** StoryBars `segments`. */
export function toStorySegments(m: StripModel): Array<{ key: string; color: string }> {
  return m.items.map((i) => ({ key: i.key, color: i.color }));
}
