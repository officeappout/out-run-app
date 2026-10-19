'use client';

/**
 * Exercise page hero — home v2 (enable_home_v2) only.
 *
 * Full-bleed media that fades into the page (MediaHeroFade), like the
 * workout preview drawer — no rounded card. With a video, the player
 * (passed as children) is the media; the tutorial player keeps its native
 * controls, so it gets the short fade. Without a video: the poster photo,
 * else the soft brand gradient — never the grey box with a video icon.
 */

import type { ReactNode } from 'react';
import MediaHeroFade from '@/components/ui/v2/MediaHeroFade';
import { pickHeroMedia } from '@/components/ui/v2/media-hero';

/** The v2 page / sheet surface (bg-v2-surface) the hero fades into. */
const SURFACE = '#f6fbfd';

export interface ExerciseHeroV2Props {
  /** True when the method has a playable source (Bunny or legacy URL). */
  hasVideo: boolean;
  posterUrl: string | null;
  /** The player shows native controls (tutorial mode) → short fade. */
  withControls: boolean;
  title: string;
  /** The video player, rendered only when hasVideo. */
  children: ReactNode;
}

export default function ExerciseHeroV2({ hasVideo, posterUrl, withControls, title, children }: ExerciseHeroV2Props) {
  const sizing = { aspectRatio: '9 / 16', maxHeight: '55vh' } as const;
  if (hasVideo) {
    return (
      <MediaHeroFade fadeTo={SURFACE} fade={withControls ? 'short' : 'full'} style={sizing}>
        {children}
      </MediaHeroFade>
    );
  }
  // No video: a still is enough — keep the hero shorter so the page isn't a big empty block.
  const media = pickHeroMedia({ imageUrl: posterUrl, alt: title });
  return (
    <MediaHeroFade
      media={media}
      fadeTo={SURFACE}
      style={media.kind === 'none' ? { height: 'min(32vh, 260px)' } : sizing}
    />
  );
}
