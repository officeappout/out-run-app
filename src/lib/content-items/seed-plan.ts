/**
 * Seed mapping for site_content — website FAQ + articles + the app-help entries → items with
 * STABLE ids, and the plan of what to write. Pure (scripts/seed-content-items.ts does the I/O).
 *
 * Ids:  faq-<audience>-<locale>-<hash of the question>   (website FAQ has no ids)
 *       article-<slug>-<locale>
 *       help-<entry id>
 *
 * Idempotent and safe against admin edits (the seed-hybrid-slot-flags lesson, CLAUDE.md):
 *   missing                          → create
 *   updatedBy === SEED_ACTOR, same hash → unchanged (nothing written)
 *   updatedBy === SEED_ACTOR, new hash  → update (the source text changed; nobody edited it)
 *   updatedBy is anything else         → skip — an admin edited it in /admin/content; never overwrite
 */
import { SEED_ACTOR, type ArticleBlock, type ArticleCategory, type ArticleCover, type ContentLocale } from './types';
import type { ContentInput } from './schema';

/** FNV-1a 32-bit, base36 — short, deterministic, no crypto dependency. */
export function stableHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

export type SeedDoc = ContentInput & { id: string; seedHash: string };

function withHash(id: string, input: ContentInput): SeedDoc {
  return { ...input, id, seedHash: stableHash(JSON.stringify(input)) };
}

// ── Source shapes (structural copies of the website / app types) ────────────
export interface WebsiteFaqGroup {
  id: 'users' | 'authorities';
  label: string;
  items: Array<{ q: string; a: string[] }>;
}
export interface WebsiteArticle {
  slug: string;
  category: ArticleCategory;
  title: string;
  excerpt: string;
  cover: ArticleCover;
  readMin: number;
  date: string;
  author: string;
  draft?: boolean;
  body: ArticleBlock[];
}
export interface HelpSource {
  id: string;
  title: string;
  keywords: readonly string[];
  answer: string;
}

const normQ = (q: string) => q.normalize('NFC').replace(/\s+/g, ' ').trim();

export function faqId(audience: string, locale: string, q: string): string {
  return `faq-${audience}-${locale}-${stableHash(normQ(q))}`;
}

export function faqToSeedDocs(faq: Partial<Record<ContentLocale, WebsiteFaqGroup[]>>): SeedDoc[] {
  const out: SeedDoc[] = [];
  for (const locale of Object.keys(faq) as ContentLocale[]) {
    for (const group of faq[locale] ?? []) {
      group.items.forEach((item, i) => {
        const id = faqId(group.id, locale, item.q);
        out.push(withHash(id, {
          type: 'faq',
          slug: id.slice(4),
          locale,
          audience: group.id,
          topic: group.id,
          tags: [],
          status: 'published',
          order: i,
          q: normQ(item.q),
          a: item.a,
        }));
      });
    }
  }
  return out;
}

export function articlesToSeedDocs(articles: readonly WebsiteArticle[], locale: ContentLocale = 'he'): SeedDoc[] {
  return articles.map((a, i) =>
    withHash(`article-${a.slug}-${locale}`, {
      type: 'article',
      slug: a.slug,
      locale,
      audience: 'users',
      topic: a.category,
      tags: [],
      // keep the website's draft flags: a draft stays a draft until someone publishes it
      status: a.draft ? 'draft' : 'published',
      order: i,
      title: a.title,
      excerpt: a.excerpt,
      body: a.body,
      category: a.category,
      cover: a.cover,
      readMin: a.readMin,
      date: a.date,
      author: a.author,
    }),
  );
}

export function helpToSeedDocs(entries: readonly HelpSource[], topicOf: (id: string) => string): SeedDoc[] {
  return entries.map((e, i) =>
    withHash(`help-${e.id.toLowerCase().replace(/[^a-z0-9_-]/g, '-')}`, {
      type: 'help',
      slug: e.id,
      locale: 'he',
      audience: 'users',
      topic: topicOf(e.id),
      tags: [...e.keywords],
      status: 'published',
      order: i,
      q: e.title,
      a: e.answer.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean),
    }),
  );
}

export interface ExistingMarker {
  updatedBy?: string;
  seedHash?: string;
}

export interface SeedPlan {
  create: SeedDoc[];
  update: SeedDoc[];
  unchanged: string[];
  /** Edited in the admin since the seed wrote them — never touched. */
  skippedEdited: string[];
}

export function planSeed(desired: readonly SeedDoc[], existing: ReadonlyMap<string, ExistingMarker>): SeedPlan {
  const plan: SeedPlan = { create: [], update: [], unchanged: [], skippedEdited: [] };
  const seen = new Set<string>();
  for (const d of desired) {
    if (seen.has(d.id)) continue; // duplicate question in the source: first one wins
    seen.add(d.id);
    const cur = existing.get(d.id);
    if (!cur) plan.create.push(d);
    else if (cur.updatedBy !== SEED_ACTOR) plan.skippedEdited.push(d.id);
    else if (cur.seedHash === d.seedHash) plan.unchanged.push(d.id);
    else plan.update.push(d);
  }
  return plan;
}
