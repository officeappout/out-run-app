"use client";

/**
 * SearchOverlayV2 — the map search screen in the home-v2 design language
 * (enable_home_v2 only; NavigationHub renders it in place of its own
 * 'searching' overlay when the flag is on — flag off is untouched).
 *
 *   • Empty (fewer than MIN_SEARCH_CHARS): Home / Work cards, "אחרונים"
 *     (persisted recents, with type icon + distance) and "קרוב אליך"
 *     (nearest parks / official routes).
 *   • Typing: results GROUPED by type (addresses & streets / places / parks /
 *     routes) with filter chips + counts, the typed text in bold, a second
 *     line, the distance from the user and "עוד N" per group.
 *
 * Every pick goes through the same `onAddressSelect` the legacy overlay uses.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  MapPin,
  X,
  Trees,
  Home,
  Briefcase,
  Search,
  Loader2,
  House,
  Signpost,
  Building2,
  Map as MapIcon,
  LandPlot,
  Landmark,
  Route as RouteIcon,
} from 'lucide-react';
import type { SearchSuggestion } from '../hooks/useSearchNavigation';
import { MIN_SEARCH_CHARS, getNearbySearchSuggestions } from '../hooks/useSearchNavigation';
import type { GeoPlaceType } from '../services/geocode-place-type';
import {
  groupSearchResults,
  previewGroup,
  highlightMatch,
  groupedRowLines,
  distanceKmTo,
  formatDistanceKm,
  SEARCH_GROUP_CHIP,
  type SearchGroupId,
} from '../services/search-groups';
import {
  useSavedPlacesStore,
  type SavedPlaceKind,
} from '@/features/user/places/store/useSavedPlacesStore';
import { useRecentSearchesStore, type RecentSearch } from '../store/useRecentSearchesStore';

// ── Type icon + tone (shared with the search pick cards) ─────────────────────
const PLACE_TYPE_ICON: Record<GeoPlaceType, typeof MapPin> = {
  address: House,
  street: Signpost,
  place: Building2,
  locality: MapIcon,
  neighborhood: LandPlot,
  poi: Landmark,
  region: MapIcon,
};

export type SearchTone = 'geo' | 'park' | 'route';

export const SEARCH_TONE_CLASS: Record<SearchTone, string> = {
  geo: 'bg-v2-tint text-v2-deep',
  park: 'bg-[#eef7df] text-[#65a30d]',
  route: 'bg-[#fff1e6] text-[#ea580c]',
};

export function suggestionIcon(item: { _source?: string; placeType?: GeoPlaceType }): { Icon: typeof MapPin; tone: SearchTone } {
  if (item._source === 'park') return { Icon: Trees, tone: 'park' };
  if (item._source === 'route') return { Icon: RouteIcon, tone: 'route' };
  return { Icon: item.placeType ? PLACE_TYPE_ICON[item.placeType] : MapPin, tone: 'geo' };
}

const CARD = 'rounded-[22px] bg-white shadow-v2-ring px-3 pt-2.5 pb-1';
const SECTION_LABEL = 'whitespace-nowrap text-[13px] font-extrabold text-v2-deep';
const PRESS = 'active:scale-[0.97] transition-transform duration-150 ease-v2';

interface SearchOverlayV2Props {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  suggestions: SearchSuggestion[];
  onAddressSelect: (addr: SearchSuggestion) => void;
  isSearching: boolean;
  inputRef: React.RefObject<HTMLInputElement>;
  onCancel: () => void;
  onSetSavedPlace?: (kind: SavedPlaceKind) => void;
  userPos?: { lat: number; lng: number } | null;
}

export default function SearchOverlayV2({
  searchQuery,
  onSearchChange,
  suggestions,
  onAddressSelect,
  isSearching,
  inputRef,
  onCancel,
  onSetSavedPlace,
  userPos,
}: SearchOverlayV2Props) {
  const savedPlaces = useSavedPlacesStore((s) => s.places);
  const recents = useRecentSearchesStore((s) => s.recents);
  const removeRecent = useRecentSearchesStore((s) => s.removeRecent);
  const clearRecents = useRecentSearchesStore((s) => s.clearRecents);

  const typing = searchQuery.length >= MIN_SEARCH_CHARS;
  const [filter, setFilter] = useState<'all' | SearchGroupId>('all');
  const [expanded, setExpanded] = useState<Partial<Record<SearchGroupId, boolean>>>({});
  // A new query starts from the "all" view with every group collapsed.
  useEffect(() => { setFilter('all'); setExpanded({}); }, [searchQuery]);

  const groups = useMemo(
    () => (typing ? groupSearchResults(suggestions, userPos) : []),
    [typing, suggestions, userPos],
  );
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  const shownGroups = filter === 'all' ? groups : groups.filter((g) => g.id === filter);

  // "קרוב אליך" — nearest parks / routes (read-only, cached lists). Fetched
  // once per overlay open with a known position.
  const [nearby, setNearby] = useState<SearchSuggestion[]>([]);
  const hasPos = !!userPos;
  const posRef = useRef(userPos);
  posRef.current = userPos;
  useEffect(() => {
    if (!hasPos || !posRef.current) return;
    let cancelled = false;
    getNearbySearchSuggestions(posRef.current)
      .then((s) => { if (!cancelled) setNearby(s); })
      .catch(() => { /* empty state just hides the section */ });
    return () => { cancelled = true; };
  }, [hasPos]);

  const handleSavedTap = (kind: SavedPlaceKind) => {
    const slot = savedPlaces[kind];
    if (slot) {
      onAddressSelect({ text: slot.address ?? slot.label, coords: slot.coords, _source: 'mapbox' });
    } else if (onSetSavedPlace) {
      onCancel();
      onSetSavedPlace(kind);
    }
  };

  // A park / route recent reopens its entity card only when its id was
  // stored (newer entries). Older ones replay as a plain place pick.
  const handleRecentTap = (entry: RecentSearch) => {
    if ((entry.source === 'park' || entry.source === 'route') && entry.id) {
      onAddressSelect({ text: entry.text, coords: entry.coords, _source: entry.source, _id: entry.id });
    } else {
      onAddressSelect({ text: entry.text, coords: entry.coords, _source: 'mapbox' });
    }
  };

  return (
    <div className="kb-fit fixed inset-0 z-[100] flex flex-col bg-v2-surface" dir="rtl">
      {/* ── Search field ─────────────────────────────────────────────── */}
      <div className="px-4 pb-3" style={{ paddingTop: 'calc(52px + max(1rem, env(safe-area-inset-top, 0px)))' }}>
        <div className="flex items-center gap-2">
          <div className="flex h-12 min-w-0 flex-1 items-center gap-2 rounded-full bg-white px-4 shadow-[0_0_0_1px_rgba(14,27,42,0.08),0_0_0_2px_rgba(0,186,247,0.35)]">
            <Search size={18} strokeWidth={2.4} className="shrink-0 text-v2-muted" />
            <input
              ref={inputRef}
              type="text"
              placeholder="כתובת, רחוב, פארק או מסלול"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="min-w-0 flex-1 border-none bg-transparent text-right text-[16px] font-bold text-v2-ink outline-none placeholder:font-semibold placeholder:text-v2-muted"
            />
            {isSearching && <Loader2 size={16} className="shrink-0 animate-spin text-v2-accent" />}
            {searchQuery && !isSearching && (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                aria-label="נקה חיפוש"
                className={`grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full bg-v2-surface ring-1 ring-inset ring-v2-hairline ${PRESS}`}
              >
                <X size={12} strokeWidth={2.4} className="text-v2-muted" />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={onCancel}
            className={`shrink-0 whitespace-nowrap px-1 text-[14px] font-extrabold text-v2-deep ${PRESS}`}
          >
            ביטול
          </button>
        </div>

        {/* Filter chips — only the groups that have hits */}
        {typing && groups.length > 1 && (
          <div className="mt-3 flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>הכל · {total}</FilterChip>
            {groups.map((g) => {
              const { Icon } = suggestionIcon(g.items[0]);
              return (
                <FilterChip key={g.id} active={filter === g.id} onClick={() => setFilter(g.id)}>
                  <Icon size={14} strokeWidth={2.4} className={filter === g.id ? '' : 'text-v2-muted'} />
                  {SEARCH_GROUP_CHIP[g.id]} · {g.items.length}
                </FilterChip>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-8">
        {!typing ? (
          <div className="flex flex-col gap-3">
            {/* Home / Work */}
            <div className="flex gap-2">
              {(['home', 'work'] as const).map((kind) => {
                const slot = savedPlaces[kind];
                const Icon = kind === 'home' ? Home : Briefcase;
                const km = slot ? distanceKmTo(userPos, slot.coords) : null;
                const sub = slot
                  ? [slot.address ?? slot.label, formatDistanceKm(km)].filter(Boolean).join(' · ')
                  : 'הקש להגדרה';
                return (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => handleSavedTap(kind)}
                    className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-[20px] bg-white px-3 py-2.5 text-start shadow-v2-ring ${PRESS}`}
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[12px] bg-v2-tint text-v2-deep">
                      <Icon size={17} strokeWidth={2.3} />
                    </span>
                    <span className="min-w-0">
                      <span className="block whitespace-nowrap text-[14px] font-black text-v2-ink">{kind === 'home' ? 'בית' : 'עבודה'}</span>
                      <span className="block truncate whitespace-nowrap text-[12px] font-bold text-v2-muted">{sub}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            {recents.length > 0 && (
              <div className={CARD}>
                <div className="flex items-center justify-between px-1 py-0.5">
                  <span className={SECTION_LABEL}>אחרונים</span>
                  <button type="button" onClick={clearRecents} className={`whitespace-nowrap text-[12.5px] font-extrabold text-v2-deep ${PRESS}`}>
                    נקה
                  </button>
                </div>
                {recents.map((entry) => {
                  const item = { text: entry.text, coords: entry.coords, _source: entry.source } as const;
                  const lines = groupedRowLines(item);
                  return (
                    <ResultRow
                      key={`recent-${entry.text}-${entry.pickedAt}`}
                      item={item}
                      primary={lines.primary}
                      secondary={lines.secondary}
                      distance={formatDistanceKm(distanceKmTo(userPos, entry.coords))}
                      onClick={() => handleRecentTap(entry)}
                      onRemove={() => removeRecent(entry.text)}
                    />
                  );
                })}
              </div>
            )}

            {nearby.length > 0 && (
              <div className={CARD}>
                <div className="px-1 py-0.5"><span className={SECTION_LABEL}>קרוב אליך</span></div>
                {nearby.map((item) => {
                  const lines = groupedRowLines(item);
                  return (
                    <ResultRow
                      key={`near-${item._source}-${item._id}`}
                      item={item}
                      primary={lines.primary}
                      secondary={lines.secondary}
                      distance={formatDistanceKm(distanceKmTo(userPos, item.coords))}
                      onClick={() => onAddressSelect(item)}
                    />
                  );
                })}
              </div>
            )}
          </div>
        ) : total === 0 ? (
          isSearching ? (
            <div className="flex justify-center py-12">
              <Loader2 size={22} className="animate-spin text-v2-accent" />
            </div>
          ) : (
            <div className="py-12 text-center">
              <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-white text-v2-muted shadow-v2-ring">
                <MapPin size={22} strokeWidth={2.3} />
              </span>
              <p className="text-[15px] font-black text-v2-ink">לא נמצאו תוצאות</p>
              <p className="mt-1 text-[12.5px] font-bold text-v2-muted">נסו כתובת, שם רחוב, פארק או מסלול</p>
            </div>
          )
        ) : (
          <div className="flex flex-col gap-2.5">
            {shownGroups.map((g) => {
              const { visible, hiddenCount } = previewGroup(g.items, filter !== 'all' || !!expanded[g.id]);
              return (
                <div key={g.id} className={CARD}>
                  <div className="flex items-center justify-between px-1 py-0.5">
                    <span className={SECTION_LABEL}>{g.label}</span>
                    {hiddenCount > 0 && (
                      <button
                        type="button"
                        onClick={() => setExpanded((e) => ({ ...e, [g.id]: true }))}
                        className={`whitespace-nowrap text-[12.5px] font-extrabold text-v2-deep ${PRESS}`}
                      >
                        עוד {hiddenCount}
                      </button>
                    )}
                  </div>
                  {visible.map((item, idx) => {
                    const lines = groupedRowLines(item);
                    return (
                      <ResultRow
                        key={`res-${g.id}-${idx}-${item.coords[0]}-${item.coords[1]}`}
                        item={item}
                        primary={lines.primary}
                        secondary={lines.secondary}
                        query={searchQuery}
                        distance={formatDistanceKm(distanceKmTo(userPos, item.coords))}
                        onClick={() => onAddressSelect(item)}
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[13px] font-extrabold ${PRESS} ${
        active ? 'bg-v2-tint text-v2-deep ring-1 ring-inset ring-v2-accent/40' : 'bg-white text-v2-ink-2 shadow-v2-ring'
      }`}
    >
      {children}
    </button>
  );
}

function ResultRow({
  item,
  primary,
  secondary,
  query,
  distance,
  onClick,
  onRemove,
}: {
  item: { _source?: string; placeType?: GeoPlaceType };
  primary: string;
  secondary: string;
  query?: string;
  distance?: string;
  onClick: () => void;
  onRemove?: () => void;
}) {
  const { Icon, tone } = suggestionIcon(item);
  return (
    <div className="flex items-center gap-1">
      <button type="button" onClick={onClick} className={`flex min-w-0 flex-1 items-center gap-3 px-1 py-2.5 text-start ${PRESS}`}>
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-[13px] ${SEARCH_TONE_CLASS[tone]}`}>
          <Icon size={19} strokeWidth={2.3} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate whitespace-nowrap text-[15px] font-bold text-v2-ink-2">
            {query
              ? highlightMatch(primary, query).map((p, i) =>
                  p.match ? <b key={i} className="font-black text-v2-ink">{p.text}</b> : <React.Fragment key={i}>{p.text}</React.Fragment>,
                )
              : primary}
          </span>
          {secondary && (
            <span className="block truncate whitespace-nowrap text-[12px] font-bold text-v2-muted">{secondary}</span>
          )}
        </span>
        {distance && (
          <span className="shrink-0 whitespace-nowrap text-[12px] font-extrabold text-v2-muted">{distance}</span>
        )}
      </button>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`הסר את ${primary} מההיסטוריה`}
          className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-v2-muted ${PRESS}`}
        >
          <X size={13} strokeWidth={2.4} />
        </button>
      )}
    </div>
  );
}
