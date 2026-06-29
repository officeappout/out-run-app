'use client';

import React from 'react';
import type { GroupSummaryCtx } from '@/features/workout-engine/summary/hooks/useGroupSummaryCtx';

interface Props {
  variant: 'group' | 'solo' | 'pair';
  groupCtx: GroupSummaryCtx | null;
  groupName?: string;
  /** Formatted date string, e.g. "יום שישי · 27 יוני" */
  dateLabel: string;
}

/** First-letter avatar circle, using OUT teal palette */
const AVATAR_COLORS = ['#1D9E75', '#0F6E56', '#E0A33E', '#C77B2A', '#5DCAA5'];

function AvatarCircle({
  name,
  photoURL,
  index,
  size = 32,
}: {
  name: string;
  photoURL?: string;
  index: number;
  size?: number;
}) {
  const bg = AVATAR_COLORS[index % AVATAR_COLORS.length];
  const initial = name ? name.charAt(0).toUpperCase() : '?';
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: bg,
        border: '2px solid #fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        fontSize: size * 0.38,
        fontWeight: 600,
        flexShrink: 0,
        overflow: 'hidden',
      }}
    >
      {photoURL ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoURL} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        initial
      )}
    </div>
  );
}

const GRADIENT_BG = 'linear-gradient(160deg, #C8E8DD 0%, #A2D4C4 40%, #6BAF9A 70%, #3D8A74 100%)';

export default function AerobicHeroBlock({ variant, groupCtx, groupName, dateLabel }: Props) {
  if (!groupCtx || (variant !== 'group' && variant !== 'pair')) return null;

  // ── Pair layout: two large equal avatar circles, centered ────────────────
  if (variant === 'pair') {
    const [p1, p2] = groupCtx.participants.slice(0, 2);
    return (
      <div
        style={{
          height: 100,
          borderRadius: 16,
          overflow: 'hidden',
          background: GRADIENT_BG,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ zIndex: 2, position: 'relative' }}>
            <AvatarCircle name={p1?.name ?? '?'} photoURL={p1?.photoURL} index={0} size={48} />
          </div>
          <div style={{ marginLeft: -12, zIndex: 1, position: 'relative' }}>
            <AvatarCircle name={p2?.name ?? '?'} photoURL={p2?.photoURL} index={1} size={48} />
          </div>
        </div>
      </div>
    );
  }

  // ── Group layout (3+ participants) ───────────────────────────────────────
  const { participants, participantCount } = groupCtx;
  const displayedParticipants = participants.slice(0, 5);
  const overflow = participantCount - displayedParticipants.length;
  const resolvedGroupName = groupCtx.groupName || groupName || '';

  return (
    <div
      style={{
        position: 'relative',
        height: 130,
        borderRadius: 16,
        overflow: 'hidden',
        background: 'linear-gradient(160deg, #C8E8DD 0%, #A2D4C4 40%, #6BAF9A 70%, #3D8A74 100%)',
        marginBottom: 0,
      }}
    >
      {/* Gradient overlay for text readability */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(to top, rgba(4,30,24,0.72) 0%, rgba(4,30,24,0) 55%)',
        }}
      />

      {/* Bottom content: avatars + group name + date */}
      <div
        style={{
          position: 'absolute',
          bottom: 12,
          right: 12,
          left: 12,
        }}
      >
        {/* Overlapping avatars */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
          {displayedParticipants.map((p, i) => (
            <div key={p.uid} style={{ marginLeft: i === 0 ? 0 : -8, zIndex: displayedParticipants.length - i }}>
              <AvatarCircle name={p.name} photoURL={p.photoURL} index={i} size={28} />
            </div>
          ))}
          {overflow > 0 && (
            <div
              style={{
                marginLeft: -8,
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.9)',
                border: '2px solid #fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 10,
                color: '#0F6E56',
                fontWeight: 600,
              }}
            >
              +{overflow}
            </div>
          )}
        </div>

        <div style={{ color: '#fff', fontSize: 16, fontWeight: 600, lineHeight: 1.2 }}>
          {resolvedGroupName}
        </div>
        <div style={{ color: '#B8E8D8', fontSize: 12, marginTop: 2 }}>{dateLabel}</div>
      </div>

      {/* coLocationMode chip — hidden in Phase 1 (undefined) */}
    </div>
  );
}
