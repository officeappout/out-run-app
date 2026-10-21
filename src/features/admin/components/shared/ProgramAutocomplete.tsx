'use client';

/**
 * ProgramAutocomplete — Searchable program selector with thumbnails.
 *
 * Based on ExerciseAutocomplete pattern. Features:
 * - Instant search filtering (Hebrew + English)
 * - Program image preview (fallback to Target/Crown icon)
 * - Master program badge indicator
 * - Sub-program count display
 * - Keyboard navigation (↑ ↓ Enter Esc)
 * - RTL-ready
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Search, Target, Crown, ChevronDown } from 'lucide-react';

// ── Types ───────────────────────────────────────────────────────────

export interface ProgramOption {
  id: string;
  name: string;
  isMaster?: boolean;
  subPrograms?: string[];
  imageUrl?: string;
  maxLevels?: number;
}

interface ProgramAutocompleteProps {
  programs: ProgramOption[];
  selectedId: string;
  onChange: (programId: string, program?: ProgramOption) => void;
  placeholder?: string;
  /** If true, visually indicate master programs with a Crown badge */
  showMasterBadge?: boolean;
  /** Optional class for the container */
  className?: string;
  disabled?: boolean;
}

// ── Component ───────────────────────────────────────────────────────

export default function ProgramAutocomplete({
  programs,
  selectedId,
  onChange,
  placeholder = 'חפש תוכנית...',
  showMasterBadge = true,
  className = '',
  disabled = false,
}: ProgramAutocompleteProps) {
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

  // Filter programs
  const filtered = programs.filter((p) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.id.toLowerCase().includes(q)
    );
  });

  // Scroll active item into view
  useEffect(() => {
    if (activeIndex >= 0 && listRef.current) {
      const item = listRef.current.children[activeIndex] as HTMLElement | undefined;
      item?.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex]);

  // Selected program label
  const selectedProgram = programs.find((p) => p.id === selectedId);
  const selectedLabel = selectedProgram?.name || '';

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (disabled) return;

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
            const p = filtered[activeIndex];
            onChange(p.id, p);
            setQuery('');
            setIsOpen(false);
          }
          break;
        case 'Escape':
          setIsOpen(false);
          break;
      }
    },
    [isOpen, filtered, activeIndex, onChange, disabled],
  );

  const handleSelect = (p: ProgramOption) => {
    onChange(p.id, p);
    setQuery('');
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className={`relative ${className}`} dir="rtl">
      {/* Input */}
      <div className="relative">
        <Search
          size={16}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
        />
        <input
          type="text"
          value={isOpen ? query : selectedId ? selectedLabel : ''}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIndex(-1);
            if (!isOpen) setIsOpen(true);
          }}
          onFocus={() => {
            if (!disabled) {
              setIsOpen(true);
              setQuery('');
            }
          }}
          onKeyDown={handleKeyDown}
          placeholder={selectedId ? selectedLabel : placeholder}
          disabled={disabled}
          className={`w-full border border-gray-300 rounded-xl pr-10 pl-8 py-2.5 text-right text-sm focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-shadow ${
            disabled ? 'bg-gray-100 cursor-not-allowed opacity-60' : 'bg-white'
          }`}
        />
        <ChevronDown
          size={14}
          className={`absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none transition-transform ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </div>

      {/* Dropdown */}
      {isOpen && !disabled && (
        <ul
          ref={listRef}
          className="absolute z-50 mt-1 w-full max-h-64 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-xl"
        >
          {filtered.length === 0 ? (
            <li className="px-4 py-3 text-sm text-gray-500 text-center">
              לא נמצאו תוצאות
            </li>
          ) : (
            filtered.map((p, idx) => {
              const isActive = idx === activeIndex;
              const isSelected = p.id === selectedId;

              return (
                <li
                  key={p.id}
                  onClick={() => handleSelect(p)}
                  className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors ${
                    isActive
                      ? 'bg-cyan-50'
                      : isSelected
                        ? 'bg-cyan-100/50'
                        : 'hover:bg-gray-50'
                  }`}
                >
                  {/* Icon / Thumbnail */}
                  <div className="w-9 h-9 rounded-lg overflow-hidden flex-shrink-0 bg-gray-100 flex items-center justify-center border border-gray-200">
                    {p.imageUrl ? (
                      <img
                        src={p.imageUrl}
                        alt=""
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    ) : p.isMaster ? (
                      <Crown size={18} className="text-amber-500" />
                    ) : (
                      <Target size={18} className="text-gray-400" />
                    )}
                  </div>

                  {/* Name + metadata */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-bold text-gray-800 truncate">
                        {p.name}
                      </p>
                      {showMasterBadge && p.isMaster && (
                        <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded flex-shrink-0">
                          Master
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <span>{p.id}</span>
                      {p.isMaster && p.subPrograms && (
                        <span>· {p.subPrograms.length} sub-programs</span>
                      )}
                      {p.maxLevels && <span>· {p.maxLevels} levels</span>}
                    </div>
                  </div>

                  {/* Selected indicator */}
                  {isSelected && (
                    <span className="text-xs font-bold text-cyan-600 bg-cyan-100 px-2 py-0.5 rounded flex-shrink-0">
                      נבחר
                    </span>
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
