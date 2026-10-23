'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useT } from '@/hooks/useT';
import { wide } from '@/messages/ns/wide';
import type { TvParticipant, TvSession } from '../core/types';
import { leaveTvSession } from '../hooks/useTvJoin';
import { CARD, PAGE_BG, PRIMARY_BTN, SECONDARY_BTN } from '../ui/styles';
import { AvatarStack } from './TvParticipantsList';
import { useTvPhoneStore } from './phone-store';

/** W-20 "participant": joined the host's room, same workout for everyone. */
export default function TvJoinedPanel({ session, participants }: { session: TvSession; participants: TvParticipant[] }) {
  const t = useT(wide);
  const router = useRouter();
  const hide = useTvPhoneStore((s) => s.hide);
  const live = session.status === 'live';
  const shared = session.workout?.sharedWorkoutId;

  const open = () => {
    hide();
    if (shared) router.push(`/workouts/${shared}`);
  };

  return (
    <div dir="rtl" className={`fixed inset-0 z-[101] flex flex-col overflow-y-auto ${PAGE_BG}`} role="dialog" aria-modal="true" aria-label={t('joined.eyebrow')}>
      <div className="px-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="text-[13px] font-extrabold text-[#047857]">{t('joined.eyebrow')}</div>
        <div className="text-[26px] font-black leading-tight">
          {session.hostName ? t('joined.title', { host: session.hostName }) : t('joined.titleNoHost')}
        </div>
      </div>

      <div className={`${CARD} mx-4 mt-3.5`}>
        {session.workout && (
          <>
            <div className="text-[20px] font-black leading-tight">{session.workout.title}</div>
            {session.workout.durationMin > 0 && <div className="mt-1 text-[14px] font-bold text-[#475569]">{t('joined.meta', { min: session.workout.durationMin })}</div>}
          </>
        )}
        <div className="mt-3.5 flex items-center gap-3">
          <AvatarStack list={participants} />
          <span className="flex-1 text-[14.5px] font-extrabold">{t('joined.count', { n: participants.length })}</span>
        </div>
      </div>

      <div className={`${CARD} mx-4 mt-3.5`}>
        {live ? (
          <p className="text-[15px] font-extrabold leading-snug">{t('joined.live')}</p>
        ) : (
          <>
            <div className="flex items-center gap-2.5">
              <span className="h-[22px] w-[22px] animate-spin rounded-full border-[3px] border-[#f59e0b] border-t-transparent motion-reduce:animate-none" aria-hidden="true" />
              <p role="status" className="min-w-0 flex-1 text-[15px] font-extrabold leading-snug">
                {t('joined.waiting', { hostGender: session.hostGender ?? 'other' })}
              </p>
            </div>
            <p className="mt-2 text-[13px] font-semibold leading-snug text-[#64748b]">{t('joined.waitingBody')}</p>
          </>
        )}
      </div>

      <div className="mt-auto flex flex-col gap-2.5 px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-3">
        {live && shared && (
          <button type="button" className={PRIMARY_BTN} onClick={open}>
            {t('joined.open')}
          </button>
        )}
        <button type="button" className={SECONDARY_BTN} onClick={() => void leaveTvSession()}>
          {t('joined.leave')}
        </button>
      </div>
    </div>
  );
}
