'use client';

/**
 * enable_workout_insights_v1 — Kelly inside the green "שיפור מהפעם הקודמת" card (canvas IN-5):
 *   headerAction  the AI-star circle → opens the Kelly chat about this workout
 *   footer        "קלי: …" — one insight + praise line (only when the AI wrote one)
 * Flag off / no Kelly AI → undefined (the card renders exactly as before).
 */
import React, { useMemo, type ReactNode } from 'react';
import { useT } from '@/hooks/useT';
import { player } from '@/messages/ns/player';
import KellyChatLauncher from '@/features/ai-coach/components/KellyChatLauncher';
import type { PhaseSummary } from '../utils/phase-summary';
import { strengthInsightRequest } from './insight-input';
import { useWorkoutInsight } from './useWorkoutInsight';

function Sparkle({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden>
      <path d="M12 2.5l2 5.6 5.6 2-5.6 2-2 5.6-2-5.6-5.6-2 5.6-2z" />
      <path d="M19 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" />
    </svg>
  );
}

export function KellyAskStar({ contextOf }: { contextOf: () => string }) {
  const t = useT(player);
  return (
    <KellyChatLauncher contextOf={contextOf}>
      {(open) => (
        <button
          type="button"
          onClick={open}
          aria-label={t('insights.askKelly')}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#00baf7] to-[#0cf2e3] transition-transform duration-150 active:scale-95"
          style={{ boxShadow: '0 6px 14px -6px rgba(0,186,247,0.7)' }}
        >
          <Sparkle size={18} color="#04222b" />
        </button>
      )}
    </KellyChatLauncher>
  );
}

export function KellyInsightRow({ line }: { line: string }) {
  const t = useT(player);
  return (
    <div
      className="mt-2.5 flex items-start gap-2 rounded-2xl bg-white/70 px-3 py-2.5"
      style={{ boxShadow: 'inset 0 0 0 1px rgba(0,186,247,0.25)' }}
      data-testid="kelly-insight"
    >
      <span className="mt-0.5 shrink-0">
        <Sparkle size={16} color="#0284c7" />
      </span>
      <span className="text-[14px] font-bold leading-5 text-v2-ink">
        <b className="text-[#0284c7]">{t('insights.kellyLabel')}</b> {line}
      </span>
    </div>
  );
}

export interface ImprovementKellySlots {
  headerAction?: ReactNode;
  footer?: ReactNode;
}

export function useSummaryKellySlots(src: {
  phases: readonly PhaseSummary[] | null;
  durationSec: number;
  isRecovery?: boolean;
  enabled: boolean;
}): ImprovementKellySlots | undefined {
  const t = useT(player);
  const req = useMemo(
    () => (src.enabled && src.phases ? strengthInsightRequest({ durationSec: src.durationSec, phases: src.phases, isRecovery: src.isRecovery }) : null),
    [src.enabled, src.phases, src.durationSec, src.isRecovery],
  );
  const { active, lines } = useWorkoutInsight(req);
  if (!active || !req) return undefined;
  const insight = lines?.insight ?? null;
  const contextOf = () =>
    t('insights.chatSeed', { minutes: String(Math.max(1, Math.round(req.durationSec / 60))), insight: insight ?? '' }).trim();
  return {
    headerAction: <KellyAskStar contextOf={contextOf} />,
    ...(insight ? { footer: <KellyInsightRow line={insight} /> } : {}),
  };
}
