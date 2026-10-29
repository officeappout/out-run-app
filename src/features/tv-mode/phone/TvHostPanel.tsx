'use client';

import React, { useState } from 'react';
import { useT } from '@/hooks/useT';
import { wide } from '@/messages/ns/wide';
import type { TvParticipant, TvSession } from '../core/types';
import { leaveTvSession } from '../hooks/useTvJoin';
import { getTvRepo } from '../services/tv-repo';
import { CARD, CHIP_OK, PAGE_BG, PRIMARY_BTN, SECONDARY_BTN } from '../ui/styles';
import TvParticipantsList, { AvatarStack } from './TvParticipantsList';
import { useTvPhoneStore } from './phone-store';

/** W-20 "host": who joined, new people can scan again, start the workout. */
export default function TvHostPanel({ session, participants }: { session: TvSession; participants: TvParticipant[] }) {
  const t = useT(wide);
  const pending = useTvPhoneStore((s) => s.pending);
  const hide = useTvPhoneStore((s) => s.hide);
  const [busy, setBusy] = useState(false);
  const others = participants.filter((p) => p.uid !== session.hostUid);

  const start = async () => {
    setBusy(true);
    try {
      await getTvRepo().startWorkout(session.code);
      hide();
      pending?.onStart();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`fixed inset-0 z-[101] flex flex-col overflow-y-auto ${PAGE_BG}`} role="dialog" aria-modal="true" aria-label={t('remote.host.title')}>
      <div className="flex items-center gap-3 px-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-extrabold text-[#0284c7]">{t('remote.host.eyebrow')}</div>
          <div className="text-[26px] font-black leading-tight">{t('remote.host.title')}</div>
        </div>
        <span className={CHIP_OK}>{t('remote.host.badge')}</span>
      </div>

      <div className={`${CARD} mx-4 mt-3.5`}>
        <div className="flex items-center gap-3">
          <span className="flex-1 text-[15px] font-extrabold">{t('remote.host.joined', { n: others.length })}</span>
          <AvatarStack list={others} size={34} />
        </div>
        {others.length > 0 && <TvParticipantsList list={others} />}
      </div>

      <p className="mx-4 mt-3 rounded-[20px] bg-[#eef8fc] px-4 py-3.5 text-[13.5px] font-bold leading-snug text-[#0c4a6e]">{t('remote.host.rescan')}</p>

      <div className="mt-auto flex flex-col gap-2.5 px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-3">
        {pending ? (
          <button type="button" className={PRIMARY_BTN} disabled={busy} onClick={() => void start()}>
            {t('remote.host.start')}
          </button>
        ) : (
          <p className="px-1 text-center text-[13.5px] font-bold leading-snug text-[#475569]">{t('remote.host.pickWorkout')}</p>
        )}
        <button type="button" className={SECONDARY_BTN} onClick={hide}>
          {t('remote.host.control')}
        </button>
        <button type="button" className="min-h-[44px] text-[14px] font-extrabold text-[#b91c1c]" onClick={() => void leaveTvSession()}>
          {t('remote.host.end')}
        </button>
      </div>
    </div>
  );
}
