'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MapPin, Loader2, Search } from 'lucide-react';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '';

interface AddressResult {
  address: string;
  coords: { lat: number; lng: number };
}

interface Suggestion {
  place_name: string;
  center: [number, number]; // [lng, lat]
}

interface CommunityAddressSearchProps {
  /** Current address string (controlled) */
  value: string;
  /** Called when the user selects a suggestion — provides both address text and coords */
  onChange: (result: AddressResult) => void;
  placeholder?: string;
  /** Bias results toward this location (user's current map center) */
  proximity?: { lat: number; lng: number };
  /** Home v2 (enable_home_v2) look — passed by CreateGroupWizard. Same behaviour. */
  v2?: boolean;
}

export default function CommunityAddressSearch({
  value,
  onChange,
  placeholder = 'חפש כתובת, פארק או אתר...',
  proximity,
  v2 = false,
}: CommunityAddressSearchProps) {
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selected, setSelected] = useState(false); // tracks if user picked from list

  const abortRef = useRef<AbortController | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync external value changes (e.g., form reset)
  useEffect(() => {
    setQuery(value);
  }, [value]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchSuggestions = useCallback(async (q: string) => {
    if (!MAPBOX_TOKEN || q.trim().length < 2) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }

    // Cancel any in-flight request
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setLoading(true);
    try {
      const url = new URL(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json`,
      );
      url.searchParams.set('access_token', MAPBOX_TOKEN);
      url.searchParams.set('language', 'he');
      url.searchParams.set('limit', '5');
      url.searchParams.set('country', 'IL');
      url.searchParams.set('types', 'poi,address,place,neighborhood,locality');
      if (proximity) {
        url.searchParams.set('proximity', `${proximity.lng},${proximity.lat}`);
      }

      const res = await fetch(url.toString(), { signal: abortRef.current.signal });
      if (!res.ok) throw new Error('geocoding failed');

      const data = await res.json();
      const features: Suggestion[] = data.features ?? [];
      setSuggestions(features);
      setShowDropdown(features.length > 0);
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setSuggestions([]);
        setShowDropdown(false);
      }
    } finally {
      setLoading(false);
    }
  }, [proximity]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    setSelected(false);

    // Debounce 320ms
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(val), 320);
  };

  const handleSelect = (s: Suggestion) => {
    const address = s.place_name;
    const coords = { lat: s.center[1], lng: s.center[0] };

    setQuery(address);
    setSelected(true);
    setShowDropdown(false);
    setSuggestions([]);
    onChange({ address, coords });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') setShowDropdown(false);
    if (e.key === 'Enter' && suggestions.length > 0) {
      e.preventDefault();
      handleSelect(suggestions[0]);
    }
  };

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Input */}
      <div className="relative">
        <input
          type="text"
          dir="rtl"
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => { if (suggestions.length > 0 && !selected) setShowDropdown(true); }}
          placeholder={placeholder}
          className={
            v2
              ? `h-12 w-full rounded-[16px] bg-white pl-11 ${selected ? 'pr-11' : 'pr-4'} text-[15px] font-semibold text-v2-ink shadow-v2-ring outline-none placeholder:text-v2-muted focus:ring-2 focus:ring-v2-accent`
              : 'w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-400 bg-white'
          }
        />

        {/* Icon: spinner or search */}
        <div className={`absolute top-1/2 -translate-y-1/2 pointer-events-none ${v2 ? 'left-4 text-v2-muted' : 'left-3 text-gray-400'}`}>
          {loading
            ? <Loader2 className={`w-4 h-4 animate-spin ${v2 ? 'text-v2-deep' : 'text-cyan-500'}`} />
            : <Search className="w-4 h-4" strokeWidth={v2 ? 2.6 : 2} />}
        </div>

        {/* Confirmed-selection checkmark */}
        {selected && (
          <div className={`absolute top-1/2 -translate-y-1/2 ${v2 ? 'right-3.5' : 'right-3'}`}>
            <div className={v2 ? 'grid h-6 w-6 place-items-center rounded-full bg-v2-tint text-v2-deep' : 'w-5 h-5 rounded-full bg-cyan-500 flex items-center justify-center'}>
              <svg className={v2 ? 'h-3 w-3' : 'w-3 h-3 text-white'} viewBox="0 0 12 12" fill="none">
                <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>
        )}
      </div>

      {/* Dropdown */}
      {showDropdown && suggestions.length > 0 && (
        <div
          className={
            v2
              ? 'absolute z-50 top-full mt-2 left-0 right-0 overflow-hidden rounded-[20px] bg-white shadow-v2-card ring-1 ring-v2-hairline'
              : 'absolute z-50 top-full mt-1.5 left-0 right-0 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden'
          }
          dir="rtl"
        >
          {suggestions.map((s, i) => {
            // Split place_name: first part is the POI/street name, rest is city/region
            const parts = s.place_name.split(',');
            const primary = parts[0]?.trim() ?? s.place_name;
            const secondary = parts.slice(1).join(',').trim();

            return (
              <button
                key={i}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); handleSelect(s); }}
                className={
                  v2
                    ? 'flex w-full items-center gap-3 border-b border-v2-hairline px-4 py-3 text-right transition-colors last:border-0 active:bg-v2-tint'
                    : 'w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 active:bg-cyan-50 transition-colors text-right border-b border-gray-50 last:border-0'
                }
              >
                <div className={v2 ? 'grid h-8 w-8 flex-shrink-0 place-items-center rounded-full bg-v2-tint' : 'flex-shrink-0 w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center'}>
                  <MapPin className={v2 ? 'h-4 w-4 text-v2-deep' : 'w-3.5 h-3.5 text-cyan-500'} strokeWidth={v2 ? 2.6 : 2} />
                </div>
                <div className="flex-1 min-w-0 text-right">
                  <p className={v2 ? 'truncate text-[14px] font-black text-v2-ink' : 'text-sm font-bold text-gray-900 truncate'}>{primary}</p>
                  {secondary && (
                    <p className={v2 ? 'truncate text-[12px] font-bold text-v2-muted' : 'text-[11px] text-gray-500 truncate'}>{secondary}</p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Empty result hint */}
      {showDropdown && !loading && suggestions.length === 0 && query.trim().length >= 2 && (
        <div
          className={
            v2
              ? 'absolute z-50 top-full mt-2 left-0 right-0 rounded-[20px] bg-white px-4 py-3 text-center text-[13px] font-bold text-v2-muted shadow-v2-card ring-1 ring-v2-hairline'
              : 'absolute z-50 top-full mt-1.5 left-0 right-0 bg-white rounded-2xl shadow-xl border border-gray-100 px-4 py-3 text-sm text-gray-500 text-center'
          }
        >
          לא נמצאו תוצאות
        </div>
      )}
    </div>
  );
}
