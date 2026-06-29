'use client';

import React from 'react';

interface Props {
  collectiveDistanceKm: number;
  participantCount: number;
}

export default function TogetherBlock({ collectiveDistanceKm, participantCount }: Props) {
  if (collectiveDistanceKm <= 0 && participantCount <= 0) return null;

  const distanceStr =
    collectiveDistanceKm > 0 ? collectiveDistanceKm.toFixed(1) : '--';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: '#E1F5EE',
        borderRadius: 12,
        padding: '10px 14px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* Flame icon (inline SVG — no icon lib dependency) */}
        <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#0F6E56" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M8.5 14.5A2.5 2.5 0 0 0 11 17c1.4 0 2.5-1.1 2.5-2.5 0-3-5-6-5-6s-3.5 5-3.5 8.5A5 5 0 0 0 10 22a5 5 0 0 0 5-5 7 7 0 0 0-7-7" />
        </svg>
        <span style={{ fontSize: 13, fontWeight: 500, color: '#04342C' }}>
          {participantCount} {participantCount === 1 ? 'אדם' : 'אנשים'} הלכו יחד
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
        <span style={{ fontSize: 18, fontWeight: 600, color: '#0F6E56' }}>{distanceStr}</span>
        <span style={{ fontSize: 12, color: '#0F6E56' }}>ק״מ סה״כ</span>
      </div>
    </div>
  );
}
