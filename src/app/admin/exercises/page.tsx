'use client';

export const dynamic = 'force-dynamic';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  getAllExercises,
  deleteExercise,
  duplicateExercise,
  searchExercises,
  getExercisesByProgram,
  getExerciseProductionReadiness,
} from '@/features/content/exercises';
import { getAllPrograms } from '@/features/content/programs';
import { Exercise, getLocalizedText, MovementGroup } from '@/features/content/exercises';
import { Program } from '@/features/content/programs';
import { Plus, Edit2, Trash2, Copy, Search, Eye, Image as ImageIcon, HelpCircle, PlayCircle, Download, AlertCircle, CheckCircle, Camera } from 'lucide-react';

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

export default function ExercisesAdminPage() {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<string>('all'); // 'all' or programId

  useEffect(() => {
    loadPrograms();
  }, []);

  useEffect(() => {
    if (searchTerm.trim()) {
      handleSearch(searchTerm);
    } else {
      loadExercises();
    }
  }, [searchTerm, activeTab]);

  const loadPrograms = async () => {
    try {
      const data = await getAllPrograms();
      setPrograms(data);
    } catch (error) {
      console.error('Error loading programs:', error);
    }
  };

  const loadExercises = async () => {
    setLoading(true);
    try {
      let data: Exercise[];
      if (activeTab === 'all') {
        data = await getAllExercises();
      } else {
        data = await getExercisesByProgram(activeTab);
      }
      setExercises(data);
    } catch (error) {
      console.error('Error loading exercises:', error);
      alert('שגיאה בטעינת התרגילים');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (term: string) => {
    if (!term.trim()) {
      loadExercises();
      return;
    }

    setLoading(true);
    try {
      const results = await searchExercises(term);
      // Filter by active tab if not 'all'
      const filtered = activeTab === 'all' 
        ? results 
        : results.filter(
            (ex) =>
              ex.targetPrograms?.some((tp) => tp.programId === activeTab) ||
              ex.programIds?.includes(activeTab)
          );
      setExercises(filtered);
    } catch (error) {
      console.error('Error searching exercises:', error);
      alert('שגיאה בחיפוש תרגילים');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (exerciseId: string, exerciseName: string) => {
    if (!confirm(`האם אתה בטוח שברצונך למחוק את התרגיל "${exerciseName}"?`)) return;

    try {
      await deleteExercise(exerciseId);
      await loadExercises();
    } catch (error) {
      console.error('Error deleting exercise:', error);
      alert('שגיאה במחיקת התרגיל');
    }
  };

  const handleDuplicate = async (exerciseId: string) => {
    try {
      await duplicateExercise(exerciseId);
      await loadExercises();
      alert('התרגיל שוכפל בהצלחה');
    } catch (error) {
      console.error('Error duplicating exercise:', error);
      alert('שגיאה בשכפול התרגיל');
    }
  };

  if (loading && exercises.length === 0) {
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
          <h1 className="text-3xl font-black text-gray-900">ניהול תרגילים</h1>
          <p className="text-gray-500 mt-2">צור וערוך תרגילי אימון</p>
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

      {/* Search Bar */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4">
        <div className="relative">
          <Search className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="חפש תרגיל לפי שם או תיאור..."
            className="w-full pr-12 pl-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Exercises Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {exercises.length === 0 ? (
          <div className="text-center py-20">
            <div className="bg-gray-50 inline-flex p-4 rounded-full mb-4">
              <Plus size={32} className="text-gray-400" />
            </div>
            <h3 className="text-lg font-bold text-gray-900">לא נמצאו תרגילים</h3>
            <p className="text-gray-500 mt-2">
              {searchTerm ? 'לא נמצאו תרגילים התואמים לחיפוש' : 'התחל על ידי הוספת התרגיל הראשון למערכת'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase font-bold sticky top-0">
                <tr>
                  <th className="px-6 py-4 rounded-tr-2xl">ID</th>
                  <th className="px-6 py-4">תצוגה מקדימה</th>
                  <th className="px-6 py-4">שם התרגיל</th>
                  <th className="px-6 py-4">סטטוס מדיה</th>
                  <th className="px-6 py-4">
                    <div className="flex items-center gap-2 justify-end">
                      <span>קבוצת תנועה</span>
                      <div className="group relative">
                        <HelpCircle size={14} className="text-gray-400 cursor-help" />
                        <div className="absolute bottom-full right-0 mb-2 hidden group-hover:block z-50">
                          <div className="bg-gray-900 text-white text-xs rounded-lg py-2 px-3 whitespace-nowrap shadow-lg max-w-xs">
                            משמש ל-Smart Swap כאשר התרגיל הראשי לא יכול להתבצע.
                            <div className="absolute top-full right-4 -mt-1">
                              <div className="border-4 border-transparent border-t-gray-900"></div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </th>
                  <th className="px-6 py-4">צפיות</th>
                  <th className="px-6 py-4 rounded-tl-2xl text-center">פעולות</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {exercises.map((exercise) => (
                  <tr
                    key={exercise.id}
                    className="hover:bg-blue-50/50 transition-colors group"
                  >
                    <td className="px-6 py-4 font-mono text-xs text-gray-500">
                      {exercise.id.substring(0, 8)}...
                    </td>
                    <td className="px-6 py-4">
                      <ExercisePreviewThumbnail 
                        imageUrl={
                          exercise.media?.imageUrl || 
                          exercise.executionMethods?.[0]?.media?.imageUrl ||
                          exercise.execution_methods?.[0]?.media?.imageUrl ||
                          exercise.executionMethods?.[0]?.media?.mainVideoUrl ||
                          exercise.execution_methods?.[0]?.media?.mainVideoUrl
                        }
                      />
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-bold text-gray-900 flex items-center gap-2">
                        {getLocalizedText(exercise.name, 'he')}
                        {exercise.isFollowAlong && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-bold" title="Follow-Along Video">
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
                          onClick={() => handleDuplicate(exercise.id)}
                          className="p-2 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                          title="שכפל"
                        >
                          <Copy size={18} />
                        </button>
                        <button
                          onClick={() =>
                            handleDelete(exercise.id, getLocalizedText(exercise.name, 'he'))
                          }
                          className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          title="מחק"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// Exercise Preview Thumbnail Component - handles null/missing media gracefully
function ExercisePreviewThumbnail({ imageUrl, isMissing = false }: { imageUrl?: string | null; isMissing?: boolean }) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  // Handle null, undefined, or empty string as missing media
  const hasValidUrl = imageUrl && typeof imageUrl === 'string' && imageUrl.trim() !== '';

  if (!hasValidUrl || isMissing) {
    return (
      <div className="w-12 h-12 rounded-lg bg-amber-50 border-2 border-dashed border-amber-300 flex items-center justify-center" title="חסרה תמונה">
        <Camera size={18} className="text-amber-500" />
      </div>
    );
  }

  return (
    <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-gray-100">
      {!imageLoaded && !imageError && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-4 h-4 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      )}
      {imageError ? (
        <div className="w-full h-full flex items-center justify-center bg-red-50 border-2 border-dashed border-red-300">
          <AlertCircle size={18} className="text-red-500" />
        </div>
      ) : (
        <img
          src={imageUrl}
          alt="Preview"
          className={`w-full h-full object-cover ${imageLoaded ? 'opacity-100' : 'opacity-0'} transition-opacity`}
          onLoad={() => setImageLoaded(true)}
          onError={() => {
            setImageError(true);
            setImageLoaded(false);
          }}
        />
      )}
    </div>
  );
}

// Production Status Badge Component
function ProductionStatusBadge({ exercise }: { exercise: Exercise }) {
  const readiness = getExerciseProductionReadiness(exercise);
  
  if (readiness.status === 'production_ready') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-bold" title="מוכן לפרודקשן">
        <CheckCircle size={12} />
        מוכן
      </span>
    );
  }
  
  if (readiness.status === 'pending_filming') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-bold" title={`חסרים ${readiness.missingCount} מדיה`}>
        <Camera size={12} />
        ממתין לצילום ({readiness.missingCount})
      </span>
    );
  }
  
  // missing_all_media
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-bold" title="חסרה כל המדיה">
      <AlertCircle size={12} />
      ללא מדיה
    </span>
  );
}
