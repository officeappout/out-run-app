'use client';

import { CalendarPlus, CheckCircle2 } from 'lucide-react';
import { useT } from '@/hooks/useT';
import { together } from '@/messages/ns/together';
import { useTogetherLocale } from '../hooks/useTogetherLocale';
import { formatDate, formatTime } from '@/lib/i18n/core/fmt';
import { localizeParams } from '../core/localize';
import { TOGETHER_CONFIG } from '../core/config';
import { buildSessionIcs, googleCalendarUrl } from '../core/schedule';

/** Invite page, after joining a session that is not about to start: registered + reminder + calendar. */
export default function JoinedForLater(props: { uid: string; groupName: string; startMs: number; onContinue: () => void }) {
  const t = useT(together);
  const { dir, locale } = useTogetherLocale();
  const title = t('later.eventTitle', { group: props.groupName });
  const min = TOGETHER_CONFIG.reminderMinBefore;
  const when = t('invite.when', { date: formatDate(props.startMs, locale, { weekday: 'long', day: 'numeric', month: 'long' }), time: formatTime(props.startMs, locale) });

  const download = () => {
    const ics = buildSessionIcs({
      uid: `${props.uid}-${props.startMs}`,
      title,
      startMs: props.startMs,
      description: t('later.eventDesc'),
      reminderLabel: t('later.reminder', { min }),
    });
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'out-together.ics';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-gray-950 px-6 text-center" dir={dir}>
      <CheckCircle2 className="h-14 w-14 text-emerald-400" />
      <div>
        <h1 className="text-2xl font-black text-white">{t('later.title')}</h1>
        <p className="mt-1 text-sm font-semibold text-white">{when}</p>
        <p className="mt-2 text-sm text-white/80">{t('later.remind', localizeParams({ min }, locale))}</p>
        <p className="mt-1 text-xs text-white/50">{t('later.opens', localizeParams({ min: TOGETHER_CONFIG.lobbyOpensMinBefore }, locale))}</p>
      </div>
      <div className="flex w-full max-w-xs flex-col gap-3">
        <button onClick={download} className="flex items-center justify-center gap-2 rounded-2xl bg-white/15 py-3 text-sm font-semibold text-white">
          <CalendarPlus className="h-4 w-4" />
          {t('later.calendar')}
        </button>
        <a
          href={googleCalendarUrl({ title, startMs: props.startMs, details: t('later.eventDesc') })}
          target="_blank"
          rel="noreferrer"
          className="rounded-2xl bg-white/10 py-3 text-sm font-semibold text-white/80"
        >
          {t('later.google')}
        </a>
        <button onClick={props.onContinue} className="rounded-2xl bg-white py-4 text-base font-black text-black">
          {t('later.continue')}
        </button>
      </div>
    </div>
  );
}
