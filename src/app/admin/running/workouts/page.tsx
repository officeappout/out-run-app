'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Plus, Edit2, Trash2, ArrowRight, Upload, Search, X } from 'lucide-react';
import {
  getRunWorkoutTemplates,
  deleteRunWorkoutTemplate,
} from '@/features/workout-engine/core/services/running-admin.service';
import type { RunWorkoutTemplate, WorkoutCategory } from '@/features/workout-engine/core/types/running.types';

const CATEGORY_LABELS: Record<WorkoutCategory, string> = {
  short_intervals: 'אינטרוולים קצרים',
  long_intervals: 'אינטרוולים ארוכים',
  fartlek_easy: 'פארטלק קל',
  fartlek_structured: 'פארטלק מובנה',
  tempo: 'טמפו',
  hill_long: 'גבעות ארוכות',
  hill_short: 'גבעות קצרות',
  hill_sprints: 'ספרינטים בגבעה',
  long_run: 'ריצה ארוכה',
  easy_run: 'ריצה קלה',
  strides: 'סטריידים',
};

const ALL_CATEGORIES = Object.keys(CATEGORY_LABELS) as WorkoutCategory[];

type ProfileFilter = 'all' | 'beginner' | 'advanced';
type QualityFilter = 'all' | 'quality' | 'easy';

export default function RunWorkoutTemplatesPage() {
  const [templates, setTemplates] = useState<RunWorkoutTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchText, setSearchText] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<WorkoutCategory | 'all'>('all');
  const [profileFilter, setProfileFilter] = useState<ProfileFilter>('all');
  const [qualityFilter, setQualityFilter] = useState<QualityFilter>('all');

  const load = async () => {
    setLoading(true);
    try {
      const data = await getRunWorkoutTemplates();
      setTemplates(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    let result = templates;

    // Text search (name)
    const q = searchText.trim().toLowerCase();
    if (q) {
      result = result.filter((t) => t.name.toLowerCase().includes(q));
    }

    // Category
    if (categoryFilter !== 'all') {
      result = result.filter((t) => t.category === categoryFilter);
    }

    // Profile type
    if (profileFilter === 'beginner') {
      result = result.filter((t) => t.targetProfileTypes.includes(3));
    } else if (profileFilter === 'advanced') {
      result = result.filter(
        (t) => t.targetProfileTypes.includes(1) || t.targetProfileTypes.includes(2),
      );
    }

    // Quality
    if (qualityFilter === 'quality') {
      result = result.filter((t) => t.isQualityWorkout);
    } else if (qualityFilter === 'easy') {
      result = result.filter((t) => !t.isQualityWorkout);
    }

    return result;
  }, [templates, searchText, categoryFilter, profileFilter, qualityFilter]);

  const hasActiveFilters =
    searchText.trim() !== '' ||
    categoryFilter !== 'all' ||
    profileFilter !== 'all' ||
    qualityFilter !== 'all';

  const clearFilters = () => {
    setSearchText('');
    setCategoryFilter('all');
    setProfileFilter('all');
    setQualityFilter('all');
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`למחוק את "${name}"?`)) return;
    try {
      await deleteRunWorkoutTemplate(id);
      await load();
    } catch (err) {
      console.error(err);
      alert('שגיאה במחיקה');
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
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/admin/running"
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-2"
          >
            <ArrowRight size={18} />
            חזור למנוע ריצה
          </Link>
          <h1 className="text-3xl font-black text-gray-900">תבניות אימונים</h1>
          <p className="text-gray-500 mt-1">בנה אימוני ריצה עם בלוקים ואזורי קצב</p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/admin/running/import/workouts"
            className="flex items-center gap-2 px-5 py-3 bg-purple-500 text-white rounded-xl font-bold hover:bg-purple-600"
          >
            <Upload size={18} />
            ייבוא JSON
          </Link>
          <Link
            href="/admin/running/workouts/new"
            className="flex items-center gap-2 px-6 py-3 bg-cyan-500 text-white rounded-xl font-bold hover:bg-cyan-600"
          >
            <Plus size={20} />
            אימון חדש
          </Link>
        </div>
      </div>

      {/* ── Filters ────────────────────────────────────────────────────── */}
      {templates.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="חיפוש לפי שם..."
                className="w-full pr-9 pl-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400"
              />
            </div>

            {/* Category */}
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as WorkoutCategory | 'all')}
              className="px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm font-bold text-gray-700 focus:ring-2 focus:ring-cyan-400"
            >
              <option value="all">כל הקטגוריות</option>
              {ALL_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>{CATEGORY_LABELS[cat]}</option>
              ))}
            </select>

            {/* Profile */}
            <select
              value={profileFilter}
              onChange={(e) => setProfileFilter(e.target.value as ProfileFilter)}
              className="px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm font-bold text-gray-700 focus:ring-2 focus:ring-cyan-400"
            >
              <option value="all">כל הפרופילים</option>
              <option value="beginner">מתחיל (3)</option>
              <option value="advanced">מתקדם (1, 2)</option>
            </select>

            {/* Quality */}
            <select
              value={qualityFilter}
              onChange={(e) => setQualityFilter(e.target.value as QualityFilter)}
              className="px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm font-bold text-gray-700 focus:ring-2 focus:ring-cyan-400"
            >
              <option value="all">הכל</option>
              <option value="quality">איכות בלבד</option>
              <option value="easy">קלים בלבד</option>
            </select>

            {/* Clear */}
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1.5 px-3 py-2.5 text-sm font-bold text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              >
                <X size={14} />
                נקה סינון
              </button>
            )}
          </div>

          {/* Counter */}
          <div className="mt-3 text-sm text-gray-500">
            מציג{' '}
            <span className="font-black text-gray-800">{filtered.length}</span>
            {' '}מתוך{' '}
            <span className="font-black text-gray-800">{templates.length}</span>
            {' '}אימונים
          </div>
        </div>
      )}

      {/* ── Table / Empty ──────────────────────────────────────────────── */}
      {templates.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-500">אין תבניות. צור אימון חדש.</p>
          <Link
            href="/admin/running/workouts/new"
            className="inline-flex items-center gap-2 mt-4 px-6 py-3 bg-cyan-500 text-white rounded-xl font-bold"
          >
            <Plus size={18} />
            אימון חדש
          </Link>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-500">אין תוצאות לסינון הנוכחי.</p>
          <button
            onClick={clearFilters}
            className="mt-3 px-5 py-2 text-sm font-bold text-cyan-600 hover:bg-cyan-50 rounded-lg"
          >
            נקה סינון
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-right">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-4 text-sm font-bold text-gray-700">שם</th>
                <th className="px-6 py-4 text-sm font-bold text-gray-700">קטגוריה</th>
                <th className="px-6 py-4 text-sm font-bold text-gray-700">פרופילים</th>
                <th className="px-6 py-4 text-sm font-bold text-gray-700">איכות</th>
                <th className="px-6 py-4 text-sm font-bold text-gray-700">בלוקים</th>
                <th className="px-6 py-4 text-sm font-bold text-gray-700">דירוג</th>
                <th className="px-6 py-4 text-sm font-bold text-gray-700">תגיות</th>
                <th className="px-6 py-4 text-sm font-bold text-gray-700 text-center">פעולות</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((t) => (
                <tr key={t.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 font-bold">{t.name}</td>
                  <td className="px-6 py-4 text-sm">
                    {t.category ? (
                      <span className="px-2 py-0.5 rounded-full bg-cyan-50 text-cyan-700 text-xs font-bold">
                        {CATEGORY_LABELS[t.category] ?? t.category}
                      </span>
                    ) : (
                      <span className="text-gray-400 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {t.targetProfileTypes.sort().join(', ')}
                  </td>
                  <td className="px-6 py-4">
                    <span className={t.isQualityWorkout ? 'text-amber-600 font-bold' : 'text-gray-500'}>
                      {t.isQualityWorkout ? 'איכות' : 'קל'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">{t.blocks?.length ?? 0} בלוקים</td>
                  <td className="px-6 py-4">
                    {t.intensityRank != null ? (
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                        t.intensityRank === 1 ? 'bg-emerald-100 text-emerald-700' :
                        t.intensityRank === 2 ? 'bg-amber-100 text-amber-700' :
                        t.intensityRank >= 3 ? 'bg-red-100 text-red-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {t.intensityRank}
                      </span>
                    ) : (
                      <span className="text-gray-300 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {Array.isArray(t.tags) && t.tags.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {t.tags.map((tag) => (
                          <span
                            key={tag}
                            className={`px-1.5 py-0.5 rounded text-xs font-bold ${
                              tag === 'beginner_only'
                                ? 'bg-red-100 text-red-700'
                                : 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-gray-300 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-center gap-2">
                      <Link
                        href={`/admin/running/workouts/${t.id}`}
                        className="p-2 text-cyan-600 hover:bg-cyan-50 rounded-lg"
                        title="ערוך"
                      >
                        <Edit2 size={18} />
                      </Link>
                      <button
                        onClick={() => handleDelete(t.id, t.name)}
                        className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
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
  );
}
