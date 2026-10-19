'use client';

/**
 * MediaHeroFade — design language v2 media hero.
 *
 * The media sits full-bleed at the top and FADES into the surface below it
 * (an alpha mask over a backdrop in `fadeTo`), with a light dark shade at the
 * top so buttons placed there stay legible. No card, no rounded corners, no
 * hard bottom edge. Same recipe as the workout preview drawer's hero.
 *
 * With no media it draws a soft brand gradient (MEDIA_HERO_BRAND_FILL) that
 * fades out the same way — never a grey rectangle with an image icon.
 *
 * Usage:
 *   <MediaHeroFade media={{ kind: 'image', src, alt }} height={240} fadeTo="#f6fbfd" />
 *   <MediaHeroFade height="55vh" fade="short">{<SomePlayer />}</MediaHeroFade>   // custom media
 *   <MediaHeroFade media={m} overlay={<button className="pointer-events-auto …" />} />
 *
 * `children` replaces `media` (crossfade stacks, players). `overlay` renders
 * above the fade and the shade, unmasked, in a pointer-events-none layer —
 * interactive overlay elements must set `pointer-events-auto`.
 */

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  MEDIA_HERO_BRAND_FILL,
  heroMaskStyle,
  type MediaHeroFadeMode,
  type MediaHeroSource,
} from './media-hero';

export interface MediaHeroFadeProps {
  /** What to show. Ignored when `children` is given. Default `{ kind: 'none' }`. */
  media?: MediaHeroSource;
  /** Custom media (masked like `media`), e.g. a crossfade stack or a video player. */
  children?: ReactNode;
  /** Unmasked content above the hero (back button, chips, story bars). */
  overlay?: ReactNode;
  /** CSS height (number = px). Omit when sizing via className/style (flex, aspect-ratio). */
  height?: number | string;
  /** The colour the media fades into — the surface right below the hero. Default white. */
  fadeTo?: string;
  /** Fade length — see MediaHeroFadeMode. Default 'full'. */
  fade?: MediaHeroFadeMode;
  /** Light dark gradient at the top for legibility of overlaid buttons. Default true. */
  topShade?: boolean;
  className?: string;
  style?: CSSProperties;
}

export default function MediaHeroFade({
  media,
  children,
  overlay,
  height,
  fadeTo = '#ffffff',
  fade = 'full',
  topShade = true,
  className = '',
  style,
}: MediaHeroFadeProps) {
  return (
    <div
      data-v2-media-hero={fade}
      className={`relative w-full shrink-0 overflow-hidden${className ? ` ${className}` : ''}`}
      style={{ height, background: fadeTo, isolation: 'isolate', ...style }}
    >
      <div className="absolute inset-0" style={heroMaskStyle(fade)}>
        {children ?? <MediaHeroLayer media={media ?? { kind: 'none' }} />}
      </div>
      {topShade && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/25 to-transparent"
          style={{ transform: 'translateZ(0)' }}
        />
      )}
      {overlay && <div className="pointer-events-none absolute inset-0">{overlay}</div>}
    </div>
  );
}

/**
 * One media source, filling its (positioned) parent. Exported so crossfade
 * stacks can render several of them inside one MediaHeroFade.
 */
export function MediaHeroLayer({ media }: { media: MediaHeroSource }) {
  return (
    <div className="absolute inset-0" style={{ background: MEDIA_HERO_BRAND_FILL }}>
      {media.kind === 'image' && (
        <MediaHeroImage src={media.src} alt={media.alt ?? ''} position={media.position} zoom={media.zoom} />
      )}
      {media.kind === 'video' && (
        <video
          src={media.src}
          poster={media.poster ?? undefined}
          autoPlay
          loop
          muted
          playsInline
          {...{ 'webkit-playsinline': 'true' }}
          preload="auto"
          className="absolute inset-0 h-full w-full object-cover"
          style={{ objectPosition: media.position }}
        />
      )}
    </div>
  );
}

/**
 * An <img> that fades in once decoded instead of popping in over its
 * backdrop (a large photo otherwise paints in a visible flash). Handles the
 * cached case where `load` fired before hydration. Keyed by src so a source
 * change starts hidden again.
 */
export function MediaHeroImage(props: { src: string; alt?: string; position?: string; zoom?: number; className?: string }) {
  return <FadeInImg key={props.src} {...props} />;
}

function FadeInImg({
  src, alt = '', position = '50% 50%', zoom, className = '',
}: { src: string; alt?: string; position?: string; zoom?: number; className?: string }) {
  const ref = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const img = ref.current;
    if (img && img.complete && img.naturalWidth > 0) setLoaded(true);
  }, []);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={ref}
      src={src}
      alt={alt}
      decoding="async"
      draggable={false}
      onLoad={() => setLoaded(true)}
      onError={() => setLoaded(false)}
      className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ease-v2 motion-reduce:transition-none ${className}`}
      style={{
        opacity: loaded ? 1 : 0,
        objectPosition: position,
        transform: zoom ? `scale(${zoom})` : undefined,
        transformOrigin: zoom ? position : undefined,
      }}
    />
  );
}
