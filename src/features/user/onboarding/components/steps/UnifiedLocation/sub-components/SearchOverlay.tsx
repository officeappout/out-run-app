'use client';

import React, { useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Search, X, ChevronLeft, ChevronRight, MapPin } from 'lucide-react';
import type { SearchOverlayProps } from '../location-types';

export function SearchOverlay({
  searchQuery,
  onSearchChange,
  filteredCities,
  onCitySelect,
  onBack,
  v2 = false,
}: SearchOverlayProps) {
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => searchInputRef.current?.focus(), 100);
  }, []);

  if (v2) {
    // v2 — full-screen search over the (blurred) map. The step is `fixed
    // inset-0` and covers <main>, so this overlay owns the top inset once.
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="absolute inset-0 z-30 flex flex-col bg-v2-surface"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}
        dir="rtl"
      >
        <div className="flex-shrink-0 px-4 pb-3">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onBack}
              aria-label="חזרה"
              className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-full bg-white shadow-v2-ring active:scale-[0.97] transition-transform duration-150 ease-v2"
            >
              <ChevronRight size={20} className="text-v2-ink" />
            </button>

            <div className="relative flex-1 min-w-0">
              <Search
                size={18}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-v2-muted pointer-events-none z-10"
              />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="חפשו עיר או שכונה"
                className="w-full h-[52px] rounded-2xl bg-white border-0 pr-11 pl-11 text-[16px] font-semibold text-v2-ink shadow-v2-ring focus:ring-2 focus:ring-inset focus:ring-v2-accent/60 outline-none placeholder:text-v2-muted text-right"
                dir="rtl"
              />
              {searchQuery && (
                <button
                  onClick={() => onSearchChange('')}
                  className="absolute left-3 top-1/2 -translate-y-1/2 grid h-7 w-7 place-items-center rounded-full bg-v2-surface ring-1 ring-inset ring-v2-hairline z-10"
                  type="button"
                  aria-label="נקה חיפוש"
                >
                  <X size={14} className="text-v2-ink-2" />
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
          {filteredCities.length > 0 ? (
            <div className="w-full rounded-[20px] bg-white shadow-v2-ring overflow-hidden divide-y divide-v2-hairline text-right">
              {filteredCities.map((city, index) => (
                <motion.button
                  key={city.id}
                  type="button"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(index, 20) * 0.02 }}
                  onClick={() => onCitySelect(city)}
                  className="w-full min-h-[60px] px-4 py-3 flex flex-row items-center gap-3 active:bg-v2-tint transition-colors"
                >
                  <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-v2-tint">
                    <MapPin size={17} className="text-v2-deep" />
                  </span>
                  <span className="flex-1 min-w-0 text-right">
                    <span className="block truncate text-[15px] font-extrabold text-v2-ink">
                      {city.name}
                    </span>
                    {city.parentName && (
                      <span className="block truncate text-[12.5px] font-bold text-v2-muted mt-0.5">
                        {city.parentName}
                      </span>
                    )}
                  </span>
                  <ChevronLeft size={18} className="flex-shrink-0 text-v2-muted" />
                </motion.button>
              ))}
            </div>
          ) : searchQuery.length > 0 ? (
            <div className="text-center py-16">
              <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-white shadow-v2-ring">
                <Search size={24} className="text-v2-muted" />
              </div>
              <p className="text-[15px] font-extrabold text-v2-ink">
                לא נמצאו תוצאות עבור &quot;{searchQuery}&quot;
              </p>
              <p className="text-[12.5px] font-bold text-v2-muted mt-1">
                נסו לחפש עיר או שכונה אחרת
              </p>
            </div>
          ) : null}
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="absolute inset-0 z-30 flex flex-col bg-white pt-20"
    >
      {/* Fixed Search Header */}
      <div className="sticky top-[80px] z-50 bg-white border-b border-gray-200 shadow-sm">
        <div className="p-4 pb-4">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="w-10 h-10 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
            >
              <ChevronLeft size={20} className="text-gray-700" />
            </button>
            
            <div className="flex-1 relative">
              <Search 
                size={18} 
                className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-500 pointer-events-none z-10" 
              />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="חפשו עיר או שכונה"
                className="w-full bg-gray-100 rounded-xl px-4 py-3 pr-11 text-gray-900 placeholder-gray-500 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#5BC2F2] focus:border-transparent focus:bg-white transition-all"
                style={{ 
                  fontFamily: 'var(--font-simpler)',
                  direction: 'rtl',
                  textAlign: 'right'
                }}
                dir="rtl"
              />
              {searchQuery && (
                <button
                  onClick={() => onSearchChange('')}
                  className="absolute left-4 top-1/2 transform -translate-y-1/2 hover:bg-gray-200 rounded-full p-1 transition-colors z-10"
                  type="button"
                  aria-label="נקה חיפוש"
                >
                  <X size={16} className="text-gray-500" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Scrollable Results List */}
      <div className="flex-1 overflow-y-auto bg-gray-50" dir="rtl">
        <div className="p-4 pr-4">
          {filteredCities.length > 0 ? (
            <div className="w-full bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden text-right">
              {filteredCities.map((city, index) => (
                <motion.button
                  key={city.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(index, 20) * 0.02 }}
                  onClick={() => onCitySelect(city)}
                  className="w-full pr-5 pl-4 py-4 flex flex-row items-center gap-3 border-b border-gray-100 last:border-b-0 hover:bg-[#5BC2F2]/5 active:bg-[#5BC2F2]/10 transition-colors"
                >
                  <MapPin size={18} className="text-[#5BC2F2] flex-shrink-0" />
                  <div className="flex-1 text-right">
                    <p 
                      className="font-bold text-gray-900 text-base text-right"
                      style={{ fontFamily: 'var(--font-simpler)' }}
                    >
                      {city.name}
                    </p>
                    {city.parentName && (
                      <p 
                        className="text-sm text-gray-500 mt-0.5 text-right"
                        style={{ fontFamily: 'var(--font-simpler)' }}
                      >
                        {city.parentName}
                      </p>
                    )}
                  </div>
                </motion.button>
              ))}
            </div>
          ) : searchQuery.length > 0 ? (
            <div className="text-center py-16">
              <div className="text-gray-400 mb-2">
                <Search size={32} className="mx-auto" />
              </div>
              <p className="text-gray-600 font-medium" style={{ fontFamily: 'var(--font-simpler)' }}>
                לא נמצאו תוצאות עבור &quot;{searchQuery}&quot;
              </p>
              <p className="text-gray-400 text-sm mt-1" style={{ fontFamily: 'var(--font-simpler)' }}>
                נסו לחפש עיר או שכונה אחרת
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </motion.div>
  );
}
