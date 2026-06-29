'use client';

import React from 'react';
import type { GroupParticipant } from '@/features/workout-engine/summary/hooks/useGroupSummaryCtx';

interface Props {
  participants: GroupParticipant[];
  currentUid: string | undefined;
  /** When true, show only first 3 participants + "פירוט ◄" link */
  compact?: boolean;
  onShowAll?: () => void;
}

const AVATAR_COLORS = ['#1D9E75', '#0F6E56', '#E0A33E', '#C77B2A', '#5DCAA5'];

function formatPace(minPerKm: number): string {
  if (!minPerKm || minPerKm <= 0) return '';
  const mins = Math.floor(minPerKm);
  const secs = Math.round((minPerKm - mins) * 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export default function ParticipantsBlock({
  participants,
  currentUid,
  compact = false,
  onShowAll,
}: Props) {
  if (!participants.length) return null;

  const displayed = compact ? participants.slice(0, 3) : participants;
  const hiddenCount = participants.length - displayed.length;

  return (
    <div>
      {displayed.map((p, i) => {
        const isCurrentUser = p.uid === currentUid;
        const initial = p.name ? p.name.charAt(0).toUpperCase() : '?';
        const bg = AVATAR_COLORS[i % AVATAR_COLORS.length];

        return (
          <div
            key={p.uid}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '7px 4px',
              borderBottom: i < displayed.length - 1 ? '0.5px solid #e8ebea' : 'none',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {/* Avatar */}
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: isCurrentUser ? '#1D9E75' : bg,
                  color: '#fff',
                  fontSize: 11,
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                  flexShrink: 0,
                }}
              >
                {p.photoURL ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.photoURL} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  initial
                )}
              </div>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: isCurrentUser ? 600 : 400,
                  color: '#1b2220',
                }}
              >
                {p.name || 'משתתף'}
                {isCurrentUser && (
                  <span style={{ fontSize: 10, color: '#1D9E75', marginRight: 4 }}> (את/ה)</span>
                )}
              </span>
            </div>

            <div style={{ textAlign: 'left', fontSize: 12, color: '#5b6664' }}>
              {p.distanceKm > 0 ? `${p.distanceKm.toFixed(2)} ק״מ` : '--'}
              {p.pace > 0 && (
                <span style={{ color: '#9aa3a1', marginRight: 4 }}>· {formatPace(p.pace)}</span>
              )}
            </div>
          </div>
        );
      })}

      {compact && hiddenCount > 0 && (
        <button
          onClick={onShowAll}
          style={{
            display: 'block',
            width: '100%',
            textAlign: 'center',
            fontSize: 12,
            color: '#1D9E75',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '6px 0 2px',
          }}
        >
          עוד {hiddenCount} משתתפים ◄
        </button>
      )}
    </div>
  );
}
