/**
 * Pure helpers for MediaHeroFade (design language v2) — the full-bleed
 * media hero that FADES into the sheet/page below it instead of sitting in
 * a hard-edged card. Reference: the workout preview drawer's hero
 * (WorkoutPreviewDrawer.tsx — mask fade + light top shade).
 */
import type { CSSProperties } from 'react';

/** What a hero shows. `none` → a soft brand gradient, never a grey box with an icon. */
export type MediaHeroSource =
  | {
      kind: 'image';
      src: string;
      alt?: string;
      /** CSS object-position (also the zoom anchor). Default '50% 50%'. */
      position?: string;
      /** Optional zoom (scale) anchored at `position`. */
      zoom?: number;
    }
  | { kind: 'video'; src: string; poster?: string | null; position?: string }
  | { kind: 'none' };

/**
 * How the bottom fades:
 *  • `full`  — the drawer's long fade (13% → 85% of the height). For loops /
 *    photos with nothing to tap at the bottom.
 *  • `short` — only the last 28px. For media with native controls
 *    (a tutorial <video controls>), so the control bar stays readable.
 */
export type MediaHeroFadeMode = 'full' | 'short';

/** Soft brand fill used when there is no media (and under media while it loads). */
export const MEDIA_HERO_BRAND_FILL = 'linear-gradient(160deg, #eef8fc 0%, #d9f1fb 100%)';

/**
 * Alpha masks (colour is irrelevant — only alpha counts). `full` uses the
 * exact stops of WorkoutPreviewDrawer's hero.
 */
export const MEDIA_HERO_FADE_MASK: Record<MediaHeroFadeMode, string> = {
  full: 'linear-gradient(to top, rgba(255,255,255,0) 13%, rgba(255,255,255,0.4) 42%, rgba(255,255,255,1) 85%)',
  short: 'linear-gradient(to top, rgba(255,255,255,0) 0px, rgba(255,255,255,0.55) 14px, rgba(255,255,255,1) 28px)',
};

/**
 * Style for the masked media wrapper. The mask IS the fade (the backdrop in
 * the fade colour shows through), so no overlay layer sits above the media —
 * on iOS that also forces a <video> off the hardware-overlay fast path, which
 * otherwise paints it above any gradient overlay (raw square, no fade).
 */
export function heroMaskStyle(mode: MediaHeroFadeMode): CSSProperties {
  const mask = MEDIA_HERO_FADE_MASK[mode];
  return { WebkitMaskImage: mask, maskImage: mask, transform: 'translateZ(0)' };
}

/** Pick the hero source from loose media fields: video → image/poster → none. */
export function pickHeroMedia(input: {
  videoUrl?: string | null;
  imageUrl?: string | null;
  alt?: string;
  position?: string;
}): MediaHeroSource {
  const video = input.videoUrl?.trim();
  const image = input.imageUrl?.trim();
  if (video) return { kind: 'video', src: video, poster: image || null, position: input.position };
  if (image) return { kind: 'image', src: image, alt: input.alt, position: input.position };
  return { kind: 'none' };
}
