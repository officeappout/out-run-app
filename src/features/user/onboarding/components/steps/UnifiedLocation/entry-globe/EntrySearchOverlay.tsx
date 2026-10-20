'use client';

import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Search, X } from 'lucide-react';
import type { CityData } from '../location-types';
import { ENTRY_COPY } from './entry-copy';
import {
  groupSearchResults,
  highlightSegments,
  placeTypeLabel,
  visibleSections,
  type SearchFilter,
} from './entry-search';

export interface EntrySearchOverlayProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  filteredCities: CityData[];
  onCitySelect: (city: CityData) => void;
  onBack: () => void;
}

function Highlighted({ text, query }: { text: string; query: string }) {
  return (
    <>
      {highlightSegments(text, query).map((seg, i) =>
        seg.match ? (
          <b key={i} className="font-extrabold text-v2-ink">
            {seg.text}
          </b>
        ) : (
          <React.Fragment key={i}>{seg.text}</React.Fragment>
        ),
      )}
    </>
  );
}

function ResultSection({
  title,
  rows,
  query,
  subtitle,
  onSelect,
}: {
  title: string;
  rows: CityData[];
  query: string;
  subtitle: (row: CityData) => string;
  onSelect: (row: CityData) => void;
}) {
  if (rows.length === 0) return null;
  return (
    <section className="flex flex-col gap-1">
      <h2 className="mx-1 mb-0.5 text-[13px] font-bold text-v2-deep">{title}</h2>
      <div className="overflow-hidden rounded-[18px] bg-white shadow-v2-card divide-y divide-[#f1f5f9]">
        {rows.map((row) => (
          <button
            key={row.id}
            type="button"
            onClick={() => onSelect(row)}
            className="block w-full px-3.5 py-3 text-right active:bg-v2-tint transition-colors"
          >
            <span className="block truncate text-[15px] font-semibold text-[#334155]">
              <Highlighted text={row.name} query={query} />
            </span>
            <span className="block truncate text-[12px] font-bold text-v2-muted">{subtitle(row)}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

/**
 * SEARCHING — full screen in the unified-search look: white pill input with a
 * cyan ring, clear ×, "ביטול"; filter chips with counts; results grouped under
 * "שכונות" / "ערים", no row icons, matched text bold. `kb-fit` ends the screen
 * at the keyboard (inert unless enable_keyboard_insets_v1 is on), so the
 * scrolling list always stays above it.
 */
export function EntrySearchOverlay({
  searchQuery,
  onSearchChange,
  filteredCities,
  onCitySelect,
  onBack,
}: EntrySearchOverlayProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [filter, setFilter] = useState<SearchFilter>('all');

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(t);
  }, []);

  const grouped = groupSearchResults(filteredCities);
  const show = visibleSections(filter);
  const chips: { key: SearchFilter; label: string }[] = [
    { key: 'all', label: ENTRY_COPY.chipAll },
    { key: 'neighborhoods', label: ENTRY_COPY.chipNeighborhoods },
    { key: 'cities', label: ENTRY_COPY.chipCities },
  ];
  const nothing = grouped.counts.all === 0;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="kb-fit absolute inset-0 z-30 flex flex-col bg-[#f8fafc]"
      style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}
      dir="rtl"
    >
      <div className="flex flex-shrink-0 flex-col gap-3 px-4 pb-2.5 pt-2">
        <div className="flex items-center gap-2">
          <div className="flex h-12 min-w-0 flex-1 items-center gap-2 rounded-full bg-white px-4 shadow-[0_0_0_1px_rgba(14,27,42,0.08),0_0_0_2px_rgba(0,186,247,0.35)]">
            <Search size={18} strokeWidth={2.4} className="flex-shrink-0 text-v2-muted" aria-hidden />
            <input
              ref={inputRef}
              type="search"
              enterKeyHint="search"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={ENTRY_COPY.searchPlaceholder}
              className="min-w-0 flex-1 bg-transparent text-right text-[16px] font-bold text-v2-ink outline-none placeholder:font-semibold placeholder:text-v2-muted [&::-webkit-search-cancel-button]:hidden"
              dir="rtl"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                aria-label={ENTRY_COPY.searchClear}
                className="grid h-6 w-6 flex-shrink-0 place-items-center rounded-full bg-[#f1f5f9]"
              >
                <X size={12} strokeWidth={2.4} className="text-v2-muted" />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={onBack}
            className="h-12 flex-shrink-0 px-1.5 text-[15px] font-bold text-v2-deep active:opacity-70"
          >
            {ENTRY_COPY.searchCancel}
          </button>
        </div>

        <div className="flex gap-1.5" role="tablist">
          {chips.map((c) => {
            const active = filter === c.key;
            return (
              <button
                key={c.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setFilter(c.key)}
                className={`flex h-8 flex-shrink-0 items-center rounded-full px-3 text-[13px] font-bold whitespace-nowrap transition-colors ${
                  active ? 'bg-v2-on-cta text-white' : 'bg-white text-v2-ink shadow-v2-ring'
                }`}
              >
                {c.label} · {grouped.counts[c.key]}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
        {nothing && searchQuery.trim().length > 0 ? (
          <div className="py-16 text-center">
            <p className="text-[15px] font-extrabold text-v2-ink">{ENTRY_COPY.noResults(searchQuery)}</p>
            <p className="mt-1 text-[12.5px] font-bold text-v2-muted">{ENTRY_COPY.noResultsHint}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3.5 pt-1">
            {show.neighborhoods && (
              <ResultSection
                title={ENTRY_COPY.sectionNeighborhoods}
                rows={grouped.neighborhoods}
                query={searchQuery}
                subtitle={(r) => r.parentName ?? ''}
                onSelect={onCitySelect}
              />
            )}
            {show.cities && (
              <ResultSection
                title={ENTRY_COPY.sectionCities}
                rows={grouped.cities}
                query={searchQuery}
                subtitle={(r) => placeTypeLabel(r.type)}
                onSelect={onCitySelect}
              />
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
