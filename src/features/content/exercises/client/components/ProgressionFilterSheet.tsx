'use client';

/**
 * ProgressionFilterSheet — unified Program + Level filter.
 *
 * A "level" is meaningless without a program context (L12 of "Push" ≠ L12 of
 * "Legs"), so this sheet enforces the dependency:
 *   1. User picks a program from a horizontal scroll of circular icons.
 *   2. The level grid populates dynamically from `program.maxLevels`.
 *   3. Changing the program resets the level if it falls out of the new range.
 *   4. A single Apply button commits both fields atomically.
 */

import { useEffect, useMemo, useState } from 'react';
import FilterSheet from './FilterSheet';
import { useExerciseLibraryStore } from '../store/useExerciseLibraryStore';
import { getAllPrograms } from '@/features/content/programs/core/program.service';
import {
  getProgramIcon,
  resolveIconKey,
} from '@/features/content/programs/core/program-icon.util';
import type { Program } from '@/features/content/programs/core/program.types';

const DEFAULT_MAX_LEVELS = 20;
const GRID_COLS = 5;

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function ProgressionFilterSheet({ isOpen, onClose }: Props) {
  const filters = useExerciseLibraryStore((s) => s.filters);
  const setProgressionFilter = useExerciseLibraryStore(
    (s) => s.setProgressionFilter,
  );

  const [programs, setPrograms] = useState<Program[]>([]);
  const [draftProgramId, setDraftProgramId] = useState<string | null>(null);
  const [draftLevel, setDraftLevel] = useState<number | null>(null);

  // Lazy-load programs the first time the sheet opens.
  useEffect(() => {
    if (!isOpen || programs.length > 0) return;
    let cancelled = false;
    getAllPrograms()
      .then((list) => {
        if (!cancelled) setPrograms(list);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isOpen, programs.length]);

  // Re-seed draft state from the store every time the sheet (re)opens so that
  // a cancelled session leaves the committed filter intact.
  useEffect(() => {
    if (isOpen) {
      setDraftProgramId(filters.programId);
      setDraftLevel(filters.level);
    }
  }, [isOpen, filters.programId, filters.level]);

  const selectedProgram = useMemo(
    () => programs.find((p) => p.id === draftProgramId) ?? null,
    [programs, draftProgramId],
  );

  const maxLevel = selectedProgram?.maxLevels ?? DEFAULT_MAX_LEVELS;

  // Switching program: drop the level if it would sit outside the new range.
  function handleSelectProgram(p: Program) {
    if (draftProgramId === p.id) {
      setDraftProgramId(null);
      setDraftLevel(null);
      return;
    }
    setDraftProgramId(p.id);
    const newMax = p.maxLevels ?? DEFAULT_MAX_LEVELS;
    if (draftLevel != null && draftLevel > newMax) {
      setDraftLevel(null);
    }
  }

  function handleApply() {
    setProgressionFilter(draftProgramId, draftLevel);
    onClose();
  }

  function handleClear() {
    setDraftProgramId(null);
    setDraftLevel(null);
    setProgressionFilter(null, null);
    onClose();
  }

  // ── Custom footer: status line + single Apply button ────────────────────
  const statusLine = (() => {
    if (!selectedProgram) return null;
    if (draftLevel == null) {
      return `מציג את כל הרמות של ${selectedProgram.name}`;
    }
    return `מציג תרגילי ${selectedProgram.name} מרמה ${draftLevel}`;
  })();

  const customFooter = (
    <div className="px-5 pt-3 pb-4 border-t border-gray-100 bg-white space-y-2">
      <p
        className="text-[12px] text-center font-medium min-h-[18px]"
        style={{ color: selectedProgram ? '#00a89e' : '#9ca3af' }}
      >
        {statusLine ?? 'בחר מסלול כדי לראות את הרמות'}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleClear}
          className="flex-1 py-2.5 rounded-lg text-sm font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
        >
          נקה
        </button>
        <button
          type="button"
          onClick={handleApply}
          className="flex-1 py-2.5 rounded-lg text-sm font-bold text-white bg-primary hover:opacity-90 transition-opacity"
        >
          החל סינון
        </button>
      </div>
    </div>
  );

  // ── Build the level grid: ['הכל', 1, 2, ..., maxLevel] ─────────────────
  const levelCells = useMemo(() => {
    const cells: Array<{ id: string; label: string; value: number | null }> = [
      { id: 'all', label: 'הכל', value: null },
    ];
    for (let i = 1; i <= maxLevel; i++) {
      cells.push({ id: `lvl-${i}`, label: String(i), value: i });
    }
    return cells;
  }, [maxLevel]);

  return (
    <FilterSheet
      isOpen={isOpen}
      title="מסלול ורמה"
      onClose={onClose}
      footer={customFooter}
    >
      <div className="space-y-5">
        {/* ── Programs — horizontal scroll of circular icons ─────────────── */}
        <section>
          <h3 className="text-[13px] font-bold text-gray-700 mb-2">מסלול</h3>
          {programs.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">
              טוען מסלולים...
            </p>
          ) : (
            <div className="flex gap-3 overflow-x-auto scrollbar-hide -mx-1 px-1 pb-1">
              {programs.map((p) => {
                const isOn = draftProgramId === p.id;
                const iconKey = resolveIconKey(p.iconKey, p.name);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleSelectProgram(p)}
                    className="flex flex-col items-center gap-1.5 flex-shrink-0 w-[72px] focus:outline-none"
                  >
                    <div
                      className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${
                        isOn
                          ? 'bg-primary text-white shadow-floating ring-2 ring-primary ring-offset-2'
                          : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      }`}
                    >
                      {getProgramIcon(iconKey, 'w-7 h-7')}
                    </div>
                    <span
                      className={`text-[11px] font-bold text-center leading-tight line-clamp-2 ${
                        isOn ? 'text-primary' : 'text-gray-700'
                      }`}
                    >
                      {p.name}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* ── Level grid (gated by program selection) ────────────────────── */}
        <section>
          <h3 className="text-[13px] font-bold text-gray-700 mb-2">רמה</h3>
          {!selectedProgram ? (
            <div className="rounded-2xl border-2 border-dashed border-gray-200 px-4 py-8 text-center">
              <p className="text-sm text-gray-400 font-medium">
                בחר מסלול כדי לראות את הרמות
              </p>
            </div>
          ) : (
            <div
              className="grid gap-2"
              style={{ gridTemplateColumns: `repeat(${GRID_COLS}, minmax(0, 1fr))` }}
            >
              {levelCells.map((cell) => {
                const isOn =
                  cell.value === null
                    ? draftLevel === null
                    : draftLevel === cell.value;
                return (
                  <button
                    key={cell.id}
                    type="button"
                    onClick={() => setDraftLevel(cell.value)}
                    className={`h-12 rounded-xl text-sm font-bold transition-all ${
                      isOn
                        ? 'text-white shadow-subtle'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                    style={isOn ? { backgroundColor: '#00dcd0' } : undefined}
                  >
                    {cell.label}
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </FilterSheet>
  );
}
