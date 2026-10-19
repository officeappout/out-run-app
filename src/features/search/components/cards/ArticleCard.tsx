'use client';

import { Clock } from 'lucide-react';
import Highlight from '../Highlight';
import ArticleCover from './ArticleCover';
import { ARTICLE_CATEGORY_LABELS, type ArticleCategory, type ArticleItem } from '@/lib/content-items/types';

/** Same category colours as the website (Articles.module.css). */
export const CATEGORY_PILL: Record<ArticleCategory, { bg: string; fg: string }> = {
  strength: { bg: '#e0f7fd', fg: '#0369a1' },
  running: { bg: '#dcfce7', fg: '#047857' },
  nutrition: { bg: '#fef3c7', fg: '#a16207' },
  hybrid: { bg: '#ede9fe', fg: '#6d28d9' },
};

export function ArticleMeta({ article }: { article: ArticleItem }) {
  const pill = CATEGORY_PILL[article.category] ?? CATEGORY_PILL.strength;
  return (
    <span className="flex items-center gap-2">
      <span className="flex h-[22px] items-center rounded-full px-2.5 text-[11px] font-bold" style={{ background: pill.bg, color: pill.fg }}>
        {ARTICLE_CATEGORY_LABELS[article.category]}
      </span>
      <span className="flex items-center gap-1 text-[12px] font-bold text-[#64748b]">
        <Clock size={12} strokeWidth={2.5} aria-hidden />{article.readMin} דק׳ קריאה
      </span>
    </span>
  );
}

/**
 * Article card in the website's style: 16:10 rounded cover, category pill + read time, title
 * weight 900. `row` = cover beside the text (results), `tile` = cover on top (recommended).
 */
export default function ArticleCard({ article, query, variant = 'row', onOpen }: { article: ArticleItem; query?: string; variant?: 'row' | 'tile'; onOpen: () => void }) {
  if (variant === 'tile') {
    return (
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl bg-white text-start shadow-[0_4px_20px_rgba(91,194,242,0.08)] active:scale-[0.98]">
        <span className="relative block aspect-[16/10] w-full overflow-hidden"><ArticleCover cover={article.cover} /></span>
        <span className="flex flex-col gap-1 p-2.5">
          <ArticleMeta article={article} />
          <span className="line-clamp-2 text-[13px] font-black leading-[18px] text-[#171717]">{article.title}</span>
        </span>
      </button>
    );
  }
  return (
    <button type="button" onClick={onOpen} className="flex items-start gap-3 text-start active:opacity-80">
      <span className="relative block aspect-[16/10] w-[132px] shrink-0 overflow-hidden rounded-2xl"><ArticleCover cover={article.cover} /></span>
      <span className="flex min-w-0 flex-col gap-1.5 pt-0.5">
        <ArticleMeta article={article} />
        <span className="line-clamp-2 text-[15px] font-black leading-[19px] text-[#171717]"><Highlight text={article.title} query={query} /></span>
      </span>
    </button>
  );
}
