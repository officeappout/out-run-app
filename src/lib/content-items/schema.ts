/**
 * site_content — input validation (admin editor + seed) and the field-guarded doc reader. Pure.
 */
import { z } from 'zod';
import {
  ARTICLE_CATEGORIES,
  CONTENT_LOCALES,
  type ArticleBlock,
  type ArticleCategory,
  type ContentItem,
  type PublicContentItem,
} from './types';

const text = (max: number) => z.string().trim().min(1).max(max);
const Slug = z.string().trim().regex(/^[a-z0-9][a-z0-9_-]{0,79}$/);

export const BlockSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('p'), text: text(4000) }),
  z.object({ type: z.literal('h2'), text: text(200) }),
  z.object({ type: z.literal('list'), items: z.array(text(600)).min(1).max(30) }),
  z.object({ type: z.literal('tip'), text: text(1000) }),
  z.object({ type: z.literal('exercises'), ids: z.array(z.string().trim().regex(/^[A-Za-z0-9_-]{1,64}$/)).min(1).max(12) }),
]);

const Base = {
  slug: Slug,
  locale: z.enum(CONTENT_LOCALES),
  audience: z.enum(['users', 'authorities']),
  topic: z.string().trim().max(40).default('general'),
  tags: z.array(z.string().trim().min(1).max(60)).max(40).default([]),
  status: z.enum(['draft', 'published']),
  order: z.number().int().min(0).max(100000).default(0),
};

export const QaInputSchema = z.object({
  ...Base,
  type: z.enum(['faq', 'help']),
  q: text(300),
  a: z.array(text(3000)).min(1).max(10),
}).strict();

export const ArticleInputSchema = z.object({
  ...Base,
  type: z.literal('article'),
  title: text(200),
  excerpt: text(600),
  body: z.array(BlockSchema).min(1).max(120),
  category: z.enum(ARTICLE_CATEGORIES),
  cover: z.union([
    z.object({ video: z.string().trim().regex(/^[A-Za-z0-9-]{8,64}$/) }).strict(),
    z.object({ illustration: z.enum(['map', 'nutrition']) }).strict(),
  ]),
  readMin: z.number().int().min(1).max(60),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  author: text(80),
}).strict();

export const ContentInputSchema = z.union([QaInputSchema, ArticleInputSchema]);
export type ContentInput = z.infer<typeof ContentInputSchema>;

export const ContentIdSchema = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,119}$/);

const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d);
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

function millis(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (v && typeof v === 'object') {
    const o = v as { toMillis?: () => number; _seconds?: number; seconds?: number };
    if (typeof o.toMillis === 'function') return o.toMillis();
    const s = o._seconds ?? o.seconds;
    if (typeof s === 'number') return s * 1000;
  }
  return 0;
}

/** A stored doc → ContentItem, never trusting a field to exist. Unknown type → null. */
export function contentItemFromDoc(id: string, data: Record<string, unknown> | undefined): ContentItem | null {
  if (!data) return null;
  const base = {
    id,
    slug: str(data.slug, id),
    locale: data.locale === 'en' ? ('en' as const) : ('he' as const),
    audience: data.audience === 'authorities' ? ('authorities' as const) : ('users' as const),
    topic: str(data.topic, 'general'),
    tags: strs(data.tags),
    status: data.status === 'published' ? ('published' as const) : ('draft' as const),
    order: typeof data.order === 'number' ? data.order : 0,
    updatedAt: millis(data.updatedAt),
    updatedBy: str(data.updatedBy),
    ...(typeof data.seedHash === 'string' ? { seedHash: data.seedHash } : {}),
  };
  if (data.type === 'faq' || data.type === 'help') {
    return { ...base, type: data.type, q: str(data.q), a: strs(data.a) };
  }
  if (data.type === 'article') {
    const parsedBody = z.array(BlockSchema).safeParse(data.body);
    const cover = data.cover && typeof data.cover === 'object' ? (data.cover as Record<string, unknown>) : {};
    const cat = str(data.category);
    const category: ArticleCategory = (ARTICLE_CATEGORIES as readonly string[]).includes(cat) ? (cat as ArticleCategory) : 'strength';
    return {
      ...base,
      type: 'article',
      title: str(data.title),
      excerpt: str(data.excerpt),
      body: parsedBody.success ? (parsedBody.data as ArticleBlock[]) : [],
      category,
      cover: typeof cover.video === 'string' ? { video: cover.video } : { illustration: cover.illustration === 'map' ? 'map' : 'nutrition' },
      readMin: typeof data.readMin === 'number' ? data.readMin : 3,
      date: str(data.date),
      author: str(data.author, 'צוות OUT'),
    };
  }
  return null;
}

/** Strip the editor bookkeeping before serving publicly. */
export function toPublicItem(item: ContentItem): PublicContentItem {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { updatedBy, seedHash, ...rest } = item;
  return rest;
}
