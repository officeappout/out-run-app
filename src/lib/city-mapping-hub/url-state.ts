/**
 * city-mapping-hub/url-state.ts — the hub's view state lives in the URL
 * (CITY-MAPPING-HUB-DESIGN.md §3.1: `?authority=<id>&…`) so a link can be
 * shared and Back works. View state only — no personal data. Pure; every
 * value is validated against a closed list, anything else falls back to the
 * default (a hand-edited URL never breaks the page).
 */
import { DEFAULT_HUB_FILTERS, HUB_SORT_KEYS, type HubFilters, type HubSortKey, type SortDir } from './filters';
import { HUB_AUTHORITY_TYPES, HUB_GAP_KEYS } from './rows';

export type HubMobileView = 'table' | 'map' | 'gaps';

export interface HubUrlState extends HubFilters {
  authority: string | null;
  sort: HubSortKey;
  dir: SortDir;
  view: HubMobileView;
}

export const DEFAULT_HUB_URL_STATE: HubUrlState = {
  ...DEFAULT_HUB_FILTERS,
  authority: null,
  sort: 'score',
  dir: 'asc',
  view: 'table',
};

const LEVELS = ['all', 'red', 'yellow', 'green', 'unmeasured'] as const;
const QUOTAS = ['all', 'below', 'within', 'above'] as const;
const GAPS = ['all', 'pending', 'contributions', ...HUB_GAP_KEYS] as const;
const VIEWS = ['table', 'map', 'gaps'] as const;

const pick = <T extends string>(v: string | null, allowed: readonly T[], dflt: T): T =>
  v != null && (allowed as readonly string[]).includes(v) ? (v as T) : dflt;

/** Same id rule as the inventory route: non-empty, ≤ 128 chars, no `/`. */
export function validAuthorityId(v: string | null | undefined): string | null {
  const s = (v ?? '').trim();
  return s && s.length <= 128 && !s.includes('/') ? s : null;
}

export function parseHubUrlState(sp: { get(name: string): string | null }): HubUrlState {
  const d = DEFAULT_HUB_URL_STATE;
  return {
    authority: validAuthorityId(sp.get('authority')),
    q: (sp.get('q') ?? '').slice(0, 80),
    level: pick(sp.get('level'), LEVELS, d.level),
    type: pick(sp.get('type'), ['all', ...HUB_AUTHORITY_TYPES], 'all'),
    gap: pick(sp.get('gap'), GAPS, d.gap),
    quota: pick(sp.get('quota'), QUOTAS, d.quota),
    paying: sp.get('paying') === '1',
    sort: pick(sp.get('sort'), HUB_SORT_KEYS, d.sort),
    dir: pick(sp.get('dir'), ['asc', 'desc'] as const, d.dir),
    view: pick(sp.get('view'), VIEWS, d.view),
  };
}

/** Only non-default values are written, so the plain URL stays plain. */
export function serializeHubUrlState(s: HubUrlState): string {
  const d = DEFAULT_HUB_URL_STATE;
  const p = new URLSearchParams();
  if (s.authority) p.set('authority', s.authority);
  if (s.q.trim()) p.set('q', s.q.trim());
  if (s.level !== d.level) p.set('level', s.level);
  if (s.type !== d.type) p.set('type', s.type);
  if (s.gap !== d.gap) p.set('gap', s.gap);
  if (s.quota !== d.quota) p.set('quota', s.quota);
  if (s.paying) p.set('paying', '1');
  if (s.sort !== d.sort) p.set('sort', s.sort);
  if (s.dir !== d.dir) p.set('dir', s.dir);
  if (s.view !== d.view) p.set('view', s.view);
  return p.toString();
}
