'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  getAllGearDefinitions,
  deleteGearDefinition,
  duplicateGearDefinition,
  searchGearDefinitions,
} from '@/features/content/equipment/gear';
import { GearDefinition } from '@/features/content/equipment/gear';
import { getLocalizedText } from '@/features/content/shared';
import { Plus, Edit2, Trash2, Copy, Search, Package } from 'lucide-react';
import * as LucideIcons from 'lucide-react';

export default function GearDefinitionsAdminPage() {
  const [gearDefinitions, setGearDefinitions] = useState<GearDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadGearDefinitions();
  }, []);

  useEffect(() => {
    if (searchTerm.trim()) {
      handleSearch(searchTerm);
    } else {
      loadGearDefinitions();
    }
  }, [searchTerm]);

  const loadGearDefinitions = async () => {
    setLoading(true);
    try {
      const data = await getAllGearDefinitions();
      setGearDefinitions(data);
    } catch (error) {
      console.error('Error loading gear definitions:', error);
      alert('שגיאה בטעינת הציוד');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (term: string) => {
    if (!term.trim()) {
      loadGearDefinitions();
      return;
    }

    setLoading(true);
    try {
      const results = await searchGearDefinitions(term);
      setGearDefinitions(results);
    } catch (error) {
      console.error('Error searching gear definitions:', error);
      alert('שגיאה בחיפוש ציוד');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (gearId: string, gearName: string) => {
    if (!confirm(`האם אתה בטוח שברצונך למחוק את הציוד "${gearName}"?`)) return;

    try {
      await deleteGearDefinition(gearId);
      await loadGearDefinitions();
    } catch (error) {
      console.error('Error deleting gear definition:', error);
      alert('שגיאה במחיקת הציוד');
    }
  };

  const handleDuplicate = async (gearId: string) => {
    try {
      await duplicateGearDefinition(gearId);
      await loadGearDefinitions();
      alert('הציוד שוכפל בהצלחה');
    } catch (error) {
      console.error('Error duplicating gear definition:', error);
      alert('שגיאה בשכפול הציוד');
    }
  };

  const getIconComponent = (iconName?: string) => {
    if (!iconName) return null;
    const IconComponent = (LucideIcons as any)[iconName];
    return IconComponent ? <IconComponent size={20} className="text-gray-600" /> : null;
  };

  // Gear Icon Component with fallback
  const GearIcon = ({ gear }: { gear: GearDefinition }) => {
    const [imageError, setImageError] = useState(false);

    // Priority: customIconUrl > Lucide icon > default Package icon
    if (gear.customIconUrl && !imageError) {
      return (
        <img
          src={gear.customIconUrl}
          alt={gear.name?.he || gear.name?.en || ''}
          className="w-full h-full object-contain"
          onError={() => setImageError(true)}
        />
      );
    }

    // Fallback to Lucide icon
    const IconComponent = getIconComponent(gear.icon);
    return IconComponent || <Package size={20} className="text-gray-400" />;
  };

  if (loading && gearDefinitions.length === 0) {
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
          <h1 className="text-3xl font-black text-gray-900">ניהול ציוד אישי</h1>
          <p className="text-gray-500 mt-2">צור וערוך הגדרות ציוד אישי למשתמשים</p>
        </div>
        <Link
          href="/admin/gear-definitions/new"
          className="flex items-center gap-2 px-6 py-3 bg-cyan-500 text-white rounded-xl font-bold hover:bg-cyan-600 transition-colors shadow-lg"
        >
          <Plus size={20} />
          ציוד חדש
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
            placeholder="חפש ציוד לפי שם, תיאור או קטגוריה..."
            className="w-full pr-12 pl-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Gear Definitions Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {gearDefinitions.length === 0 ? (
          <div className="text-center py-20">
            <div className="bg-gray-50 inline-flex p-4 rounded-full mb-4">
              <Plus size={32} className="text-gray-400" />
            </div>
            <h3 className="text-lg font-bold text-gray-900">לא נמצאו הגדרות ציוד</h3>
            <p className="text-gray-500 mt-2">
              {searchTerm ? 'לא נמצאו הגדרות ציוד התואמות לחיפוש' : 'התחל על ידי הוספת ההגדרה הראשונה למערכת'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase font-bold sticky top-0">
                <tr>
                  <th className="px-6 py-4 rounded-tr-2xl">ID</th>
                  <th className="px-6 py-4">אייקון</th>
                  <th className="px-6 py-4">שם</th>
                  <th className="px-6 py-4">קטגוריה</th>
                  <th className="px-6 py-4 rounded-tl-2xl text-center">פעולות</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {gearDefinitions.map((gear) => (
                  <tr
                    key={gear.id}
                    className="hover:bg-blue-50/50 transition-colors group"
                  >
                    <td className="px-6 py-4 font-mono text-xs text-gray-500">
                      {gear.id.substring(0, 8)}...
                    </td>
                    <td className="px-6 py-4">
            <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center overflow-hidden">
              <GearIcon gear={gear} />
            </div>
                    </td>
                    <td className="px-6 py-4">
            <div className="font-bold text-gray-900">
              {gear.name?.he || gear.name?.en}
            </div>
            {gear.description && (
              <div className="text-xs text-gray-500 mt-1">
                {gear.description.he || gear.description.en}
              </div>
            )}
                    </td>
                    <td className="px-6 py-4">
                      {gear.category ? (
                        <span className="bg-gray-100 text-gray-600 px-3 py-1 rounded-full text-xs font-bold">
                          {gear.category}
                        </span>
                      ) : (
                        <span className="text-gray-400 text-xs">ללא קטגוריה</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Link
                          href={`/admin/gear-definitions/${gear.id}`}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="ערוך"
                        >
                          <Edit2 size={18} />
                        </Link>
                        <button
                          onClick={() => handleDuplicate(gear.id)}
                          className="p-2 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                          title="שכפל"
                        >
                          <Copy size={18} />
                        </button>
                        <button
                          onClick={() => handleDelete(gear.id, gear.name?.he || gear.name?.en || '')}
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
