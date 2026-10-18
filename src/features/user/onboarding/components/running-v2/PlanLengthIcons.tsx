/**
 * Custom inline icons for the v2 plan-length cards (enable_home_v2).
 * Drawn for this screen on purpose (owner: "non-generic"): a calendar page
 * carrying the number of weeks, a race bib with a chequered finish band for
 * "I have a race", and a week strip with a slider knob for a custom length.
 * All strokes use currentColor.
 */
import React from 'react';

const base = {
  width: 26,
  height: 26,
  viewBox: '0 0 26 26',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.9,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

/** Calendar page with the plan length printed on it. */
export function WeeksCalendarIcon({ weeks }: { weeks: number }) {
  const label = String(weeks);
  return (
    <svg {...base}>
      <rect x="3.5" y="5" width="19" height="17.5" rx="3.5" />
      <path d="M3.5 10h19" />
      <path d="M8.5 3v4M17.5 3v4" />
      <text
        x="13"
        y="19.6"
        textAnchor="middle"
        fontSize={label.length > 1 ? 8.6 : 9.6}
        fontWeight={900}
        fill="currentColor"
        stroke="none"
        style={{ fontFamily: 'inherit', letterSpacing: '-0.04em' }}
      >
        {label}
      </text>
    </svg>
  );
}

/** Race bib: four safety pins, a chequered finish band, the number lines. */
export function RaceBibIcon() {
  const squares: [number, number][] = [
    [8.2, 9.2], [11.4, 9.2], [14.6, 9.2],
    [9.8, 10.8], [13, 10.8], [16.2, 10.8],
  ];
  return (
    <svg {...base}>
      <rect x="3" y="6" width="20" height="15" rx="2.6" />
      <g fill="currentColor" stroke="none">
        <circle cx="5.9" cy="8.9" r="0.85" />
        <circle cx="20.1" cy="8.9" r="0.85" />
        <circle cx="5.9" cy="18.1" r="0.85" />
        <circle cx="20.1" cy="18.1" r="0.85" />
        {squares.map(([x, y]) => (
          <rect key={`${x}-${y}`} x={x} y={y} width="1.6" height="1.6" />
        ))}
      </g>
      <rect x="8.2" y="9.2" width="9.6" height="3.2" strokeWidth={0.8} />
      <path d="M9.2 15.6h7.6" strokeWidth={2.4} />
      <path d="M10.6 18.4h4.8" strokeWidth={1.6} />
    </svg>
  );
}

/** A strip of weeks with a slider knob — "pick your own length". */
export function CustomLengthIcon() {
  return (
    <svg {...base}>
      <path d="M3.5 14h19" />
      <path d="M3.5 18v1.6M8.25 18v1.6M13 18v1.6M17.75 18v1.6M22.5 18v1.6" />
      <circle cx="15.2" cy="14" r="2.9" fill="white" />
      <path d="M6.5 8.2 4.4 6.4l2.1-1.8M19.5 8.2l2.1-1.8-2.1-1.8" />
      <path d="M9.5 6.4h7" strokeDasharray="1.4 2" />
    </svg>
  );
}
