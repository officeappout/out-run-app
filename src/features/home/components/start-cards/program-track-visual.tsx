'use client';

import type { FC } from 'react';
import { MediaHeroImage } from '@/components/ui/v2';
import { MuscleIcon, RunIcon } from '@/features/content/programs/core/program-icon.util';
import { RUNNING_GOAL_PHOTOS } from '@/features/user/onboarding/constants/running-goal-visuals';
import type { ProgramTrack } from '@/features/home/utils/program-start-cards';

export type ProgramArtCrop = 'tall' | 'wide';

export interface ProgramArtFrame {
  /** CSS object-position (also the zoom anchor). */
  position: string;
  /** Zoom onto the subject, anchored at `position`. */
  zoom?: number;
}

export interface ProgramTrackVisual {
  /** The app's own photo for the track. */
  image: string;
  /** Crop for the tall half-width start card and for the wide add-card strip. */
  crop: Record<ProgramArtCrop, ProgramArtFrame>;
  /** The program icon (currentColor) — the same glyphs the schedule / journey strip use. */
  Icon: FC<{ className?: string }>;
  /** Activity colour: strength #00baf7, cardio text #65a30d. */
  color: string;
}

/**
 * Per-track art for the home start / add cards. Strength = the gateway's
 * "תוכנית כוח" photo (AddStrengthProgramCard's own image); running = the
 * web-sized copy of the gateway's "תוכנית ריצה" race photo (#466), zoomed
 * onto the runners so the start arch's sponsor panels stay out of frame.
 */
export const PROGRAM_TRACK_VISUAL: Record<ProgramTrack, ProgramTrackVisual> = {
  strength: {
    image: '/images/gateway/card-strength.png',
    crop: { tall: { position: '55% 40%' }, wide: { position: '50% 35%' } },
    Icon: MuscleIcon,
    color: '#00baf7',
  },
  running: {
    image: RUNNING_GOAL_PHOTOS.race,
    crop: { tall: { position: '50% 100%', zoom: 2 }, wide: { position: '50% 80%', zoom: 1.2 } },
    Icon: RunIcon,
    color: '#65a30d',
  },
};

/**
 * The AddStrengthProgramCard / gateway card treatment: the track photo
 * full-bleed in its (positioned) parent with the white bottom-to-top fade.
 * `fade` = how far up the white reaches (CSS height of the gradient layer).
 */
export function ProgramArt({ track, crop, fade = '100%' }: { track: ProgramTrack; crop: ProgramArtCrop; fade?: string }) {
  const v = PROGRAM_TRACK_VISUAL[track];
  const frame = v.crop[crop];
  return (
    <>
      <div className="absolute inset-0 overflow-hidden bg-v2-tint" aria-hidden="true" data-program-art={track}>
        <MediaHeroImage src={v.image} position={frame.position} zoom={frame.zoom} />
      </div>
      <div
        className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-white via-white/80 to-transparent"
        style={{ height: fade }}
        aria-hidden="true"
      />
    </>
  );
}

/** The track's program icon in its activity colour. */
export function ProgramTrackIcon({ track, className = 'h-[18px] w-[18px]' }: { track: ProgramTrack; className?: string }) {
  const { Icon, color } = PROGRAM_TRACK_VISUAL[track];
  return (
    <span className="inline-flex shrink-0" style={{ color }} aria-hidden="true" data-program-icon={track}>
      <Icon className={className} />
    </span>
  );
}
