'use client';

import {
  Filter,
  X,
  Download,
  Eye,
  EyeOff,
  Users,
  MapPin,
  Target,
  Activity,
  Wind,
  Flame,
  User,
} from 'lucide-react';
import { ExecutionLocation, ExerciseRole, MovementGroup, MuscleGroup } from '@/features/content/exercises';
import { FilterState, MatrixCell } from './types';
import {
  LOCATION_ICONS,
  LOCATION_LABELS,
  MUSCLE_GROUP_LABELS,
  MOVEMENT_GROUP_LABELS,
  EXERCISE_ROLE_LABELS,
} from './constants';

import { OutdoorBrand } from '@/features/content/equipment/brands';

interface ContentFiltersProps {
  filters: FilterState;
  allLifestyleTags: string[];
  allLocations: ExecutionLocation[];
  allBrands: OutdoorBrand[];
  selectedCellsCount: number;
  shotListMode: boolean;
  onToggleFilter: <K extends keyof FilterState>(
    category: K,
    value: FilterState[K] extends (infer U)[] ? U : never
  ) => void;
  onClearFilters: () => void;
  onToggleShotListMode: () => void;
  onExportFilmingBrief: () => void;
}

export default function ContentFilters({
  filters,
  allLifestyleTags,
  allLocations,
  allBrands,
  selectedCellsCount,
  shotListMode,
  onToggleFilter,
  onClearFilters,
  onToggleShotListMode,
  onExportFilmingBrief,
}: ContentFiltersProps) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Filter size={20} className="text-gray-500" />
          <h2 className="text-lg font-bold text-gray-900">סינון מתקדם</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onToggleShotListMode}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-sm transition-all ${
              shotListMode
                ? 'bg-red-500 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {shotListMode ? <EyeOff size={16} /> : <Eye size={16} />}
            {shotListMode ? 'מצב רשימת צילום' : 'הצג הכל'}
          </button>
          {selectedCellsCount > 0 && (
            <button
              onClick={onExportFilmingBrief}
              className="flex items-center gap-2 px-4 py-2 bg-purple-500 text-white rounded-lg font-bold text-sm hover:bg-purple-600 transition-colors"
            >
              <Download size={16} />
              ייצא {selectedCellsCount} פריטים
            </button>
          )}
          <button
            onClick={onClearFilters}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-600 rounded-lg font-bold text-sm hover:bg-gray-200 transition-colors"
          >
            <X size={16} />
            נקה סינון
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Lifestyle Tags */}
        <div>
          <label className="text-xs font-bold text-gray-500 mb-2 flex items-center gap-1">
            <Users size={14} />
            אורח חיים / פרסונה
          </label>
          <div className="flex flex-wrap gap-2">
            {allLifestyleTags.map((tag) => (
              <button
                key={tag}
                onClick={() => onToggleFilter('lifestyleTags', tag)}
                className={`px-2 py-1 rounded text-xs font-bold transition-all ${
                  filters.lifestyleTags.includes(tag)
                    ? 'bg-cyan-500 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>

        {/* Locations */}
        <div>
          <label className="text-xs font-bold text-gray-500 mb-2 flex items-center gap-1">
            <MapPin size={14} />
            מיקומים
          </label>
          <div className="flex flex-wrap gap-2">
            {Object.entries(LOCATION_LABELS).map(([loc, label]) => (
              <button
                key={loc}
                onClick={() => onToggleFilter('locations', loc as ExecutionLocation)}
                className={`px-2 py-1 rounded text-xs font-bold transition-all flex items-center gap-1 ${
                  filters.locations.includes(loc as ExecutionLocation)
                    ? 'bg-cyan-500 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {LOCATION_ICONS[loc as ExecutionLocation]}
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Muscle Groups */}
        <div>
          <label className="text-xs font-bold text-gray-500 mb-2 flex items-center gap-1">
            <Target size={14} />
            קבוצות שרירים
          </label>
          <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
            {Object.entries(MUSCLE_GROUP_LABELS).map(([mg, label]) => (
              <button
                key={mg}
                onClick={() => onToggleFilter('muscleGroups', mg as MuscleGroup)}
                className={`px-2 py-1 rounded text-xs font-bold transition-all ${
                  filters.muscleGroups.includes(mg as MuscleGroup)
                    ? 'bg-cyan-500 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Movement Patterns */}
        <div>
          <label className="text-xs font-bold text-gray-500 mb-2 flex items-center gap-1">
            <Activity size={14} />
            דפוסי תנועה
          </label>
          <div className="flex flex-wrap gap-2">
            {Object.entries(MOVEMENT_GROUP_LABELS).map(([pattern, label]) => (
              <button
                key={pattern}
                onClick={() => onToggleFilter('movementPatterns', pattern as MovementGroup)}
                className={`px-2 py-1 rounded text-xs font-bold transition-all ${
                  filters.movementPatterns.includes(pattern as MovementGroup)
                    ? 'bg-cyan-500 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Exercise Roles */}
        <div>
          <label className="text-xs font-bold text-gray-500 mb-2 flex items-center gap-1">
            <Flame size={14} />
            תפקיד התרגיל
          </label>
          <div className="flex flex-wrap gap-2">
            {Object.entries(EXERCISE_ROLE_LABELS).map(([role, label]) => (
              <button
                key={role}
                onClick={() => onToggleFilter('exerciseRoles', role as ExerciseRole)}
                className={`px-2 py-1 rounded text-xs font-bold transition-all ${
                  filters.exerciseRoles.includes(role as ExerciseRole)
                    ? 'bg-cyan-500 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {role === 'warmup' && <Flame size={12} />}
                {role === 'cooldown' && <Wind size={12} />}
                {role === 'main' && <Activity size={12} />}
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Movement Type */}
        <div>
          <label className="text-xs font-bold text-gray-500 mb-2 flex items-center gap-1">
            <Activity size={14} />
            סוג תנועה
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => onToggleFilter('movementTypes', 'compound')}
              className={`px-2 py-1 rounded text-xs font-bold transition-all ${
                filters.movementTypes.includes('compound')
                  ? 'bg-cyan-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              מורכב
            </button>
            <button
              onClick={() => onToggleFilter('movementTypes', 'isolation')}
              className={`px-2 py-1 rounded text-xs font-bold transition-all ${
                filters.movementTypes.includes('isolation')
                  ? 'bg-cyan-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              מבודד
            </button>
          </div>
        </div>

        {/* Symmetry */}
        <div>
          <label className="text-xs font-bold text-gray-500 mb-2 flex items-center gap-1">
            <Users size={14} />
            סימטריה
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => onToggleFilter('symmetries', 'bilateral')}
              className={`px-2 py-1 rounded text-xs font-bold transition-all flex items-center gap-1 ${
                filters.symmetries.includes('bilateral')
                  ? 'bg-cyan-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <Users size={12} />
              דו-צדדי
            </button>
            <button
              onClick={() => onToggleFilter('symmetries', 'unilateral')}
              className={`px-2 py-1 rounded text-xs font-bold transition-all flex items-center gap-1 ${
                filters.symmetries.includes('unilateral')
                  ? 'bg-cyan-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <User size={12} />
              חד-צדדי
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
