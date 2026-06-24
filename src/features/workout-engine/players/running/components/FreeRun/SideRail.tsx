'use client';

import { useState } from 'react';
import type { Participant } from '@/features/workout-engine/shared/types/session-policy';
import { useMapStore } from '@/features/parks/core/store/useMapStore';

interface SideRailProps {
  participants: Participant[];
  /** Height of the story bar in px — used to offset the rail below it. */
  storyBarHeight: number;
  onSelect?: (uid: string) => void;
}

export default function SideRail({ participants, storyBarHeight, onSelect }: SideRailProps) {
  const selectedParticipantUid = useMapStore((s) => s.selectedParticipantUid);

  if (!participants.length) return null;

  const n = participants.length;
  const centerIdx = (n - 1) / 2;

  return (
    <div
      className="absolute left-3 flex flex-col items-center gap-3 z-[35] pointer-events-auto"
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
          isSelected={p.uid === selectedParticipantUid}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

interface AvatarBadgeProps {
  participant: Participant;
  dist: number;
  isSelected: boolean;
  onSelect?: (uid: string) => void;
}

function AvatarBadge({ participant, dist, isSelected, onSelect }: AvatarBadgeProps) {
  const [imgError, setImgError] = useState(false);

  const scale = Math.max(0.45, 1 - dist * 0.18);
  const opacity = Math.max(0.30, 1 - dist * 0.22);
  const initials = participant.name.slice(0, 2).toUpperCase();

  const distanceLabel =
    participant.distanceKm > 0
      ? participant.distanceKm.toFixed(1)
      : null;

  return (
    <button
      className="flex flex-col items-center gap-0.5 active:scale-90 transition-transform"
      style={{
        transform: `scale(${scale})`,
        opacity,
        transition: 'transform 0.25s, opacity 0.25s',
        transformOrigin: 'center center',
        background: 'transparent',
        border: 'none',
        padding: 0,
        cursor: 'pointer',
      }}
      onClick={() => onSelect?.(participant.uid)}
      aria-label={`בחר ${participant.name}`}
    >
      {/* Avatar circle with selection ring */}
      <div
        className="w-12 h-12 rounded-full flex items-center justify-center overflow-hidden"
        style={{
          border: isSelected
            ? `3px solid ${participant.color}`
            : `2px solid ${participant.color}`,
          boxShadow: isSelected
            ? `0 0 0 2px ${participant.color}55`
            : 'none',
          background: '#1a1a2e',
          transition: 'border-width 0.15s, box-shadow 0.15s',
        }}
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
    </button>
  );
}
