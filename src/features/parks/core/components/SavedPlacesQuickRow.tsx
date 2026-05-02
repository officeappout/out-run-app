'use client';

/**
 * SavedPlacesQuickRow — pair of glassmorphic icon buttons (Home, Work)
 * that sit directly below the FloatingSearchBar. Each button reads the
 * matching slot from `useSavedPlacesStore`:
 *
 *   • Place set    → tap = trigger commute to that destination via the
 *                    parent-supplied `onPick(coords, label)` callback.
 *                    Long-press (300 ms) opens an "edit / clear" mini menu.
 *   • Place unset  → tap = open `SetSavedPlaceSheet` for that kind via
 *                    the parent's `onSetRequest(kind)` callback.
 *
 * Sheet hosting is the parent's responsibility — this row only emits
 * intent. That keeps the row a pure presentational component and lets
 * DiscoverLayer (the parent) coordinate the sheet with the rest of the
 * commute lifecycle.
 *
 * Z-index: matches the FloatingSearchBar tier (z-[70] from the parent
 * container) — sits ABOVE the map, BELOW the full-screen search overlay.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Home, Briefcase, Pencil, Trash2 } from 'lucide-react';
import {
  useSavedPlacesStore,
  SAVED_PLACE_KIND_LABEL,
  type SavedPlaceKind,
  type SavedPlace,
} from '@/features/user/places/store/useSavedPlacesStore';

interface SavedPlacesQuickRowProps {
  /** Fired when user taps a SET shortcut — parent should kick off the
   *  commute flow with these coords as the destination. */
  onPick: (place: SavedPlace) => void;
  /** Fired when user taps an UNSET shortcut — parent should open the
   *  SetSavedPlaceSheet for that kind. */
  onSetRequest: (kind: SavedPlaceKind) => void;
}

const KIND_ICON: Record<SavedPlaceKind, React.ElementType> = {
  home: Home,
  work: Briefcase,
};

/** How long the user must hold a button before the edit menu opens. */
const LONG_PRESS_MS = 350;

export default function SavedPlacesQuickRow({
  onPick,
  onSetRequest,
}: SavedPlacesQuickRowProps) {
  // Subscribe to the store. Note: the store is `skipHydration: true` for
  // SSR safety, so on first client paint the slots may briefly read as
  // null until hydration commits — this is the desired behaviour
  // (empty state until we know we DO have something stored).
  const places = useSavedPlacesStore((s) => s.places);
  const clearPlace = useSavedPlacesStore((s) => s.clearPlace);

  // Long-press → edit menu state. Open menu is keyed by kind so only
  // one is open at a time.
  const [openMenuFor, setOpenMenuFor] = useState<SavedPlaceKind | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFiredRef = useRef(false);

  // Close the menu when the user taps anywhere outside the row.
  useEffect(() => {
    if (!openMenuFor) return;
    const onDocClick = () => setOpenMenuFor(null);
    // Defer the listener attach by one tick so the very tap that opened
    // the menu doesn't immediately close it on its own bubble.
    const t = setTimeout(() => document.addEventListener('click', onDocClick), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener('click', onDocClick);
    };
  }, [openMenuFor]);

  const handlePointerDown = (kind: SavedPlaceKind, place: SavedPlace | null) => {
    if (!place) return; // long-press only meaningful on set shortcuts
    longPressFiredRef.current = false;
    longPressTimerRef.current = setTimeout(() => {
      longPressFiredRef.current = true;
      setOpenMenuFor(kind);
    }, LONG_PRESS_MS);
  };

  const cancelLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleClick = (kind: SavedPlaceKind, place: SavedPlace | null) => {
    cancelLongPress();
    // If the long-press already fired and opened the menu, don't ALSO
    // dispatch the tap action — the user's intent was clearly the menu.
    if (longPressFiredRef.current) {
      longPressFiredRef.current = false;
      return;
    }
    if (place) {
      onPick(place);
    } else {
      onSetRequest(kind);
    }
  };

  const renderButton = (kind: SavedPlaceKind) => {
    const place = places[kind];
    const Icon = KIND_ICON[kind];
    const label = SAVED_PLACE_KIND_LABEL[kind];
    const isSet = place !== null;

    return (
      <div key={kind} className="relative flex-1 min-w-0">
        <button
          type="button"
          onClick={() => handleClick(kind, place)}
          onPointerDown={() => handlePointerDown(kind, place)}
          onPointerUp={cancelLongPress}
          onPointerLeave={cancelLongPress}
          onPointerCancel={cancelLongPress}
          aria-label={isSet ? `נווט ל${label}` : `הגדר ${label}`}
          className="w-full rounded-2xl ring-1 ring-black/5 flex items-center gap-2 px-3 py-2 active:scale-[0.97] transition-transform shadow-[0_6px_18px_rgba(0,0,0,0.08)]"
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.55)',
            backdropFilter: 'blur(24px) saturate(160%)',
            WebkitBackdropFilter: 'blur(24px) saturate(160%)',
          }}
          dir="rtl"
        >
          <span
            className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
              isSet ? 'bg-cyan-50' : 'bg-gray-100/80'
            }`}
          >
            <Icon size={14} className={isSet ? 'text-cyan-600' : 'text-gray-500'} />
          </span>
          <div className="flex-1 min-w-0 text-right">
            <div className="text-[12px] font-black text-gray-900 leading-tight">
              {label}
            </div>
            <div className="text-[10px] text-gray-500 leading-tight truncate">
              {isSet ? place!.address ?? 'מוכן לניווט' : 'הקש להגדרה'}
            </div>
          </div>
        </button>

        {/* Long-press menu — minimal: edit / clear. Anchored under the
            button; closes on outside-click via the effect above. */}
        {openMenuFor === kind && (
          <div
            className="absolute top-full inset-x-0 mt-1 rounded-xl ring-1 ring-black/5 shadow-[0_10px_24px_rgba(0,0,0,0.12)] overflow-hidden z-10"
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.92)',
              backdropFilter: 'blur(24px) saturate(160%)',
              WebkitBackdropFilter: 'blur(24px) saturate(160%)',
            }}
            dir="rtl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => {
                setOpenMenuFor(null);
                onSetRequest(kind);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-right text-[12px] font-bold text-gray-800 active:bg-gray-100"
            >
              <Pencil size={12} className="text-cyan-600" />
              ערוך כתובת
            </button>
            <button
              type="button"
              onClick={() => {
                setOpenMenuFor(null);
                clearPlace(kind);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-right text-[12px] font-bold text-rose-600 border-t border-gray-100 active:bg-rose-50"
            >
              <Trash2 size={12} />
              מחק
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex gap-2" dir="rtl">
      {renderButton('home')}
      {renderButton('work')}
    </div>
  );
}
