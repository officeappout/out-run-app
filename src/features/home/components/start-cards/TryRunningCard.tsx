'use client';

import { Loader2, Sprout } from 'lucide-react';
import type { UserFullProfile } from '@/types/user-profile';
import { useT } from '@/hooks/useT';
import { home } from '@/messages/ns/home';
import { formatNumber } from '@/lib/i18n/core/fmt';
import { useLocaleStore } from '@/store/useLocaleStore';
import type { WalkStreak } from '@/features/home/utils/walk-streak';
import { useOnboardingEntryTap, type OnboardingEntryNavigate } from './useOnboardingEntryTap';
import { PROGRAM_CARD_ENTRY } from './program-signup-gate';

export interface TryRunningCardProps {
  profile: UserFullProfile | null | undefined;
  streak: WalkStreak;
  /** Home's health-declaration gate, same as the start cards. */
  onNavigate?: OnboardingEntryNavigate;
  onDismiss: () => void;
}

const SIMPLER = { fontFamily: 'var(--font-simpler)' } as const;

/**
 * Canvas WR-6 — after 4+ consecutive weeks of walking: "מוכן לנסות ריצה קלה?". The CTA opens the
 * running questionnaire (the same entry as the "הליכה וריצה" start card); "לא עכשיו, ממשיך ללכת" hides
 * the card for 30 days. Shows only the numbers we really have (walks, weeks in a row).
 */
export default function TryRunningCard({ profile, streak, onNavigate, onDismiss }: TryRunningCardProps) {
  const t = useT(home);
  const locale = useLocaleStore((st) => st.locale);
  const num = (n: number) => formatNumber(n, locale);
  const { loading, tap } = useOnboardingEntryTap(profile, 'RUNNING', onNavigate, PROGRAM_CARD_ENTRY);
  return (
    <div className="flex h-full w-full items-center justify-center">
      <div data-try-running="" className="flex w-full flex-col overflow-hidden rounded-[24px] bg-white text-start shadow-lg">
        <div className="grid h-[86px] place-items-center bg-gradient-to-br from-[#f3f9e9] to-[#e2f2c8]">
          <Sprout size={38} strokeWidth={2} className="text-[#65a30d]" aria-hidden="true" />
        </div>
        <div className="flex flex-col gap-1 px-4 pb-2 pt-3">
          <p className="text-[12.5px] font-extrabold text-[#65a30d]" style={SIMPLER}>{t('tryRun.kicker', { weeks: num(streak.weeks) })}</p>
          <h3 className="text-[19px] font-black leading-tight text-slate-900" style={SIMPLER}>{t('tryRun.title')}</h3>
          <p className="text-[13px] font-medium leading-[1.45] text-slate-700" style={SIMPLER}>{t('tryRun.body')}</p>
          <div className="mt-1 flex gap-1.5">
            <Stat value={num(streak.walks)} label={t('tryRun.stat.walks')} />
            <Stat value={num(streak.weeks)} label={t('tryRun.stat.weeks')} />
          </div>
          <button
            type="button"
            onClick={tap}
            disabled={loading}
            className="mt-2 flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-v2-cta text-[14px] font-extrabold text-v2-on-cta shadow-v2-cta transition-transform duration-150 ease-v2 active:scale-[0.97] disabled:opacity-60"
          >
            {loading && <Loader2 size={16} className="animate-spin" />}
            {t('tryRun.cta')}
          </button>
          <button type="button" onClick={onDismiss} className="mx-auto -my-1 h-11 whitespace-nowrap px-3 text-[12.5px] font-bold text-v2-muted">
            {t('tryRun.dismiss')}
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex-1 rounded-2xl bg-[#f6fbfd] px-2 py-1.5 text-center shadow-[inset_0_0_0_1px_#e6edf2]">
      <div className="text-[17px] font-black text-slate-900">{value}</div>
      <div className="whitespace-nowrap text-[11px] font-bold text-slate-500">{label}</div>
    </div>
  );
}
