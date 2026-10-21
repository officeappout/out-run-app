'use client';

/**
 * "סדר לי במילים" (enable_week_builder_v1) — the week builder's Kelly chip. Shown ONLY when the
 * user has Kelly AI (useAiCoachAccess, the app's one entitlement check for Kelly AI). Opens the
 * Kelly chat over the builder (the builder keeps its state underneath) with the week the user
 * is looking at in the composer — the user's own words, never auto-sent. Any schedule change
 * still goes through Kelly's existing confirm card: nothing is saved without the user's tap.
 */
import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { useT } from '@/hooks/useT';
import { coach } from '@/messages/ns/coach';
import { useUserStore } from '@/features/user';
import { useAiCoachAccess } from '../hooks/useAiCoachAccess';
import { useKellyChatConfig } from '../hooks/useKellyChatConfig';
import { weekContextLineHe } from '@/features/schedule/week-builder/weekContext';
import type { WbWeek } from '@/features/schedule/week-builder/types';
import AiCoachChat from './AiCoachChat';

export interface KellyWeekChipProps {
  /** The week as one line (weekContextLineHe); '' = nothing placed yet. */
  weekLineHe: string;
}

function KellyWeekOverlay({ initialInput, onClose }: { initialInput: string; onClose: () => void }) {
  const { profile } = useUserStore();
  const cfg = useKellyChatConfig();
  if (!profile || cfg.loading || !cfg.canUseAi) return null;
  return (
    <AiCoachChat
      profile={profile}
      onClose={onClose}
      unified={cfg.unified}
      phase2={cfg.phase2}
      weatherOn={cfg.weatherOn}
      proactive={cfg.unified && cfg.proactive}
      memory={cfg.memory}
      round4={cfg.round4}
      runsByType={cfg.runsByType}
      initialInput={initialInput}
    />
  );
}

export default function KellyWeekChip({ weekLineHe }: KellyWeekChipProps) {
  const t = useT(coach);
  const { canUseAi } = useAiCoachAccess();
  const [open, setOpen] = useState<string | null>(null);
  if (!canUseAi) return null;
  const context = weekLineHe ? t('weekChip.context', { week: weekLineHe }) : t('weekChip.contextEmpty');
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(context)}
        className="inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-v2-tint px-3 text-[13px] font-extrabold text-v2-deep ring-1 ring-inset ring-v2-accent/40 transition-transform duration-150 ease-v2 active:scale-[0.97]"
      >
        <Sparkles size={14} strokeWidth={2.2} aria-hidden />
        {t('weekChip.label')}
      </button>
      {open != null && <KellyWeekOverlay initialInput={open} onClose={() => setOpen(null)} />}
    </>
  );
}

/** The week builder's header action: the chip over the week the user is looking at. */
export function kellyWeekAction<P>(week: WbWeek<P>) {
  return <KellyWeekChip weekLineHe={weekContextLineHe(week)} />;
}
