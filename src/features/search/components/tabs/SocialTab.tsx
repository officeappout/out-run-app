'use client';

/**
 * "אנשים וקבוצות" (Social board): השותפים שלי · גלה קבוצות · אנשים. Same sources as today's
 * groups / people tabs (useMyGroups / useArenaData, getUsersByUids, searchUsersByName).
 */
import { useEffect, useMemo, useState } from 'react';
import { Users } from 'lucide-react';
import { useSocialStore } from '@/features/social/store/useSocialStore';
import { getUsersByUids, type UserSearchResult } from '@/features/social/services/user-search.service';
import HitGroupView, { type HitViewDeps } from '../results/HitGroupView';
import PersonCard from '../cards/PersonCard';
import { RowSkeleton } from '../Skeletons';
import { groupToHit } from '../../providers/community';
import { scoreText } from '../../core/text';
import type { SearchHit } from '../../core/types';
import type { SearchContext } from '../../hooks/useSearchContext';

type Sub = 'partners' | 'groups' | 'people';
const SUBS: Array<{ id: Sub; label: string }> = [
  { id: 'partners', label: 'השותפים שלי' },
  { id: 'groups', label: 'גלה קבוצות' },
  { id: 'people', label: 'אנשים' },
];

export default function SocialTab({ query, hits, loading, ctx, deps }: { query: string; hits: SearchHit[]; loading: boolean; ctx: SearchContext; deps: HitViewDeps }) {
  const [sub, setSub] = useState<Sub>('groups');
  const following = useSocialStore((s) => s.following);
  const socialLoaded = useSocialStore((s) => s.isLoaded);
  const loadConnections = useSocialStore((s) => s.loadConnections);
  const [partners, setPartners] = useState<UserSearchResult[] | null>(null);

  useEffect(() => {
    if (ctx.uid && !socialLoaded) loadConnections(ctx.uid);
  }, [ctx.uid, socialLoaded, loadConnections]);

  useEffect(() => {
    if (sub !== 'partners' || !socialLoaded) return;
    if (!following.length) { setPartners([]); return; }
    let alive = true;
    getUsersByUids(following, ctx.ageGroup).then((u) => alive && setPartners(u)).catch(() => alive && setPartners([]));
    return () => { alive = false; };
  }, [sub, socialLoaded, following, ctx.ageGroup]);

  const groupHits = useMemo(() => {
    if (query) return hits.filter((h) => h.kind === 'group');
    const all = [...ctx.myGroups, ...ctx.groups.filter((g) => !ctx.myGroups.some((m) => m.id === g.id))];
    return all.map((g) => groupToHit(g, 1, ctx.pos)).sort((a, b) => (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9));
  }, [query, hits, ctx.groups, ctx.myGroups, ctx.pos]);
  const peopleHits = useMemo(() => hits.filter((h) => h.kind === 'person'), [hits]);
  const filteredPartners = useMemo(
    () => (partners && query ? partners.filter((p) => scoreText(p.name, query) > 0) : partners),
    [partners, query],
  );

  return (
    <div className="flex flex-col gap-3">
      <div role="tablist" aria-label="אנשים וקבוצות" className="grid grid-cols-3 gap-1 rounded-xl bg-[#eef2f6] p-1">
        {SUBS.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={sub === s.id}
            onClick={() => setSub(s.id)}
            className={`h-[34px] rounded-[9px] text-[13px] font-bold ${sub === s.id ? 'bg-white text-[#04222b] shadow-[0_2px_10px_rgba(0,0,0,0.06)]' : 'text-[#6b7280]'}`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {sub === 'groups' && (
        groupHits.length ? <HitGroupView category="social" hits={groupHits} query={query} deps={deps} />
          : <Empty text={query ? 'לא נמצאו קבוצות' : ctx.hasCityAccess ? 'עוד אין קבוצות בעיר שלך' : 'קבוצות יופיעו כאן כשיהיו בעיר שלך'} />
      )}

      {sub === 'people' && (
        query.length < 2 ? <Empty text="הקלידו שם כדי למצוא אנשים" />
          : loading && !peopleHits.length ? <div className="grid grid-cols-2 gap-2.5"><RowSkeleton /><RowSkeleton /></div>
            : peopleHits.length ? <HitGroupView category="social" hits={peopleHits} query={query} deps={deps} />
              : <Empty text="לא נמצאו אנשים בשם הזה" />
      )}

      {sub === 'partners' && (
        filteredPartners === null ? <div className="flex flex-col gap-2"><RowSkeleton /><RowSkeleton /></div>
          : filteredPartners.length ? (
            <div className="grid grid-cols-2 gap-2.5">{filteredPartners.map((p) => <PersonCard key={p.uid} person={p} query={query} />)}</div>
          ) : <Empty text="עוד אין לך שותפים. אפשר למצוא אותם ב״אנשים״" />
      )}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center">
      <Users size={22} className="text-[#007399]" aria-hidden />
      <p className="m-0 text-[14px] text-[#6b7280]">{text}</p>
    </div>
  );
}
