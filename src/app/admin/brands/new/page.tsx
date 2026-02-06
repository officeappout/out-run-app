'use client';

export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createOutdoorBrand } from '@/features/content/equipment/brands';
import { OutdoorBrandFormData } from '@/features/content/equipment/brands';
import { Save, X, Loader2, ArrowRight, Video, Image as ImageIcon } from 'lucide-react';
import Link from 'next/link';
import { useIsMounted } from '@/hooks/useIsMounted';
import { parseVideoUrl, isValidHexColor } from '@/utils/video-utils';
import Alert from '@/components/admin/Alert';

export default function NewBrandPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<OutdoorBrandFormData>({
    name: '',
    logoUrl: '',
    brandColor: '',
    website: '',
    videoUrl: '',
    description: '',
  });
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const isMounted = useIsMounted();
  
  const videoInfo = formData.videoUrl ? parseVideoUrl(formData.videoUrl) : null;
  const hasValidLogo = formData.logoUrl && formData.logoUrl.trim().length > 0;

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!formData.name.trim()) {
      errors.name = 'שם המותג הוא שדה חובה';
    }

    if (formData.brandColor && !isValidHexColor(formData.brandColor)) {
      errors.brandColor = 'צבע לא תקין. השתמש בפורמט hex (למשל: #FF5733)';
    }

    if (formData.website && !formData.website.match(/^https?:\/\/.+/)) {
      errors.website = 'כתובת אתר לא תקינה. השתמש בפורמט https://example.com';
    }

    if (formData.logoUrl && !formData.logoUrl.match(/^https?:\/\/.+\.(jpg|jpeg|png|gif|webp|svg)/i)) {
      errors.logoUrl = 'כתובת תמונה לא תקינה';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    try {
      setIsSubmitting(true);
      await createOutdoorBrand(formData);
      router.push('/admin/brands');
    } catch (error) {
      console.error('Error creating brand:', error);
      alert('שגיאה ביצירת המותג');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-20" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/admin/brands"
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4 transition-colors"
          >
            <ArrowRight size={18} />
            חזור לרשימת המותגים
          </Link>
          <h1 className="text-3xl font-black text-gray-900">מותג חדש</h1>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/admin/brands"
            className="flex items-center gap-2 px-6 py-3 bg-gray-200 text-gray-700 rounded-xl font-bold hover:bg-gray-300 transition-colors"
          >
            <X size={18} />
            ביטול
          </Link>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="flex items-center gap-2 px-6 py-3 bg-cyan-500 text-white rounded-xl font-bold hover:bg-cyan-600 transition-colors disabled:opacity-50 shadow-lg"
          >
            {isSubmitting ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
            {isSubmitting ? 'יוצר...' : 'צור מותג'}
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm space-y-6">
        {/* Validation Errors */}
        {Object.keys(validationErrors).length > 0 && (
          <Alert
            type="error"
            title="שגיאות אימות"
            message="אנא תקן את השגיאות הבאות לפני השמירה"
            onClose={() => setValidationErrors({})}
          />
        )}

        {/* Name */}
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-2">שם המותג *</label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => {
              setFormData({ ...formData, name: e.target.value });
              if (validationErrors.name) {
                setValidationErrors({ ...validationErrors, name: '' });
              }
            }}
            required
            className="w-full px-4 py-3 text-base border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
            placeholder="לדוגמה: Saly, Ludos, Generic Urban"
          />
          {validationErrors.name && (
            <p className="mt-1 text-xs text-red-600">{validationErrors.name}</p>
          )}
        </div>

        {/* Logo URL */}
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
            <ImageIcon size={16} className="text-gray-500" />
            כתובת לוגו
          </label>
          <input
            type="url"
            value={formData.logoUrl || ''}
            onChange={(e) => {
              setFormData({ ...formData, logoUrl: e.target.value });
              if (validationErrors.logoUrl) {
                setValidationErrors({ ...validationErrors, logoUrl: '' });
              }
            }}
            className="w-full px-4 py-3 text-base border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
            placeholder="https://example.com/logo.png"
          />
          {validationErrors.logoUrl && (
            <p className="mt-1 text-xs text-red-600">{validationErrors.logoUrl}</p>
          )}
          {isMounted && hasValidLogo && (
            <div className="mt-3 flex items-center gap-3">
              <div className="relative w-20 h-20 rounded-full overflow-hidden border-2 border-gray-200 bg-gray-50">
                <img
                  src={formData.logoUrl!}
                  alt="Logo preview"
                  className="w-full h-full object-contain"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              </div>
              <p className="text-xs text-gray-500">תצוגה מקדימה של הלוגו</p>
            </div>
          )}
        </div>

        {/* Brand Color */}
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-2">צבע מותג</label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={formData.brandColor || '#6B7280'}
              onChange={(e) => {
                setFormData({ ...formData, brandColor: e.target.value });
                if (validationErrors.brandColor) {
                  setValidationErrors({ ...validationErrors, brandColor: '' });
                }
              }}
              className="w-16 h-16 border border-gray-300 rounded-lg cursor-pointer"
            />
            <input
              type="text"
              value={formData.brandColor || ''}
              onChange={(e) => {
                const value = e.target.value;
                setFormData({ ...formData, brandColor: value });
                if (validationErrors.brandColor) {
                  setValidationErrors({ ...validationErrors, brandColor: '' });
                }
              }}
              placeholder="#6B7280"
              className="flex-1 px-4 py-3 text-base border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
            />
          </div>
          {validationErrors.brandColor && (
            <p className="mt-1 text-xs text-red-600">{validationErrors.brandColor}</p>
          )}
          {isMounted && formData.brandColor && isValidHexColor(formData.brandColor) && (
            <div className="mt-2 flex items-center gap-2">
              <div
                className="w-8 h-8 rounded-full border-2 border-gray-200"
                style={{ backgroundColor: formData.brandColor }}
              />
              <p className="text-xs text-gray-500">צבע מותג: {formData.brandColor}</p>
            </div>
          )}
        </div>

        {/* Website */}
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-2">אתר אינטרנט</label>
          <input
            type="url"
            value={formData.website || ''}
            onChange={(e) => {
              setFormData({ ...formData, website: e.target.value });
              if (validationErrors.website) {
                setValidationErrors({ ...validationErrors, website: '' });
              }
            }}
            className="w-full px-4 py-3 text-base border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
            placeholder="https://example.com"
          />
          {validationErrors.website && (
            <p className="mt-1 text-xs text-red-600">{validationErrors.website}</p>
          )}
        </div>

        {/* Video URL */}
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
            <Video size={16} className="text-gray-500" />
            קישור לסרטון (YouTube/Vimeo)
          </label>
          <input
            type="url"
            value={formData.videoUrl || ''}
            onChange={(e) => setFormData({ ...formData, videoUrl: e.target.value })}
            className="w-full px-4 py-3 text-base border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
            placeholder="https://www.youtube.com/watch?v=... או https://vimeo.com/..."
          />
          {isMounted && videoInfo && videoInfo.embedUrl && (
            <div className="mt-3 space-y-2">
              <div className="relative w-full aspect-video rounded-lg overflow-hidden border border-gray-200 bg-gray-50">
                {videoInfo.thumbnailUrl ? (
                  <img
                    src={videoInfo.thumbnailUrl}
                    alt="Video thumbnail"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gray-100">
                    <Video size={32} className="text-gray-400" />
                  </div>
                )}
                <div className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/10 transition-colors">
                  <div className="w-16 h-16 rounded-full bg-white/90 flex items-center justify-center">
                    <Video size={24} className="text-gray-700" />
                  </div>
                </div>
              </div>
              <p className="text-xs text-gray-500">
                {videoInfo.platform === 'youtube' ? 'YouTube' : 'Vimeo'} - תצוגה מקדימה
              </p>
            </div>
          )}
          {isMounted && formData.videoUrl && !videoInfo?.embedUrl && (
            <Alert
              type="warning"
              message="לא ניתן לזהות את הסרטון. אנא ודא שהקישור הוא מ-YouTube או Vimeo."
              className="mt-2"
            />
          )}
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-2">תיאור</label>
          <textarea
            value={formData.description || ''}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            rows={4}
            className="w-full px-4 py-3 text-base border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-transparent resize-none"
            placeholder="תיאור קצר של המותג..."
          />
        </div>
      </form>
    </div>
  );
}
