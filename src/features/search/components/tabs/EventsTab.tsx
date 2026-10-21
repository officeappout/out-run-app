'use client';

/** "אירועים" (Events board): השבוע / מרוצים / ימי כושר / סדנאות / מפגשי קהילה + the list. */
import { useMemo, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { BRAND_GRADIENT } from '@/components/ui/v2';
import HitGroupView, { type HitViewDeps } from '../results/HitGroupView';
import { eventToHit, upcomingEvents } from '../../providers/community';
import { countEventsThisWeek } from '../../core/situations';
import type { EventHit, SearchHit } from '../../core/types';
import type { SearchContext } from '../../hooks/useSearchContext';
import type { CommunityEvent } from '@/types/community.types';
import { useT } from '@/hooks/useT';
import { library } from '@/messages/ns/library';

type Filter = 'all' | 'week' | 'race' | 'fitness_day' | 'workshop' | 'community_meetup';
const FILTERS = [
  { id: 'all', labelKey: 'search.events.filter.all' },
  { id: 'week', labelKey: 'search.events.filter.week' },
  { id: 'race', labelKey: 'search.events.filter.race' },
  { id: 'fitness_day', labelKey: 'search.events.filter.fitnessDay' },
  { id: 'workshop', labelKey: 'search.events.filter.workshop' },
  { id: 'community_meetup', labelKey: 'search.events.filter.communityMeetup' },
] as const satisfies ReadonlyArray<{ id: Filter; labelKey: string }>;

const matches = (e: CommunityEvent, f: Filter) =>
  f === 'all' ? true : f === 'week' ? countEventsThisWeek([e.date as unknown as Date]) === 1 : e.category === f;

export default function EventsTab({ query, hits, ctx, deps }: { query: string; hits: SearchHit[]; ctx: SearchContext; deps: HitViewDeps }) {
  const t = useT(library);
  const [filter, setFilter] = useState<Filter>('all');
  const list = useMemo<EventHit[]>(() => {
    const base = query ? hits.filter((h): h is EventHit => h.kind === 'event') : upcomingEvents(ctx.events).map((e) => eventToHit(e, 1, ctx.pos));
    return base.filter((h) => matches(h.event, filter));
  }, [query, hits, ctx.events, ctx.pos, filter]);

  return (
    <div className="flex flex-col gap-3">
      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label={t('search.events.filterLabel')}>
        {FILTERS.map((f) => {
          const on = filter === f.id;
          return (
            <button
              key={f.id}
              type="button"
              aria-pressed={on}
              onClick={() => setFilter(f.id)}
              className="h-8 shrink-0 whitespace-nowrap rounded-full px-3 text-[13px] font-bold active:scale-[0.97]"
              style={on ? { background: '#04222b', color: '#ffffff' } : { background: '#ffffff', color: '#4b5563', border: '1px solid #e5e7eb' }}
            >
              {t(f.labelKey)}
            </button>
          );
        })}
      </div>
      {list.length ? (
        <HitGroupView category="events" hits={list} query={query} deps={deps} />
      ) : (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <span className="grid h-11 w-11 place-items-center rounded-2xl" style={{ background: BRAND_GRADIENT }} aria-hidden>
            <CalendarDays size={20} className="text-[#04222b]" />
          </span>
          <p className="m-0 text-[14px] text-[#6b7280]">{query ? t('search.events.none') : t('search.events.noneUpcoming')}</p>
        </div>
      )}
    </div>
  );
}
