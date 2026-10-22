'use client';

import { Users, RefreshCw, Check } from 'lucide-react';
import type { SessionEnrichment } from '@/features/parks/core/hooks/useCommunityEnrichment';
import type { ProfileUser } from '../../UserProfileSheet';
import { sessionRowTimeLabel } from '../utils/park-detail-format';
import { useT } from '@/hooks/useT';
import { map as mapNs } from '@/messages/ns/map';

interface ParkSessionRowProps {
  ev: SessionEnrichment;
  v2: boolean;
  isJoining: boolean;
  alreadyJoined: boolean;
  /** Personal arrival published by this viewer — gets a "פרסמת" badge. */
  isOwnArrival: boolean;
  onJoin: (ev: SessionEnrichment) => void;
  onOpenProfile: (user: ProfileUser) => void;
}

/**
 * One "מתאמנים" row. Personal arrivals are individual "I'm heading here"
 * announcements — not joinable group sessions — so they get no Join CTA; the
 * publisher sees a "פרסמת" badge confirming their own arrival (also the
 * read-on-mount confirmation that survives refresh).
 */
export default function ParkSessionRow({ ev, v2, isJoining, alreadyJoined, isOwnArrival, onJoin, onOpenProfile }: ParkSessionRowProps) {
  const t = useT(mapNs);
  const timeLabel = sessionRowTimeLabel(ev.nextStartTime);
  const count = Math.max(1, ev.currentRegistrations ?? 0);

  return (
    <div
      className={v2 ? 'flex items-center gap-3 rounded-[16px] bg-white px-3 py-2.5 shadow-v2-ring' : 'flex items-center gap-2 py-1.5 px-2.5 bg-emerald-50/70 rounded-lg hover:bg-emerald-50 transition-colors'}
    >
      <span className={v2 ? 'min-w-[48px] text-[13px] font-extrabold tabular-nums text-v2-muted' : 'text-[11px] font-black text-emerald-700 min-w-[40px] text-center'} dir="ltr">{timeLabel}</span>
      <span className={v2 ? 'flex-1 truncate text-[14.5px] font-extrabold text-v2-ink' : 'flex-1 text-xs font-bold text-emerald-800 truncate'}>
        {ev.isRecurring ? t('parkDetail.session.group') : ev.eventLabel}
      </span>
      {ev.isRecurring && <RefreshCw size={10} className="text-emerald-400 flex-shrink-0" />}
      {!ev.isPersonalArrival && (
        <span className="text-[10px] text-emerald-600 font-bold flex-shrink-0">{count} <Users size={10} className="inline -mt-0.5" /></span>
      )}
      <div className="flex -space-x-1 rtl:space-x-reverse flex-shrink-0">
        {ev.avatars?.slice(0, 2).map((a, ai) => (
          <button key={`${ev.eventId}_av_${a.uid}_${ai}`} onClick={() => onOpenProfile({ uid: a.uid, name: a.name, photoURL: a.photoURL })} className="w-5 h-5 rounded-full border border-white bg-emerald-100 flex items-center justify-center text-[7px] font-black text-emerald-700 overflow-hidden active:scale-90">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {a.photoURL ? <img src={a.photoURL} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" /> : a.name.charAt(0)}
          </button>
        ))}
      </div>
      {ev.isPersonalArrival ? (
        isOwnArrival ? (
          <span className="flex-shrink-0 px-2.5 py-1 border border-emerald-500 text-emerald-600 rounded-md text-[10px] font-bold flex items-center gap-0.5">
            <Check size={10} />
            {t('parkDetail.session.published')}
          </span>
        ) : null
      ) : alreadyJoined ? (
        <span className="flex-shrink-0 px-2.5 py-1 border border-emerald-500 text-emerald-600 rounded-md text-[10px] font-bold flex items-center gap-0.5">
          <Check size={10} />
          {t('parkDetail.session.joined')}
        </span>
      ) : (
        <button
          onClick={() => onJoin(ev)}
          disabled={isJoining || ev.spotsLeft === 0}
          className="flex-shrink-0 px-2.5 py-1 bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-300 text-white rounded-md text-[10px] font-bold transition-colors"
        >
          {isJoining ? '...' : t('parkDetail.session.join')}
        </button>
      )}
    </div>
  );
}
