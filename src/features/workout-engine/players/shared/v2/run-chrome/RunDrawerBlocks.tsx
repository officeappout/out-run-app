'use client';

/**
 * The attached run drawer's contents (boards H-1…H-5) — presentational only.
 * Equal columns with hairline dividers, a centred gauge, no block list / timeline.
 *   intervals compact: 3 equal columns (pace now | target range | left in rep)
 *   intervals large:   pace on top, gauge with the target band, 2 equal halves (metres left | time left), next line
 *   free compact:      2 equal halves (pace now | avg pace)
 *   free / bike large: rate on top, gauge (fast ↔ slow, avg marker), 2 equal halves
 */

import React from 'react';
import { useT } from '@/hooks/useT';
import { together } from '@/messages/ns/together';
import { gaugeLayout } from './run-chrome-logic';

export function Cells({ children }: { children: React.ReactNode }) {
  const items = React.Children.toArray(children);
  return (
    <div className="flex items-stretch gap-1.5">
      {items.map((c, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span aria-hidden className="w-px self-stretch bg-slate-200" />}
          {c}
        </React.Fragment>
      ))}
    </div>
  );
}

export function Cell({ label, value, size = 26, tone }: { label: string; value: string; size?: number; tone?: string }) {
  return (
    <span className="flex min-w-0 flex-1 basis-0 flex-col items-center gap-0.5 text-center">
      <span className="text-[12px] font-extrabold text-slate-500">{label}</span>
      <span dir="ltr" className="font-black tabular-nums" style={{ fontSize: size, lineHeight: 1.1, letterSpacing: '-0.03em', color: tone ?? '#0e1419' }}>
        {value}
      </span>
    </span>
  );
}

/** Pace gauge: fast on the left, slow on the right; target band (intervals) or average marker (free). */
export function Gauge(props: { nowSec: number; loSec?: number; hiSec?: number; avgSec?: number; bottomLeft?: string; bottomCenter?: string; bottomRight?: string }) {
  const t = useT(together);
  const g = gaugeLayout(props);
  return (
    <div className="mx-2 mt-2">
      <div
        dir="ltr"
        role="img"
        aria-label={props.bottomCenter}
        className="relative h-3 rounded-full"
        style={{ background: 'linear-gradient(90deg,#f97316 0%,#fdba74 30%,#d1fae5 50%,#fecaca 70%,#e5484d 100%)' }}
      >
        {g.band && (
          <span
            className="absolute rounded-full"
            style={{ top: -4, bottom: -4, left: `${g.band.leftPct}%`, width: `${g.band.widthPct}%`, background: 'rgba(16,185,129,0.85)', boxShadow: '0 0 0 3px #fff, 0 0 0 4.5px rgba(14,20,25,0.2)' }}
          />
        )}
        {g.avgPct != null && !g.band && (
          <span className="absolute w-[3px] rounded-full bg-slate-700" style={{ top: -5, bottom: -5, left: `calc(${g.avgPct}% - 1.5px)` }} />
        )}
        <span
          className="absolute box-border h-[26px] w-[26px] rounded-full bg-white"
          style={{ top: -7, left: `calc(${g.pointerPct}% - 13px)`, border: `5px solid ${g.band && !g.inBand ? '#e5484d' : '#10b981'}`, boxShadow: '0 4px 10px -4px rgba(9,30,50,0.5)' }}
        />
      </div>
      <div className="mt-2 flex justify-between text-[11.5px] font-extrabold text-slate-500">
        <span>{props.bottomRight ?? t('chrome.gauge.slow')}</span>
        <span className="text-slate-600">{props.bottomCenter}</span>
        <span>{props.bottomLeft ?? t('chrome.gauge.fast')}</span>
      </div>
    </div>
  );
}

export function BigRate({ value, color, size = 76 }: { value: string; color?: string; size?: number }) {
  return (
    <div dir="ltr" className="mt-1.5 text-center font-black tabular-nums" style={{ fontSize: size, lineHeight: `${size + 4}px`, letterSpacing: '-0.04em', color: color ?? '#0e1419' }}>
      {value}
    </div>
  );
}

export function Chip({ icon, children, bg = '#fde8e8' }: { icon?: React.ReactNode; children: React.ReactNode; bg?: string }) {
  return (
    <div className="flex justify-center">
      <span className="inline-flex h-[26px] items-center gap-[5px] rounded-full px-2.5 text-[12.5px] font-extrabold" style={{ background: bg }}>
        {icon}
        {children}
      </span>
    </div>
  );
}

// ── compact variants ────────────────────────────────────────────────────────

export function IntervalsCompact(p: { chip: React.ReactNode; paceNow: string; paceTone?: string; target: string; left: string }) {
  const t = useT(together);
  return (
    <>
      <div className="mb-2.5">{p.chip}</div>
      <Cells>
        <Cell label={t('chrome.label.paceNow')} value={p.paceNow} tone={p.paceTone} />
        <Cell label={t('chrome.label.targetRange')} value={p.target} />
        <Cell label={t('chrome.label.leftInRep')} value={p.left} />
      </Cells>
    </>
  );
}

export function FreeCompact(p: { rateNow: string; rateAvg: string; speed?: boolean }) {
  const t = useT(together);
  return (
    <Cells>
      <Cell size={36} label={t(p.speed ? 'chrome.label.speedNow' : 'chrome.label.paceNow')} value={p.rateNow} />
      <Cell size={36} label={t(p.speed ? 'chrome.label.avgSpeed' : 'chrome.label.avgPace')} value={p.rateAvg} />
    </Cells>
  );
}

// ── large variants ──────────────────────────────────────────────────────────

export function IntervalsLarge(p: { chip: React.ReactNode; paceNow: string; paceTone?: string; nowSec: number; loSec?: number; hiSec?: number; targetText: string; metersLeft: string; timeLeft: string; nextText?: string }) {
  const t = useT(together);
  return (
    <>
      {p.chip}
      <BigRate value={p.paceNow} color={p.paceTone} />
      <Gauge nowSec={p.nowSec} loSec={p.loSec} hiSec={p.hiSec} bottomCenter={t('chrome.gauge.target', { range: p.targetText })} />
      <div className="mt-4 border-t border-slate-100 pt-3">
        <Cells>
          <Cell size={30} label={t('chrome.label.metersLeft')} value={p.metersLeft} />
          <Cell size={30} label={t('chrome.label.timeLeft')} value={p.timeLeft} />
        </Cells>
      </div>
      {p.nextText && <p className="mt-2.5 text-center text-[13px] font-bold text-slate-600">{t('chrome.next', { what: p.nextText })}</p>}
    </>
  );
}

export function FreeLarge(p: { title: string; rateNow: string; nowSec: number; avgSec?: number; avgText: string; first: { label: string; value: string }; second: { label: string; value: string }; nextText?: string }) {
  const t = useT(together);
  return (
    <>
      <Chip bg="#e0f2fe">{p.title}</Chip>
      <BigRate value={p.rateNow} />
      <Gauge nowSec={p.nowSec} avgSec={p.avgSec} bottomCenter={p.avgText} />
      <div className="mt-4 border-t border-slate-100 pt-3">
        <Cells>
          <Cell size={30} label={p.first.label} value={p.first.value} />
          <Cell size={30} label={p.second.label} value={p.second.value} />
        </Cells>
      </div>
      {p.nextText && <p className="mt-2.5 text-center text-[13px] font-bold text-slate-600">{t('chrome.next', { what: p.nextText })}</p>}
    </>
  );
}
