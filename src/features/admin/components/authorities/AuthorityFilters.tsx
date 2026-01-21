import { useState } from 'react';
import { Search, X } from 'lucide-react';
import { AuthorityType } from '@/types/admin-types';

interface AuthorityFiltersProps {
  typeFilter: AuthorityType | 'all';
  viewMode: 'grouped' | 'flat';
  searchQuery: string;
  onTypeFilterChange: (filter: AuthorityType | 'all') => void;
  onViewModeChange: (mode: 'grouped' | 'flat') => void;
  onSearchChange: (query: string) => void;
}

export default function AuthorityFilters({
  typeFilter,
  viewMode,
  searchQuery,
  onTypeFilterChange,
  onViewModeChange,
  onSearchChange,
}: AuthorityFiltersProps) {
  return (
    <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 space-y-4">
      {/* Search Bar */}
      <div className="relative">
        <Search size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="חפש לפי שם הרשות..."
          className="w-full pr-10 pl-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 outline-none text-right text-black placeholder:text-gray-600 bg-white"
          dir="rtl"
        />
        {searchQuery && (
          <button
            onClick={() => onSearchChange('')}
            className="absolute left-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Filters Row */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <label className="text-sm font-bold text-gray-700">סינון לפי סוג:</label>
          <select
            value={typeFilter}
            onChange={(e) => onTypeFilterChange(e.target.value as AuthorityType | 'all')}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 outline-none text-black bg-white"
          >
            <option value="all">הכל</option>
            <option value="regional_council">מועצות אזוריות</option>
            <option value="local_council">מועצות מקומיות</option>
            <option value="city">עיריות</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onViewModeChange('grouped')}
            className={`px-4 py-2 rounded-lg font-bold transition-colors ${
              viewMode === 'grouped'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            תצוגה היררכית
          </button>
          <button
            onClick={() => onViewModeChange('flat')}
            className={`px-4 py-2 rounded-lg font-bold transition-colors ${
              viewMode === 'flat'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            תצוגה שטוחה
          </button>
        </div>
      </div>
    </div>
  );
}
