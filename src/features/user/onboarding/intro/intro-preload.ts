/**
 * Image warm-up for the intro (pilot note AJ2, 01.11): the character, the phone
 * mockup and the happy person used to pop in late (or blink) because only the
 * NEXT story's images were requested, one step ahead, and never decoded before
 * they were painted. Now the whole intro is requested as soon as it mounts, the
 * next screen's images first, and each one is decoded ahead of time so the
 * first frame that shows it already has its pixels.
 *
 * Pure apart from the injected image constructor (testable, no React).
 */

import { BARRIER_STORY_META, storyImages } from './intro-copy';

/**
 * The story images still to come, for the step on screen now (-1 = the
 * bridge): the next story first, then the rest in ring order, no duplicates.
 */
export function introPreloadOrder(step: number): string[] {
  const order: string[] = [];
  const seen = new Set<string>();
  for (let i = Math.max(0, step + 1); i < BARRIER_STORY_META.length; i++) {
    for (const src of storyImages(BARRIER_STORY_META[i])) {
      if (!seen.has(src)) {
        seen.add(src);
        order.push(src);
      }
    }
  }
  return order;
}

type ImageLike = { src: string; decoding?: string; decode?: () => Promise<void> };

/**
 * Requests + decodes `srcs` once each. The created images are kept in `cache`
 * (the caller holds it for the intro's lifetime), so they aren't collected
 * before the screen that uses them mounts.
 */
export function warmImages(srcs: readonly string[], cache: Map<string, ImageLike>, make: () => ImageLike): void {
  for (const src of srcs) {
    if (cache.has(src)) continue;
    const img = make();
    img.decoding = 'async';
    img.src = src;
    cache.set(src, img);
    img.decode?.().catch(() => {});
  }
}
