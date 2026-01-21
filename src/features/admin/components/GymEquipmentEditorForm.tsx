'use client';

import { useState, useEffect } from 'react';
import { GymEquipmentFormData, EquipmentBrand } from '@/types/gym-equipment.type';
import { MuscleGroup } from '@/types/exercise.type';
import { ExerciseType } from '@/types/exercise.type';
import {
  Dumbbell,
  Clock,
  Pause,
  Check,
  X,
  Plus,
  Video,
  Image as ImageIcon,
} from 'lucide-react';

interface GymEquipmentEditorFormProps {
  onSubmit: (data: GymEquipmentFormData) => void;
  isSubmitting: boolean;
  initialData?: GymEquipmentFormData;
}

// Muscle group labels in Hebrew (same as exercise form)
const MUSCLE_GROUP_LABELS: Record<MuscleGroup, string> = {
  chest: 'חזה',
  back: 'גב',
  shoulders: 'כתפיים',
  abs: 'בטן',
  obliques: 'אלכסונים',
  forearms: 'אמות',
  biceps: 'דו-ראשי',
  triceps: 'שלושה ראשים',
  quads: 'ארבע ראשי',
  hamstrings: 'המסטרינג',
  glutes: 'ישבן',
  calves: 'שוקיים',
  traps: 'טרפז',
  cardio: 'קרדיו',
  full_body: 'כל הגוף',
  core: 'ליבה',
  legs: 'רגליים',
};

// Exercise type labels
const EXERCISE_TYPE_LABELS: Record<ExerciseType, { label: string; icon: React.ReactNode }> = {
  reps: { label: 'חזרות', icon: <Dumbbell size={18} /> },
  time: { label: 'זמן', icon: <Clock size={18} /> },
  rest: { label: 'מנוחה', icon: <Pause size={18} /> },
};

export default function GymEquipmentEditorForm({
  onSubmit,
  isSubmitting,
  initialData,
}: GymEquipmentEditorFormProps) {
  const [formData, setFormData] = useState<GymEquipmentFormData>({
    name: '',
    type: 'reps',
    recommendedLevel: 1,
    isFunctional: false,
    muscleGroups: [],
    brands: [],
    ...initialData,
  });

  useEffect(() => {
    if (initialData) {
      setFormData(initialData);
    }
  }, [initialData]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  const toggleArrayItem = <T,>(array: T[], item: T): T[] => {
    return array.includes(item) ? array.filter((i) => i !== item) : [...array, item];
  };

  const addBrand = () => {
    setFormData({
      ...formData,
      brands: [...formData.brands, { brandName: '', imageUrl: '', videoUrl: '' }],
    });
  };

  const removeBrand = (index: number) => {
    setFormData({
      ...formData,
      brands: formData.brands.filter((_, i) => i !== index),
    });
  };

  const updateBrand = (index: number, field: keyof EquipmentBrand, value: string) => {
    const updatedBrands = [...formData.brands];
    updatedBrands[index] = { ...updatedBrands[index], [field]: value };
    setFormData({ ...formData, brands: updatedBrands });
  };

  return (
    <form id="gym-equipment-form" onSubmit={handleSubmit} className="space-y-6">
      {/* Basic Info Section */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
        <h2 className="text-xl font-bold flex items-center gap-2 text-gray-800 mb-6">
          <span className="w-1 h-6 bg-blue-500 rounded-full"></span>
          פרטים בסיסיים
        </h2>

        <div className="space-y-6">
          {/* Name */}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">שם הציוד *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              placeholder="לדוגמה: Bench Press Machine"
            />
          </div>

          {/* Type and Level */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">סוג הציוד *</label>
              <div className="grid grid-cols-3 gap-3">
                {(Object.keys(EXERCISE_TYPE_LABELS) as ExerciseType[]).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setFormData({ ...formData, type })}
                    className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                      formData.type === type
                        ? 'border-cyan-500 bg-cyan-50 text-cyan-700'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {EXERCISE_TYPE_LABELS[type].icon}
                    <span className="text-xs font-bold">{EXERCISE_TYPE_LABELS[type].label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">רמה מומלצת *</label>
              <input
                type="number"
                min="1"
                max="20"
                value={formData.recommendedLevel}
                onChange={(e) =>
                  setFormData({ ...formData, recommendedLevel: parseInt(e.target.value) || 1 })
                }
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Is Functional Toggle */}
          <div>
            <label className="flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all hover:bg-gray-50">
              <input
                type="checkbox"
                checked={formData.isFunctional}
                onChange={(e) => setFormData({ ...formData, isFunctional: e.target.checked })}
                className="w-5 h-5 text-cyan-500 border-gray-300 rounded focus:ring-cyan-500"
              />
              <span className="text-sm font-bold text-gray-700">ציוד פונקציונלי (Functional)</span>
            </label>
          </div>
        </div>
      </div>

      {/* Muscle Groups Section */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
        <h2 className="text-xl font-bold flex items-center gap-2 text-gray-800 mb-6">
          <span className="w-1 h-6 bg-orange-500 rounded-full"></span>
          קבוצות שרירים
        </h2>

        <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {(Object.keys(MUSCLE_GROUP_LABELS) as MuscleGroup[]).map((muscle) => (
            <button
              key={muscle}
              type="button"
              onClick={() =>
                setFormData({
                  ...formData,
                  muscleGroups: toggleArrayItem(formData.muscleGroups, muscle),
                })
              }
              className={`flex items-center justify-center gap-2 p-4 rounded-xl border-2 transition-all ${
                formData.muscleGroups.includes(muscle)
                  ? 'border-cyan-500 bg-cyan-50 text-cyan-700'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              {formData.muscleGroups.includes(muscle) && <Check size={16} />}
              <span className="text-sm font-bold">{MUSCLE_GROUP_LABELS[muscle]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Brands Section */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold flex items-center gap-2 text-gray-800">
            <span className="w-1 h-6 bg-purple-500 rounded-full"></span>
            חברות/יצרנים ({formData.brands.length})
          </h2>
          <button
            type="button"
            onClick={addBrand}
            className="flex items-center gap-2 px-4 py-2 bg-cyan-500 text-white rounded-lg font-bold hover:bg-cyan-600 transition-colors"
          >
            <Plus size={18} />
            הוסף חברה
          </button>
        </div>

        <div className="space-y-4">
          {formData.brands.map((brand, index) => (
            <div
              key={index}
              className="p-6 border-2 border-gray-200 rounded-xl space-y-4 relative bg-gray-50/50"
            >
              <div className="flex items-center justify-between mb-4 pr-10">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-cyan-100 text-cyan-700 font-bold text-xs flex items-center justify-center">
                    {index + 1}
                  </span>
                  <h3 className="text-sm font-bold text-gray-700">חברה #{index + 1}</h3>
                </div>
                <button
                  type="button"
                  onClick={() => removeBrand(index)}
                  className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  title="מחק חברה"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Brand Name */}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">שם החברה *</label>
                <input
                  type="text"
                  value={brand.brandName}
                  onChange={(e) => updateBrand(index, 'brandName', e.target.value)}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  placeholder="לדוגמה: Ludos, Urbanics, Life Fitness"
                />
              </div>

              {/* Image and Video in Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Image URL */}
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">
                    <ImageIcon size={16} className="inline mr-2" />
                    קישור לתמונה
                  </label>
                  <input
                    type="url"
                    value={brand.imageUrl || ''}
                    onChange={(e) => updateBrand(index, 'imageUrl', e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                    placeholder="https://example.com/image.jpg"
                  />
                  {brand.imageUrl && (
                    <div className="mt-3 w-full h-32 rounded-lg overflow-hidden bg-gray-100 border border-gray-200">
                      <img
                        src={brand.imageUrl}
                        alt={brand.brandName}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    </div>
                  )}
                </div>

                {/* Video URL */}
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">
                    <Video size={16} className="inline mr-2" />
                    קישור לסרטון
                  </label>
                  <input
                    type="url"
                    value={brand.videoUrl || ''}
                    onChange={(e) => updateBrand(index, 'videoUrl', e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                    placeholder="https://youtube.com/watch?v=... או https://vimeo.com/..."
                  />
                  {brand.videoUrl && (
                    <div className="mt-3">
                      <VideoPreview url={brand.videoUrl} />
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}

          {formData.brands.length === 0 && (
            <div className="text-center py-10 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
              <p className="text-gray-400 mb-2">לא נוספו חברות</p>
              <button
                type="button"
                onClick={addBrand}
                className="text-cyan-600 hover:text-cyan-700 font-bold text-sm"
              >
                הוסף את החברה הראשונה
              </button>
            </div>
          )}
        </div>
      </div>
    </form>
  );
}

// Video Preview Component (reused from ExerciseEditorForm)
function VideoPreview({ url }: { url: string }) {
  const [videoId, setVideoId] = useState<string | null>(null);
  const [videoType, setVideoType] = useState<'youtube' | 'vimeo' | 'unknown'>('unknown');

  useEffect(() => {
    // Extract YouTube video ID
    const youtubeRegex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
    const youtubeMatch = url.match(youtubeRegex);
    
    if (youtubeMatch) {
      setVideoId(youtubeMatch[1]);
      setVideoType('youtube');
      return;
    }

    // Extract Vimeo video ID
    const vimeoRegex = /(?:vimeo\.com\/)(\d+)/;
    const vimeoMatch = url.match(vimeoRegex);
    
    if (vimeoMatch) {
      setVideoId(vimeoMatch[1]);
      setVideoType('vimeo');
      return;
    }

    setVideoId(null);
    setVideoType('unknown');
  }, [url]);

  if (!videoId || videoType === 'unknown') {
    return (
      <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
        <p className="text-xs text-yellow-700">
          לא ניתן לזהות את הקישור. אנא ודא שהקישור הוא מ-YouTube או Vimeo.
        </p>
      </div>
    );
  }

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden bg-gray-50 mt-2">
      <div className="aspect-video w-full">
        {videoType === 'youtube' ? (
          <iframe
            src={`https://www.youtube.com/embed/${videoId}`}
            className="w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            title="Video preview"
          />
        ) : (
          <iframe
            src={`https://player.vimeo.com/video/${videoId}`}
            className="w-full h-full"
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
            title="Video preview"
          />
        )}
      </div>
    </div>
  );
}
