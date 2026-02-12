'use client';

import React, { useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Search, X, ChevronLeft, MapPin } from 'lucide-react';
import type { SearchOverlayProps } from '../location-types';

export function SearchOverlay({
  searchQuery,
  onSearchChange,
  filteredCities,
  onCitySelect,
  onBack,
}: SearchOverlayProps) {
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => searchInputRef.current?.focus(), 100);
  }, []);

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
                  transition={{ delay: index * 0.02 }}
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
