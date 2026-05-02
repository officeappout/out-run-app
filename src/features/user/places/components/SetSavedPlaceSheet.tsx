'use client';

/**
 * SetSavedPlaceSheet — bottom sheet for the "tap to set Home / Work"
 * flow. Reuses Mapbox's geocoder via `MapboxService.searchAddress`,
 * mirrors the input pattern from NavigationHub's full-screen search,
 * and writes the picked address into `useSavedPlacesStore` on confirm.
 *
 * Mounted by `SavedPlacesQuickRow` when the user taps an empty Home /
 * Work shortcut. Closes itself on save / cancel — the parent only
 * needs to track an `openKind: SavedPlaceKind | null` flag.
 *
 * Style: shares the glassmorphism vocabulary used by FloatingSearchBar
 * (translucent white + backdrop-blur) so the whole commute-entry
 * surface reads as one premium layer. Z-[100] places it above the
 * floating search bar (z-[70]) but below DiscoverLayer's safety modals.
 */

import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Loader2, X, Home, Briefcase, Check, MapPin } from 'lucide-react';
import { MapboxService } from '@/features/parks/core/services/mapbox.service';
import {
  useSavedPlacesStore,
  SAVED_PLACE_KIND_LABEL,
  type SavedPlaceKind,
} from '../store/useSavedPlacesStore';

interface SetSavedPlaceSheetProps {
  /** Which slot we're setting; null closes the sheet. */
  openKind: SavedPlaceKind | null;
  onClose: () => void;
}

interface GeocoderHit {
  text: string;
  coords: [number, number];
}

const KIND_ICON: Record<SavedPlaceKind, React.ElementType> = {
  home: Home,
  work: Briefcase,
};

export default function SetSavedPlaceSheet({ openKind, onClose }: SetSavedPlaceSheetProps) {
  const setPlace = useSavedPlacesStore((s) => s.setPlace);
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<GeocoderHit[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Reset every time the sheet opens for a different kind so the user
  // never sees stale results when re-opening for the other slot.
  useEffect(() => {
    if (openKind) {
      setQuery('');
      setHits([]);
      setIsSearching(false);
      // Auto-focus once the slide-in animation has had a moment to commit
      // — focusing immediately races with the keyboard reveal on iOS and
      // the input ends up scrolled offscreen.
      const t = setTimeout(() => inputRef.current?.focus(), 280);
      return () => clearTimeout(t);
    }
  }, [openKind]);

  // Debounced geocoder query — same 400 ms window as `useSearchNavigation`
  // so the user gets identical input feel across both surfaces.
  useEffect(() => {
    if (!openKind) return;
    if (query.length < 3) {
      setHits([]);
      setIsSearching(false);
      return;
    }
    let cancelled = false;
    setIsSearching(true);
    const t = setTimeout(async () => {
      try {
        const results = await MapboxService.searchAddress(query);
        if (!cancelled) setHits(results);
      } catch {
        if (!cancelled) setHits([]);
      } finally {
        if (!cancelled) setIsSearching(false);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, openKind]);

  const handlePick = (hit: GeocoderHit) => {
    if (!openKind) return;
    setPlace({
      kind: openKind,
      label: SAVED_PLACE_KIND_LABEL[openKind],
      coords: hit.coords,
      address: hit.text,
      updatedAt: Date.now(),
    });
    onClose();
  };

  const KindIcon = openKind ? KIND_ICON[openKind] : MapPin;
  const kindLabel = openKind ? SAVED_PLACE_KIND_LABEL[openKind] : '';

  return (
    <AnimatePresence>
      {openKind && (
        <>
          {/* Backdrop — translucent so the map stays a hint visible behind
              the sheet, reinforcing the "this lives on the map" feel. */}
          <motion.div
            key="set-place-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[100]"
            style={{
              backgroundColor: 'rgba(15, 23, 42, 0.32)',
              backdropFilter: 'blur(8px) saturate(140%)',
              WebkitBackdropFilter: 'blur(8px) saturate(140%)',
            }}
            onClick={onClose}
          />

          {/* Sheet — bottom-anchored, glass surface, RTL throughout */}
          <motion.div
            key="set-place-sheet"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 320 }}
            dir="rtl"
            className="fixed bottom-0 inset-x-0 z-[100] rounded-t-3xl shadow-[0_-12px_40px_rgba(0,0,0,0.18)] flex flex-col max-h-[80vh]"
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.92)',
              backdropFilter: 'blur(24px) saturate(160%)',
              WebkitBackdropFilter: 'blur(24px) saturate(160%)',
              paddingBottom: 'env(safe-area-inset-bottom, 0px)',
            }}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-10 h-1 rounded-full bg-gray-300" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-cyan-50 flex items-center justify-center">
                  <KindIcon size={18} className="text-cyan-600" />
                </div>
                <div>
                  <h2 className="text-base font-black text-gray-900 leading-tight">
                    הגדרת {kindLabel}
                  </h2>
                  <p className="text-[11px] text-gray-500 leading-tight">
                    חפש כתובת ובחר מהרשימה
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="סגור"
                className="w-8 h-8 rounded-full bg-gray-100/80 flex items-center justify-center active:scale-90 transition-transform"
              >
                <X size={14} className="text-gray-600" />
              </button>
            </div>

            {/* Search input — same pill shape as FloatingSearchBar */}
            <div className="px-5 pb-3">
              <div
                className="rounded-2xl ring-1 ring-black/5 flex items-center h-12 ps-3 pe-3 gap-2"
                style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.75)',
                  backdropFilter: 'blur(12px) saturate(160%)',
                  WebkitBackdropFilter: 'blur(12px) saturate(160%)',
                }}
              >
                <Search size={16} className="text-gray-500 shrink-0" />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={`כתובת ה${kindLabel} שלך...`}
                  className="flex-1 bg-transparent border-none outline-none text-sm font-medium text-gray-900 placeholder:text-gray-400 text-right"
                />
                {isSearching && (
                  <Loader2 size={14} className="text-cyan-500 animate-spin shrink-0" />
                )}
              </div>
            </div>

            {/* Results */}
            <div className="flex-1 overflow-y-auto px-3 pb-4">
              {query.length < 3 ? (
                <div className="text-center py-10 text-gray-400">
                  <MapPin size={28} className="mx-auto mb-2 opacity-60" />
                  <p className="text-xs font-medium">הקלד לפחות 3 תווים</p>
                </div>
              ) : hits.length === 0 && !isSearching ? (
                <div className="text-center py-10 text-gray-400">
                  <p className="text-xs font-medium">לא נמצאו תוצאות</p>
                </div>
              ) : (
                <ul className="space-y-1">
                  {hits.map((hit, idx) => (
                    <li key={`hit-${idx}-${hit.coords[0]}-${hit.coords[1]}`}>
                      <button
                        type="button"
                        onClick={() => handlePick(hit)}
                        className="w-full flex items-center gap-3 px-3 py-3 rounded-xl active:bg-gray-100 transition-colors text-right"
                      >
                        <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                          <MapPin size={15} className="text-gray-500" />
                        </div>
                        <span className="flex-1 text-sm font-medium text-gray-800 truncate">
                          {hit.text}
                        </span>
                        <Check size={14} className="text-cyan-500 opacity-0 group-active:opacity-100 shrink-0" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
