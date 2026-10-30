'use client';

/**
 * Attached run chrome content for FREE run / walk / ride / route (boards H-3,
 * H-4, H-5): data strip, compact = 2 equal halves (rate now | average), large =
 * rate on top, gauge (fast ↔ slow, average marker), 2 equal halves, next-km line.
 */

import React, { useMemo } from 'react';
import { Cell, Cells, FreeCompact, FreeLarge } from '../../../../shared/v2/run-chrome/RunDrawerBlocks';
import type { AerobicCellSpec } from '../../../lib/aerobic-player-view';
import { withUnit, type CommonT } from '@/lib/i18n/units';
import { common } from '@/messages/ns/common';
import type { RunDataStripItem } from '../../../../shared/v2/run-chrome/RunDataStrip';
import type { TogetherLiveStatus } from '@/features/workout-engine/together/hooks/useTogetherSession';
import { useRunningPlayer } from '../../../store/useRunningPlayer';
import { fmtClock, fmtPace } from '../../../lib/planned-rep-results';
import { fmtSpeed, paceSecToKmh } from '../../../lib/aerobic-activity';
import { useT } from '@/hooks/useT';
import { together } from '@/messages/ns/together';

export function useFreeChromeNodes(p: {
  totals: { durationSec: number; distanceKm: number };
  currentPaceSec: number;
  metric: 'pace' | 'speed' | undefined;
  isPaused: boolean;
  /** enable_combo_flow_v1 (board PlayerMetrics): the three numbers for this activity / mode. */
  cells?: AerobicCellSpec[] | null;
}) {
  const t = useT(together);
  const tc = useT(common);
  const cells = p.cells ?? null;
  const elevationGain = useRunningPlayer((s) => s.elevationGain);
  const { totals, currentPaceSec } = p;
  const speed = p.metric === 'speed';

  return useMemo(() => {
    const avgSec = totals.distanceKm > 0.05 ? totals.durationSec / totals.distanceKm : 0;
    const rate = (sec: number) => (sec > 0 ? (speed ? fmtSpeed(paceSecToKmh(sec)) : fmtPace(sec)) : (speed ? '--' : '--:--'));
    const rateNow = rate(currentPaceSec);
    const rateAvg = rate(avgSec);
    const unitAvg = speed ? `${rateAvg} ${t('chrome.kmUnit')}` : rateAvg;

    const strip: RunDataStripItem[] = [
      { value: rateNow, label: t(speed ? 'chrome.label.speed' : 'chrome.label.pace') },
      { value: fmtClock(totals.durationSec), label: t('chrome.label.time') },
      { value: totals.distanceKm.toFixed(2), label: t('chrome.label.km') },
    ];

    const compact = <FreeCompact rateNow={rateNow} rateAvg={rateAvg} speed={speed} />;

    const kmIndex = Math.floor(totals.distanceKm) + 1;
    const frac = totals.distanceKm - Math.floor(totals.distanceKm);
    const first = speed
      ? { label: t('chrome.label.distance'), value: totals.distanceKm.toFixed(2) }
      : { label: t('chrome.label.kmNow'), value: `${frac.toFixed(2)}/1.00` };
    const second = speed
      ? { label: t('chrome.label.time'), value: fmtClock(totals.durationSec) }
      : { label: t('chrome.label.kmLeft'), value: `${Math.round((1 - frac) * 1000)} ${t('chrome.metersUnit')}` };
    const large = (
      <FreeLarge
        title={t('chrome.gauge.kmNow', { n: kmIndex, what: t(speed ? 'chrome.gauge.speedNow' : 'chrome.gauge.paceNow') })}
        rateNow={rateNow}
        nowSec={currentPaceSec}
        avgSec={avgSec > 0 ? avgSec : undefined}
        avgText={t('chrome.gauge.avg', { value: unitAvg })}
        first={first}
        second={second}
        nextText={speed ? undefined : t('chrome.nextKm', { n: kmIndex })}
      />
    );

    const live: TogetherLiveStatus = {
      kind: 'run',
      state: p.isPaused ? 'paused' : 'active',
      distanceKm: totals.distanceKm,
      paceSecPerKm: currentPaceSec > 0 ? currentPaceSec : undefined,
      avgPaceSecPerKm: avgSec > 0 ? avgSec : undefined,
      elapsedSec: totals.durationSec,
      elevGainM: elevationGain > 0 ? elevationGain : undefined,
    };
    if (cells) {
      const shown = cells.map((c) => ({ value: cellValue(c, rate, tc), label: t(CELL_LABEL[c.key]) }));
      const row = (size: number) => (
        <Cells>
          {shown.map((c) => (
            <Cell key={c.label} label={c.label} value={c.value} size={size} />
          ))}
        </Cells>
      );
      // A pace gauge only where pace is one of the numbers (a run).
      const paced = cells.some((c) => c.key === 'pace' || c.key === 'speed');
      return { strip: shown, compact: row(26), large: paced ? large : row(30), live };
    }
    return { strip, compact, large, live };
  }, [t, tc, cells, totals.durationSec, totals.distanceKm, currentPaceSec, speed, p.isPaused, elevationGain]);
}

const CELL_LABEL = {
  time: 'chrome.label.time',
  km: 'chrome.label.km',
  kmLeft: 'chrome.label.kmToFinish',
  arrival: 'chrome.label.arrival',
  steps: 'chrome.label.steps',
  pace: 'chrome.label.pace',
  speed: 'chrome.label.speed',
} as const;

function cellValue(c: AerobicCellSpec, rate: (sec: number) => string, tc: CommonT): string {
  if (c.value == null) return '--';
  switch (c.key) {
    case 'time':
      return fmtClock(c.value);
    case 'km':
      return c.value.toFixed(2);
    case 'kmLeft':
      return c.value.toFixed(1);
    case 'arrival':
      return withUnit('min', String(Math.max(1, Math.ceil(c.value / 60))), tc);
    case 'steps':
      return Math.round(c.value).toLocaleString('en-US');
    default:
      return rate(c.value);
  }
}
