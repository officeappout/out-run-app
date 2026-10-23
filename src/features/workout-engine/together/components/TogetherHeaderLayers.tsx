'use client';

import { useT } from '@/hooks/useT';
import { together } from '@/messages/ns/together';
import { formatNumber } from '@/lib/i18n/core/fmt';
import { useTogetherLocale } from '../hooks/useTogetherLocale';
import { formatPace } from '../core/rail-logic';
import type { OrderedParticipant } from '../core/presence-order';

function Face({ p, size }: { p: OrderedParticipant; size: number }) {
  return (
    <span className="grid place-items-center overflow-hidden rounded-full bg-[#1a1a2e] font-extrabold text-white" style={{ width: size, height: size, fontSize: size * 0.3, boxShadow: '0 0 0 2px #fff, 0 0 0 4px rgba(14,20,25,0.15)' }}>
      {p.photoURL ? <img src={p.photoURL} alt="" className="h-full w-full object-cover" /> : (p.name.charAt(0) || '·')}
    </span>
  );
}

/** Layer 2 of the run header (board H-3/H-7): overlapped faces + "12.4 ק״מ ביחד". */
export function TogetherFacesLayer({ participants, totalKm }: { participants: OrderedParticipant[]; totalKm: number }) {
  const t = useT(together);
  const { locale } = useTogetherLocale();
  return (
    <div className="flex h-[46px] items-center justify-center gap-2.5 px-4">
      <span className="flex ps-2">
        {participants.slice(0, 4).map((p) => (
          <span key={p.uid} className="-ms-2"><Face p={p} size={26} /></span>
        ))}
      </span>
      <span dir="ltr" className="text-[30px] font-black tabular-nums" style={{ letterSpacing: '-0.03em' }}>
        {formatNumber(totalKm, locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
      </span>
      <span className="text-[14px] font-extrabold text-sky-700">{t('chrome.together.km')}</span>
    </div>
  );
}

/** Layer 3 (board H-7): "אני מול נועה · קצב" with the two paces. */
export function TogetherRaceLayer({ name, mePaceSec, themPaceSec, metric = 'pace' }: { name: string; mePaceSec: number; themPaceSec: number; metric?: 'pace' | 'speed' }) {
  const t = useT(together);
  const { locale } = useTogetherLocale();
  const rate = (sec: number) => (metric === 'speed' ? (sec > 0 ? formatNumber(3600 / sec, locale, { maximumFractionDigits: 1, minimumFractionDigits: 1 }) : '--') : formatPace(sec) || '--:--');
  const what = t(metric === 'speed' ? 'chrome.label.speed' : 'chrome.label.pace');
  return (
    <div className="flex h-[46px] flex-col items-center justify-center px-4" role="status">
      <span className="text-[12.5px] font-extrabold text-slate-500">{t('chrome.layer.race', { name, what })}</span>
      <span dir="ltr" className="text-[22px] font-black leading-6 tabular-nums">
        {t('chrome.layer.versus', { me: rate(mePaceSec), them: rate(themPaceSec) })}
      </span>
    </div>
  );
}

