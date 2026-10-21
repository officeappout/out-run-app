'use client';

/** "מאמרים": category chips (as on the website) + the articles; filtered by the query when typed. */
import { useMemo, useState } from 'react';
import ArticleCard from '../cards/ArticleCard';
import { RowSkeleton } from '../Skeletons';
import { rankArticles } from '../../providers/content';
import { ARTICLE_CATEGORIES, ARTICLE_CATEGORY_LABELS, type ArticleCategory, type ArticleItem } from '@/lib/content-items/types';
import { useT } from '@/hooks/useT';
import { library } from '@/messages/ns/library';

export default function ArticlesTab({ query, articles, loading, onOpen }: { query: string; articles: ArticleItem[]; loading: boolean; onOpen: (a: ArticleItem) => void }) {
  const t = useT(library);
  const [cat, setCat] = useState<ArticleCategory | null>(null);
  const cats = ARTICLE_CATEGORIES.filter((c) => articles.some((a) => a.category === c));
  const list = useMemo(() => {
    const base = query ? rankArticles(articles, query).map((h) => h.article) : articles;
    return base.filter((a) => !cat || a.category === cat);
  }, [articles, query, cat]);

  if (loading && !articles.length) return <div className="flex flex-col gap-3"><RowSkeleton /><RowSkeleton /></div>;
  return (
    <div className="flex flex-col gap-3.5">
      {cats.length > 1 && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('search.articles.categoryLabel')}>
          {[null, ...cats].map((c) => {
            const on = cat === c;
            return (
              <button
                key={c ?? 'all'}
                type="button"
                aria-pressed={on}
                onClick={() => setCat(c)}
                className="h-8 rounded-full px-3.5 text-[13px] font-extrabold active:scale-[0.97]"
                style={on ? { background: '#0e1419', color: '#ffffff' } : { background: '#ffffff', color: '#334155', border: '1px solid #e2e8f0' }}
              >
                {c ? ARTICLE_CATEGORY_LABELS[c] : t('search.articles.all')}
              </button>
            );
          })}
        </div>
      )}
      {list.length ? list.map((a) => <ArticleCard key={a.id} article={a} query={query} onOpen={() => onOpen(a)} />)
        : <p className="py-10 text-center text-[14px] text-[#6b7280]">{articles.length ? t('search.articles.none') : t('search.articles.soon')}</p>}
    </div>
  );
}
