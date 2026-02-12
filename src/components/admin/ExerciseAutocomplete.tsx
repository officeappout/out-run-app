'use client';

/**
 * ExerciseAutocomplete — Searchable exercise selector with thumbnails.
 *
 * Features:
 * - Instant search filtering (Hebrew + English)
 * - Exercise thumbnail preview (fallback to icon when missing)
 * - Keyboard navigation (↑ ↓ Enter Esc)
 * - RTL-ready
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Search, Dumbbell, Camera } from 'lucide-react';
import type { Exercise } from '@/features/content/exercises/core/exercise.types';
import { getLocalizedText } from '@/features/content/shared/localized-text.types';

// ── Helpers ─────────────────────────────────────────────────────────

/** Extract the best available thumbnail URL from an Exercise object. */
function getExerciseThumbnail(ex: Exercise): string | null {
  // 1) Legacy
  if (ex.media?.imageUrl) return ex.media.imageUrl;
  // 2) Execution methods (new)
  const methods = ex.executionMethods ?? (ex as any).execution_methods;
  if (Array.isArray(methods) && methods.length > 0) {
    const m = methods[0]?.media;
    if (m?.imageUrl) return m.imageUrl;
    if (m?.mainVideoUrl) return m.mainVideoUrl; // fallback to video poster
  }
  return null;
}

// ── Props ───────────────────────────────────────────────────────────

interface ExerciseAutocompleteProps {
  exercises: Exercise[];
  selectedId: string;
  onChange: (exerciseId: string, exerciseName: string) => void;
  placeholder?: string;
}

// ── Component ───────────────────────────────────────────────────────

export default function ExerciseAutocomplete({
  exercises,
  selectedId,
  onChange,
  placeholder = 'חפש תרגיל...',
}: ExerciseAutocompleteProps) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Filter exercises
  const filtered = exercises.filter((ex) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    const he = getLocalizedText(ex.name, 'he').toLowerCase();
    const en = getLocalizedText(ex.name, 'en').toLowerCase();
    return he.includes(q) || en.includes(q) || ex.id.toLowerCase().includes(q);
  });

  // Scroll active item into view
  useEffect(() => {
    if (activeIndex >= 0 && listRef.current) {
      const item = listRef.current.children[activeIndex] as HTMLElement | undefined;
      item?.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex]);

  // Selected exercise label
  const selectedExercise = exercises.find((e) => e.id === selectedId);
  const selectedLabel = selectedExercise
    ? getLocalizedText(selectedExercise.name, 'he') || getLocalizedText(selectedExercise.name, 'en')
    : '';

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen) {
        if (e.key === 'ArrowDown' || e.key === 'Enter') {
          setIsOpen(true);
          e.preventDefault();
        }
        return;
      }

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setActiveIndex((prev) => Math.min(prev + 1, filtered.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setActiveIndex((prev) => Math.max(prev - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (activeIndex >= 0 && activeIndex < filtered.length) {
            const ex = filtered[activeIndex];
            const name = getLocalizedText(ex.name, 'he') || getLocalizedText(ex.name, 'en') || ex.id;
            onChange(ex.id, name);
            setQuery('');
            setIsOpen(false);
          }
          break;
        case 'Escape':
          setIsOpen(false);
          break;
      }
    },
    [isOpen, filtered, activeIndex, onChange]
  );

  const handleSelect = (ex: Exercise) => {
    const name = getLocalizedText(ex.name, 'he') || getLocalizedText(ex.name, 'en') || ex.id;
    onChange(ex.id, name);
    setQuery('');
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className="relative" dir="rtl">
      {/* Display selected value or search input */}
      <div className="relative">
        <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={isOpen ? query : (selectedId ? selectedLabel : '')}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIndex(-1);
            if (!isOpen) setIsOpen(true);
          }}
          onFocus={() => {
            setIsOpen(true);
            setQuery('');
          }}
          onKeyDown={handleKeyDown}
          placeholder={selectedId ? selectedLabel : placeholder}
          className="w-full border border-gray-300 rounded-xl pr-10 pl-4 py-2.5 text-right focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-shadow"
        />
      </div>

      {/* Dropdown */}
      {isOpen && (
        <ul
          ref={listRef}
          className="absolute z-50 mt-1 w-full max-h-64 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-xl"
        >
          {filtered.length === 0 ? (
            <li className="px-4 py-3 text-sm text-gray-500 text-center">לא נמצאו תוצאות</li>
          ) : (
            filtered.map((ex, idx) => {
              const thumb = getExerciseThumbnail(ex);
              const nameHe = getLocalizedText(ex.name, 'he');
              const nameEn = getLocalizedText(ex.name, 'en');
              const isActive = idx === activeIndex;
              const isSelected = ex.id === selectedId;

              return (
                <li
                  key={ex.id}
                  onClick={() => handleSelect(ex)}
                  className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors ${
                    isActive
                      ? 'bg-cyan-50'
                      : isSelected
                      ? 'bg-cyan-100/50'
                      : 'hover:bg-gray-50'
                  }`}
                >
                  {/* Thumbnail */}
                  <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-gray-100 flex items-center justify-center border border-gray-200">
                    {thumb ? (
                      <img
                        src={thumb}
                        alt=""
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                          (e.target as HTMLImageElement).parentElement!.classList.add('exercise-thumb-err');
                        }}
                      />
                    ) : (
                      <Dumbbell size={18} className="text-gray-400" />
                    )}
                  </div>

                  {/* Name */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-800 truncate">{nameHe || nameEn || ex.id}</p>
                    {nameHe && nameEn && (
                      <p className="text-xs text-gray-500 truncate">{nameEn}</p>
                    )}
                  </div>

                  {/* Selected indicator */}
                  {isSelected && (
                    <span className="text-xs font-bold text-cyan-600 bg-cyan-100 px-2 py-0.5 rounded">נבחר</span>
                  )}
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
