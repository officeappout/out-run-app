'use client';

/** Explainer 9 (board Explain3): the week strip (a static illustration from the user's groups) and Kelly's line. */
import clsx from 'clsx';
import type { Gender } from '@/lib/i18n/core/i18n-core';
import { useT } from '@/hooks/useT';
import { onboarding } from '@/messages/ns/onboarding';
import { common } from '@/messages/ns/common';
import { weekdayLabel } from '@/lib/i18n/units';
import { GROUP_ICON } from './quiz-v3-model';
import type { WeekPreviewDay } from './quiz-v3-outro';

const KELLY = '/assets/lemur/lemur-avatar.png';

export default function ExplainSchedule({ days, gender }: { days: WeekPreviewDay[]; gender: Gender }) {
  const t = useT(onboarding);
  const tc = useT(common);
  return (
    <>
      <span className="self-start rounded-full bg-v2-tint px-3 py-1.5 text-[13px] font-extrabold text-v2-deep">{t('quizV3.explain3.tag')}</span>
      <h1 className="m-0 text-[32px] font-black leading-[38px] tracking-v2-tighter">{t('quizV3.explain3.title')}</h1>
      <p className="m-0 text-[16px] leading-6 text-v2-ink-2">{t('quizV3.explain3.body', { gender })}</p>
      <div className="flex flex-col gap-3 rounded-[24px] bg-white p-4 shadow-v2-card">
        <span className="text-[14px] font-black">{t('quizV3.explain3.schedule')}</span>
        <ul className="m-0 grid list-none grid-cols-7 gap-1.5 p-0 text-center">
          {days.map((d) => (
            <li key={d.day} className="flex flex-col items-center gap-1.5">
              <span className="text-[12px] font-bold text-v2-muted">{weekdayLabel(d.day, 'letter', tc)}</span>
              <span className={clsx('grid h-[34px] w-[34px] place-items-center rounded-xl', d.group ? 'bg-v2-tint' : 'bg-[#f1f5f8]')}>
                {d.group && <img src={GROUP_ICON[d.group]} alt={t('quizV3.group.name', { group: d.group })} className="w-5" />}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex items-end gap-2.5">
        <img src={KELLY} alt={t('quizV3.explain3.lemurAlt')} className="h-[72px] w-[72px] flex-shrink-0 object-contain" />
        <p className="m-0 rounded-[22px] rounded-ee-[6px] bg-white px-3.5 py-3 text-[15px] font-semibold leading-[22px] shadow-v2-ring">
          {t('quizV3.explain3.lemur', { gender })}
        </p>
      </div>
    </>
  );
}
