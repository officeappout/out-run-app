'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Plus, Edit2, Trash2, ArrowRight, Play, Upload } from 'lucide-react';
import {
  getRunProgramTemplates,
  deleteRunProgramTemplate,
} from '@/features/workout-engine/core/services/running-admin.service';
import type { RunProgramTemplate } from '@/features/workout-engine/core/types/running.types';

export default function RunProgramTemplatesPage() {
  const [programs, setPrograms] = useState<RunProgramTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const data = await getRunProgramTemplates();
      setPrograms(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`למחוק את "${name}"?`)) return;
    try {
      await deleteRunProgramTemplate(id);
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
          <h1 className="text-3xl font-black text-gray-900">תוכניות ריצה</h1>
          <p className="text-gray-500 mt-1">הגדר תוכניות ריצה וחוקי התקדמות</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/running/import/programs"
            className="flex items-center gap-2 px-4 py-3 bg-purple-500 text-white rounded-xl font-bold hover:bg-purple-600"
          >
            <Upload size={18} />
            ייבוא JSON
          </Link>
          <Link
            href="/admin/running/programs/new"
            className="flex items-center gap-2 px-6 py-3 bg-cyan-500 text-white rounded-xl font-bold hover:bg-cyan-600"
          >
            <Plus size={20} />
            תוכנית חדשה
          </Link>
        </div>
      </div>

      {programs.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-500">אין תוכניות. צור תוכנית חדשה.</p>
          <Link
            href="/admin/running/programs/new"
            className="inline-flex items-center gap-2 mt-4 px-6 py-3 bg-cyan-500 text-white rounded-xl font-bold"
          >
            <Plus size={18} />
            תוכנית חדשה
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-right">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-4 text-sm font-bold text-gray-700">שם</th>
                <th className="px-6 py-4 text-sm font-bold text-gray-700">מרחק יעד</th>
                <th className="px-6 py-4 text-sm font-bold text-gray-700">שבועות</th>
                <th className="px-6 py-4 text-sm font-bold text-gray-700">חוקי התקדמות</th>
                <th className="px-6 py-4 text-sm font-bold text-gray-700 text-center">פעולות</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {programs.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 font-bold">{p.name}</td>
                  <td className="px-6 py-4 text-gray-600">{p.targetDistance}</td>
                  <td className="px-6 py-4 text-gray-600">{p.canonicalWeeks}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{p.progressionRules?.length ?? 0} כללים</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-center gap-2">
                      <Link
                        href={`/admin/running/programs/${p.id}/simulate`}
                        className="p-2 text-purple-600 hover:bg-purple-50 rounded-lg"
                        title="סימולציה"
                      >
                        <Play size={18} />
                      </Link>
                      <Link
                        href={`/admin/running/programs/${p.id}`}
                        className="p-2 text-cyan-600 hover:bg-cyan-50 rounded-lg"
                        title="ערוך"
                      >
                        <Edit2 size={18} />
                      </Link>
                      <button
                        onClick={() => handleDelete(p.id, p.name)}
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
