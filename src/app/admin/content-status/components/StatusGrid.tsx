'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, AlertCircle, XCircle, Video, Grid3x3, AlertTriangle } from 'lucide-react';
import { Exercise, ExecutionLocation, getLocalizedText } from '@/features/content/exercises';
import { MatrixCell, GroupByOption } from './types';
import { LOCATION_ICONS, LOCATION_LABELS } from './constants';
import PersonaBadge from './PersonaBadge';

interface StatusGridProps {
  exercises: Exercise[];
  groupedExercises: Record<string, Exercise[]>;
  matrixCells: MatrixCell[];
  allLocations: ExecutionLocation[];
  groupBy: GroupByOption;
  shotListMode: boolean;
  selectedCells: Set<string>;
  onGroupByChange: (option: GroupByOption) => void;
  onCellSelect: (cellKey: string, status: MatrixCell['status']) => void;
}

function getCellStatusIcon(status: MatrixCell['status']) {
  if (status === 'complete') {
    return <CheckCircle2 size={16} className="text-green-500" />;
  } else if (status === 'partial') {
    return <AlertCircle size={16} className="text-yellow-500" />;
  } else {
    return <XCircle size={16} className="text-red-500" />;
  }
}

export default function StatusGrid({
  exercises,
  groupedExercises,
  matrixCells,
  allLocations,
  groupBy,
  shotListMode,
  selectedCells,
  onGroupByChange,
  onCellSelect,
}: StatusGridProps) {
  const router = useRouter();

  // Navigate to exercise edit page with context
  const handleCellClick = (e: React.MouseEvent, exerciseId: string, cell: MatrixCell) => {
    // If Ctrl/Cmd is held, allow selection instead of navigation
    if (e.ctrlKey || e.metaKey) {
      e.stopPropagation();
      if (cell.status !== 'complete') {
        const cellKey = `${exerciseId}|${cell.location}`;
        onCellSelect(cellKey, cell.status);
      }
      return;
    }

    // Build query parameters
    const params = new URLSearchParams();
    params.set('location', cell.location);
    if (cell.lifestyleTags.length > 0) {
      params.set('persona', cell.lifestyleTags[0]); // Use first persona tag
    }

    router.push(`/admin/exercises/${exerciseId}?${params.toString()}`);
  };

  return (
    <>
      {/* Group By Toggle */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4">
        <div className="flex items-center gap-4">
          <label className="text-sm font-bold text-gray-700 flex items-center gap-2">
            <Grid3x3 size={16} />
            קיבוץ לפי:
          </label>
          <div className="flex gap-2">
            {(['program', 'muscleGroup', 'location', 'pattern'] as GroupByOption[]).map((option) => (
              <button
                key={option}
                onClick={() => onGroupByChange(option)}
                className={`px-4 py-2 rounded-lg font-bold text-sm transition-all ${
                  groupBy === option
                    ? 'bg-cyan-500 text-white shadow-md'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {option === 'program' && 'תוכנית'}
                {option === 'muscleGroup' && 'קבוצת שריר'}
                {option === 'location' && 'מיקום'}
                {option === 'pattern' && 'דפוס תנועה'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content Matrix */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3 text-xs font-bold text-gray-500 border-b border-gray-200 sticky right-0 bg-gray-50 z-20 min-w-[200px]">
                  תרגיל
                </th>
                {allLocations.map((location) => (
                  <th
                    key={location}
                    className="px-4 py-3 text-xs font-bold text-gray-500 border-b border-gray-200 text-center min-w-[120px]"
                  >
                    <div className="flex flex-col items-center gap-1">
                      {LOCATION_ICONS[location]}
                      <span>{LOCATION_LABELS[location]}</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(groupedExercises).map(([groupName, groupExercises]) => (
                <React.Fragment key={groupName}>
                  <tr className="bg-gray-100">
                    <td colSpan={allLocations.length + 1} className="px-4 py-2 font-bold text-gray-700">
                      {groupName} ({groupExercises.length})
                    </td>
                  </tr>
                  {groupExercises.map((exercise) => {
                    const exerciseCells = matrixCells.filter((c) => c.exerciseId === exercise.id);
                    const shouldShow = shotListMode
                      ? exerciseCells.some((c) => c.status !== 'complete')
                      : true;

                    if (!shouldShow) return null;

                    return (
                      <tr key={exercise.id} className="hover:bg-blue-50/50 transition-colors">
                        <td 
                          className="px-4 py-3 border-b border-gray-100 sticky right-0 bg-white z-10 cursor-pointer hover:bg-blue-50/30 transition-colors group"
                          onClick={() => router.push(`/admin/exercises/${exercise.id}`)}
                          title="לחץ לעריכת התרגיל"
                        >
                          <div className="font-bold text-gray-900 group-hover:text-cyan-600 transition-colors">
                            {getLocalizedText(exercise.name, 'he')}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            {exercise.movementType === 'compound' ? 'מורכב' : exercise.movementType === 'isolation' ? 'מבודד' : ''}
                            {exercise.symmetry === 'unilateral' && ' • חד-צדדי'}
                            {exercise.symmetry === 'bilateral' && ' • דו-צדדי'}
                          </div>
                        </td>
                        {allLocations.map((location) => {
                          const cell = exerciseCells.find((c) => c.location === location);
                          if (!cell) {
                            return (
                              <td
                                key={location}
                                className="px-4 py-3 border-b border-gray-100 text-center"
                              >
                                <div className="text-gray-300">—</div>
                              </td>
                            );
                          }

                          const cellKey = `${exercise.id}|${location}`;
                          const isSelected = selectedCells.has(cellKey);

                          return (
                            <td
                              key={location}
                              className={`px-4 py-3 border-b border-gray-100 text-center relative group ${
                                isSelected ? 'bg-purple-100' : ''
                              } cursor-pointer hover:bg-cyan-50 hover:border-cyan-200 hover:border-2 transition-all`}
                              onClick={(e) => handleCellClick(e, exercise.id, cell)}
                              title="לחץ לעריכת התרגיל והוספת תוכן (Ctrl+Click לבחירה)"
                            >
                              <div className="flex flex-col items-center gap-1">
                                <div className="flex items-center gap-1">
                                  {getCellStatusIcon(cell.status)}
                                  {cell.hasVideo && !cell.hasNotificationText && (
                                    <AlertTriangle size={12} className="text-yellow-500" title="חסר טקסט להתראה" />
                                  )}
                                </div>
                                <div className="flex flex-wrap gap-1 justify-center">
                                  {cell.lifestyleTags.slice(0, 3).map((tag) => (
                                    <PersonaBadge key={tag} tag={tag} />
                                  ))}
                                </div>
                                {cell.hasYouTubeTutorial && (
                                  <Video size={12} className="text-blue-500" />
                                )}
                              </div>
                              {/* Subtle hover indicator */}
                              <div className="absolute inset-0 border-2 border-cyan-400 rounded-lg opacity-0 group-hover:opacity-20 transition-opacity pointer-events-none" />
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
