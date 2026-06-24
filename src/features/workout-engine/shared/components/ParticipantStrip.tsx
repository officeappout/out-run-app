'use client';

import { useEffect, useRef } from 'react';
import { useMapStore } from '@/features/parks/core/store/useMapStore';
import type { PartnerPosition } from '@/features/parks/core/hooks/useGroupPresence';

const MAX_VISIBLE_AVATARS = 5;

interface ParticipantStripProps {
  partnerPositions: PartnerPosition[];
  totalDistanceKm: number;
}

export default function ParticipantStrip({
  partnerPositions,
  totalDistanceKm,
}: ParticipantStripProps) {
  const setNavCardHeight = useMapStore((s) => s.setNavCardHeight);
  const storyBarHeight = useMapStore((s) => s.storyBarHeight);

  // Mirror TurnCarousel's exact ResizeObserver pattern.
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = rootRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      const h = entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height;
      if (Number.isFinite(h) && h > 0) setNavCardHeight(Math.round(h));
    });
    observer.observe(node);
    return () => {
      observer.disconnect();
      setNavCardHeight(0);
    };
  }, [setNavCardHeight]);

  // Stack below the story bar, same offset logic as TurnCarousel.
  const stackedTop =
    storyBarHeight > 0
      ? `calc(env(safe-area-inset-top, 0px) + ${storyBarHeight + 8}px)`
      : `max(1rem, env(safe-area-inset-top))`;

  const visible = partnerPositions.slice(0, MAX_VISIBLE_AVATARS);
  const overflow = partnerPositions.length - MAX_VISIBLE_AVATARS;
  // Never fall back to groupName — it bleeds route/session names into the strip label.
  // Before any distance is covered, show nothing (avatars speak for themselves).
  const distanceLabel =
    totalDistanceKm > 0 ? `יחד עברתם ${totalDistanceKm.toFixed(1)} ק"מ` : null;

  return (
    <div
      ref={rootRef}
      className="absolute left-0 right-0 z-[30] pointer-events-auto px-3 py-2"
      style={{ top: stackedTop }}
      aria-label={distanceLabel ?? undefined}
    >
      <div
        className="flex items-center gap-2 rounded-2xl px-3 py-1.5"
        style={{
          background: 'rgba(255,255,255,0.72)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          boxShadow: '0 2px 12px rgba(0,0,0,0.10)',
        }}
      >
        {/* Avatar chips — overlapping row */}
        <div className="flex items-center" style={{ direction: 'ltr' }}>
          {visible.map((p, i) => (
            <AvatarChip key={p.uid} position={p} offset={i} />
          ))}
          {overflow > 0 && (
            <div
              className="flex items-center justify-center rounded-full text-[10px] font-bold text-white"
              style={{
                width: 28,
                height: 28,
                background: '#555',
                marginLeft: -6,
                zIndex: visible.length,
                border: '2px solid white',
              }}
            >
              +{overflow}
            </div>
          )}
        </div>

        {/* Collective distance — hidden until first metre is covered */}
        {distanceLabel && (
          <span
            className="text-[13px] font-semibold text-gray-800 truncate"
            style={{ direction: 'rtl' }}
          >
            {distanceLabel}
          </span>
        )}
      </div>
    </div>
  );
}

function AvatarChip({
  position,
  offset,
}: {
  position: PartnerPosition;
  offset: number;
}) {
  const initials = position.name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div
      className="relative rounded-full overflow-hidden flex items-center justify-center text-[10px] font-bold text-white"
      style={{
        width: 28,
        height: 28,
        marginLeft: offset === 0 ? 0 : -6,
        zIndex: offset,
        border: `2px solid ${position.color}`,
        background: position.color,
        flexShrink: 0,
      }}
      title={position.name}
    >
      {position.personaImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={position.personaImageUrl}
          alt={position.name}
          className="w-full h-full object-cover"
        />
      ) : (
        initials
      )}
    </div>
  );
}
