'use client';

/**
 * FloatingSearchBar — premium glassmorphic top search bar for the
 * unified discover/commute surface. Replaces the opaque white pill
 * `DiscoverLayer.renderTopBar` used today; visual language is borrowed
 * from `MapLoadingSkeleton` (`backdropFilter: 'blur(24px) saturate(160%)'`)
 * with a lighter `rgba(255,255,255,0.55)` tint instead of the slate
 * AI-overlay tint, so dark text on a colourful map is still legible.
 *
 * Behavior is identical to the legacy bar — focus opens the
 * NavigationHub full-screen search by flipping `logic.navState` to
 * `'searching'`. The actual suggestion list, address-pick handling,
 * and entity-vs-address branching all live in NavigationHub +
 * useMapLogic.handleAddressSelect, so this component stays purely
 * presentational.
 *
 * Z-index: kept at z-[70] (same tier as the legacy top bar) so the
 * full-screen search overlay (z-[100]) and modal sheets (z-[100]+)
 * still sit above it.
 */

import React from 'react';
import { Search } from 'lucide-react';

interface FloatingSearchBarProps {
  /** Current input value — proxied so the bar feels responsive while
   *  the search is also the trigger that opens the full overlay. */
  searchQuery: string;
  onSearchChange: (q: string) => void;
  /** Fires when the user focuses the input — parent flips navState to
   *  'searching' so NavigationHub mounts. */
  onFocus: () => void;
  /** Forward ref so useMapLogic can re-focus the same input from
   *  inside the NavigationHub overlay when needed. */
  inputRef?: React.RefObject<HTMLInputElement>;
  /** Optional placeholder; defaults to a commute-leaning prompt. */
  placeholder?: string;
}

export default function FloatingSearchBar({
  searchQuery,
  onSearchChange,
  onFocus,
  inputRef,
  placeholder = 'לאן הולכים?',
}: FloatingSearchBarProps) {
  return (
    <div
      className="pointer-events-auto rounded-2xl ring-1 ring-black/5 flex items-center h-12 ps-4 pe-3 gap-2 shadow-[0_10px_30px_rgba(0,0,0,0.10)]"
      style={{
        // Glassmorphism tokens — same recipe as MapLoadingSkeleton's
        // overlay, just with a brighter base tint so input text reads
        // against any map colour underneath. Saturation boost makes
        // the map's greens/blues pop through the blur for that "the
        // world is right behind this glass" feel.
        backgroundColor: 'rgba(255, 255, 255, 0.55)',
        backdropFilter: 'blur(24px) saturate(160%)',
        WebkitBackdropFilter: 'blur(24px) saturate(160%)',
      }}
      dir="rtl"
    >
      <Search size={16} className="text-gray-700 shrink-0" />
      <input
        ref={inputRef}
        type="text"
        placeholder={placeholder}
        value={searchQuery}
        onFocus={onFocus}
        onChange={(e) => onSearchChange(e.target.value)}
        className="flex-1 bg-transparent border-none outline-none text-sm font-semibold text-gray-900 placeholder:text-gray-500 text-right"
      />
    </div>
  );
}
