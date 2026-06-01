'use client';

import { useRef, useEffect } from 'react';

/** Immutable descriptor for one tier's video. Once mounted, these URLs never change. */
export interface VideoTier {
  id: string;
  videoUrlWebm: string | null;
  videoUrlMov: string | null;
  videoUrl: string | null;
  thumbnailUrl: string | null;
}

interface VideoPlayerProps {
  /** All tiers that should be permanently mounted in the DOM. */
  tiers: VideoTier[];
  /** ID of the tier currently being displayed. */
  activeTierId: string | null;
  className?: string;
  /** When true, renders a white gradient overlay so the video melts into the white background. */
  whiteGradient?: boolean;
}

/**
 * Carousel-style video player: one permanently mounted <video> node per tier.
 *
 * DOM nodes are NEVER destroyed or remounted — switching tiers is a pure CSS
 * opacity toggle, so the browser's hardware decoder state is preserved for every
 * node at all times.  The active tier plays; all inactive tiers are paused and
 * reset to frame 0 so they are always ready for an instant, clean re-activation.
 */
export default function VideoPlayer({
  tiers,
  activeTierId,
  className = '',
  whiteGradient = false,
}: VideoPlayerProps) {
  const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());

  // Play / pause / timeline-reset logic — runs whenever the active tier changes
  // OR whenever a new tier is added (so newly mounted inactive videos are paused
  // immediately, guaranteeing they start from the pre-decoded first frame on activation).
  useEffect(() => {
    videoRefs.current.forEach((el, tierId) => {
      if (tierId === activeTierId) {
        el.play().catch(() => {});
      } else {
        el.pause();
        // 0.001 keeps the decoder anchored to the first keyframe rather than
        // returning to the demuxer start position (which can show a black frame
        // on iOS WKWebView and Android Chromium before the GPU re-uploads the texture).
        el.currentTime = 0.001;
      }
    });
  }, [activeTierId, tiers]);

  return (
    <div className={`relative ${className}`}>
      <div className="relative w-full h-full bg-slate-50">

        {tiers.map((tier) => {
          const isActive = tier.id === activeTierId;
          const hasSrc = !!(tier.videoUrlWebm || tier.videoUrlMov || tier.videoUrl);

          return (
            <div
              key={tier.id}
              className={`absolute inset-0 w-full h-full transition-opacity duration-300 pointer-events-none ${
                isActive ? 'opacity-100 z-10' : 'opacity-0 z-0'
              }`}
            >
              {hasSrc && (
                /* Sources for this tier are set once at mount and never mutated.
                   The #t=0.001 fragment instructs iOS WKWebView and Android Chromium
                   to decode and paint the first keyframe immediately — even while the
                   node is opacity-0 — so the GPU texture is ready before the swap.
                   No poster/img fallback: the hardware-decoded frame IS the thumbnail. */
                <video
                  ref={(el) => {
                    if (el) videoRefs.current.set(tier.id, el);
                    else videoRefs.current.delete(tier.id);
                  }}
                  loop
                  muted
                  playsInline
                  preload="auto"
                  onLoadedMetadata={(e) => {
                    // Anchor the decoder to the first frame so the hardware
                    // frame buffer is populated before the tier becomes visible.
                    e.currentTarget.currentTime = 0.001;
                  }}
                  className="absolute inset-0 w-full h-full object-cover"
                  style={{ background: 'transparent', WebkitAppearance: 'none' }}
                >
                  {tier.videoUrlWebm && <source src={`${tier.videoUrlWebm}#t=0.001`} type="video/webm" />}
                  {tier.videoUrlMov  && <source src={`${tier.videoUrlMov}#t=0.001`}  type="video/quicktime" />}
                  {tier.videoUrl     && <source src={`${tier.videoUrl}#t=0.001`} />}
                </video>
              )}
            </div>
          );
        })}

        {/* Bottom gradient — sits above all tier nodes on z-20 */}
        {whiteGradient && (
          <div
            className="absolute bottom-[-2px] left-0 right-0 pointer-events-none z-20"
            style={{
              height: 'clamp(56px, 20%, 110px)',
              background: 'linear-gradient(to top, rgba(255,255,255,1), rgba(255,255,255,0.85), rgba(255,255,255,0.5), rgba(255,255,255,0))',
            }}
          />
        )}
      </div>
    </div>
  );
}
