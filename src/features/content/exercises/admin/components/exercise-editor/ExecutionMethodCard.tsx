'use client';

import { useState, useEffect } from 'react';
import {
  ExecutionMethod,
  ExecutionLocation,
  RequiredGearType,
} from '../../../core/exercise.types';
import { GymEquipment } from '../../../../equipment/gym/core/gym-equipment.types';
import { GearDefinition } from '../../../../equipment/gear/core/gear-definition.types';
import { getAllOutdoorBrands } from '../../../../equipment/brands';
import { OutdoorBrand } from '../../../../equipment/brands';
import {
  Check,
  X,
  Home,
  MapPin,
  Navigation,
  Building2,
  User,
  Video,
  Link as LinkIcon,
  Image as ImageIcon,
  Package,
  ChevronDown,
  ChevronUp,
  Plane,
  AlertCircle,
  Star,
  Plus,
  HelpCircle,
  Copy,
} from 'lucide-react';
import { storage } from '@/lib/firebase';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { safeRenderText } from '@/utils/render-helpers';
import VideoPreview from './helpers/VideoPreview';
import ImagePreview from './helpers/ImagePreview';
import InstructionalVideosEditor from './helpers/InstructionalVideosEditor';
import MediaLibraryModal from '@/features/admin/components/MediaLibraryModal';
import { MediaAsset } from '@/features/admin/services/media-assets.service';

interface ExecutionMethodCardProps {
  method: ExecutionMethod;
  index: number;
  gymEquipmentList: GymEquipment[];
  gearDefinitionsList: GearDefinition[];
  loadingRequirements: boolean;
  isFollowAlong?: boolean; // Whether the exercise is in follow-along mode
  isFocused?: boolean; // Whether this card is auto-focused (from Content Status deep-link)
  onFocused?: () => void; // Callback when card is focused
  onUpdate: (method: ExecutionMethod) => void;
  onRemove: () => void;
  onDuplicate?: () => void; // Callback to duplicate this method
  hideHeaderActions?: boolean; // Hide duplicate/delete buttons when used in accordion (they're in the header)
}

export default function ExecutionMethodCard({
  method,
  index,
  gymEquipmentList,
  gearDefinitionsList,
  loadingRequirements,
  isFollowAlong = false,
  isFocused = false,
  onFocused,
  onUpdate,
  onRemove,
  onDuplicate,
  hideHeaderActions = false,
}: ExecutionMethodCardProps) {
  const [isMediaExpanded, setIsMediaExpanded] = useState(false);
  const [isCuesExpanded, setIsCuesExpanded] = useState(true); // Start expanded
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [outdoorBrands, setOutdoorBrands] = useState<OutdoorBrand[]>([]);
  const [loadingBrands, setLoadingBrands] = useState(false);
  const [showMediaLibrary, setShowMediaLibrary] = useState(false);
  const [mediaLibraryType, setMediaLibraryType] = useState<'image' | 'video' | 'all'>('all');
  const [mediaLibraryField, setMediaLibraryField] = useState<'mainVideoUrl' | 'imageUrl' | null>(null);
  
  // Auto-expand when focused from Content Status deep-link
  useEffect(() => {
    if (isFocused) {
      setIsMediaExpanded(true);
      // Call onFocused after a delay to allow rendering
      setTimeout(() => {
        onFocused?.();
      }, 100);
    }
  }, [isFocused, onFocused]);

  // Load outdoor brands when component mounts and gear type is fixed_equipment
  useEffect(() => {
    if (method.requiredGearType === 'fixed_equipment' && outdoorBrands.length === 0) {
      loadBrands();
    }
  }, [method.requiredGearType]);

  const loadBrands = async () => {
    setLoadingBrands(true);
    try {
      const brands = await getAllOutdoorBrands();
      setOutdoorBrands(brands);
    } catch (error) {
      console.error('Error loading outdoor brands:', error);
    } finally {
      setLoadingBrands(false);
    }
  };

  // CRITICAL: Defensive wrapper to ensure no objects are accidentally saved back to DB
  const safeUpdate = (updated: ExecutionMethod) => {
    const sanitized: ExecutionMethod = {
      ...updated,
      methodName: typeof updated.methodName === 'string' ? updated.methodName : String(updated.methodName || ''),
      // Ensure gearIds is always an array of strings
      gearIds: Array.isArray(updated.gearIds) 
        ? updated.gearIds.filter((id): id is string => typeof id === 'string' && id.trim() !== '')
        : [],
      // Ensure equipmentIds is always an array of strings
      equipmentIds: Array.isArray(updated.equipmentIds)
        ? updated.equipmentIds.filter((id): id is string => typeof id === 'string' && id.trim() !== '')
        : [],
    };
    onUpdate(sanitized);
  };

  const locationLabels: Record<ExecutionLocation, { label: string; icon: React.ReactNode }> = {
    home: { label: 'בית', icon: <Home size={16} /> },
    park: { label: 'פארק', icon: <MapPin size={16} /> },
    street: { label: 'רחוב', icon: <Navigation size={16} /> },
    office: { label: 'משרד', icon: <Building2 size={16} /> },
    school: { label: 'בית ספר', icon: <Building2 size={16} /> },
    gym: { label: 'חדר כושר', icon: <User size={16} /> },
    airport: { label: 'שדה תעופה', icon: <Plane size={16} /> },
  };

  const gearTypeLabels: Record<RequiredGearType, string> = {
    fixed_equipment: 'מתקן קבוע',
    user_gear: 'ציוד אישי',
    improvised: 'מאולתר',
  };

  // Get fixed equipment list (gym installations)
  const fixedEquipmentList = gymEquipmentList.map((eq) => ({ 
    id: eq.id, 
    name: eq.name, 
    type: 'fixed' as const 
  }));
  
  // Get personal gear list (user_gear - excludes improvised)
  const personalGearList = gearDefinitionsList
    .filter((gear) => gear.category !== 'improvised')
    .map((gear) => ({ 
      id: gear.id, 
      name: gear.name.he || gear.name.en || '', 
      type: 'personal' as const 
    }));
  
  // Get improvised items list
  const improvisedList = gearDefinitionsList
    .filter((gear) => gear.category === 'improvised')
    .map((gear) => ({ 
      id: gear.id, 
      name: gear.name.he || gear.name.en || '', 
      type: 'improvised' as const 
    }));
  
  // Helper to get item name by ID from any list
  const getItemNameById = (id: string): { name: string; type: 'fixed' | 'personal' | 'improvised' } | null => {
    const fixed = fixedEquipmentList.find(e => e.id === id);
    if (fixed) return { name: fixed.name, type: 'fixed' };
    
    const personal = personalGearList.find(g => g.id === id);
    if (personal) return { name: personal.name, type: 'personal' };
    
    const improvised = improvisedList.find(g => g.id === id);
    if (improvised) return { name: improvised.name, type: 'improvised' };
    
    return null;
  };
  
  // Backward compatibility: Get available gear list based on gear type (legacy)
  const getAvailableGearList = () => {
    const gearType = method.requiredGearType;
    if (gearType === 'fixed_equipment') {
      return fixedEquipmentList;
    } else if (gearType === 'user_gear') {
      return personalGearList;
    } else if (gearType === 'improvised') {
      return improvisedList;
    }
    return [];
  };

  const handleVideoUpload = (file: File) => {
    const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const safeLocation = typeof method.location === 'string' ? method.location : String(method.location || 'home');
    const path = `exercise-videos/${safeLocation}/${Date.now()}-${safeName}`;
    const storageRef = ref(storage, path);
    const uploadTask = uploadBytesResumable(storageRef, file);

    setUploading(true);
    setUploadProgress(0);

    uploadTask.on(
      'state_changed',
      (snapshot) => {
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        setUploadProgress(Math.round(progress));
      },
      (error) => {
        console.error('Error uploading video:', error);
        setUploading(false);
      },
      async () => {
        try {
          const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
          safeUpdate({
            ...method,
            media: { ...method.media, mainVideoUrl: downloadUrl },
          });
        } catch (err) {
          console.error('Error getting download URL:', err);
        } finally {
          setUploading(false);
        }
      }
    );
  };

  // Note: availableGear was removed as we now use individual lists for mixed selection
  // const availableGear = getAvailableGearList();

  return (
    <div className={`p-4 border-2 rounded-xl space-y-3 relative transition-all ${
      isFocused 
        ? 'border-cyan-500 bg-cyan-50/50 shadow-lg ring-2 ring-cyan-200' 
        : 'border-gray-200 bg-gray-50/50'
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-purple-100 text-purple-700 font-bold text-xs flex items-center justify-center">
            {index + 1}
          </div>
          <div>
            <div className="text-sm font-bold text-gray-700">
              {method.methodName || 'שיטת ביצוע חדשה'}
            </div>
            <div className="text-xs text-gray-500">
              {safeRenderText(
                typeof method.requiredGearType === 'string'
                  ? gearTypeLabels[method.requiredGearType as RequiredGearType]
                  : String(method.requiredGearType)
              )}
            </div>
          </div>
        </div>
        {!hideHeaderActions && (
          <div className="flex items-center gap-1">
            {/* Duplicate Button */}
            {onDuplicate && (
              <button
                type="button"
                onClick={onDuplicate}
                className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                title="שכפל שיטת ביצוע"
              >
                <Copy size={16} />
              </button>
            )}
            {/* Delete Button */}
            <button
              type="button"
              onClick={onRemove}
              className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
              title="מחק שיטת ביצוע"
            >
              <X size={16} />
            </button>
          </div>
        )}
      </div>

      {/* Method Name */}
      <div>
        <label className="block text-xs font-bold text-gray-500 mb-1.5">שם שיטת הביצוע (עברית)</label>
        <input
          type="text"
          value={method.methodName || ''}
          onChange={(e) => safeUpdate({ ...method, methodName: e.target.value })}
          className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
          placeholder="לדוגמה: מתח עם גומיות, שכיבות סמיכה על ספסל"
        />
      </div>

      {/* Notification Text */}
      <div>
        <div className="flex items-center gap-1.5 mb-1.5">
          <label className="text-xs font-bold text-gray-500">
            טקסט להתראה (Notification Text)
          </label>
          <div className="group relative">
            <HelpCircle size={12} className="text-gray-400 cursor-help" />
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-50">
              <div className="bg-gray-900 text-white text-xs rounded-lg py-2 px-3 whitespace-nowrap shadow-lg max-w-xs">
                הודעה קצרה שתקפוץ למשתמש לפני תחילת הסט
                <br />
                <span className="text-gray-300">(למשל: &quot;וודא שהכיסא יציב&quot;)</span>
                <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1">
                  <div className="border-4 border-transparent border-t-gray-900"></div>
                </div>
              </div>
            </div>
          </div>
          <span className="text-gray-400 font-normal text-xs">(עד 100 תווים)</span>
        </div>
        <textarea
          value={method.notificationText || ''}
          onChange={(e) => {
            const text = e.target.value.slice(0, 100); // Enforce 100 char limit
            safeUpdate({ ...method, notificationText: text });
          }}
          maxLength={100}
          rows={2}
          className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent resize-none"
          placeholder="למשל: הגב תפוס מהישיבה? בוא נתמתח על הכיסא..."
        />
        <div className="flex justify-between items-center mt-1">
          <p className="text-[10px] text-gray-500">
            טקסט זה יוצג בהתראה לפני תחילת התרגיל
          </p>
          <span className={`text-[10px] font-bold ${
            (method.notificationText?.length || 0) >= 90 
              ? 'text-red-500' 
              : (method.notificationText?.length || 0) >= 70 
              ? 'text-yellow-500' 
              : 'text-gray-400'
          }`}>
            {(method.notificationText?.length || 0)}/100
          </span>
        </div>
      </div>

      {/* Mixed Equipment Selection - Supports Fixed + Personal simultaneously */}
      <div className="pt-2 border-t border-gray-200">
        <div className="flex items-center gap-3 mb-3">
          <h3 className="text-sm font-bold text-gray-700 flex items-center gap-2">
            <Package size={16} className="text-cyan-500" />
            ציוד נדרש
          </h3>
          <span className="text-[10px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
            ניתן לשלב סוגים שונים
          </span>
        </div>

        {/* All Selected Equipment Tags - Unified View */}
        {((method.equipmentIds?.length || 0) > 0 || (method.gearIds?.length || 0) > 0) && (
          <div className="mb-3 p-2 bg-gray-50 rounded-lg border border-gray-200">
            <p className="text-[10px] font-bold text-gray-500 mb-1.5">ציוד שנבחר:</p>
            <div className="flex flex-wrap gap-1.5">
              {/* Fixed Equipment Tags */}
              {(method.equipmentIds || []).map((itemId: string) => {
                const item = getItemNameById(itemId);
                return (
                  <span
                    key={`fixed-${itemId}`}
                    className="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 text-purple-800 rounded-lg text-xs font-semibold"
                  >
                    <span className="text-[9px] bg-purple-200 px-1 rounded">מתקן</span>
                    {item?.name || itemId}
                    <button
                      type="button"
                      onClick={() => {
                        const newIds = (method.equipmentIds || []).filter(id => id !== itemId);
                        safeUpdate({ ...method, equipmentIds: newIds });
                      }}
                      className="text-purple-600 hover:text-purple-900"
                    >
                      <X size={12} />
                    </button>
                  </span>
                );
              })}
              {/* Personal Gear Tags */}
              {(method.gearIds || []).map((itemId: string) => {
                const item = getItemNameById(itemId);
                const isImprovised = item?.type === 'improvised';
                return (
                  <span
                    key={`gear-${itemId}`}
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold ${
                      isImprovised 
                        ? 'bg-amber-100 text-amber-800' 
                        : 'bg-cyan-100 text-cyan-800'
                    }`}
                  >
                    <span className={`text-[9px] px-1 rounded ${
                      isImprovised ? 'bg-amber-200' : 'bg-cyan-200'
                    }`}>
                      {isImprovised ? 'מאולתר' : 'אישי'}
                    </span>
                    {item?.name || itemId}
                    <button
                      type="button"
                      onClick={() => {
                        const newIds = (method.gearIds || []).filter(id => id !== itemId);
                        safeUpdate({ ...method, gearIds: newIds });
                      }}
                      className={isImprovised ? 'text-amber-600 hover:text-amber-900' : 'text-cyan-600 hover:text-cyan-900'}
                    >
                      <X size={12} />
                    </button>
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Equipment Selection Dropdowns - All visible simultaneously */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Fixed Equipment Dropdown */}
          <div>
            <label className="block text-[10px] font-bold text-purple-600 mb-1.5 flex items-center gap-1">
              <span className="w-2 h-2 bg-purple-500 rounded-full"></span>
              מתקן קבוע
            </label>
            <select
              value=""
              onChange={(e) => {
                if (!e.target.value) return;
                const currentIds = method.equipmentIds || [];
                if (currentIds.includes(e.target.value)) return;
                safeUpdate({ 
                  ...method, 
                  equipmentIds: [...currentIds, e.target.value],
                  // Set requiredGearType to fixed_equipment if nothing selected yet
                  requiredGearType: method.requiredGearType || 'fixed_equipment'
                });
              }}
              disabled={loadingRequirements || fixedEquipmentList.length === 0}
              className="w-full px-2 py-1.5 text-xs border border-purple-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:opacity-50 bg-white"
            >
              <option value="">+ הוסף מתקן...</option>
              {fixedEquipmentList
                .filter(item => !(method.equipmentIds || []).includes(item.id))
                .map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
            </select>
          </div>

          {/* Personal Gear Dropdown */}
          <div>
            <label className="block text-[10px] font-bold text-cyan-600 mb-1.5 flex items-center gap-1">
              <span className="w-2 h-2 bg-cyan-500 rounded-full"></span>
              ציוד אישי
            </label>
            <select
              value=""
              onChange={(e) => {
                if (!e.target.value) return;
                const currentIds = method.gearIds || [];
                if (currentIds.includes(e.target.value)) return;
                safeUpdate({ 
                  ...method, 
                  gearIds: [...currentIds, e.target.value],
                  // Set requiredGearType to user_gear if nothing selected yet
                  requiredGearType: method.requiredGearType || 'user_gear'
                });
              }}
              disabled={loadingRequirements || personalGearList.length === 0}
              className="w-full px-2 py-1.5 text-xs border border-cyan-200 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent disabled:opacity-50 bg-white"
            >
              <option value="">+ הוסף ציוד...</option>
              {personalGearList
                .filter(item => !(method.gearIds || []).includes(item.id))
                .map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
            </select>
          </div>

          {/* Improvised Items Dropdown */}
          <div>
            <label className="block text-[10px] font-bold text-amber-600 mb-1.5 flex items-center gap-1">
              <span className="w-2 h-2 bg-amber-500 rounded-full"></span>
              פריט מאולתר
            </label>
            <select
              value=""
              onChange={(e) => {
                if (!e.target.value) return;
                const currentIds = method.gearIds || [];
                if (currentIds.includes(e.target.value)) return;
                safeUpdate({ 
                  ...method, 
                  gearIds: [...currentIds, e.target.value],
                  // Set requiredGearType to improvised if nothing selected yet
                  requiredGearType: method.requiredGearType || 'improvised'
                });
              }}
              disabled={loadingRequirements || improvisedList.length === 0}
              className="w-full px-2 py-1.5 text-xs border border-amber-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent disabled:opacity-50 bg-white"
            >
              <option value="">+ הוסף פריט...</option>
              {improvisedList
                .filter(item => !(method.gearIds || []).includes(item.id))
                .map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
            </select>
            {improvisedList.length === 0 && (
              <p className="text-[9px] text-amber-600 mt-1">
                אין פריטים מאולתרים
              </p>
            )}
          </div>
        </div>

        {/* Brand Selection (show when fixed equipment is selected) */}
        {(method.equipmentIds?.length || 0) > 0 && (
          <div className="mt-3">
            <label className="block text-xs font-bold text-gray-500 mb-1.5">מותג ציוד חוץ (אופציונלי)</label>
            <select
              value={method.brandId || ''}
              onChange={(e) => safeUpdate({ ...method, brandId: e.target.value || null })}
              disabled={loadingBrands}
              className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent disabled:opacity-50"
            >
              <option value="">ללא מותג (גנרי)</option>
              {outdoorBrands.map((brand) => (
                <option key={brand.id} value={brand.id}>
                  {brand.name}
                </option>
              ))}
            </select>
            <p className="text-[10px] text-gray-500 mt-1">
              בחר מותג ספציפי אם התרגיל מיועד לציוד של יצרן מסוים (למשל: Saly, Ludos)
            </p>
          </div>
        )}

        {/* Empty State Message */}
        {(method.equipmentIds?.length || 0) === 0 && (method.gearIds?.length || 0) === 0 && (
          <p className="text-[10px] text-gray-400 mt-2 text-center">
            בחר ציוד מאחת הקטגוריות למעלה, או שלב בין סוגים שונים
          </p>
        )}
      </div>

      {/* Available Locations & Lifestyle Tags */}
      <div className="pt-2 border-t border-gray-200">
        <h3 className="text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
          <MapPin size={16} className="text-cyan-500" />
          זמינות והתאמה
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Available Locations Multi-select */}
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-2">מיקומים זמינים</label>
            <div className="grid grid-cols-3 md:grid-cols-4 gap-1.5">
              {(Object.keys(locationLabels) as ExecutionLocation[]).map((location) => (
                <button
                  key={location}
                  type="button"
                  onClick={() => {
                    const currentMapping = method.locationMapping || [];
                    const newMapping = currentMapping.includes(location)
                      ? currentMapping.filter(l => l !== location)
                      : [...currentMapping, location];
                    safeUpdate({ ...method, locationMapping: newMapping });
                  }}
                  className={`flex flex-col items-center gap-1 p-2 rounded-lg border-2 transition-all ${
                    (method.locationMapping || []).includes(location)
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className={`${(method.locationMapping || []).includes(location) ? 'text-blue-600' : 'text-gray-400'}`}>
                    {locationLabels[location].icon}
                  </div>
                  <span className="text-[10px] font-bold">{safeRenderText(locationLabels[location].label)}</span>
                  {(method.locationMapping || []).includes(location) && (
                    <Check size={10} className="text-blue-600" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Lifestyle Tags Multi-select */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-bold text-gray-500">תגיות אורח חיים (אופציונלי)</label>
              <button
                type="button"
                onClick={() => {
                  const allTags = ['parent', 'student', 'office_worker', 'remote_worker', 'athlete', 'senior'];
                  const currentTags = method.lifestyleTags || [];
                  // If all tags are already selected, clear them (which means "all")
                  // Otherwise, clear to "all" (empty = available to everyone)
                  const hasAnyTags = currentTags.length > 0;
                  safeUpdate({ ...method, lifestyleTags: hasAnyTags ? [] : [] });
                }}
                className={`px-2 py-1 text-[10px] font-bold rounded-lg transition-all ${
                  !method.lifestyleTags || method.lifestyleTags.length === 0
                    ? 'bg-emerald-100 text-emerald-700 border border-emerald-300'
                    : 'bg-gray-100 text-gray-600 hover:bg-emerald-50 hover:text-emerald-600'
                }`}
              >
                ✓ מתאים לכולם
              </button>
            </div>
            {/* Info message when no tags selected */}
            {(!method.lifestyleTags || method.lifestyleTags.length === 0) && (
              <div className="mb-2 p-2 bg-emerald-50 border border-emerald-200 rounded-lg">
                <p className="text-[10px] text-emerald-700 font-medium">
                  ✓ ללא תגיות = מתאים לכל סוגי המשתמשים
                </p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { id: 'parent', label: 'הורה', icon: <User size={12} /> },
                { id: 'student', label: 'סטודנט', icon: <Building2 size={12} /> },
                { id: 'office_worker', label: 'עובד משרד', icon: <Building2 size={12} /> },
                { id: 'remote_worker', label: 'עובד מהבית', icon: <Home size={12} /> },
                { id: 'athlete', label: 'ספורטאי', icon: <User size={12} /> },
                { id: 'senior', label: 'גיל הזהב', icon: <User size={12} /> },
              ].map((tag) => (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => {
                    const currentTags = method.lifestyleTags || [];
                    const newTags = currentTags.includes(tag.id)
                      ? currentTags.filter(t => t !== tag.id)
                      : [...currentTags, tag.id];
                    safeUpdate({ ...method, lifestyleTags: newTags });
                  }}
                  className={`flex items-center justify-center gap-1.5 p-2 rounded-lg border-2 transition-all text-[10px] ${
                    (method.lifestyleTags || []).includes(tag.id)
                      ? 'border-green-500 bg-green-50 text-green-700'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className={`${(method.lifestyleTags || []).includes(tag.id) ? 'text-green-600' : 'text-gray-400'}`}>
                    {tag.icon}
                  </div>
                  <span className="font-bold">{safeRenderText(tag.label)}</span>
                  {(method.lifestyleTags || []).includes(tag.id) && (
                    <Check size={10} className="text-green-600" />
                  )}
                </button>
              ))}
            </div>
            <p className="text-[9px] text-gray-500 mt-1.5">
              💡 בחר תגיות ספציפיות רק אם שיטת הביצוע מיועדת לקהל מסוים
            </p>
          </div>
        </div>
      </div>

      {/* Media Section - Collapsible */}
      <div className="pt-2 border-t border-gray-200">
        <button
          type="button"
          onClick={() => setIsMediaExpanded(!isMediaExpanded)}
          className="w-full flex items-center justify-between text-sm font-bold text-gray-700 hover:text-cyan-600 transition-colors"
        >
          <span className="flex items-center gap-2">
            <Video size={16} className="text-cyan-500" />
            מדיה (וידאו ותמונות)
          </span>
          {isMediaExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {isMediaExpanded && (
          <div className="mt-3 space-y-3">
            {/* Main Video */}
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5">
                סרטון ראשי {isFollowAlong && <span className="text-blue-600">(Follow-Along)</span>}
              </label>
              {isFollowAlong && (
                <p className="text-[10px] text-blue-600 mb-1.5">
                  ⚠️ עבור Follow-Along, השתמש בסרטון מלא (לא לולאה קצרה)
                </p>
              )}
              <div className="flex gap-2">
                <input
                  type="url"
                  value={typeof method.media?.mainVideoUrl === 'string' ? method.media.mainVideoUrl : String(method.media?.mainVideoUrl || '')}
                  onChange={(e) =>
                    safeUpdate({
                      ...method,
                      media: { ...method.media, mainVideoUrl: e.target.value },
                    })
                  }
                  className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  placeholder="https://..."
                />
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setMediaLibraryType('video');
                    setMediaLibraryField('mainVideoUrl');
                    setShowMediaLibrary(true);
                  }}
                  className="inline-flex items-center text-[11px] font-semibold text-gray-600 cursor-pointer px-3 py-1.5 bg-gray-100 border border-gray-200 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  <Video size={14} className="ml-1" />
                  בחר/העלה מדיה
                </button>
              </div>
              {uploading && (
                <span className="text-[11px] text-gray-500 mt-1 block">
                  מעלה וידאו... {uploadProgress}%
                </span>
              )}
              {isFollowAlong && (
                <div className="mt-2">
                  <label className="block text-xs font-bold text-gray-500 mb-1.5">
                    משך הסרטון (שניות) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={method.media?.videoDurationSeconds || ''}
                    onChange={(e) => {
                      const seconds = parseInt(e.target.value, 10);
                      safeUpdate({
                        ...method,
                        media: { 
                          ...method.media, 
                          videoDurationSeconds: isNaN(seconds) ? undefined : seconds 
                        },
                      });
                    }}
                    className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                    placeholder="לדוגמה: 120 (2 דקות)"
                  />
                  <p className="text-[10px] text-gray-500 mt-1">
                    משך הסרטון יקבע מתי להתקדם אוטומטית לחלק הבא באימון
                  </p>
                </div>
              )}
              {method.media?.mainVideoUrl && (
                <div className="mt-2">
                  <VideoPreview
                    url={safeRenderText(
                      typeof method.media.mainVideoUrl === 'string' 
                        ? method.media.mainVideoUrl 
                        : String(method.media.mainVideoUrl || '')
                    )}
                    onRemove={() =>
                      safeUpdate({
                        ...method,
                        media: { ...method.media, mainVideoUrl: '' },
                      })
                    }
                  />
                </div>
              )}
            </div>

            {/* Instructional Videos */}
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5">
                <LinkIcon size={12} className="inline mr-1" />
                סרטוני הדרכה
              </label>
              <InstructionalVideosEditor
                videos={method.media?.instructionalVideos || []}
                onChange={(videos) =>
                  safeUpdate({
                    ...method,
                    media: { ...method.media, instructionalVideos: videos },
                  })
                }
              />
            </div>

            {/* Image URL */}
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5">
                <ImageIcon size={12} className="inline mr-1" />
                קישור לתמונה
              </label>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={typeof method.media?.imageUrl === 'string' ? method.media.imageUrl : String(method.media?.imageUrl || '')}
                  onChange={(e) =>
                    safeUpdate({
                      ...method,
                      media: { ...method.media, imageUrl: e.target.value },
                    })
                  }
                  className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  placeholder="https://example.com/image.jpg"
                />
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setMediaLibraryType('image');
                    setMediaLibraryField('imageUrl');
                    setShowMediaLibrary(true);
                  }}
                  className="inline-flex items-center text-[11px] font-semibold text-gray-600 cursor-pointer px-3 py-1.5 bg-gray-100 border border-gray-200 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  <ImageIcon size={14} className="ml-1" />
                  בחר/העלה מדיה
                </button>
              </div>
              {method.media?.imageUrl && (
                <div className="mt-2">
                  <ImagePreview url={typeof method.media.imageUrl === 'string' ? method.media.imageUrl : String(method.media.imageUrl || '')} />
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Cues & Highlights Section - Collapsible */}
      <div className="pt-2 border-t border-gray-200">
        <button
          type="button"
          onClick={() => setIsCuesExpanded(!isCuesExpanded)}
          className="w-full flex items-center justify-between text-sm font-bold text-gray-700 hover:text-amber-600 transition-colors"
        >
          <span className="flex items-center gap-2">
            <AlertCircle size={16} className="text-amber-500" />
            דגשים ונקודות מרכזיות
            {((method.specificCues?.length || 0) > 0 || (method.highlights?.length || 0) > 0) && (
              <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[10px] rounded-full font-bold">
                {(method.specificCues?.length || 0) + (method.highlights?.length || 0)}
              </span>
            )}
          </span>
          {isCuesExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {isCuesExpanded && (
          <div className="mt-3 space-y-4">
            {/* Specific Cues */}
            <div>
              <label className="flex items-center gap-2 text-xs font-bold text-gray-500 mb-2">
                <AlertCircle size={12} className="text-amber-500" />
                דגשי ביצוע (Specific Cues)
              </label>
              <p className="text-[10px] text-gray-500 mb-2">
                נקודות קצרות לביצוע נכון בשיטה זו
              </p>
              <div className="space-y-1.5">
                {(method.specificCues || []).map((cue, cueIndex) => (
                  <div key={cueIndex} className="flex items-center gap-1.5">
                    <div className="flex items-center justify-center w-5 h-5 bg-amber-100 text-amber-700 rounded-full text-[10px] font-bold flex-shrink-0">
                      {cueIndex + 1}
                    </div>
                    <input
                      type="text"
                      value={cue}
                      onChange={(e) => {
                        const newCues = [...(method.specificCues || [])];
                        newCues[cueIndex] = e.target.value;
                        safeUpdate({ ...method, specificCues: newCues });
                      }}
                      className="flex-1 px-2 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                      placeholder="דגש ביצוע..."
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const newCues = (method.specificCues || []).filter((_, i) => i !== cueIndex);
                        safeUpdate({ ...method, specificCues: newCues });
                      }}
                      className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    const newCues = [...(method.specificCues || []), ''];
                    safeUpdate({ ...method, specificCues: newCues });
                  }}
                  className="flex items-center gap-1 px-2 py-1.5 text-amber-600 hover:bg-amber-50 rounded-lg font-bold text-xs transition-colors"
                >
                  <Plus size={12} />
                  הוסף דגש
                </button>
              </div>
            </div>

            {/* Highlights */}
            <div>
              <label className="flex items-center gap-2 text-xs font-bold text-gray-500 mb-2">
                <Star size={12} className="text-green-500" />
                נקודות מרכזיות (Highlights)
              </label>
              <p className="text-[10px] text-gray-500 mb-2">
                יתרונות וטיפים לשיטת ביצוע זו
              </p>
              <div className="space-y-1.5">
                {(method.highlights || []).map((highlight, highlightIndex) => (
                  <div key={highlightIndex} className="flex items-center gap-1.5">
                    <div className="flex items-center justify-center w-5 h-5 bg-green-100 text-green-700 rounded-full flex-shrink-0">
                      <Star size={10} />
                    </div>
                    <input
                      type="text"
                      value={highlight}
                      onChange={(e) => {
                        const newHighlights = [...(method.highlights || [])];
                        newHighlights[highlightIndex] = e.target.value;
                        safeUpdate({ ...method, highlights: newHighlights });
                      }}
                      className="flex-1 px-2 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      placeholder="נקודה מרכזית..."
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const newHighlights = (method.highlights || []).filter((_, i) => i !== highlightIndex);
                        safeUpdate({ ...method, highlights: newHighlights });
                      }}
                      className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    const newHighlights = [...(method.highlights || []), ''];
                    safeUpdate({ ...method, highlights: newHighlights });
                  }}
                  className="flex items-center gap-1 px-2 py-1.5 text-green-600 hover:bg-green-50 rounded-lg font-bold text-xs transition-colors"
                >
                  <Plus size={12} />
                  הוסף נקודה
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Media Library Modal */}
      <MediaLibraryModal
        isOpen={showMediaLibrary}
        onClose={() => {
          setShowMediaLibrary(false);
          setMediaLibraryField(null);
        }}
        onSelect={(asset: MediaAsset) => {
          if (mediaLibraryField === 'mainVideoUrl') {
            safeUpdate({
              ...method,
              media: { ...method.media, mainVideoUrl: asset.url },
            });
          } else if (mediaLibraryField === 'imageUrl') {
            safeUpdate({
              ...method,
              media: { ...method.media, imageUrl: asset.url },
            });
          }
          setShowMediaLibrary(false);
          setMediaLibraryField(null);
        }}
        assetType={mediaLibraryType}
        title={mediaLibraryField === 'mainVideoUrl' ? 'בחר סרטון' : 'בחר תמונה'}
      />
    </div>
  );
}
