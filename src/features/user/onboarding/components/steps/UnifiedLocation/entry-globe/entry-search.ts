/**
 * Entry flow v2 — pure helpers for the grouped city / neighbourhood search
 * (no React). Works on the step's existing `filteredCities` (its own filter
 * and cap are unchanged); this only groups, counts and highlights.
 */
import type { CityData } from '../location-types';
import type { NamespaceKey } from '@/lib/i18n/catalogs';
import type { MessageValues } from '@/lib/i18n/core/i18n-core';
import type { onboarding } from '@/messages/ns/onboarding';

export type SearchFilter = 'all' | 'neighborhoods' | 'cities';

/** The caller's translator (useT(onboarding) in the drawer, makeT in tests). */
type OnboardingT = (key: NamespaceKey<typeof onboarding>, values?: MessageValues) => string;

export interface GroupedSearchResults {
  /** Rows with a parent (neighbourhoods / settlements inside a city or council). */
  neighborhoods: CityData[];
  /** Top-level places (cities, councils). */
  cities: CityData[];
  counts: Record<SearchFilter, number>;
}

export function groupSearchResults(results: readonly CityData[] | null | undefined): GroupedSearchResults {
  const neighborhoods: CityData[] = [];
  const cities: CityData[] = [];
  for (const r of results ?? []) {
    if (!r) continue;
    if (r.parentName) neighborhoods.push(r);
    else cities.push(r);
  }
  return {
    neighborhoods,
    cities,
    counts: { all: neighborhoods.length + cities.length, neighborhoods: neighborhoods.length, cities: cities.length },
  };
}

/** Which sections a filter shows. */
export function visibleSections(filter: SearchFilter): { neighborhoods: boolean; cities: boolean } {
  return { neighborhoods: filter !== 'cities', cities: filter !== 'neighborhoods' };
}

/** The grey line under a top-level place. */
export function placeTypeLabel(type: CityData['type'] | undefined, t: OnboardingT): string {
  return t('location.entry.search.placeType', { type: type ?? '' });
}

export interface HighlightSegment {
  text: string;
  match: boolean;
}

/** Splits `text` into segments, marking every occurrence of any query word (case-insensitive). */
export function highlightSegments(text: string, query: string): HighlightSegment[] {
  const src = text ?? '';
  const words = (query ?? '')
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0);
  if (!src || words.length === 0) return src ? [{ text: src, match: false }] : [];

  const lower = src.toLowerCase();
  const marked = new Array<boolean>(src.length).fill(false);
  for (const w of words) {
    let from = 0;
    while (from <= lower.length - w.length) {
      const at = lower.indexOf(w, from);
      if (at < 0) break;
      for (let i = at; i < at + w.length; i++) marked[i] = true;
      from = at + w.length;
    }
  }

  const out: HighlightSegment[] = [];
  for (let i = 0; i < src.length; i++) {
    const last = out[out.length - 1];
    if (last && last.match === marked[i]) last.text += src[i];
    else out.push({ text: src[i], match: marked[i] });
  }
  return out;
}
