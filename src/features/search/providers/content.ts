/**
 * Articles / FAQ / help provider — site_content through the cached public API, help through the
 * one help loader (site_content, or the code entries as fallback). Ranking is pure.
 */
import { fetchPublishedContent } from '@/lib/content-items/client';
import { isArticleItem, isQaItem, type ArticleItem, type PublicContentItem } from '@/lib/content-items/types';
import { loadHelpEntries } from '@/lib/app-help/loader';
import type { HelpQA } from '@/lib/app-help/types';
import { scoreFields } from '../core/text';
import type { ArticleHit, QaHit } from '../core/types';

export interface ContentCorpus {
  articles: ArticleItem[];
  faq: QaHitSource[];
  help: QaHitSource[];
}
export interface QaHitSource { id: string; q: string; a: string[]; tags: string[]; topic: string }

const blockText = (a: ArticleItem) =>
  a.body.map((b) => (b.type === 'list' ? b.items.join(' ') : b.type === 'exercises' ? '' : b.text)).join(' ');

export function rankArticles(articles: readonly ArticleItem[], query: string): ArticleHit[] {
  return articles
    .map((a) => ({ a, s: scoreFields([[a.title, 1], [a.tags.join(' '), 0.8], [a.excerpt, 0.6], [blockText(a), 0.35]], query) }))
    .filter((x) => x.s > 0)
    .map(({ a, s }) => ({ kind: 'article' as const, key: `article:${a.id}`, title: a.title, subtitle: a.excerpt, score: s, article: a }))
    .sort((x, y) => y.score - x.score);
}

export function rankQa(items: readonly QaHitSource[], query: string, kind: 'faq' | 'help'): QaHit[] {
  return items
    .map((i) => ({ i, s: scoreFields([[i.q, 1], [i.tags.join(' '), 0.8], [i.a.join(' '), 0.35]], query) }))
    .filter((x) => x.s > 0)
    .map(({ i, s }) => ({ kind, key: `${kind}:${i.id}`, title: i.q, score: s, id: i.id, q: i.q, a: i.a, topic: i.topic }))
    .sort((x, y) => y.score - x.score);
}

const helpSource = (h: HelpQA): QaHitSource => ({ id: h.id, q: h.q, a: h.a, tags: h.tags, topic: h.topic });

export function splitContent(items: readonly PublicContentItem[]): { articles: ArticleItem[]; faq: QaHitSource[] } {
  const articles = items.filter(isArticleItem).map((a) => ({ ...a, updatedBy: '' }) as ArticleItem)
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const faq = items.filter(isQaItem).filter((i) => i.type === 'faq' && i.audience === 'users')
    .map((i) => ({ id: i.id, q: i.q, a: i.a, tags: i.tags, topic: i.topic }));
  return { articles, faq };
}

let corpusPromise: Promise<ContentCorpus> | null = null;
let corpusAt = 0;

/** Everything the content chips need, cached for 5 minutes. Never throws. */
export function loadContentCorpus(): Promise<ContentCorpus> {
  if (corpusPromise && Date.now() - corpusAt < 5 * 60_000) return corpusPromise;
  corpusAt = Date.now();
  corpusPromise = (async () => {
    const [articles, faq, help] = await Promise.all([
      fetchPublishedContent('article', 'he'),
      fetchPublishedContent('faq', 'he'),
      loadHelpEntries().catch(() => [] as HelpQA[]),
    ]);
    const split = splitContent([...(articles ?? []), ...(faq ?? [])]);
    return { ...split, help: help.filter((h) => h.audience === 'users').map(helpSource) };
  })();
  return corpusPromise;
}

export async function searchContent(query: string): Promise<{ articles: ArticleHit[]; qa: QaHit[] }> {
  const c = await loadContentCorpus();
  return { articles: rankArticles(c.articles, query), qa: [...rankQa(c.help, query, 'help'), ...rankQa(c.faq, query, 'faq')] };
}
