'use client';

/**
 * The equipment drawer's hero (enable_place_workouts_v1) — the exercise
 * page's own ExerciseHeroV2: full-bleed media fading into the page. The
 * brand's demo video (Bunny, else a YouTube / Vimeo embed) is the media;
 * without one, the equipment's photo; without that, the brand gradient.
 */

import BunnyVideoPlayer from '@/lib/bunny/BunnyVideoPlayer';
import { extractBunnyVideoId } from '@/lib/bunny/bunny.config';
import { bunnyImg } from '@/lib/bunny-image';
import ExerciseHeroV2 from '@/features/content/exercises/client/components/ExerciseHeroV2';
import { parseVideoEmbed } from './video-embed';

export interface EquipmentHeroV2Props {
  name: string;
  videoUrl: string | undefined;
  imageUrl: string | undefined;
  /** The embed's accessible title. */
  videoTitle: string;
}

const POSTER_W = 720;

export default function EquipmentHeroV2({ name, videoUrl, imageUrl, videoTitle }: EquipmentHeroV2Props) {
  const bunnyId = extractBunnyVideoId(videoUrl);
  const embed = bunnyId ? null : parseVideoEmbed(videoUrl);
  const poster = imageUrl ? bunnyImg(imageUrl, POSTER_W) : null;
  return (
    <ExerciseHeroV2 hasVideo={!!bunnyId || !!embed} posterUrl={poster} withControls title={name}>
      {bunnyId ? (
        <BunnyVideoPlayer videoId={bunnyId} poster={imageUrl} />
      ) : embed ? (
        <iframe
          src={embed.src}
          className="absolute inset-0 h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          title={videoTitle}
        />
      ) : null}
    </ExerciseHeroV2>
  );
}
