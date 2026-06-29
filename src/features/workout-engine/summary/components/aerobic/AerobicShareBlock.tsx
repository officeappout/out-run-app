'use client';

import React from 'react';
import type { GroupSummaryCtx } from '@/features/workout-engine/summary/hooks/useGroupSummaryCtx';

interface Props {
  distanceKm: number;
  groupCtx: GroupSummaryCtx | null;
  onSave: () => void;
  onClose: () => void;
  /** False when the workout was below the minimum threshold and was not saved */
  wasSaved?: boolean;
}

export default function AerobicShareBlock({ distanceKm, groupCtx, onSave, onClose, wasSaved = true }: Props) {
  const handleShare = async () => {
    const distanceStr = distanceKm > 0 ? `${distanceKm.toFixed(2)} ק״מ` : '';
    const groupPart =
      groupCtx && groupCtx.participantCount > 1
        ? ` | ${groupCtx.participantCount} אנשים · ${groupCtx.collectiveDistanceKm.toFixed(1)} ק״מ יחד`
        : '';
    const text = `סיימתי אימון ב-OUT! ${distanceStr}${groupPart} 💪`;

    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ text });
      } catch {
        // user cancelled or not supported
      }
    }
  };

  return (
    <div style={{ padding: '0 0 4px' }}>
      {!wasSaved && (
        <div style={{
          textAlign: 'center', fontSize: 12, color: '#9aa3a1',
          marginBottom: 8, padding: '6px 0',
        }}>
          אימון קצר מדי — לא נשמר
        </div>
      )}
    <div style={{ display: 'flex', gap: 10, padding: '12px 0 0' }}>
      <button
        onClick={handleShare}
        style={{
          flex: 1,
          textAlign: 'center',
          padding: '12px 0',
          borderRadius: 16,
          background: '#1D9E75',
          color: '#fff',
          fontSize: 14,
          fontWeight: 500,
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
        }}
      >
        {/* Share icon */}
        <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
          <polyline points="16 6 12 2 8 6" />
          <line x1="12" y1="2" x2="12" y2="15" />
        </svg>
        שתף
      </button>

      <button
        onClick={onSave}
        style={{
          flex: 1,
          textAlign: 'center',
          padding: '12px 0',
          borderRadius: 16,
          background: '#fff',
          color: '#1b2220',
          fontSize: 14,
          fontWeight: 500,
          border: '0.5px solid #e8ebea',
          cursor: 'pointer',
        }}
      >
        {wasSaved ? 'סיום ושמור' : 'סיום'}
      </button>
    </div>
    </div>
  );
}
