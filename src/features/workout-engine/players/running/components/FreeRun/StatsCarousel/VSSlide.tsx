'use client';

import { useState } from 'react';
import { useSessionStore } from '@/features/workout-engine/core/store/useSessionStore';
import { useRunningPlayer } from '@/features/workout-engine/players/running/store/useRunningPlayer';
import { useMapStore } from '@/features/parks/core/store/useMapStore';
import { computeStandings } from '@/features/workout-engine/players/running/lib/computeStandings';
import { formatPace } from '@/features/workout-engine/core/utils/formatPace';

// ─────────────────────────────────────────────────────────────────────────────

function AvatarCircle({
  src,
  initials,
  color,
  isLeader,
}: {
  src?: string;
  initials: string;
  color: string;
  isLeader: boolean;
}) {
  const [imgErr, setImgErr] = useState(false);
  return (
    <div
      className="w-14 h-14 rounded-full flex items-center justify-center overflow-hidden mx-auto"
      style={{
        border: `3px solid ${color}`,
        boxShadow: isLeader ? `0 0 0 3px ${color}44` : 'none',
        background: '#1a1a2e',
        transition: 'box-shadow 0.2s',
      }}
    >
      {!imgErr && src ? (
        <img
          src={src}
          alt={initials}
          className="w-full h-full object-cover"
          onError={() => setImgErr(true)}
        />
      ) : (
        <span className="text-sm font-bold" style={{ color }}>
          {initials}
        </span>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function VSSlide() {
  const totalDistance = useSessionStore((s) => s.totalDistance);
  const currentPace = useRunningPlayer((s) => s.currentPace);
  const selectedParticipantUid = useMapStore((s) => s.selectedParticipantUid);
  const participants = useMapStore((s) => s.groupParticipants);

  const standings = computeStandings(totalDistance, selectedParticipantUid, participants);
  const rival = standings?.rival ?? null;

  if (!rival) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[220px] gap-3 px-6 text-gray-400">
        <span className="text-3xl">🏃</span>
        <p className="text-sm font-semibold text-center">בחר רץ במפה להשוואה</p>
      </div>
    );
  }

  const gapM = standings?.gapM ?? 0;
  const iLead = gapM > 0;
  const tied = gapM === 0;

  const myColor = '#00dcd0';
  const rivalPace = rival.pace;
  const myPaceStr = currentPace > 0 ? formatPace(currentPace) : null;

  return (
    <div className="flex flex-col min-h-[220px] px-4 py-4 gap-3 select-none">
      {/* Header row */}
      <div className="flex items-center gap-2">
        {/* Me column */}
        <div className="flex-1 flex flex-col items-center gap-1">
          <AvatarCircle initials="אני" color={myColor} isLeader={iLead || tied} />
          <span className="text-[11px] font-bold" style={{ color: myColor }}>
            אני
          </span>
        </div>

        {/* VS badge */}
        <div className="flex flex-col items-center gap-0.5 px-1">
          <span
            className="text-lg font-black"
            style={{ color: '#fff', textShadow: '0 1px 4px rgba(0,0,0,0.5)' }}
          >
            VS
          </span>
        </div>

        {/* Rival column */}
        <div className="flex-1 flex flex-col items-center gap-1">
          <AvatarCircle
            src={rival.personaImageUrl}
            initials={rival.name.slice(0, 2).toUpperCase()}
            color={rival.color}
            isLeader={!iLead || tied}
          />
          <span className="text-[11px] font-bold truncate max-w-[80px]" style={{ color: rival.color }}>
            {rival.name.split(' ')[0]}
          </span>
        </div>
      </div>

      {/* Distance row */}
      <div className="flex items-baseline gap-2">
        <span
          className="flex-1 text-center text-xl font-black tabular-nums"
          style={{ color: iLead || tied ? myColor : 'rgba(255,255,255,0.55)' }}
        >
          {totalDistance.toFixed(2)}
          <span className="text-[11px] font-semibold ml-0.5">ק&quot;מ</span>
        </span>
        <span className="text-gray-500 text-xs w-4 text-center">—</span>
        <span
          className="flex-1 text-center text-xl font-black tabular-nums"
          style={{ color: !iLead || tied ? rival.color : 'rgba(255,255,255,0.55)' }}
        >
          {rival.distanceKm.toFixed(2)}
          <span className="text-[11px] font-semibold ml-0.5">ק&quot;מ</span>
        </span>
      </div>

      {/* Pace row — shown only when at least one side has data */}
      {(myPaceStr || rivalPace) && (
        <div className="flex items-center gap-2">
          <span className="flex-1 text-center text-sm font-semibold tabular-nums text-gray-300">
            {myPaceStr ? `${myPaceStr} /ק"מ` : '—'}
          </span>
          <span className="text-gray-600 text-xs w-4 text-center">קצב</span>
          <span className="flex-1 text-center text-sm font-semibold tabular-nums text-gray-300">
            {rivalPace ? `${rivalPace} /ק"מ` : '—'}
          </span>
        </div>
      )}

      {/* Gap label */}
      <div className="text-center">
        {tied ? (
          <span className="text-sm font-bold text-gray-300">שווה בדיוק</span>
        ) : (
          <span
            className="text-sm font-bold"
            style={{ color: iLead ? myColor : rival.color }}
          >
            {iLead ? '▲' : '▼'}{' '}
            {iLead ? 'מוביל' : 'מפגר'} ב-{Math.abs(gapM)} מ&apos;
          </span>
        )}
      </div>
    </div>
  );
}
