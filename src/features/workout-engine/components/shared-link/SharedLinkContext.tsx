'use client';

import React from 'react';
import { CalendarClock, MapPin } from 'lucide-react';
import { useT } from '@/hooks/useT';
import { library, type LibraryT } from '@/messages/ns/library';
import { formatDate, formatTime } from '@/lib/i18n/core/fmt';
import { useLocaleStore } from '@/store/useLocaleStore';
import { inviteDayKind, type InviteView, type SenderView } from '../../services/shared-workout-view';

interface Props {
  variant: 'share' | 'invite';
  sender: SenderView | null;
  invite: InviteView | null;
  nowMs?: number;
}

function Avatar({ initial, photoURL }: { initial: string; photoURL: string | null }) {
  return (
    <span className="-ms-2 grid h-7 w-7 place-items-center overflow-hidden rounded-full border-2 border-white bg-cyan-100 text-[12px] font-extrabold text-cyan-800 first:ms-0">
      {photoURL ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoURL} alt="" className="h-full w-full object-cover" />
      ) : (
        initial
      )}
    </span>
  );
}

/**
 * Canvas G6-01 / G6-02 — the card above the exercise list. SHARE: who shared it ("X שיתפה איתך אימון
 * שאהבה") + a quiet line. INVITE: who invited you, when, where and who is coming. The sender's
 * gender picks the verb (ICU select); an unknown name falls back to a neutral line.
 */
export default function SharedLinkContext({ variant, sender, invite, nowMs = Date.now() }: Props) {
  const t = useT(library);
  const locale = useLocaleStore((s) => s.locale);
  const gender = sender?.gender ?? 'other';
  const initial = sender ? Array.from(sender.name)[0] ?? '' : '';

  const title =
    variant === 'invite'
      ? sender ? t('sharedWorkout.link.invite.title', { name: sender.name, gender }) : t('sharedWorkout.link.invite.fallbackTitle')
      : sender ? t('sharedWorkout.link.share.title', { name: sender.name, gender }) : t('sharedWorkout.link.share.fallbackTitle');

  return (
    <section data-shared-link={variant} className="rounded-3xl bg-white p-4 text-start shadow-sm ring-1 ring-slate-900/5">
      <div className="flex items-center gap-3">
        {sender && (
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-cyan-100 text-[16px] font-black text-cyan-800" aria-hidden>
            {initial}
          </span>
        )}
        <div className="min-w-0">
          <h2 className="text-[16px] font-black leading-tight text-slate-900">{title}</h2>
          {variant === 'share' && <p className="mt-0.5 text-[13px] font-medium text-slate-500">{t('sharedWorkout.link.share.sub')}</p>}
        </div>
      </div>

      {variant === 'invite' && invite && (
        <div className="mt-3 flex flex-col gap-2 text-[14px] font-bold text-slate-800">
          <div className="flex items-center gap-2">
            <CalendarClock size={16} className="shrink-0 text-cyan-600" aria-hidden />
            <span>
              {t('sharedWorkout.link.invite.when', {
                day: dayLabel(inviteDayKind(invite.startsAtMs, nowMs), invite.startsAtMs, locale, t),
                time: formatTime(invite.startsAtMs, locale, { hour: '2-digit', minute: '2-digit', hour12: false }),
              })}
            </span>
          </div>
          {invite.placeName && (
            <div className="flex items-center gap-2">
              <MapPin size={16} className="shrink-0 text-cyan-600" aria-hidden />
              <span className="min-w-0 truncate">{invite.placeName}</span>
            </div>
          )}
          {invite.goingCount > 0 && (
            <div className="flex items-center gap-2">
              <span className="flex">{invite.avatars.map((a, i) => <Avatar key={i} {...a} />)}</span>
              <span className="text-[13px] font-extrabold text-slate-600">
                {t('sharedWorkout.link.invite.going', { count: invite.goingCount })}
              </span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function dayLabel(kind: 'today' | 'tomorrow' | 'date', ms: number, locale: Parameters<typeof formatDate>[1], t: LibraryT): string {
  if (kind === 'today') return t('sharedWorkout.link.invite.today');
  if (kind === 'tomorrow') return t('sharedWorkout.link.invite.tomorrow');
  return formatDate(ms, locale, { weekday: 'short', day: 'numeric', month: 'numeric' });
}
