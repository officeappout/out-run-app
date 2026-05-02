'use client';

/**
 * CommuteStatsCarousel
 * ────────────────────
 * The ETA-focused HUD that REPLACES the workout `StatsCarousel`
 * whenever `sessionMode === 'commute'` (see AdaptiveMetricsWrapper).
 *
 * Design intent — "Simple Mode for daily navigation":
 *   • The hero metric is ETA (how long until I get there?), not pace
 *     and not calories — those are workout-mindset numbers that feel
 *     wrong on a school-run.
 *   • Secondary metrics are **distance remaining** + **wall-clock
 *     arrival time**. That's the entire mental model a daily commuter
 *     cares about: "X minutes, arriving at HH:MM".
 *   • Pace, calories, lap stats are intentionally OMITTED — they're
 *     hidden behind the sessionMode switch in AdaptiveMetricsWrapper.
 *   • The destination chip reuses the same accent + typography as the
 *     `DestinationMarker` so the HUD reads as the on-card extension
 *     of the map pin.
 *
 * The component is a pure consumer of `useCommuteEta` + the destination
 * label from `useRunningPlayer.commuteContext`. No internal state, no
 * intervals — it re-renders whenever GPS / pace updates, just like the
 * workout StatsCarousel does.
 */

import React from 'react';
import { Flag, Clock, Navigation, MapPin } from 'lucide-react';
import { useRunningPlayer } from '../../store/useRunningPlayer';
import { useCommuteEta } from './useCommuteEta';

const ACCENT = '#00ADEF';
const ACCENT_DARK = '#0284C7';

function formatEta(seconds: number | null): { value: string; unit: string } {
  if (seconds === null || !Number.isFinite(seconds)) return { value: '--', unit: 'מ׳' };
  if (seconds <= 0) return { value: '0', unit: 'מ׳' };
  if (seconds < 60) return { value: String(Math.max(1, Math.round(seconds))), unit: 'שנ׳' };
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return { value: String(minutes), unit: 'דק׳' };
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return { value: `${hours}:${mins.toString().padStart(2, '0')}`, unit: 'שעות' };
}

function formatRemainingDistance(km: number | null): string {
  if (km === null || !Number.isFinite(km)) return '--';
  if (km < 1) return `${Math.round(km * 1000)} מ׳`;
  return `${km.toFixed(km < 10 ? 2 : 1)} ק״מ`;
}

function formatArrivalClock(date: Date | null): string {
  if (!date) return '--:--';
  const hh = date.getHours().toString().padStart(2, '0');
  const mm = date.getMinutes().toString().padStart(2, '0');
  return `${hh}:${mm}`;
}

export default function CommuteStatsCarousel() {
  const commuteContext = useRunningPlayer((s) => s.commuteContext);
  const { distanceRemainingKm, etaSeconds, etaArrival, hasArrived } = useCommuteEta();

  const eta = formatEta(etaSeconds);
  const remaining = formatRemainingDistance(distanceRemainingKm);
  const arrival = formatArrivalClock(etaArrival);

  // The destination chip caps at 24 chars to keep the row visually
  // balanced against the icon and the surrounding card padding.
  const destinationLabel = commuteContext?.label ?? 'יעד';
  const trimmedLabel =
    destinationLabel.length > 24 ? `${destinationLabel.slice(0, 23)}…` : destinationLabel;

  return (
    <div className="px-4 pb-4 pt-1" dir="rtl">
      {/* ── Destination chip ─────────────────────────────────────────────
          Mirrors the look of the DestinationMarker chip on the map so
          the HUD feels visually continuous with the pin. */}
      <div className="flex items-center justify-center mb-3">
        <div
          className="flex items-center gap-2 px-3 py-1 rounded-full text-white text-[11px] font-black shadow-[0_4px_10px_rgba(0,173,239,0.25)]"
          style={{ backgroundColor: ACCENT }}
        >
          <Flag size={11} fill="white" strokeWidth={2.4} />
          <span className="truncate max-w-[200px]">{trimmedLabel}</span>
        </div>
      </div>

      {/* ── Hero metric: ETA ─────────────────────────────────────────────
          The single biggest number on the card. This is the question
          a commuter is actually asking: "how long until I arrive?". */}
      <div
        className="text-center mb-4"
        aria-live="polite"
        aria-atomic="true"
      >
        <div className="flex items-baseline justify-center gap-2" dir="ltr">
          <span
            className="text-[64px] font-black leading-none tabular-nums"
            style={{ color: hasArrived ? '#10B981' : '#0F172A' }}
          >
            {hasArrived ? '✓' : eta.value}
          </span>
          {!hasArrived && (
            <span
              className="text-base font-black uppercase tracking-wide"
              style={{ color: ACCENT_DARK }}
            >
              {eta.unit}
            </span>
          )}
        </div>
        <p className="mt-1 text-xs font-bold text-gray-500">
          {hasArrived ? 'הגעת ליעד' : 'זמן משוער עד ליעד'}
        </p>
      </div>

      {/* ── Secondary row: remaining distance + wall-clock arrival ───── */}
      <div
        className="grid grid-cols-2 rounded-2xl overflow-hidden ring-1 ring-black/5"
        style={{ backgroundColor: 'rgba(241, 245, 249, 0.7)' }}
      >
        <SecondaryStat
          icon={<Navigation size={14} />}
          label="נותר"
          value={remaining}
        />
        <div className="border-r border-black/5">
          <SecondaryStat
            icon={<Clock size={14} />}
            label="הגעה משוערת"
            value={arrival}
          />
        </div>
      </div>

      {/* Empty-state hint — only when GPS hasn't produced a fix yet. */}
      {distanceRemainingKm === null && (
        <div className="mt-3 flex items-center justify-center gap-2 text-[11px] text-gray-400 font-medium">
          <MapPin size={11} />
          <span>ממתין לאיתור GPS…</span>
        </div>
      )}
    </div>
  );
}

function SecondaryStat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="px-3 py-3 text-center">
      <div className="flex items-center justify-center gap-1.5 text-gray-500 mb-1">
        {icon}
        <span className="text-[10px] font-bold uppercase tracking-wider">{label}</span>
      </div>
      <div
        className="text-lg font-black text-gray-900 tabular-nums"
        dir="ltr"
      >
        {value}
      </div>
    </div>
  );
}
