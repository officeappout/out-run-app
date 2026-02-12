'use client';

export const dynamic = 'force-dynamic';

import React, { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react';
import Link from 'next/link';
import { TableVirtuoso } from 'react-virtuoso';
import {
  getAllExercises,
  deleteExercise,
  duplicateExercise,
  getExercisesByProgram,
  getExerciseProductionReadiness,
} from '@/features/content/exercises';
import { getAllPrograms } from '@/features/content/programs';
import { Exercise, getLocalizedText, MovementGroup } from '@/features/content/exercises';
import { Program } from '@/features/content/programs';
import {
  Plus, Edit2, Trash2, Copy, Search, Eye, HelpCircle,
  PlayCircle, Download, AlertCircle, CheckCircle, Camera,
} from 'lucide-react';

// ────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────

const MOVEMENT_GROUP_LABELS: Record<MovementGroup, string> = {
  squat: 'סקוואט',
  hinge: 'הינג׳',
  horizontal_push: 'דחיקה אופקית',
  vertical_push: 'דחיקה אנכית',
  horizontal_pull: 'משיכה אופקית',
  vertical_pull: 'משיכה אנכית',
  core: 'ליבה',
  isolation: 'איסוליישן',
};

// ────────────────────────────────────────────────────────────────
// Helpers — all pure, no hooks
// ────────────────────────────────────────────────────────────────

/** Video-related URL patterns we must NEVER pass to an <img> src */
const VIDEO_PATTERNS = /\.(mp4|mov|webm|avi|mkv)(\?|#|$)|youtube\.com|youtu\.be|vimeo\.com/i;

/**
 * Return the first **image-only** URL from execution_methods.
 * Video URLs (.mp4, YouTube, etc.) are explicitly skipped so the browser
 * never attempts to fetch video metadata for a thumbnail.
 */
function findFirstImageUrl(exercise: Exercise): string | undefined {
  const methods = exercise.execution_methods || exercise.executionMethods || [];
  for (const m of methods) {
    const url = m?.media?.imageUrl;
    if (url && typeof url === 'string' && url.trim() && !VIDEO_PATTERNS.test(url)) {
      return url;
    }
  }
  // Fallback to legacy top-level media (image only)
  if (exercise.media?.imageUrl && !VIDEO_PATTERNS.test(exercise.media.imageUrl)) {
    return exercise.media.imageUrl;
  }
  return undefined;
}

// ────────────────────────────────────────────────────────────────
// Memoised sub-components (never re-render unless props change)
// ────────────────────────────────────────────────────────────────

/** Static image-only thumbnail. No video player, no IntersectionObserver. */
const ExercisePreviewThumbnail = memo(function ExercisePreviewThumbnail({
  imageUrl,
}: {
  imageUrl?: string | null;
}) {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  const hasValidUrl = imageUrl && typeof imageUrl === 'string' && imageUrl.trim() !== '';

  if (!hasValidUrl) {
    return (
      <div
        className="w-12 h-12 rounded-lg bg-amber-50 border-2 border-dashed border-amber-300 flex items-center justify-center"
        title="חסרה תמונה"
      >
        <Camera size={18} className="text-amber-500" />
      </div>
    );
  }

  return (
    <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-gray-100">
      {status === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-4 h-4 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      {status === 'error' ? (
        <div className="w-full h-full flex items-center justify-center bg-red-50 border-2 border-dashed border-red-300">
          <AlertCircle size={18} className="text-red-500" />
        </div>
      ) : (
        <img
          src={imageUrl}
          alt="Preview"
          className={`w-full h-full object-cover transition-opacity ${status === 'loaded' ? 'opacity-100' : 'opacity-0'}`}
          loading="lazy"
          decoding="async"
          onLoad={() => setStatus('loaded')}
          onError={() => setStatus('error')}
        />
      )}
    </div>
  );
});

/** Cached production readiness badge — input is the Exercise object reference */
const ProductionStatusBadge = memo(function ProductionStatusBadge({
  exercise,
}: {
  exercise: Exercise;
}) {
  const readiness = useMemo(() => getExerciseProductionReadiness(exercise), [exercise]);

  if (readiness.status === 'production_ready') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-bold">
        <CheckCircle size={12} />
        מוכן
      </span>
    );
  }
  if (readiness.status === 'pending_filming') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-bold">
        <Camera size={12} />
        ממתין לצילום ({readiness.missingCount})
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-bold">
      <AlertCircle size={12} />
      ללא מדיה
    </span>
  );
});

// ────────────────────────────────────────────────────────────────
// Virtualised row — the critical memoised piece
// ────────────────────────────────────────────────────────────────

interface ExerciseRowProps {
  exercise: Exercise;
  thumbnailUrl: string | undefined;
  onDuplicate: (id: string) => void;
  onDelete: (id: string, name: string) => void;
}

const ExerciseRow = memo(function ExerciseRow({
  exercise,
  thumbnailUrl,
  onDuplicate,
  onDelete,
}: ExerciseRowProps) {
  const name = getLocalizedText(exercise.name, 'he');

  return (
    <>
      <td className="px-6 py-4 font-mono text-xs text-gray-500">
        {exercise.id.substring(0, 8)}...
      </td>
      <td className="px-6 py-4">
        <ExercisePreviewThumbnail imageUrl={thumbnailUrl} />
      </td>
      <td className="px-6 py-4">
        <div className="font-bold text-gray-900 flex items-center gap-2">
          {name}
          {exercise.isFollowAlong && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-bold">
              <PlayCircle size={12} />
              Follow-Along
            </span>
          )}
        </div>
        <div className="text-xs text-gray-500 mt-1">
          {exercise.type} • {exercise.muscleGroups.length} שרירים
          {exercise.targetPrograms && exercise.targetPrograms.length > 0 && (
            <span> • {exercise.targetPrograms.length} שיוכי תוכנית</span>
          )}
        </div>
      </td>
      <td className="px-6 py-4">
        <ProductionStatusBadge exercise={exercise} />
      </td>
      <td className="px-6 py-4">
        {exercise.movementGroup ? (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-purple-100 text-purple-700">
            {MOVEMENT_GROUP_LABELS[exercise.movementGroup] || exercise.movementGroup}
          </span>
        ) : (
          <span className="text-xs text-gray-400">—</span>
        )}
      </td>
      <td className="px-6 py-4">
        <div className="flex items-center gap-2 text-gray-600">
          <Eye size={16} />
          <span className="font-bold">{exercise.stats?.views || 0}</span>
        </div>
      </td>
      <td className="px-6 py-4">
        <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <Link
            href={`/admin/exercises/${exercise.id}`}
            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            title="ערוך"
          >
            <Edit2 size={18} />
          </Link>
          <button
            onClick={() => onDuplicate(exercise.id)}
            className="p-2 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
            title="שכפל"
          >
            <Copy size={18} />
          </button>
          <button
            onClick={() => onDelete(exercise.id, name)}
            className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
            title="מחק"
          >
            <Trash2 size={18} />
          </button>
        </div>
      </td>
    </>
  );
});

// ────────────────────────────────────────────────────────────────
// Page component
// ────────────────────────────────────────────────────────────────

export default function ExercisesAdminPage() {
  // ── Source data (fetched once per tab) ──
  const [allExercises, setAllExercises] = useState<Exercise[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>('all');

  // ── Search is purely local — no Firestore, no remount ──
  const [searchTerm, setSearchTerm] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Non-blocking toast notification
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const showToast = useCallback((message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 2500);
  }, []);

  // ── Fetch programs once on mount ──
  useEffect(() => {
    getAllPrograms()
      .then(setPrograms)
      .catch((err) => console.error('Error loading programs:', err));
  }, []);

  // ── Fetch exercises when tab changes (NOT when searchTerm changes) ──
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const fetcher = activeTab === 'all' ? getAllExercises() : getExercisesByProgram(activeTab);
    fetcher
      .then((data) => {
        if (!cancelled) setAllExercises(data);
      })
      .catch((err) => console.error('Error loading exercises:', err))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [activeTab]);

  // ── Client-side filtering (instant, zero network) ──
  const filteredExercises = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return allExercises;
    return allExercises.filter((ex) => {
      const name = getLocalizedText(ex.name, 'he').toLowerCase();
      const goal = ex.content?.goal?.toLowerCase() || '';
      const movementLabel = ex.movementGroup
        ? (MOVEMENT_GROUP_LABELS[ex.movementGroup] || '').toLowerCase()
        : '';
      return name.includes(q) || goal.includes(q) || movementLabel.includes(q);
    });
  }, [allExercises, searchTerm]);

  // ── Pre-compute thumbnail URLs once when source data changes ──
  const thumbnailMap = useMemo(() => {
    const map = new Map<string, string | undefined>();
    for (const ex of allExercises) {
      map.set(ex.id, findFirstImageUrl(ex));
    }
    return map;
  }, [allExercises]);

  // ── Actions (stable callbacks) ──
  const handleDelete = useCallback(
    async (exerciseId: string, exerciseName: string) => {
      if (!confirm(`האם אתה בטוח שברצונך למחוק את התרגיל "${exerciseName}"?`)) return;
      try {
        await deleteExercise(exerciseId);
        setAllExercises((prev) => prev.filter((e) => e.id !== exerciseId));
        showToast('✓ התרגיל נמחק');
      } catch (error) {
        console.error('Error deleting exercise:', error);
        showToast('✗ שגיאה במחיקת התרגיל');
      }
    },
    [showToast]
  );

  const handleDuplicate = useCallback(
    async (exerciseId: string) => {
      try {
        await duplicateExercise(exerciseId);
        const data = activeTab === 'all' ? await getAllExercises() : await getExercisesByProgram(activeTab);
        setAllExercises(data);
        showToast('✓ התרגיל שוכפל בהצלחה');
      } catch (error) {
        console.error('Error duplicating exercise:', error);
        showToast('✗ שגיאה בשכפול התרגיל');
      }
    },
    [showToast, activeTab]
  );

  // ── Initial loading screen (only on very first load) ──
  if (loading && allExercises.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">טוען...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      {/* Non-blocking Toast */}
      {toastMessage && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[200] animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="bg-gray-900 text-white text-sm font-bold px-5 py-3 rounded-xl shadow-2xl">
            {toastMessage}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <div>
          <h1 className="text-3xl font-black text-gray-900">ניהול תרגילים</h1>
          <p className="text-gray-500 mt-2">
            {allExercises.length > 0
              ? `${filteredExercises.length === allExercises.length
                  ? allExercises.length
                  : `${filteredExercises.length} / ${allExercises.length}`} תרגילים`
              : 'צור וערוך תרגילי אימון'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/admin/export-exercises"
            className="flex items-center gap-2 px-5 py-3 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200 transition-colors"
          >
            <Download size={18} />
            ייצוא CSV
          </Link>
          <Link
            href="/admin/exercises/new"
            className="flex items-center gap-2 px-6 py-3 bg-cyan-500 text-white rounded-xl font-bold hover:bg-cyan-600 transition-colors shadow-lg"
          >
            <Plus size={20} />
            תרגיל חדש
          </Link>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4">
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-2">
          <button
            onClick={() => setActiveTab('all')}
            className={`px-4 py-2 rounded-lg font-bold text-sm whitespace-nowrap transition-all ${
              activeTab === 'all'
                ? 'bg-cyan-500 text-white shadow-md'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            הכל
          </button>
          {programs.map((program) => (
            <button
              key={program.id}
              onClick={() => setActiveTab(program.id)}
              className={`px-4 py-2 rounded-lg font-bold text-sm whitespace-nowrap transition-all ${
                activeTab === program.id
                  ? 'bg-cyan-500 text-white shadow-md'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {program.name}
            </button>
          ))}
        </div>
      </div>

      {/* Search Bar — pure local state, no form submission, no Firestore */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4">
        <div className="relative">
          <Search className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
          <input
            ref={searchInputRef}
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="חפש תרגיל לפי שם, יעד, או קבוצת תנועה..."
            className="w-full pr-12 pl-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
            autoComplete="off"
            spellCheck={false}
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                searchInputRef.current?.focus();
              }}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs font-bold"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Exercises Table — True Virtualised */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {filteredExercises.length === 0 ? (
          <div className="text-center py-20">
            <div className="bg-gray-50 inline-flex p-4 rounded-full mb-4">
              {searchTerm ? <Search size={32} className="text-gray-400" /> : <Plus size={32} className="text-gray-400" />}
            </div>
            <h3 className="text-lg font-bold text-gray-900">
              {searchTerm ? 'לא נמצאו תרגילים' : 'אין תרגילים עדיין'}
            </h3>
            <p className="text-gray-500 mt-2">
              {searchTerm
                ? `לא נמצאו תרגילים התואמים ל-"${searchTerm}"`
                : 'התחל על ידי הוספת התרגיל הראשון למערכת'}
            </p>
            {searchTerm && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  searchInputRef.current?.focus();
                }}
                className="mt-4 text-cyan-600 hover:text-cyan-700 text-sm font-bold"
              >
                נקה חיפוש
              </button>
            )}
          </div>
        ) : (
          <TableVirtuoso
            data={filteredExercises}
            overscan={200}
            style={{ height: 'calc(100vh - 380px)', minHeight: 400 }}
            fixedHeaderContent={() => (
              <tr className="bg-gray-50 text-gray-500 text-xs uppercase font-bold">
                <th className="px-6 py-4 text-right">ID</th>
                <th className="px-6 py-4 text-right">תצוגה מקדימה</th>
                <th className="px-6 py-4 text-right">שם התרגיל</th>
                <th className="px-6 py-4 text-right">סטטוס מדיה</th>
                <th className="px-6 py-4 text-right">
                  <div className="flex items-center gap-2 justify-end">
                    <span>קבוצת תנועה</span>
                    <div className="group relative">
                      <HelpCircle size={14} className="text-gray-400 cursor-help" />
                      <div className="absolute bottom-full right-0 mb-2 hidden group-hover:block z-50">
                        <div className="bg-gray-900 text-white text-xs rounded-lg py-2 px-3 whitespace-nowrap shadow-lg max-w-xs">
                          משמש ל-Smart Swap כאשר התרגיל הראשי לא יכול להתבצע.
                          <div className="absolute top-full right-4 -mt-1">
                            <div className="border-4 border-transparent border-t-gray-900" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </th>
                <th className="px-6 py-4 text-right">צפיות</th>
                <th className="px-6 py-4 text-center">פעולות</th>
              </tr>
            )}
            itemContent={(_index, exercise) => (
              <ExerciseRow
                exercise={exercise}
                thumbnailUrl={thumbnailMap.get(exercise.id)}
                onDuplicate={handleDuplicate}
                onDelete={handleDelete}
              />
            )}
            components={{
              Table: (props) => (
                <table {...props} className="w-full text-right" />
              ),
              TableHead: React.forwardRef(function VHead(props, ref) {
                return <thead {...props} ref={ref} className="sticky top-0 z-10" />;
              }),
              TableBody: React.forwardRef(function VBody(props, ref) {
                return <tbody {...props} ref={ref} className="divide-y divide-gray-100" />;
              }),
              TableRow: (props) => (
                <tr {...props} className="hover:bg-blue-50/50 transition-colors group" />
              ),
            }}
          />
        )}

        {/* Stats footer */}
        {filteredExercises.length > 0 && (
          <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
            <span>
              {filteredExercises.length === allExercises.length
                ? `${allExercises.length} תרגילים סה"כ`
                : `${filteredExercises.length} תוצאות מתוך ${allExercises.length}`}
            </span>
            {searchTerm && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  searchInputRef.current?.focus();
                }}
                className="text-cyan-600 hover:text-cyan-700 font-bold"
              >
                נקה חיפוש
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
