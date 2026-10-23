/**
 * content-resolve — pure name resolution for the admin assistant's route / park tools.
 * One named record (an official route, a curated route or a park) from a free-text query:
 *   exact doc id → exact normalized name → a UNIQUE partial name match; several hits →
 *   up to 5 candidates, never a guess. Same normalization as the authority resolver
 *   (prefix / niqqud / quotes / spaces stripped, with-or-without a leading ה).
 */
import { normalizeAuthorityName } from '@/lib/routes-nationwide/admin-match';

export const CONTENT_CANDIDATES_MAX = 5;
/** A query that merely CONTAINS a (short) record name is too weak a match: "פארק" in "פארק הירקון". */
export const MIN_REVERSE_CONTAINMENT_LEN = 6;

export type ContentCollection = 'official_routes' | 'curated_routes' | 'parks';

export interface ContentRow {
  id: string;
  collection: ContentCollection;
  name: string;
  authorityId: string | null;
  city: string | null;
  /** short status label for the candidate list (published / pending / …) */
  status: string;
}

export type ContentResolution =
  | { kind: 'resolved'; row: ContentRow; matchedBy: 'id' | 'name' | 'partial_name' }
  | { kind: 'ambiguous'; candidates: ContentRow[] }
  | { kind: 'none' };

function keysOf(s: string): string[] {
  const k = normalizeAuthorityName(s);
  if (!k) return [];
  return [k, k.startsWith('ה') ? k.slice(1) : `ה${k}`].filter(Boolean);
}

export function resolveContentQuery(query: string, rows: ContentRow[]): ContentResolution {
  const q = query.trim();
  if (!q) return { kind: 'none' };
  const byId = rows.filter((r) => r.id === q);
  if (byId.length === 1) return { kind: 'resolved', row: byId[0], matchedBy: 'id' };
  if (byId.length > 1) return { kind: 'ambiguous', candidates: byId.slice(0, CONTENT_CANDIDATES_MAX) };

  const qKeys = keysOf(q);
  if (!qKeys.length) return { kind: 'none' };
  const exact = rows.filter((r) => keysOf(r.name).some((k) => qKeys.includes(k)));
  if (exact.length === 1) return { kind: 'resolved', row: exact[0], matchedBy: 'name' };
  if (exact.length > 1) return { kind: 'ambiguous', candidates: exact.slice(0, CONTENT_CANDIDATES_MAX) };

  const qk = qKeys[0];
  if (qk.length < 2) return { kind: 'none' };
  // the record name contains the query ("מתחם מזרחי" ⊂ "לולאת מתחם מזרחי") — the safer direction
  const forward = rows.filter((r) => {
    const k = normalizeAuthorityName(r.name);
    return k.length >= 2 && k.includes(qk);
  });
  const pick = forward.length
    ? forward
    : rows.filter((r) => {
        const k = normalizeAuthorityName(r.name);
        return k.length >= MIN_REVERSE_CONTAINMENT_LEN && qk.includes(k);
      });
  if (pick.length === 1) return { kind: 'resolved', row: pick[0], matchedBy: 'partial_name' };
  if (pick.length > 1) return { kind: 'ambiguous', candidates: pick.slice(0, CONTENT_CANDIDATES_MAX) };
  return { kind: 'none' };
}

// ── status labels shared by the overviews and the leaderboard ────────────────

/** Route status from the stored fields: published / pending / archived / rejected / no_publish_field. */
export function routeStatusOf(d: { published?: unknown; status?: unknown }): 'published' | 'pending' | 'archived' | 'rejected' | 'no_publish_field' {
  if (d.published === true) return 'published';
  if (d.status === 'archived') return 'archived';
  if (d.status === 'rejected') return 'rejected';
  if (d.published === false) return 'pending';
  return 'no_publish_field';
}

/** Park status: published / pending (= unpublished, not draft / rejected) / draft / rejected / no_published_field. */
export function parkStatusOf(d: { published?: unknown; contentStatus?: unknown }): 'published' | 'pending' | 'draft' | 'rejected' | 'no_published_field' {
  if (d.published === true) return 'published';
  if (d.contentStatus === 'draft') return 'draft';
  if (d.contentStatus === 'rejected') return 'rejected';
  if (d.published === false) return 'pending';
  return 'no_published_field';
}
