'use client';

export const dynamic = 'force-dynamic';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  getAllOutdoorBrands,
  deleteOutdoorBrand,
  searchOutdoorBrands,
  seedGenericUrbanBrand,
} from '@/features/content/equipment/brands';
import { OutdoorBrand } from '@/features/content/equipment/brands';
import { Plus, Edit2, Trash2, Search, Package, Sparkles } from 'lucide-react';

export default function BrandsAdminPage() {
  const [brands, setBrands] = useState<OutdoorBrand[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadBrands();
  }, []);

  useEffect(() => {
    if (searchTerm.trim()) {
      handleSearch(searchTerm);
    } else {
      loadBrands();
    }
  }, [searchTerm]);

  const loadBrands = async () => {
    setLoading(true);
    try {
      const data = await getAllOutdoorBrands();
      setBrands(data);
    } catch (error) {
      console.error('Error loading brands:', error);
      alert('שגיאה בטעינת המותגים');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (term: string) => {
    if (!term.trim()) {
      loadBrands();
      return;
    }

    setLoading(true);
    try {
      const results = await searchOutdoorBrands(term);
      setBrands(results);
    } catch (error) {
      console.error('Error searching brands:', error);
      alert('שגיאה בחיפוש מותגים');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (brandId: string, brandName: string) => {
    if (!confirm(`האם אתה בטוח שברצונך למחוק את המותג "${brandName}"?`)) return;

    try {
      await deleteOutdoorBrand(brandId);
      await loadBrands();
    } catch (error) {
      console.error('Error deleting brand:', error);
      alert('שגיאה במחיקת המותג');
    }
  };

  const handleSeedGenericUrban = async () => {
    try {
      const brandId = await seedGenericUrbanBrand();
      if (brandId) {
        alert('מותג "Generic Urban" נוצר בהצלחה!');
        await loadBrands();
      } else {
        alert('מותג "Generic Urban" כבר קיים או שגיאה ביצירתו');
      }
    } catch (error) {
      console.error('Error seeding Generic Urban brand:', error);
      alert('שגיאה ביצירת המותג');
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <div>
          <h1 className="text-3xl font-black text-gray-900">ניהול מותגי ציוד חוץ</h1>
          <p className="text-gray-500 mt-2">צור וערוך מותגי ציוד חוץ (Saly, Ludos, וכו')</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleSeedGenericUrban}
            className="flex items-center gap-2 px-4 py-2 bg-purple-500 text-white rounded-xl font-bold hover:bg-purple-600 transition-colors"
            title="צור את המותג 'Generic Urban' (ריהוט רחוב גנרי)"
          >
            <Sparkles size={18} />
            צור Generic Urban
          </button>
          <Link
            href="/admin/brands/new"
            className="flex items-center gap-2 px-6 py-3 bg-cyan-500 text-white rounded-xl font-bold hover:bg-cyan-600 transition-colors shadow-lg"
          >
            <Plus size={20} />
            מותג חדש
          </Link>
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
            placeholder="חפש מותג לפי שם או תיאור..."
            className="w-full pr-12 pl-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Brands Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-gray-500">טוען...</div>
          </div>
        ) : brands.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <Package size={48} className="mb-4 opacity-50" />
            <p className="text-lg font-bold">אין מותגים</p>
            <p className="text-sm mt-2">התחל ביצירת מותג חדש</p>
          </div>
        ) : (
          <table className="w-full text-right">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">שם מותג</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">לוגו</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">צבע מותג</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">אתר</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">תיאור</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">פעולות</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {brands.map((brand) => (
                <tr key={brand.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-bold text-gray-900">{brand.name}</div>
                  </td>
                  <td className="px-6 py-4">
                    {brand.logoUrl ? (
                      <img
                        src={brand.logoUrl}
                        alt={brand.name}
                        className="w-12 h-12 object-contain rounded-lg border border-gray-200"
                      />
                    ) : (
                      <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center text-gray-400 text-xs">
                        אין לוגו
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {brand.brandColor ? (
                      <div className="flex items-center gap-2">
                        <div
                          className="w-8 h-8 rounded-full border-2 border-gray-200"
                          style={{ backgroundColor: brand.brandColor }}
                        />
                        <span className="text-sm text-gray-600">{brand.brandColor}</span>
                      </div>
                    ) : (
                      <span className="text-gray-400 text-sm">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {brand.website ? (
                      <a
                        href={brand.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-cyan-600 hover:text-cyan-700 text-sm font-medium"
                      >
                        {brand.website}
                      </a>
                    ) : (
                      <span className="text-gray-400 text-sm">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-600 max-w-xs truncate">
                      {brand.description || '—'}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/admin/brands/${brand.id}`}
                        className="p-2 text-gray-600 hover:text-cyan-600 hover:bg-cyan-50 rounded-lg transition-colors"
                        title="ערוך"
                      >
                        <Edit2 size={18} />
                      </Link>
                      <button
                        onClick={() => handleDelete(brand.id, brand.name)}
                        className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
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
        )}
      </div>
    </div>
  );
}
