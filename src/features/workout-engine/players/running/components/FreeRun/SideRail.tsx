'use client';

import { useState } from 'react';
import type { Participant } from '@/features/workout-engine/shared/types/session-policy';

interface SideRailProps {
  participants: Participant[];
  /** Height of the story bar in px — used to offset the rail below it. */
  storyBarHeight: number;
}

export default function SideRail({ participants, storyBarHeight }: SideRailProps) {
  if (!participants.length) return null;

  const n = participants.length;
  const centerIdx = (n - 1) / 2;

  return (
    <div
      className="absolute left-3 flex flex-col items-center gap-3 z-[35] pointer-events-none"
      style={{
        top: `calc(env(safe-area-inset-top, 0px) + ${storyBarHeight + 8}px)`,
        bottom: 'calc(var(--session-bar-clearance, 0px) + 8px)',
        justifyContent: 'center',
      }}
    >
      {participants.map((p, i) => (
        <AvatarBadge
          key={p.uid}
          participant={p}
          dist={Math.abs(i - centerIdx)}
        />
      ))}
    </div>
  );
}

interface AvatarBadgeProps {
  participant: Participant;
  dist: number;
}

function AvatarBadge({ participant, dist }: AvatarBadgeProps) {
  const [imgError, setImgError] = useState(false);

  const scale = Math.max(0.45, 1 - dist * 0.18);
  const opacity = Math.max(0.30, 1 - dist * 0.22);
  const initials = participant.name.slice(0, 2).toUpperCase();

  const distanceLabel =
    participant.distanceKm > 0
      ? participant.distanceKm.toFixed(1)
      : null;

  return (
    <div
      className="flex flex-col items-center gap-0.5"
      style={{
        transform: `scale(${scale})`,
        opacity,
        transition: 'transform 0.25s, opacity 0.25s',
        transformOrigin: 'center center',
      }}
    >
      {/* Avatar circle */}
      <div
        className="w-12 h-12 rounded-full flex items-center justify-center overflow-hidden"
        style={{ border: `2px solid ${participant.color}`, background: '#1a1a2e' }}
      >
        {!imgError && participant.personaImageUrl ? (
          <img
            src={participant.personaImageUrl}
            alt={participant.name}
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <span
            className="text-xs font-bold select-none"
            style={{ color: participant.color }}
          >
            {initials}
          </span>
        )}
      </div>

      {/* Distance badge */}
      {distanceLabel && (
        <span
          className="text-[9px] font-bold tabular-nums leading-none px-1 py-0.5 rounded"
          style={{
            background: participant.color,
            color: '#fff',
            minWidth: '2rem',
            textAlign: 'center',
          }}
        >
          {distanceLabel}
        </span>
      )}
    </div>
  );
}
