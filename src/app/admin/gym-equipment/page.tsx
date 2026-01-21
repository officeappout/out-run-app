'use client';

// Force dynamic rendering to prevent SSR issues with window/localStorage
export const dynamic = 'force-dynamic';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  getAllGymEquipment,
  deleteGymEquipment,
  duplicateGymEquipment,
  searchGymEquipment,
} from '@/features/content/equipment/gym';
import { GymEquipment } from '@/features/content/equipment/gym';
import { Plus, Edit2, Trash2, Copy, Search } from 'lucide-react';

export default function GymEquipmentAdminPage() {
  const [equipment, setEquipment] = useState<GymEquipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadEquipment();
  }, []);

  useEffect(() => {
    if (searchTerm.trim()) {
      handleSearch(searchTerm);
    } else {
      loadEquipment();
    }
  }, [searchTerm]);

  const loadEquipment = async () => {
    setLoading(true);
    try {
      const data = await getAllGymEquipment();
      setEquipment(data);
    } catch (error) {
      console.error('Error loading gym equipment:', error);
      alert('שגיאה בטעינת הציוד');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (term: string) => {
    if (!term.trim()) {
      loadEquipment();
      return;
    }

    setLoading(true);
    try {
      const results = await searchGymEquipment(term);
      setEquipment(results);
    } catch (error) {
      console.error('Error searching gym equipment:', error);
      alert('שגיאה בחיפוש ציוד');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (equipmentId: string, equipmentName: string) => {
    if (!confirm(`האם אתה בטוח שברצונך למחוק את הציוד "${equipmentName}"?`)) return;

    try {
      await deleteGymEquipment(equipmentId);
      await loadEquipment();
    } catch (error) {
      console.error('Error deleting gym equipment:', error);
      alert('שגיאה במחיקת הציוד');
    }
  };

  const handleDuplicate = async (equipmentId: string) => {
    try {
      await duplicateGymEquipment(equipmentId);
      await loadEquipment();
      alert('הציוד שוכפל בהצלחה');
    } catch (error) {
      console.error('Error duplicating gym equipment:', error);
      alert('שגיאה בשכפול הציוד');
    }
  };

  if (loading && equipment.length === 0) {
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
          <h1 className="text-3xl font-black text-gray-900">ניהול מתקני כושר</h1>
          <p className="text-gray-500 mt-2">צור וערוך מתקני כושר קבועים</p>
        </div>
        <Link
          href="/admin/gym-equipment/new"
          className="flex items-center gap-2 px-6 py-3 bg-cyan-500 text-white rounded-xl font-bold hover:bg-cyan-600 transition-colors shadow-lg"
        >
          <Plus size={20} />
          מתקן חדש
        </Link>
      </div>

      {/* Search Bar */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4">
        <div className="relative">
          <Search className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="חפש מתקן לפי שם..."
            className="w-full pr-12 pl-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Equipment Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {equipment.length === 0 ? (
          <div className="text-center py-20">
            <div className="bg-gray-50 inline-flex p-4 rounded-full mb-4">
              <Plus size={32} className="text-gray-400" />
            </div>
            <h3 className="text-lg font-bold text-gray-900">לא נמצאו מתקנים</h3>
            <p className="text-gray-500 mt-2">
              {searchTerm ? 'לא נמצאו מתקנים התואמים לחיפוש' : 'התחל על ידי הוספת המתקן הראשון למערכת'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase font-bold sticky top-0">
                <tr>
                  <th className="px-6 py-4 rounded-tr-2xl">ID</th>
                  <th className="px-6 py-4">שם המתקן</th>
                  <th className="px-6 py-4">סוג</th>
                  <th className="px-6 py-4">רמה</th>
                  <th className="px-6 py-4">חברות</th>
                  <th className="px-6 py-4 rounded-tl-2xl text-center">פעולות</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {equipment.map((item) => (
                  <tr
                    key={item.id}
                    className="hover:bg-blue-50/50 transition-colors group"
                  >
                    <td className="px-6 py-4 font-mono text-xs text-gray-500">
                      {item.id.substring(0, 8)}...
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-bold text-gray-900">{item.name}</div>
                      {item.isFunctional && (
                        <span className="text-xs text-cyan-600 font-bold">Functional</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      {item.type === 'reps' ? 'חזרות' : item.type === 'time' ? 'זמן' : 'מנוחה'}
                    </td>
                    <td className="px-6 py-4 text-gray-600">{item.recommendedLevel}</td>
                    <td className="px-6 py-4">
                      <span className="bg-gray-100 text-gray-600 px-3 py-1 rounded-full text-xs font-bold">
                        {item.brands.length} חברות
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Link
                          href={`/admin/gym-equipment/${item.id}`}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="ערוך"
                        >
                          <Edit2 size={18} />
                        </Link>
                        <button
                          onClick={() => handleDuplicate(item.id)}
                          className="p-2 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                          title="שכפל"
                        >
                          <Copy size={18} />
                        </button>
                        <button
                          onClick={() => handleDelete(item.id, item.name)}
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
