'use client';
/**
 * ParkRingScreen — the in-between screen before the park workout's summary (enable_park_live_v2,
 * board Park 11, pilot N1): this week's ring fills (walking + strength, the progress tab's colors),
 * a line from Kelly, and the 150 weekly minutes explained. "הבא" opens the summary.
 */
import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Button } from '@/components/ui/v2';
import { useT } from '@/hooks/useT';
import { summary as summaryNs } from '@/messages/ns/summary';
import { useActivityStore } from '@/features/activity/store/useActivityStore';
import { ACTIVITY_COLORS, WHO_COMPLIANCE_BASELINE } from '@/features/activity/types/activity.types';
import type { HybridFinalizeResult } from '@/features/workout-engine/hybrid/hybrid-orchestrator';
import { weekRingView } from '../park-summary';

import { useUiDir } from '@/lib/i18n/useUiDir';
const SIZE = 240;
const STROKE = 18;
const R = (SIZE - STROKE) / 2;
const C = 2 * Math.PI * R;

function Arc({ from, frac, color, reduce }: { from: number; frac: number; color: string; reduce: boolean | null }) {
  if (frac <= 0) return null;
  return (
    <motion.circle
      cx={SIZE / 2}
      cy={SIZE / 2}
      r={R}
      fill="none"
      stroke={color}
      strokeWidth={STROKE}
      strokeLinecap="round"
      strokeDasharray={`${C * frac} ${C}`}
      transform={`rotate(${-90 + from * 360} ${SIZE / 2} ${SIZE / 2})`}
      initial={reduce ? false : { strokeDasharray: `0 ${C}` }}
      animate={{ strokeDasharray: `${C * frac} ${C}` }}
      transition={{ duration: 1.1, ease: [0.23, 1, 0.32, 1], delay: 0.2 }}
    />
  );
}

export default function ParkRingScreen({ result, onNext }: { result: HybridFinalizeResult; onNext: () => void }) {
  const { direction } = useUiDir();
  const t = useT(summaryNs);
  const reduce = useReducedMotion();
  const totals = useActivityStore((s) => s.weeklySummary?.categoryTotals);
  const strengthSec = result.segments
    .filter((s) => s.kind === 'strength')
    .reduce((a, s) => a + (s.actual?.durationSec ?? 0), 0);
  const v = weekRingView(totals, { aerobicSec: result.summary.totalActualAerobicSec, strengthSec }, WHO_COMPLIANCE_BASELINE.weeklyAerobicMinutes);
  const cardio = ACTIVITY_COLORS.cardio.hex;
  const strength = ACTIVITY_COLORS.strength.hex;
  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-v2-surface px-5" dir={direction} style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 40px)' }}>
      <h1 className="text-center text-[24px] font-black text-v2-ink" style={{ fontFamily: 'var(--font-simpler)' }}>
        {t('parkLive.ring.title')}
      </h1>
      <div className="relative mx-auto mt-6" style={{ width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden>
          <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke={cardio} strokeOpacity={0.16} strokeWidth={STROKE} />
          <Arc from={0} frac={v.aerobicFrac} color={cardio} reduce={reduce} />
          <Arc from={v.aerobicFrac} frac={v.strengthFrac} color={strength} reduce={reduce} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span dir="ltr" className="text-[48px] font-black leading-none tabular-nums text-v2-ink">{v.totalMin}</span>
          <span className="mt-1 text-[13px] font-extrabold text-v2-muted">{t('parkLive.ring.of', { goal: String(v.goalMin) })}</span>
        </div>
      </div>
      <div className="mt-4 flex justify-center gap-4">
        <span className="flex items-center gap-1.5 text-[13.5px] font-extrabold text-v2-ink">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: cardio }} aria-hidden />
          {t('parkLive.ring.aerobic', { min: String(v.aerobicMin) })}
        </span>
        <span className="flex items-center gap-1.5 text-[13.5px] font-extrabold text-v2-ink">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: strength }} aria-hidden />
          {t('parkLive.ring.strength', { min: String(v.strengthMin) })}
        </span>
      </div>
      <div className="mt-5 flex items-start gap-2.5 rounded-2xl bg-white px-3.5 py-3 ring-1 ring-inset ring-v2-hairline">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/assets/lemur/lemur-avatar.png" alt="" className="h-10 w-10 shrink-0 object-contain" />
        <p className="text-[14px] leading-[21px] text-v2-ink">{t('parkLive.ring.kelly')}</p>
      </div>
      <p className="mt-3 text-center text-[13px] leading-[20px] text-v2-ink-2">{t('parkLive.ring.who', { goal: String(v.goalMin) })}</p>
      <div className="mt-auto pt-4" style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom, 20px))' }}>
        <Button variant="cta" block onClick={onNext}>{t('parkLive.ring.next')}</Button>
      </div>
    </div>
  );
}
