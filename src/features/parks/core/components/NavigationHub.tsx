"use client";

import React, { useCallback, useEffect, useRef } from 'react';
import {
    MapPin,
    Footprints,
    Activity,
    Bike,
    X,
    Clock,
    Trees,
    Home,
    Briefcase,
    Bookmark,
    Search,
    Loader2,
    ChevronRight,
} from 'lucide-react';
import { ActivityType } from '../types/route.types';
import type { NavVariants, RouteVariant, SearchSuggestion } from '../hooks/useSearchNavigation';
import { Route as RouteIcon } from 'lucide-react';
import {
  useSavedPlacesStore,
  type SavedPlaceKind,
} from '@/features/user/places/store/useSavedPlacesStore';
import { useRecentSearchesStore } from '../store/useRecentSearchesStore';

export type NavHubState = 'idle' | 'searching' | 'navigating';

const SUGGESTION_ICON: Record<string, typeof MapPin> = {
  park: Trees,
  route: RouteIcon,
  mapbox: MapPin,
};

interface NavigationHubProps {
    navState: NavHubState;
    onStateChange: (state: NavHubState) => void;
    /**
     * Navigation variant slots — kept on the props surface for backwards
     * compatibility with existing callers (DiscoverLayer still passes
     * them). The variant-card UI was removed in the unified-RouteCarousel
     * refactor: RouteCarousel now owns the 3-card commute selection
     * surface and renders the chip badge per route. These props are
     * effectively unused by NavigationHub today and can be deleted in a
     * follow-up cleanup once all call sites stop spreading them.
     */
    navigationVariants?: NavVariants;
    selectedVariant?: RouteVariant;
    onVariantSelect?: (v: RouteVariant) => void;
    navActivity?: ActivityType;
    onActivityChange?: (a: ActivityType) => void;
    isLoading?: boolean;
    onStart?: () => void;
    searchQuery: string;
    onSearchChange: (q: string) => void;
    suggestions: SearchSuggestion[];
    onAddressSelect: (addr: SearchSuggestion) => void;
    isSearching?: boolean;
    inputRef?: React.RefObject<HTMLInputElement>;
    /**
     * Fired when the user taps a Home / Work quick action whose slot is
     * EMPTY. Parent should open SetSavedPlaceSheet for that kind. When
     * the slot is set, the row instead behaves as an address pick (no
     * callback needed — the suggestion is synthesised in-component and
     * piped through `onAddressSelect`).
     */
    onSetSavedPlace?: (kind: SavedPlaceKind) => void;
}

const ACTIVITY_META: Array<{ id: ActivityType; label: string; icon: React.ElementType }> = [
    { id: 'walking', label: 'הליכה', icon: Footprints },
    { id: 'running', label: 'ריצה', icon: Activity },
    { id: 'cycling', label: 'רכיבה', icon: Bike },
];

/**
 * Quick action tiles inside the full-screen search overlay.
 * `home` / `work` read from `useSavedPlacesStore` (smart shortcuts).
 * `saved` / `parks` are still input-stuffing intents (no persistence).
 */
type QuickActionId = 'home' | 'work' | 'saved' | 'parks';
const QUICK_ACTIONS: Array<{
  id: QuickActionId;
  label: string;
  icon: React.ElementType;
  color: string;
  bg: string;
}> = [
  { id: 'home', label: 'בית', icon: Home, color: 'text-cyan-500', bg: 'bg-cyan-50' },
  { id: 'work', label: 'עבודה', icon: Briefcase, color: 'text-purple-500', bg: 'bg-purple-50' },
  { id: 'saved', label: 'שמורים', icon: Bookmark, color: 'text-amber-500', bg: 'bg-amber-50' },
  { id: 'parks', label: 'פארקים', icon: Trees, color: 'text-green-500', bg: 'bg-green-50' },
];

export default function NavigationHub({
    navState,
    onStateChange,
    searchQuery,
    onSearchChange,
    suggestions,
    onAddressSelect,
    isSearching = false,
    inputRef,
    onSetSavedPlace,
}: NavigationHubProps) {
    const localInputRef = useRef<HTMLInputElement>(null);
    const actualInputRef = inputRef || localInputRef;
    const savedPlaces = useSavedPlacesStore((s) => s.places);
    const recents = useRecentSearchesStore((s) => s.recents);
    const removeRecent = useRecentSearchesStore((s) => s.removeRecent);
    const clearRecents = useRecentSearchesStore((s) => s.clearRecents);

    // Replay a stored RecentSearch through the same `onAddressSelect`
    // pipeline as a fresh suggestion. Tagging the synthetic suggestion
    // with the original `_source` keeps the downstream branching
    // (commute vs. entity card) identical to the first-pick path —
    // nothing in the consuming layers needs to know it came from
    // history.
    const handleRecentTap = useCallback((entry: typeof recents[number]) => {
      onAddressSelect({
        text: entry.text,
        coords: entry.coords,
        _source: entry.source,
      });
    }, [onAddressSelect]);

    useEffect(() => {
        if (navState === 'searching' && actualInputRef.current) {
            setTimeout(() => actualInputRef.current?.focus(), 100);
        }
    }, [navState, actualInputRef]);

    const handleQuickActionTap = (id: QuickActionId, label: string) => {
      // Smart Home/Work shortcuts:
      //   - place set   → synthesise a savedPlace SearchSuggestion and
      //                   pipe through `onAddressSelect` so the existing
      //                   commute branch in handleAddressSelect picks
      //                   it up. Same code path as a Mapbox hit.
      //   - place unset → ask the parent to open SetSavedPlaceSheet via
      //                   `onSetSavedPlace`. We close the search overlay
      //                   first so the sheet doesn't stack on top of it.
      if (id === 'home' || id === 'work') {
        const slot = savedPlaces[id];
        if (slot) {
          onAddressSelect({
            text: slot.address ?? slot.label,
            coords: slot.coords,
            _source: 'mapbox', // routes through the commute branch
          });
        } else if (onSetSavedPlace) {
          onStateChange('idle');
          onSetSavedPlace(id);
        }
        return;
      }
      // Generic intents (saved / parks) keep the legacy behaviour —
      // they just stuff the search input.
      onSearchChange(label);
    };

    const displayItems = searchQuery.length >= 3 ? suggestions : [];

    if (navState === 'searching') {
        return (
            <div
                className="fixed inset-0 z-[100] flex flex-col"
                style={{
                    // Glassmorphism backdrop — same recipe as
                    // MapLoadingSkeleton, applied to a near-opaque white
                    // base so the suggestion list stays legible. The
                    // map underneath remains a soft hint visible at the
                    // edges, anchoring the user spatially.
                    backgroundColor: 'rgba(255,255,255,0.92)',
                    backdropFilter: 'blur(24px) saturate(160%)',
                    WebkitBackdropFilter: 'blur(24px) saturate(160%)',
                }}
            >
                <div className="pt-[max(1.5rem,env(safe-area-inset-top))] px-4 pb-3 border-b border-white/40">
                    <div
                        className="rounded-2xl h-12 flex items-center px-3 gap-2 ring-1 ring-black/5 shadow-[0_6px_18px_rgba(0,0,0,0.06)]"
                        style={{
                            backgroundColor: 'rgba(255,255,255,0.65)',
                            backdropFilter: 'blur(12px) saturate(160%)',
                            WebkitBackdropFilter: 'blur(12px) saturate(160%)',
                        }}
                    >
                        <Search size={18} className="text-gray-500 shrink-0" />
                        <input
                            ref={actualInputRef}
                            type="text"
                            placeholder="לאן רוצים להגיע?"
                            value={searchQuery}
                            onChange={(e) => onSearchChange(e.target.value)}
                            className="flex-1 bg-transparent border-none outline-none text-sm text-gray-900 text-right font-semibold placeholder:text-gray-500"
                            autoFocus
                        />
                        {isSearching && <Loader2 size={16} className="text-cyan-500 animate-spin shrink-0" />}
                        {searchQuery && !isSearching && (
                            <button onClick={() => onSearchChange('')} className="p-1 hover:bg-gray-100/60 rounded-full">
                                <X size={14} className="text-gray-500" />
                            </button>
                        )}
                        <button
                            onClick={() => { onSearchChange(''); onStateChange('idle'); }}
                            className="text-cyan-600 text-xs font-bold ms-1"
                        >
                            ביטול
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto">
                    {searchQuery.length < 3 ? (
                        <div className="px-5 pt-5 pb-6" dir="rtl">
                            {/* ── Quick action tiles ─────────────────────
                                Compact 4-up grid (refinement pass — the
                                old 2-col / py-5 / w-14 icon ring read
                                as oversized on phone screens). The
                                whole grid now fits in a single
                                horizontal stripe for thumb-comfortable
                                scanning. */}
                            <div className="grid grid-cols-4 gap-2.5 mb-7">
                                {QUICK_ACTIONS.map(({ id, label, icon: Icon, color, bg }) => {
                                    const isSavedSlot = id === 'home' || id === 'work';
                                    const slot = isSavedSlot ? savedPlaces[id as SavedPlaceKind] : null;
                                    return (
                                        <button
                                            key={id}
                                            onClick={() => handleQuickActionTap(id, label)}
                                            className="flex flex-col items-center gap-1.5 py-3 rounded-2xl transition-all active:scale-[0.97] ring-1 ring-black/5 shadow-[0_3px_10px_rgba(0,0,0,0.04)]"
                                            style={{
                                                backgroundColor: 'rgba(255,255,255,0.6)',
                                                backdropFilter: 'blur(12px) saturate(160%)',
                                                WebkitBackdropFilter: 'blur(12px) saturate(160%)',
                                            }}
                                        >
                                            <div className={`w-10 h-10 rounded-full ${bg} flex items-center justify-center`}>
                                                <Icon size={18} className={color} />
                                            </div>
                                            <span className="text-[11px] font-bold text-gray-800 leading-none">
                                                {label}
                                            </span>
                                            {isSavedSlot && !slot && (
                                                <span className="text-[9px] text-gray-400 leading-none -mt-0.5">
                                                    הקש להגדרה
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>

                            {/* ── Recent searches ────────────────────────
                                Reads from `useRecentSearchesStore` (real,
                                persisted user history) — replaces the
                                previous hard-coded stub. Tap → replay
                                through the SAME onAddressSelect path
                                as a fresh suggestion. Long-list cap is
                                handled inside the store (MAX_ENTRIES).
                                Empty state stays quiet — no header at
                                all if the user hasn't searched yet. */}
                            {recents.length > 0 && (
                                <>
                                    <div className="flex items-center justify-between mb-3 px-1">
                                        <div className="flex items-center gap-2">
                                            <Clock size={12} className="text-gray-400" />
                                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                                                חיפושים אחרונים
                                            </span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={clearRecents}
                                            className="text-[10px] font-bold text-gray-400 hover:text-gray-600 transition-colors"
                                        >
                                            נקה
                                        </button>
                                    </div>
                                    <div className="space-y-0.5">
                                        {recents.map((entry) => {
                                            const SugIcon = SUGGESTION_ICON[entry.source] ?? MapPin;
                                            const iconBg = entry.source === 'park'
                                                ? 'bg-emerald-50 text-emerald-600'
                                                : entry.source === 'route'
                                                    ? 'bg-blue-50 text-blue-600'
                                                    : 'bg-gray-100 text-gray-500';
                                            return (
                                                <div
                                                    key={`recent-${entry.text}-${entry.pickedAt}`}
                                                    className="w-full flex items-center gap-3 px-2.5 py-2.5 rounded-xl hover:bg-gray-50 transition-colors group"
                                                >
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRecentTap(entry)}
                                                        className="flex-1 flex items-center gap-3 text-start"
                                                    >
                                                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${iconBg}`}>
                                                            <SugIcon size={14} />
                                                        </div>
                                                        <span className="text-[13px] text-gray-700 font-medium truncate">
                                                            {entry.text}
                                                        </span>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => removeRecent(entry.text)}
                                                        className="w-6 h-6 rounded-full flex items-center justify-center text-gray-300 hover:text-gray-500 hover:bg-gray-100 transition-colors opacity-0 group-hover:opacity-100"
                                                        aria-label={`הסר את ${entry.text} מההיסטוריה`}
                                                    >
                                                        <X size={11} />
                                                    </button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </>
                            )}
                        </div>
                    ) : (
                        <div className="p-4" dir="rtl">
                            <div className="flex items-center gap-2 mb-3 px-1">
                                <Search size={12} className="text-gray-400" />
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                                    תוצאות חיפוש
                                </span>
                                <span className="text-[10px] text-gray-300">({displayItems.length})</span>
                            </div>

                            {displayItems.length === 0 && !isSearching ? (
                                <div className="text-center py-12 text-gray-400">
                                    <MapPin size={32} className="mx-auto mb-3 opacity-50" />
                                    <p className="text-sm font-medium text-gray-500">לא נמצאו תוצאות</p>
                                </div>
                            ) : (
                                <div className="space-y-1">
                                    {displayItems.map((item, idx) => {
                                        const SugIcon = SUGGESTION_ICON[item._source ?? 'mapbox'] ?? MapPin;
                                        const iconBg = item._source === 'park'
                                          ? 'bg-emerald-50 text-emerald-600 group-hover:bg-emerald-100'
                                          : item._source === 'route'
                                            ? 'bg-blue-50 text-blue-600 group-hover:bg-blue-100'
                                            : 'bg-gray-100 text-gray-500 group-hover:bg-blue-50 group-hover:text-blue-600';
                                        return (
                                        <button
                                            key={`suggestion-${idx}-${item._source ?? 'g'}-${item.coords[0]}-${item.coords[1]}`}
                                            onClick={() => onAddressSelect(item)}
                                            className="w-full px-3 py-3 flex items-center justify-between hover:bg-gray-50 rounded-xl transition-colors group"
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors shrink-0 ${iconBg}`}>
                                                    <SugIcon size={16} />
                                                </div>
                                                <div className="flex flex-col items-start">
                                                  <span className="text-sm font-medium text-gray-800 text-right truncate max-w-[220px]">
                                                      {item.text}
                                                  </span>
                                                  {item._source && item._source !== 'mapbox' && (
                                                    <span className={`text-[10px] font-bold ${item._source === 'park' ? 'text-emerald-500' : 'text-blue-500'}`}>
                                                      {item._source === 'park' ? 'פארק' : 'מסלול'}
                                                    </span>
                                                  )}
                                                </div>
                                            </div>
                                            <ChevronRight size={14} className="text-gray-300 shrink-0" />
                                        </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // ── 'navigating' state intentionally returns null ──
    // The legacy 3-variant Waze-style bottom drawer used to live here,
    // but the unified RouteCarousel now owns all route selection (loop
    // AND commute). DiscoverLayer's `mapMode === 'commute'` branch
    // mounts RouteCarousel directly when an address is picked, so this
    // component is only responsible for the SEARCH overlay now.
    //
    // Backwards-compat: existing call sites still pass
    // `navigationVariants` / `onVariantSelect` / `onStart` etc; those
    // props are accepted but ignored. Cleanup ticket: drop them once
    // useSearchNavigation is trimmed to just the suggestion pipeline.
    return null;
}
