'use client';

import React from 'react';

interface Props {
  activityType: 'walking' | 'running';
  /** minutes per km */
  pace: number;
  /** seconds */
  duration: number;
  calories: number;
}

function formatPace(minPerKm: number): string {
  if (!minPerKm || !isFinite(minPerKm) || minPerKm <= 0) return '--';
  const mins = Math.floor(minPerKm);
  const secs = Math.round((minPerKm - mins) * 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '--';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

interface RingProps {
  value: string;
  label: string;
  /** 0–100 */
  pct: number;
  stroke: string;
  track: string;
  size?: number;
}

function Ring({ value, label, pct, stroke, track, size = 68 }: RingProps) {
  const r = size / 2 - 6;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - Math.min(100, Math.max(0, pct)) / 100);
  const cx = size / 2;
  const fontSize = value.length > 5 ? 10 : 12;

  return (
    <div style={{ textAlign: 'center' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cx} r={r} fill="none" stroke={track} strokeWidth={6} />
        <circle
          cx={cx}
          cy={cx}
          r={r}
          fill="none"
          stroke={stroke}
          strokeWidth={6}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${cx} ${cx})`}
          style={{ transition: 'stroke-dashoffset 700ms ease-out' }}
        />
        <text
          x={cx}
          y={cx + fontSize * 0.4}
          textAnchor="middle"
          fontSize={fontSize}
          fontWeight={500}
          fill="#1b2220"
        >
          {value}
        </text>
      </svg>
      <div style={{ fontSize: 11, color: '#5b6664', marginTop: 2 }}>{label}</div>
    </div>
  );
}

export default function AerobicStatRingsBlock({ activityType, pace, duration, calories }: Props) {
  const paceLabel = activityType === 'walking' ? "ד׳/ק״מ" : 'קצב ממוצע';
  const durationMinutes = Math.round(duration / 60);

  // Ring fills — relative to reasonable maximums for display purposes
  const pacePct = pace > 0 ? Math.min(100, Math.max(10, Math.round(((12 - pace) / 12) * 100 + 30))) : 0;
  const durationPct = Math.min(100, Math.round((durationMinutes / 90) * 100));
  const caloriesPct = Math.min(100, Math.round((calories / 600) * 100));

  return (
    <div style={{ display: 'flex', justifyContent: 'space-around', padding: '8px 0' }}>
      <Ring value={formatPace(pace)} label={paceLabel} pct={pacePct} stroke="#1D9E75" track="#EAF4F0" />
      <Ring value={formatDuration(duration)} label="זמן" pct={durationPct} stroke="#0F6E56" track="#E8F0EC" />
      <Ring value={calories > 0 ? `${Math.round(calories)}` : '--'} label="קק״ל" pct={caloriesPct} stroke="#E0A33E" track="#FAEEDA" />
    </div>
  );
}
