'use client';

/**
 * Add track · "השבוע המשולב" (enable_home_v2; boards jr/J3-05 = sch/S-6b, jr/J4-05 = sch/S-6c).
 *
 * The recommendation card, the schedule builder's own priority control (preset to the
 * track the user started with), the week rows with their diff tags (חדש / נשאר /
 * הוזז: … · כי …), the "keep it as it was, only add on free days" alternative and one CTA.
 * Presentational: the engine week comes in ready (add-track/addTrackWeek.ts).
 */
import { Footprints, Info, Zap } from 'lucide-react';
import { useT } from '@/hooks/useT';
import { onboarding, type OnboardingKey } from '@/messages/ns/onboarding';
import type { MessageValues } from '@/lib/i18n/core/i18n-core';
import StickyActionButton from '@/components/ui/StickyActionButton';
import { IconTile, RecommendationCard, WeekDayRow, WeekSessionPiece } from '@/components/ui/v2';
import AerobicStrengthSlider from '@/features/parks/core/components/hybrid/AerobicStrengthSlider';
import { getProgramIcon, resolveIconKey } from '@/features/content/programs/core/program-icon.util';
import { DAY_LETTERS_HE } from '@/features/schedule/utils/runWeekRecommendation';
import type { AddedTrack } from '@/features/schedule/add-track/addTrackProfile';
import {
  priorityHelperHe,
  priorityLineHe,
  type AddTrackSessionView,
  type AddTrackWeekView,
} from '@/features/schedule/add-track/addTrackWeek';
import type { SchedulePriority } from '@/features/schedule/engine-v2/types';

type OnboardingT = (key: OnboardingKey, values?: MessageValues) => string;

const COPY: Record<AddedTrack, { title: OnboardingKey; subtitle: OnboardingKey }> = {
  running: { title: 'signup.addTrack.running.title', subtitle: 'signup.addTrack.running.subtitle' },
  strength: { title: 'signup.addTrack.strength.title', subtitle: 'signup.addTrack.strength.subtitle' },
};

export interface AddTrackWeekStepProps {
  added: AddedTrack;
  week: AddTrackWeekView;
  dates: number[];
  times: { run: string; strength: string };
  priority: SchedulePriority;
  /** AerobicStrengthSlider share (0.30 … 0.70). */
  share: number;
  onShare: (share: number) => void;
  /** true = the add-only week is showing. */
  keepOnly: boolean;
  /** null = nothing would move anyway (the alternative is not offered). */
  onToggleKeepOnly: (() => void) | null;
  error: string | null;
  onConfirm: () => void | Promise<void>;
}

function SessionIcon({ s }: { s: AddTrackSessionView }) {
  if (s.kind === 'run') {
    const quality = s.slot === 'quality_primary' || s.slot === 'quality_secondary';
    return <IconTile icon={quality ? Zap : Footprints} tone="run" size="sm" />;
  }
  return (
    <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-[#00baf7]/10 text-[#00baf7]">
      {getProgramIcon(resolveIconKey(undefined, s.slug ?? null), 'w-5 h-5')}
    </span>
  );
}

function sessionPieceProps(t: OnboardingT, s: AddTrackSessionView, times: AddTrackWeekStepProps['times']) {
  return {
    title: s.nameHe,
    subtitle: t('signup.addTrack.session.subtitle', { kind: s.kind, time: s.kind === 'run' ? times.run : times.strength }),
    tag:
      s.status === 'new'
        ? { label: t('signup.addTrack.tag.new'), tone: 'new' as const }
        : s.status === 'moved'
          ? { label: t('signup.addTrack.tag.moved'), tone: 'moved' as const }
          : null,
    note: s.noteHe ? { text: s.noteHe, tone: s.status === 'moved' ? ('moved' as const) : s.status === 'kept' ? ('kept' as const) : ('info' as const) } : null,
  };
}

export default function AddTrackWeekStep(p: AddTrackWeekStepProps) {
  const t = useT(onboarding);
  const copy = COPY[p.added];
  return (
    <div dir="rtl" className="relative mx-auto flex w-full max-w-md flex-1 flex-col bg-v2-surface font-simpler text-v2-ink">
      <div className="px-4 pb-2 pt-1">
        <h1 className="truncate whitespace-nowrap text-[24px] font-black leading-[1.2] !tracking-[-0.02em]">{t(copy.title)}</h1>
        <p className="mt-0.5 truncate whitespace-nowrap text-[13.5px] font-bold text-v2-muted">{t(copy.subtitle)}</p>

        <RecommendationCard className="mt-3.5" title={p.week.titleHe} detail={priorityLineHe(p.priority, p.added)} />
      </div>

      <div className="-mx-1 mt-1">
        <AerobicStrengthSlider
          v2
          aerobicShare={p.share}
          onChange={p.onShare}
          goalType="time"
          timeBudgetMin={30}
          helperText={priorityHelperHe(p.priority)}
          recommendedShare={p.added === 'running' ? 0.3 : 0.7}
        />
      </div>

      <div className="px-4">
        <p className="px-1 pb-1.5 text-[12px] font-bold text-v2-muted">{t('signup.addTrack.legend')}</p>
        <div className="overflow-hidden rounded-[22px] bg-white shadow-v2-card">
          {p.week.days.map((day) => (
            <WeekDayRow
              key={day.dow}
              letter={DAY_LETTERS_HE[day.dow]}
              date={p.dates[day.dow]}
              muted={day.sessions.length === 0}
              emptyLabel={t('signup.addTrack.rest')}
              divider={day.dow > 0}
            >
              {day.sessions.map((s, i) => (
                <WeekSessionPiece key={`${s.kind}-${s.slot ?? s.slug}-${i}`} icon={<SessionIcon s={s} />} {...sessionPieceProps(t, s, p.times)} />
              ))}
            </WeekDayRow>
          ))}
        </div>

        {p.week.warningsHe.length > 0 && (
          <div className="mt-3 flex items-start gap-2 rounded-[14px] bg-v2-tint px-3.5 py-2.5 text-[13px] font-bold leading-snug text-v2-ink">
            <Info size={16} strokeWidth={2.2} aria-hidden className="mt-0.5 shrink-0 text-v2-deep" />
            <span className="min-w-0">{p.week.warningsHe[0]}</span>
          </div>
        )}
        {p.error && <p className="mt-3 text-center text-[13px] font-bold text-red-600">{p.error}</p>}

        {p.onToggleKeepOnly && (
          <button
            type="button"
            onClick={p.onToggleKeepOnly}
            className="mx-auto mt-3 flex h-[34px] items-center whitespace-nowrap px-3 text-[13.5px] font-extrabold text-v2-deep transition-transform duration-150 ease-v2 active:scale-[0.97]"
          >
            {p.keepOnly ? t('signup.addTrack.keepOnly.back') : t('signup.addTrack.keepOnly.offer')}
          </button>
        )}
      </div>

      <div className="flex-grow" />
      <StickyActionButton variant="v2" label={t('signup.addTrack.confirm')} disabled={p.week.newCount === 0} onPress={p.onConfirm} />
    </div>
  );
}
