'use client';

/** The empty search screen (Main board): recents, situation shortcuts, recommended articles, Kelly. */
import { Clock, MapPin, Dumbbell, HelpCircle, CalendarDays, Route as RouteIcon, Users } from 'lucide-react';
import { BrandCard, BRAND_GRADIENT } from '@/components/ui/v2';
import SectionHead from './SectionHead';
import AskKellyRow from './AskKellyRow';
import ArticleCard from './cards/ArticleCard';
import type { Situation, SituationIcon } from '../core/situations';
import type { ArticleItem } from '@/lib/content-items/types';
import { useT } from '@/hooks/useT';
import { library } from '@/messages/ns/library';

const ICON: Record<SituationIcon, { Icon: typeof MapPin; bg: string; fg: string }> = {
  park: { Icon: MapPin, bg: '#ccfbf1', fg: '#04222b' },
  strength: { Icon: Dumbbell, bg: BRAND_GRADIENT, fg: '#04222b' },
  help: { Icon: HelpCircle, bg: '#e0f2fe', fg: '#007399' },
  event: { Icon: CalendarDays, bg: '#fff7ed', fg: '#c2410c' },
  route: { Icon: RouteIcon, bg: '#c7f3ee', fg: '#04222b' },
  group: { Icon: Users, bg: '#e0f2fe', fg: '#007399' },
};

interface Props {
  recents: string[];
  onRecent: (q: string) => void;
  onClearRecents: () => void;
  situations: Situation[];
  onSituation: (s: Situation) => void;
  articles: ArticleItem[];
  onArticle: (a: ArticleItem) => void;
  onAllArticles: () => void;
}

export default function EmptyState({ recents, onRecent, onClearRecents, situations, onSituation, articles, onArticle, onAllArticles }: Props) {
  const t = useT(library);
  return (
    <div className="flex flex-col gap-[18px]">
      {recents.length > 0 && (
        <section aria-labelledby="se-recents" className="flex flex-col gap-2">
          <SectionHead id="se-recents" tone="ink" title={t('search.empty.recents')} action={t('search.empty.clearRecents')} onAction={onClearRecents} />
          <div className="flex flex-wrap gap-1.5">
            {recents.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => onRecent(r)}
                className="flex h-8 items-center gap-1.5 rounded-full border border-[#e5e7eb] bg-white px-3 text-[14px] text-[#171717] active:scale-[0.97]"
              >
                <Clock size={13} className="text-[#9ca3af]" aria-hidden />{r}
              </button>
            ))}
          </div>
        </section>
      )}

      {situations.length > 0 && (
        <section aria-labelledby="se-situations" className="flex flex-col gap-2">
          <SectionHead id="se-situations" tone="ink" title={t('search.empty.situations')} />
          <div className="grid grid-cols-2 gap-2">
            {situations.map((s) => {
              const { Icon, bg, fg } = ICON[s.icon];
              return (
                <BrandCard key={s.id} as="button" radius={16} onClick={() => onSituation(s)} className="flex flex-col gap-1.5 p-3">
                  <span className="grid h-8 w-8 place-items-center rounded-[10px]" style={{ background: bg }} aria-hidden>
                    <Icon size={16} strokeWidth={2.2} style={{ color: fg }} />
                  </span>
                  <span className="text-[14px] font-bold text-[#171717]">{t(`search.situation.${s.id}.title`)}</span>
                  <span className="text-[12px] text-[#6b7280]">{t(`search.situation.${s.id}.sub`, { n: s.n ?? 0 })}</span>
                </BrandCard>
              );
            })}
          </div>
        </section>
      )}

      {articles.length > 0 && (
        <section aria-labelledby="se-articles" className="flex flex-col gap-2">
          <SectionHead id="se-articles" tone="ink" title={t('search.empty.articles')} action={t('search.empty.allArticles')} onAction={onAllArticles} />
          <div className="flex gap-2.5">
            {articles.slice(0, 2).map((a) => <ArticleCard key={a.id} article={a} variant="tile" onOpen={() => onArticle(a)} />)}
          </div>
        </section>
      )}

      <AskKellyRow />
    </div>
  );
}
