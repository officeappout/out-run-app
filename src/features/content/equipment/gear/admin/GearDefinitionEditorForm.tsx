'use client';

import { useState, useEffect, useRef } from 'react';
import { GearDefinitionFormData } from '../core/gear-definition.types';
import type { AppLanguage } from '../../../shared/localized-text.types';
import * as LucideIcons from 'lucide-react';
import {
  Package,
  Dumbbell,
  Activity,
  Circle,
  Square,
  Anchor,
  Waves,
  Bike,
  Upload,
  X,
  Image as ImageIcon,
  Loader2,
} from 'lucide-react';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from '@/lib/firebase';

interface GearDefinitionEditorFormProps {
  onSubmit: (data: GearDefinitionFormData) => void;
  isSubmitting: boolean;
  initialData?: GearDefinitionFormData;
}

// Common Lucide icons for gear (covering main equipment families)
const COMMON_ICONS = [
  { name: 'Package', component: Package },   // Generic box / accessories
  { name: 'Dumbbell', component: Dumbbell }, // Weights / resistance
  { name: 'Activity', component: Activity }, // Cardio / general activity
  { name: 'Anchor', component: Anchor },     // Suspension / anchored gear
  { name: 'Waves', component: Waves },       // Mobility / balance
  { name: 'Circle', component: Circle },     // Rings / circular gear
  { name: 'Square', component: Square },     // Mats / flat surfaces
  { name: 'Bike', component: Bike },         // Cardio machines
];

// Category options - Equipment Families (physical types)
const CATEGORIES = [
  { value: 'suspension', label: 'Suspension (טבעות, TRX)' },
  { value: 'resistance', label: 'Resistance (גומיות התנגדות)' },
  { value: 'weights', label: 'Weights (משקולות, קטלבל)' },
  { value: 'stationary', label: 'Stationary (מתח, מקבילים)' },
  { value: 'accessories', label: 'Accessories (מזרן, חבל קפיצה)' },
  { value: 'cardio', label: 'Cardio (אופניים, הליכון)' },
  { value: 'improvised', label: 'Improvised (אלתור - כיסא, שולחן, קיר)' },
];

export default function GearDefinitionEditorForm({
  onSubmit,
  isSubmitting,
  initialData,
}: GearDefinitionEditorFormProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [activeLang, setActiveLang] = useState<AppLanguage>('he');
  const [formData, setFormData] = useState<GearDefinitionFormData>({
    name: { he: '', en: '' },
    description: { he: '', en: '' },
    icon: '',
    category: '',
    shopLink: '',
    tutorialVideo: '',
    customIconUrl: '',
    ...initialData,
  });

  useEffect(() => {
    if (initialData) {
      setFormData({
        name: initialData.name || { he: '', en: '' },
        description: initialData.description || { he: '', en: '' },
        icon: initialData.icon || '',
        category: initialData.category || '',
        shopLink: initialData.shopLink || '',
        tutorialVideo: initialData.tutorialVideo || '',
        customIconUrl: initialData.customIconUrl || '',
      });
    }
  }, [initialData]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const validTypes = ['image/svg+xml', 'image/png', 'image/jpeg', 'image/jpg'];
    if (!validTypes.includes(file.type)) {
      alert('נא להעלות קובץ SVG או PNG בלבד');
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      alert('גודל הקובץ חייב להיות קטן מ-2MB');
      return;
    }

    try {
      setUploading(true);
      
      // Generate unique path: gear_icons/{timestamp}_{filename}
      const timestamp = Date.now();
      const fileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const storagePath = `gear_icons/${timestamp}_${fileName}`;
      
      // Upload to Firebase Storage
      const storageRef = ref(storage, storagePath);
      const snapshot = await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(snapshot.ref);
      
      // Update form data with the new URL
      setFormData({ ...formData, customIconUrl: downloadURL });
      
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error: any) {
      console.error('Error uploading icon:', error);
      alert(`שגיאה בהעלאת האייקון: ${error.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveCustomIcon = async () => {
    // If there's an existing custom icon URL, optionally delete it from storage
    if (formData.customIconUrl) {
      try {
        // Extract path from URL
        const url = formData.customIconUrl;
        const pathMatch = url.match(/gear_icons%2F([^?]+)/);
        if (pathMatch) {
          const filePath = `gear_icons/${decodeURIComponent(pathMatch[1])}`;
          const storageRef = ref(storage, filePath);
          await deleteObject(storageRef);
        }
      } catch (error) {
        // Don't block removal if deletion fails
        console.warn('Could not delete old icon from storage:', error);
      }
    }
    
    // Remove from form data
    setFormData({ ...formData, customIconUrl: '' });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  const getIconComponent = (iconName?: string) => {
    if (!iconName) return null;
    const IconComponent = (LucideIcons as any)[iconName];
    return IconComponent ? <IconComponent size={20} /> : null;
  };

  const [previewImageError, setPreviewImageError] = useState(false);

  // Reset preview error when customIconUrl changes
  useEffect(() => {
    setPreviewImageError(false);
  }, [formData.customIconUrl]);

  return (
    <form id="gear-definition-form" onSubmit={handleSubmit} className="space-y-6" dir="rtl">
      <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm space-y-6">
        <h2 className="text-xl font-bold flex items-center gap-2 text-gray-800">
          <Package size={20} />
          פרטי הציוד
        </h2>

        {/* Name + Description (Multi-language HE / EN) */}
        <div className="mb-2 space-y-4">
          <div className="flex items-center justify-between">
            <label className="block text-sm font-bold text-gray-700">
              שם הציוד <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-2 text-xs font-bold bg-gray-100 rounded-full p-1">
              {[
                { id: 'he' as AppLanguage, label: 'עברית' },
                { id: 'en' as AppLanguage, label: 'English' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setActiveLang(opt.id)}
                  className={`px-3 py-1 rounded-full transition-all ${
                    activeLang === opt.id
                      ? 'bg-white text-cyan-600 shadow-sm'
                      : 'text-gray-500'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <input
            type="text"
            value={formData.name?.[activeLang as 'he' | 'en'] || ''}
            onChange={(e) =>
              setFormData({
                ...formData,
                name: {
                  he: formData.name?.he || '',
                  en: formData.name?.en || '',
                  [activeLang]: e.target.value,
                },
              })
            }
            required
            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-transparent text-black placeholder-gray-400 font-simpler"
            placeholder={activeLang === 'he' ? 'לדוגמה: טבעות, TRX, גומיות' : 'e.g. Rings, TRX, Bands'}
          />

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">
              תיאור ({activeLang === 'he' ? 'HE' : 'EN'})
            </label>
            <textarea
              value={formData.description?.[activeLang as 'he' | 'en'] || ''}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  description: {
                    he: formData.description?.he || '',
                    en: formData.description?.en || '',
                    [activeLang]: e.target.value,
                  },
                })
              }
              rows={3}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-transparent text-black placeholder-gray-400 font-simpler"
              placeholder={
                activeLang === 'he'
                  ? 'תיאור קצר של הציוד (אופציונלי)...'
                  : 'Short description of the gear (optional)...'
              }
            />
          </div>
        </div>

        {/* Icon Selection */}
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-2">
            אייקון
          </label>
          <div className="grid grid-cols-4 md:grid-cols-6 gap-3 mb-3">
            {COMMON_ICONS.map((icon) => {
              const IconComponent = icon.component;
              const isSelected = formData.icon === icon.name;
              return (
                <button
                  key={icon.name}
                  type="button"
                  onClick={() => setFormData({ ...formData, icon: icon.name })}
                  className={`p-3 rounded-xl border-2 text-xs transition-all flex flex-col items-center gap-1 ${
                    isSelected
                      ? 'border-cyan-500 bg-cyan-50 text-cyan-700'
                      : 'border-gray-200 hover:border-gray-300 text-gray-500'
                  }`}
                >
                  <IconComponent
                    size={22}
                    className={isSelected ? 'text-cyan-600' : 'text-gray-400'}
                  />
                  <span className="font-bold truncate max-w-[80px]">{icon.name}</span>
                </button>
              );
            })}
          </div>
          <input
            type="text"
            value={formData.icon || ''}
            onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
            placeholder="או הזן שם אייקון מ-Lucide (לדוגמה: Dumbbell, Package, Anchor)"
          />
          {/* Preview: Show custom icon if available, otherwise Lucide icon */}
          {(formData.customIconUrl || formData.icon) && (
            <div className="mt-3 p-3 bg-gray-50 rounded-lg flex items-center gap-3">
              <span className="text-sm text-gray-600">תצוגה מקדימה:</span>
              <div className="w-10 h-10 rounded-lg bg-white border border-gray-200 flex items-center justify-center overflow-hidden">
                {formData.customIconUrl && !previewImageError ? (
                  <img
                    src={formData.customIconUrl}
                    alt="Custom icon"
                    className="w-full h-full object-contain"
                    onError={() => setPreviewImageError(true)}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    {getIconComponent(formData.icon) || (
                      <Package size={20} className="text-gray-400" />
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Custom Icon Upload */}
        <div className="border-t border-gray-200 pt-6">
          <label className="block text-sm font-bold text-gray-700 mb-2">
            אייקון מותאם אישית (Custom Branded Icon)
          </label>
          <p className="text-xs text-gray-500 mb-3">
            העלה אייקון מותאם אישית (SVG או PNG, מקסימום 2MB). אם מועלה, הוא יוצג במקום האייקון מ-Lucide.
          </p>
          
          {formData.customIconUrl ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-xl">
                <div className="w-16 h-16 rounded-lg bg-white border border-gray-200 flex items-center justify-center overflow-hidden flex-shrink-0">
                  <img
                    src={formData.customIconUrl}
                    alt="Custom icon"
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-gray-900">אייקון מותאם אישית מועלה</p>
                  <p className="text-xs text-gray-500 mt-1">האייקון המותאם יוצג במקום האייקון מ-Lucide</p>
                </div>
                <button
                  type="button"
                  onClick={handleRemoveCustomIcon}
                  className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  title="הסר אייקון מותאם"
                >
                  <X size={18} />
                </button>
              </div>
            </div>
          ) : (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".svg,.png,.jpg,.jpeg"
                onChange={handleFileUpload}
                disabled={uploading || isSubmitting}
                className="hidden"
                id="custom-icon-upload"
              />
              <label
                htmlFor="custom-icon-upload"
                className={`flex items-center justify-center gap-2 px-6 py-3 border-2 border-dashed rounded-xl cursor-pointer transition-all ${
                  uploading || isSubmitting
                    ? 'border-gray-300 bg-gray-50 cursor-not-allowed'
                    : 'border-cyan-300 bg-cyan-50 hover:bg-cyan-100 hover:border-cyan-400'
                }`}
              >
                {uploading ? (
                  <>
                    <Loader2 size={18} className="animate-spin text-cyan-600" />
                    <span className="text-sm font-bold text-cyan-600">מעלה...</span>
                  </>
                ) : (
                  <>
                    <Upload size={18} className="text-cyan-600" />
                    <span className="text-sm font-bold text-cyan-600">העלה אייקון מותאם אישית</span>
                  </>
                )}
              </label>
            </div>
          )}
        </div>

        {/* Category (Equipment Family) */}
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-2">
            משפחת ציוד (Equipment Family)
          </label>
          <select
            value={formData.category || ''}
            onChange={(e) => setFormData({ ...formData, category: e.target.value })}
            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
          >
            <option value="">בחר קטגוריה...</option>
            {CATEGORIES.map((cat) => (
              <option key={cat.value} value={cat.value}>
                {cat.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-500 mt-1">
            בחר את סוג הציוד הפיזי (ולא את קבוצת השרירים או מטרת האימון).
          </p>
        </div>

        {/* Shop & Tutorial Links */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">
              קישור לרכישה / שיתוף (Shop / Affiliate Link)
            </label>
            <input
              type="url"
              value={formData.shopLink || ''}
              onChange={(e) => setFormData({ ...formData, shopLink: e.target.value })}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              placeholder="https://example.com/product"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">
              סרטון הדרכה / הסבר על המוצר (Tutorial Video URL)
            </label>
            <input
              type="url"
              value={formData.tutorialVideo || ''}
              onChange={(e) => setFormData({ ...formData, tutorialVideo: e.target.value })}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              placeholder="https://youtube.com/watch?v=..."
            />
          </div>
        </div>
      </div>
    </form>
  );
}
