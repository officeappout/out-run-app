'use client';

import { BrandCard, BRAND_GRADIENT } from '@/components/ui/v2';
import Highlight from '../Highlight';
import { formatKm } from './PlaceRow';
import { EVENT_CATEGORY_LABEL } from '../../providers/community';
import type { CommunityEvent } from '@/types/community.types';

const MONTHS = ['ינו׳', 'פבר׳', 'מרץ', 'אפר׳', 'מאי', 'יוני', 'יולי', 'אוג׳', 'ספט׳', 'אוק׳', 'נוב׳', 'דצמ׳'];

function dateParts(d: Date | string | undefined): { month: string; day: string } | null {
  const t = d instanceof Date ? d : d ? new Date(d) : null;
  if (!t || !Number.isFinite(t.getTime())) return null;
  return { month: MONTHS[t.getMonth()], day: String(t.getDate()) };
}

interface Props {
  event: CommunityEvent;
  distanceKm: number | null;
  query?: string;
  joined: boolean;
  joining: boolean;
  onOpen: () => void;
  onJoin: () => void;
}

/** Event card (Events board): date tile, category pill, name, time · place · distance, "אני בא". */
export default function EventResultCard({ event, distanceKm, query, joined, joining, onOpen, onJoin }: Props) {
  const dp = dateParts(event.date as unknown as Date);
  const meta = [event.startTime, event.location?.address, formatKm(distanceKm) ? `${formatKm(distanceKm)} ממך` : null].filter(Boolean).join(' · ');
  const spots = typeof event.maxParticipants === 'number' ? Math.max(0, event.maxParticipants - (event.currentRegistrations ?? 0)) : null;
  return (
    <BrandCard as="article" className="flex items-center gap-3 p-3">
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-start" aria-label={`פרטי האירוע ${event.name}`}>
        <span className="flex h-[58px] w-[52px] shrink-0 flex-col items-center justify-center rounded-2xl text-[#04222b]" style={{ background: BRAND_GRADIENT }} aria-hidden>
          <span className="text-[11px] font-bold">{dp?.month ?? ''}</span>
          <span className="text-[20px] font-bold leading-none">{dp?.day ?? '–'}</span>
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="w-fit rounded-full bg-[#fff7ed] px-2 py-0.5 text-[11px] font-bold text-[#c2410c]">{EVENT_CATEGORY_LABEL[event.category] ?? 'אירוע'}</span>
          <span className="truncate text-[15px] font-bold text-[#171717]"><Highlight text={event.name} query={query} /></span>
          <span className="truncate text-[12px] text-[#6b7280]">{[meta, spots != null ? `${spots} מקומות` : null].filter(Boolean).join(' · ')}</span>
        </span>
      </button>
      <button
        type="button"
        onClick={() => (joined ? onOpen() : onJoin())}
        disabled={joining}
        aria-label={joined ? `${event.name}: נרשמת` : `להירשם ל${event.name}`}
        className="h-[34px] shrink-0 rounded-full px-3 text-[13px] font-bold disabled:opacity-60 active:scale-[0.97]"
        style={joined ? { background: '#f0faff', color: '#007399' } : { background: BRAND_GRADIENT, color: '#04222b' }}
      >
        {joining ? '…' : joined ? 'נרשמת ✓' : 'אני בא'}
      </button>
    </BrandCard>
  );
}
