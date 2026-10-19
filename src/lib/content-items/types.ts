/**
 * site_content — ONE source for the FAQ, articles and in-app help, shared by the app (search,
 * the help hub, Kelly's get_app_help) and the marketing website (/faq, /learn). Pure types.
 *
 *   site_content/{id}
 *     type      'faq' | 'help' (q + a[])  ·  'article' (title, excerpt, body blocks, cover …)
 *     slug      stable per item (article slug, help entry id, faq hash) — what links use
 *     locale    'he' | 'en'
 *     audience  'users' | 'authorities'
 *     topic     help chapter id / faq group / article category
 *     tags      words a user might search with
 *     status    'draft' | 'published' — only published items are ever served publicly
 *     updatedAt server timestamp · updatedBy 'seed-content-items' or the admin's uid
 *     seedHash  set by the seed only (what it last wrote; see seed-plan.ts)
 *
 * Writes: Admin SDK only (/api/admin/content/**, the seed). Reads: published items through the
 * public cached GET /api/content (and firestore.rules allows a direct read of a published doc).
 */
export const CONTENT_ITEMS_COLLECTION = 'site_content';
export const CONTENT_SUGGESTIONS_COLLECTION = 'content_suggestions';
/** updatedBy of every item the seed wrote and nobody edited since. */
export const SEED_ACTOR = 'seed-content-items';

export const CONTENT_TYPES = ['faq', 'help', 'article'] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];
export const CONTENT_LOCALES = ['he', 'en'] as const;
export type ContentLocale = (typeof CONTENT_LOCALES)[number];
export type ContentAudience = 'users' | 'authorities';
export type ContentStatus = 'draft' | 'published';

export const ARTICLE_CATEGORIES = ['strength', 'running', 'nutrition', 'hybrid'] as const;
export type ArticleCategory = (typeof ARTICLE_CATEGORIES)[number];
export const ARTICLE_CATEGORY_LABELS: Record<ArticleCategory, string> = {
  strength: 'כוח',
  running: 'ריצה',
  nutrition: 'תזונה',
  hybrid: 'משולב',
};

/** Same blocks as the website's content/articles.ts. */
export type ArticleBlock =
  | { type: 'p'; text: string }
  | { type: 'h2'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'tip'; text: string }
  | { type: 'exercises'; ids: string[] };

export type ArticleCover = { video: string } | { illustration: 'map' | 'nutrition' };

interface ContentItemBase {
  id: string;
  slug: string;
  locale: ContentLocale;
  audience: ContentAudience;
  topic: string;
  tags: string[];
  status: ContentStatus;
  /** Sort order inside its group (faq order on the site, help order in a chapter). */
  order: number;
  /** ms since epoch (serialized from the server timestamp); 0 when unknown. */
  updatedAt: number;
  updatedBy: string;
  seedHash?: string;
}

export interface QaItem extends ContentItemBase {
  type: 'faq' | 'help';
  q: string;
  a: string[];
}

export interface ArticleItem extends ContentItemBase {
  type: 'article';
  title: string;
  excerpt: string;
  body: ArticleBlock[];
  category: ArticleCategory;
  cover: ArticleCover;
  readMin: number;
  /** ISO date (yyyy-mm-dd). */
  date: string;
  author: string;
}

export type ContentItem = QaItem | ArticleItem;

/** What the public API serves: no editor bookkeeping. */
export type PublicContentItem = Omit<QaItem, 'updatedBy' | 'seedHash'> | Omit<ArticleItem, 'updatedBy' | 'seedHash'>;

export function isQaItem(i: { type: string }): i is QaItem {
  return i.type === 'faq' || i.type === 'help';
}
export function isArticleItem(i: { type: string }): i is ArticleItem {
  return i.type === 'article';
}

export interface ContentSuggestion {
  id: string;
  uid: string;
  query: string;
  category: string;
  status: 'new' | 'handled';
  createdAt: number;
}
