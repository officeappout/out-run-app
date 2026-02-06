'use client';

export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { Exercise, getLocalizedText } from '@/features/content/exercises';
import { useContentMatrix } from './hooks/useContentMatrix';
import StatsOverview from './components/StatsOverview';
import ContentFilters from './components/ContentFilters';
import StatusGrid from './components/StatusGrid';
import { MatrixCell } from './components/types';

export default function ContentStatusPage() {
  const {
    loading,
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
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">טוען...</div>
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
