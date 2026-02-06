'use client';

import { useState, useEffect } from 'react';
import { GymEquipmentFormData, EquipmentBrand } from '../core/gym-equipment.types';
import { MuscleGroup } from '../../../exercises/core/exercise.types';
import { ExerciseType } from '../../../exercises/core/exercise.types';
import {
  Dumbbell,
  Clock,
  Pause,
  Check,
  X,
  Plus,
  Video,
  Image as ImageIcon,
  Home,
  Building2,
  MapPin,
  Building,
  Navigation,
  Search,
} from 'lucide-react';
import { EquipmentLocation } from '../core/gym-equipment.types';
import { safeRenderText } from '@/utils/render-helpers';
import { getAllOutdoorBrands, OutdoorBrand } from '../../../equipment/brands';

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

// Location labels in Hebrew (matching ExecutionMethodCard style)
const LOCATION_LABELS: Record<EquipmentLocation | 'street', { label: string; icon: React.ReactNode }> = {
  home: { label: 'בית', icon: <Home size={18} /> },
  park: { label: 'פארק', icon: <MapPin size={18} /> },
  office: { label: 'משרד', icon: <Building2 size={18} /> },
  gym: { label: 'מכון כושר', icon: <Building size={18} /> },
  street: { label: 'רחוב', icon: <Navigation size={18} /> },
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
    availableInLocations: [],
    defaultLocation: undefined,
    ...initialData,
  });
  const [outdoorBrands, setOutdoorBrands] = useState<OutdoorBrand[]>([]);
  const [brandSearchTerm, setBrandSearchTerm] = useState<Record<number, string>>({});
  const [focusedBrandIndex, setFocusedBrandIndex] = useState<number | null>(null);

  useEffect(() => {
    loadOutdoorBrands();
  }, []);

  useEffect(() => {
    if (initialData) {
      // CRITICAL: Sanitize name if it comes as an object
      const sanitizedData = {
        ...initialData,
        name: typeof initialData.name === 'object' && initialData.name !== null
          ? (initialData.name as any).he || (initialData.name as any).en || String(initialData.name)
          : initialData.name || '',
        muscleGroups: initialData.muscleGroups || [],
        brands: initialData.brands?.map((brand) => ({
          ...brand,
          brandId: brand.brandId || undefined, // Ensure brandId is preserved
        })) || [],
      };
      setFormData(sanitizedData);
      
      // Initialize search terms for existing brands
      const searchTerms: Record<number, string> = {};
      sanitizedData.brands.forEach((brand, index) => {
        if (brand.brandName) {
          searchTerms[index] = brand.brandName;
        }
      });
      setBrandSearchTerm(searchTerms);
    }
  }, [initialData]);

  const loadOutdoorBrands = async () => {
    try {
      const brands = await getAllOutdoorBrands();
      setOutdoorBrands(brands);
    } catch (error) {
      console.error('Error loading outdoor brands:', error);
    }
  };

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
    setBrandSearchTerm({ ...brandSearchTerm, [formData.brands.length]: '' });
  };

  const removeBrand = (index: number) => {
    setFormData({
      ...formData,
      brands: formData.brands.filter((_, i) => i !== index),
    });
    const newSearchTerms = { ...brandSearchTerm };
    delete newSearchTerms[index];
    // Reindex remaining search terms
    const reindexed: Record<number, string> = {};
    Object.keys(newSearchTerms).forEach((key) => {
      const oldIndex = parseInt(key);
      if (oldIndex > index) {
        reindexed[oldIndex - 1] = newSearchTerms[oldIndex];
      } else if (oldIndex < index) {
        reindexed[oldIndex] = newSearchTerms[oldIndex];
      }
    });
    setBrandSearchTerm(reindexed);
  };

  const updateBrand = (index: number, field: keyof EquipmentBrand, value: string) => {
    const updatedBrands = [...formData.brands];
    updatedBrands[index] = { ...updatedBrands[index], [field]: value };
    setFormData({ ...formData, brands: updatedBrands });
  };

  const updateBrandWithId = (index: number, brand: OutdoorBrand) => {
    const updatedBrands = [...formData.brands];
    updatedBrands[index] = {
      ...updatedBrands[index],
      brandName: brand.name,
      brandId: brand.id, // CRITICAL: Save brandId for linking to outdoorBrands collection
      imageUrl: brand.logoUrl || updatedBrands[index].imageUrl,
      videoUrl: brand.videoUrl || updatedBrands[index].videoUrl,
    };
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
              value={safeRenderText(formData.name)}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              className="w-full px-4 py-3 text-base border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
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
                className="w-full px-4 py-3 text-base border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
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
                  muscleGroups: toggleArrayItem(formData.muscleGroups || [], muscle),
                })
              }
              className={`flex items-center justify-center gap-2 p-4 rounded-xl border-2 transition-all ${
                (formData.muscleGroups || []).includes(muscle)
                  ? 'border-cyan-500 bg-cyan-50 text-cyan-700'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              {(formData.muscleGroups || []).includes(muscle) && <Check size={16} />}
              <span className="text-sm font-bold">{MUSCLE_GROUP_LABELS[muscle]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Available Locations Section */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
        <h2 className="text-xl font-bold flex items-center gap-2 text-gray-800 mb-6">
          <span className="w-1 h-6 bg-green-500 rounded-full"></span>
          <MapPin size={20} className="text-green-500" />
          זמינות במיקומים
        </h2>

        <div className="space-y-6">
          {/* Default Location Dropdown */}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
              <MapPin size={16} />
              מיקום ברירת מחדל (Default Location)
            </label>
            <select
              value={formData.defaultLocation || ''}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  defaultLocation: (e.target.value || undefined) as EquipmentLocation | undefined,
                })
              }
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-transparent bg-white"
            >
              <option value="">ללא מיקום ברירת מחדל</option>
              {(Object.keys(LOCATION_LABELS).filter(loc => loc !== 'street') as EquipmentLocation[]).map((location) => (
                <option key={location} value={location}>
                  {safeRenderText(LOCATION_LABELS[location].label)}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-2">
              המיקום העיקרי שבו הציוד הזה נמצא בדרך כלל
            </p>
          </div>

          {/* Allowed Locations Multi-select */}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
              <MapPin size={16} />
              מיקומים זמינים (Allowed Locations)
            </label>
            <p className="text-sm text-gray-600 mb-4">
              בחר את כל המיקומים שבהם הציוד הזה זמין (ניתן לבחור מספר מיקומים)
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {(Object.keys(LOCATION_LABELS).filter(loc => loc !== 'street') as EquipmentLocation[]).map((location) => (
                <button
                  key={location}
                  type="button"
                  onClick={() =>
                    setFormData({
                      ...formData,
                      availableInLocations: toggleArrayItem(
                        formData.availableInLocations || [],
                        location
                      ),
                    })
                  }
                  className={`flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 transition-all ${
                    (formData.availableInLocations || []).includes(location)
                      ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-sm'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <div className={`${(formData.availableInLocations || []).includes(location) ? 'text-blue-600' : 'text-gray-400'}`}>
                    {LOCATION_LABELS[location].icon}
                  </div>
                  <span className="text-sm font-bold">{safeRenderText(LOCATION_LABELS[location].label)}</span>
                  {(formData.availableInLocations || []).includes(location) && (
                    <Check size={14} className="text-blue-600" />
                  )}
                </button>
              ))}
            </div>
          </div>
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

              {/* Brand Selection */}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">מותג *</label>
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                  <input
                    type="text"
                    value={brandSearchTerm[index] !== undefined ? brandSearchTerm[index] : (brand.brandName || '')}
                    onChange={(e) => {
                      setBrandSearchTerm({ ...brandSearchTerm, [index]: e.target.value });
                    }}
                    onFocus={() => {
                      setFocusedBrandIndex(index);
                      if (brandSearchTerm[index] === undefined && brand.brandName) {
                        setBrandSearchTerm({ ...brandSearchTerm, [index]: brand.brandName });
                      }
                    }}
                    onBlur={() => {
                      // Delay to allow click on dropdown item
                      setTimeout(() => setFocusedBrandIndex(null), 200);
                    }}
                    className="w-full px-4 py-3 pr-10 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                    placeholder="חפש מותג..."
                    required
                  />
                </div>
                {focusedBrandIndex === index && (
                  <div className="mt-2 max-h-48 overflow-y-auto border border-gray-200 rounded-lg bg-white shadow-lg z-10 relative">
                    {outdoorBrands
                      .filter((ob) => {
                        const search = (brandSearchTerm[index] || '').toLowerCase();
                        return !search || ob.name.toLowerCase().includes(search);
                      })
                      .slice(0, 10)
                      .map((outdoorBrand) => (
                        <button
                          key={outdoorBrand.id}
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault(); // Prevent blur
                            updateBrandWithId(index, outdoorBrand);
                            setBrandSearchTerm({ ...brandSearchTerm, [index]: outdoorBrand.name });
                            setFocusedBrandIndex(null);
                          }}
                          className={`w-full text-right px-4 py-2 hover:bg-cyan-50 transition-colors ${
                            brand.brandName === outdoorBrand.name ? 'bg-cyan-100 font-bold' : ''
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-900">{outdoorBrand.name}</span>
                            {outdoorBrand.logoUrl && (
                              <img
                                src={outdoorBrand.logoUrl}
                                alt={outdoorBrand.name}
                                className="w-6 h-6 object-contain rounded"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'none';
                                }}
                              />
                            )}
                          </div>
                        </button>
                      ))}
                    {outdoorBrands.filter((ob) => {
                      const search = (brandSearchTerm[index] || '').toLowerCase();
                      return !search || ob.name.toLowerCase().includes(search);
                    }).length === 0 && (
                      <div className="px-4 py-3 text-sm text-gray-500 text-center">
                        לא נמצאו מותגים
                      </div>
                    )}
                  </div>
                )}
                {brand.brandName && focusedBrandIndex !== index && (
                  <div className="mt-2 flex items-center gap-2">
                    <p className="text-xs text-gray-500">
                      מותג נבחר: <span className="font-bold text-cyan-600">{brand.brandName}</span>
                    </p>
                    {brand.brandId && (
                      <span className="text-xs text-gray-400">(ID: {brand.brandId})</span>
                    )}
                  </div>
                )}
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
                    className="w-full px-4 py-2 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
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
                    className="w-full px-4 py-2 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
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
