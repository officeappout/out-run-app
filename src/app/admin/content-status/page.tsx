'use client';

export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { Exercise, getLocalizedText } from '@/features/content/exercises';
import { useContentMatrix } from './hooks/useContentMatrix';
import StatsOverview from './components/StatsOverview';
import ContentFilters from './components/ContentFilters';
import StatusGrid from './components/StatusGrid';
import { MatrixCell } from './components/types';
import { AlertTriangle, Loader2 } from 'lucide-react';

export default function ContentStatusPage() {
  const {
    loading,
    error,
    allLocations,
    allLifestyleTags,
    allBrands,
    filteredExercises,
    matrixCells,
    groupedExercises,
    stats,
    filters,
    groupBy,
    setGroupBy,
    toggleFilter,
    clearFilters,
  } = useContentMatrix();

  const [shotListMode, setShotListMode] = useState(false);
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());

  // Export filming brief
  const exportFilmingBrief = () => {
    const selectedCellsData = Array.from(selectedCells)
      .map((cellKey) => {
        const [exerciseId, location] = cellKey.split('|');
        const exercise = filteredExercises.find((e) => e.id === exerciseId);
        const cell = matrixCells.find((c) => c.exerciseId === exerciseId && c.location === location);
        if (!exercise || !cell) return null;
        return {
          exerciseName: getLocalizedText(exercise.name, 'he'),
          location: location,
          status: cell.status,
          missing: {
            video: !cell.hasVideo,
            duration: !cell.hasDuration,
            notificationText: !cell.hasNotificationText,
            youtubeTutorial: !cell.hasYouTubeTutorial,
          },
        };
      })
      .filter(Boolean);

    const brief = {
      generatedAt: new Date().toISOString(),
      totalItems: selectedCellsData.length,
      items: selectedCellsData,
    };

    const blob = new Blob([JSON.stringify(brief, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `filming-brief-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Handle cell selection
  const handleCellSelect = (cellKey: string, status: MatrixCell['status']) => {
    if (status !== 'complete') {
      const newSelected = new Set(selectedCells);
      if (newSelected.has(cellKey)) {
        newSelected.delete(cellKey);
      } else {
        newSelected.add(cellKey);
      }
      setSelectedCells(newSelected);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
        <p className="text-gray-500 font-medium">טוען נתוני מדיה...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4" dir="rtl">
        <div className="flex items-center gap-3 px-6 py-4 bg-red-50 border border-red-200 rounded-2xl">
          <AlertTriangle className="w-6 h-6 text-red-500 flex-shrink-0" />
          <div>
            <p className="font-bold text-red-700">שגיאה בטעינת הנתונים</p>
            <p className="text-sm text-red-600 mt-1">{error}</p>
          </div>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors"
        >
          נסה שוב
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <div>
          <h1 className="text-3xl font-black text-gray-900">מרכז פעולות תוכן (Matrix 2.0)</h1>
          <p className="text-gray-500 mt-2">ניהול וניטור כיסוי תוכן מלא</p>
        </div>
      </div>

      {/* Stats Bar */}
      <StatsOverview stats={stats} />

      {/* Filters Bar */}
      <ContentFilters
        filters={filters}
        allLifestyleTags={allLifestyleTags}
        allLocations={allLocations}
        allBrands={allBrands}
        selectedCellsCount={selectedCells.size}
        shotListMode={shotListMode}
        onToggleFilter={toggleFilter}
        onClearFilters={clearFilters}
        onToggleShotListMode={() => setShotListMode(!shotListMode)}
        onExportFilmingBrief={exportFilmingBrief}
      />

      {/* Content Matrix */}
      <StatusGrid
        exercises={filteredExercises}
        groupedExercises={groupedExercises}
        matrixCells={matrixCells}
        allLocations={allLocations}
        groupBy={groupBy}
        shotListMode={shotListMode}
        selectedCells={selectedCells}
        onGroupByChange={setGroupBy}
        onCellSelect={handleCellSelect}
      />
    </div>
  );
}
