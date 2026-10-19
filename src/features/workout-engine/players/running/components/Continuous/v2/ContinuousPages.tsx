'use client';

/**
 * The three swipe pages of the v2 continuous-run card (layout only):
 *   main     — R2-prop-easy: the hero (time or distance, by the goal), the
 *              smoothed zone chip, the zone position bar, 3 tiles
 *   pace     — U-B1: current pace huge in the state colour + the bar,
 *              time in zone and average pace
 *   distance — U-B3: total distance huge, average pace, total time, kcal
 *              (no mini map — the real map is right behind the card)
 * Pace is never shown on legs under 400 m (owner rule): the caller passes
 * showLivePace=false and the pace page / tile drop out.
 * A ride (metric 'speed', enable_home_v2 cycling) shows km/h everywhere pace
 * would be, straight from the player's smoothed pace — the zone tracker's
 * 2:00–20:00 /km validity window would drop fast bike samples.
 */

import React from 'react';
import { Check, ChevronsDown, ChevronsUp } from 'lucide-react';
import PaceRangeScale from '../../PlannedRun/v2/PaceRangeScale';
import { PACE_BAND_COLORS, fmtBand, fmtClock, fmtPace } from '../../../lib/planned-rep-results';
import { avgPaceSec, zoneStatusText, type ZoneStatus, type ZoneTarget } from '../../../lib/continuous-run';
import type { ZoneTracking } from '../../../hooks/useZoneTracking';
import { fmtSpeed, paceSecToKmh, rateLabels, type RateMetric } from '../../../lib/aerobic-activity';

export interface ContinuousCardData {
  heroKind: 'time' | 'distance';
  /** Hero value: seconds (time) or km (distance). */
  heroSeconds: number;
  heroKm: number;
  zone: ZoneTarget | null;
  tracking: ZoneTracking;
  /** Raw live pace sec/km (0 = none). */
  currentPaceSec: number;
  showLivePace: boolean;
  totals: { durationSec: number; distanceKm: number; calories: number };
  /** "מתוך ~5.2" on the distance page, when the plan knows it. */
  plannedKm?: number | null;
  /** Shown instead of the current-pace tile on short legs ("212 מ׳"). */
  shortLegRemaining?: string | null;
  /** 'speed' (a ride): km/h instead of min/km. Default 'pace'. */
  metric?: RateMetric;
}

/** "5:12" pace or "24.3" speed for a sec/km value; placeholder when none. */
function rateText(metric: RateMetric, paceSec: number): string {
  if (metric === 'speed') return fmtSpeed(paceSecToKmh(paceSec));
  return paceSec > 0 ? fmtPace(paceSec) : '--:--';
}

function bandOf(status: ZoneStatus) {
  return status === 'in' || status === 'fast' || status === 'slow' ? PACE_BAND_COLORS[status] : null;
}

export function ZoneChip({ zone, tracking }: { zone: ZoneTarget | null; tracking: ZoneTracking }) {
  const t = bandOf(tracking.status);
  const text = zoneStatusText(tracking.status, tracking.rollingPaceSec, zone);
  if (!t || !text) return null;
  const Icon = tracking.status === 'in' ? Check : tracking.status === 'fast' ? ChevronsUp : ChevronsDown;
  return (
    <span
      className="inline-flex h-[28px] min-w-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[12.5px] font-extrabold"
      style={{ background: t.bg, color: t.text }}
      role="status"
    >
      <Icon size={13} strokeWidth={2.6} aria-hidden />
      <span className="truncate">{text}</span>
    </span>
  );
}

function Tile({ value, label, color }: { value: string; label: string; color?: string }) {
  return (
    <div className="min-w-0 flex-1 rounded-[16px] bg-v2-surface px-1.5 py-2.5 text-center ring-1 ring-inset ring-v2-hairline">
      <div dir="ltr" className="truncate whitespace-nowrap text-[22px] font-black leading-tight tracking-[-0.02em] tabular-nums" style={{ color: color ?? '#0e1419' }}>
        {value}
      </div>
      <div className="truncate whitespace-nowrap text-[11.5px] font-bold text-v2-muted">{label}</div>
    </div>
  );
}

function Stat({ value, label, color }: { value: string; label: string; color?: string }) {
  return (
    <div className="min-w-0 flex-1 text-center">
      <div dir="ltr" className="truncate whitespace-nowrap text-[28px] font-black leading-tight tracking-[-0.02em] tabular-nums" style={{ color: color ?? '#0e1419' }}>
        {value}
      </div>
      <div className="truncate whitespace-nowrap text-[12.5px] font-extrabold text-v2-muted">{label}</div>
    </div>
  );
}

function Scale({ zone, paceSec, color }: { zone: ZoneTarget; paceSec: number; color: string }) {
  return (
    <PaceRangeScale
      minSec={zone.minSec}
      maxSec={zone.maxSec}
      currentSec={paceSec}
      markerColor={color}
      targetLabel={zone.showNumbers ? `טווח ${zone.label} ${fmtBand(zone.minSec, zone.maxSec)}` : `טווח · ${zone.label}`}
    />
  );
}

/** Pace driving the visuals: the smoothed one when present (no jitter), else the raw one. A ride uses the player's own smoothed pace. */
function shownPace(d: ContinuousCardData): number {
  if (d.metric === 'speed') return d.currentPaceSec;
  return d.tracking.rollingPaceSec ?? d.currentPaceSec;
}

export function MainPage({ d }: { d: ContinuousCardData }) {
  const band = bandOf(d.tracking.status);
  const pace = shownPace(d);
  const avg = avgPaceSec(d.totals.durationSec, d.totals.distanceKm);
  const hero = d.heroKind === 'time' ? fmtClock(d.heroSeconds) : d.heroKm.toFixed(2);
  const metric = d.metric ?? 'pace';
  const labels = rateLabels(metric);
  return (
    <>
      <div className="flex min-w-0 items-center justify-between gap-2">
        <span className="whitespace-nowrap text-[13px] font-extrabold text-v2-deep">{d.heroKind === 'time' ? 'זמן' : 'ק״מ'}</span>
        <ZoneChip zone={d.zone} tracking={d.tracking} />
      </div>
      <div dir="ltr" className="whitespace-nowrap text-right text-[80px] font-black leading-[1.02] tracking-[-0.03em] tabular-nums text-v2-ink">
        {hero}
      </div>
      {d.zone && d.showLivePace && <Scale zone={d.zone} paceSec={pace} color={band?.fg ?? '#a9b7c2'} />}
      <div className="mt-3 flex gap-2">
        {d.heroKind === 'time' ? (
          <Tile value={d.totals.distanceKm.toFixed(2)} label="ק״מ" />
        ) : (
          <Tile value={fmtClock(d.totals.durationSec)} label="זמן" />
        )}
        {d.showLivePace ? (
          <Tile value={rateText(metric, pace)} label={labels.current} color={band?.text} />
        ) : (
          <Tile value={d.shortLegRemaining ?? '--'} label="נותרו בבלוק" />
        )}
        <Tile value={rateText(metric, avg)} label={labels.average} />
      </div>
    </>
  );
}

export function PacePage({ d }: { d: ContinuousCardData }) {
  const band = bandOf(d.tracking.status);
  const pace = shownPace(d);
  const avg = avgPaceSec(d.totals.durationSec, d.totals.distanceKm);
  const metric = d.metric ?? 'pace';
  const labels = rateLabels(metric);
  return (
    <>
      <div className="flex min-w-0 items-center justify-between gap-2">
        <span className="whitespace-nowrap text-[13px] font-extrabold text-v2-deep">{labels.now}</span>
        <ZoneChip zone={d.zone} tracking={d.tracking} />
      </div>
      <div
        dir="ltr"
        className="mt-1 whitespace-nowrap text-center text-[104px] font-black leading-[0.95] tracking-[-0.045em] tabular-nums"
        style={{ color: band?.fg ?? '#0e1419' }}
      >
        {rateText(metric, pace)}
      </div>
      <div className="mt-1 whitespace-nowrap text-center text-[13px] font-extrabold text-v2-muted">{labels.unitLine}</div>
      {d.zone && <Scale zone={d.zone} paceSec={pace} color={band?.fg ?? '#a9b7c2'} />}
      <div className="mt-3 flex border-t border-v2-hairline pt-2.5">
        {d.zone ? (
          <Stat value={d.tracking.inZonePct === null ? '--' : `${d.tracking.inZonePct}%`} label="זמן בטווח" />
        ) : (
          <Stat value={fmtClock(d.totals.durationSec)} label="זמן" />
        )}
        <Stat value={rateText(metric, avg)} label={labels.average} />
      </div>
    </>
  );
}

export function DistancePage({ d }: { d: ContinuousCardData }) {
  const avg = avgPaceSec(d.totals.durationSec, d.totals.distanceKm);
  const metric = d.metric ?? 'pace';
  return (
    <>
      <div className="flex min-w-0 items-center justify-between gap-2">
        <span className="whitespace-nowrap text-[13px] font-extrabold text-v2-deep">מרחק כולל</span>
        {d.plannedKm ? <span className="whitespace-nowrap text-[12.5px] font-extrabold text-v2-muted">{`מתוך ~${d.plannedKm.toFixed(1)}`}</span> : null}
      </div>
      <div dir="ltr" className="mt-1 whitespace-nowrap text-center font-black leading-[0.95] tracking-[-0.045em] tabular-nums text-v2-ink">
        <span className="text-[88px]">{d.totals.distanceKm.toFixed(2)}</span>
        <span className="ms-1.5 text-[20px] font-extrabold text-v2-muted">ק״מ</span>
      </div>
      <div className="mt-3 flex border-t border-v2-hairline pt-2.5">
        <Stat value={rateText(metric, avg)} label={rateLabels(metric).average} />
        <Stat value={fmtClock(d.totals.durationSec)} label="זמן כולל" />
        <Stat value={String(Math.round(d.totals.calories || 0))} label="קק״ל" />
      </div>
    </>
  );
}
