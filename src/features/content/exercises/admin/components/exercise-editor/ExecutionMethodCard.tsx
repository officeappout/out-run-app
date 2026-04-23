'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  ExecutionMethod,
  ExecutionLocation,
  RequiredGearType,
} from '../../../core/exercise.types';
import { EXECUTION_LOCATION_LABELS } from '../../../core/exercise-location.constants';
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
  Trees,
  Dumbbell,
  Search,
  Languages,
} from 'lucide-react';
import type { AppLanguage, ExerciseLang, LocalizedText, ExternalVideo } from '../../../core/exercise.types';
import { storage } from '@/lib/firebase';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { safeRenderText } from '@/utils/render-helpers';
import VideoPreview from './helpers/VideoPreview';
import ImagePreview from './helpers/ImagePreview';
import InstructionalVideosEditor from './helpers/InstructionalVideosEditor';
import BunnyVideoUploader from './BunnyVideoUploader';
import MediaLibraryModal from '@/features/admin/components/MediaLibraryModal';
import { MediaAsset } from '@/features/admin/services/media-assets.service';
import GenderedTextInput, { GenderedTextListInput } from './shared/GenderedTextInput';
import { GenderedText, isGenderedText, getGenderedText } from '../../../core/exercise.types';
import ErrorBoundary from '@/components/ErrorBoundary';
import {
  resolveEquipmentSvgPath,
  ALIAS_TO_CANONICAL,
  normalizeGearId,
} from '@/features/workout-engine/shared/utils/gear-mapping.utils';

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
  // Phase 5.5 — i18n: language tab for text fields in this method card
  const [activeLang, setActiveLang] = useState<ExerciseLang>('he');

  const [isMediaExpanded, setIsMediaExpanded] = useState(false);
  const [isCuesExpanded, setIsCuesExpanded] = useState(true); // Start expanded
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [outdoorBrands, setOutdoorBrands] = useState<OutdoorBrand[]>([]);
  const [loadingBrands, setLoadingBrands] = useState(false);
  const [showMediaLibrary, setShowMediaLibrary] = useState(false);
  const [mediaLibraryType, setMediaLibraryType] = useState<'image' | 'video' | 'all'>('all');
  const [mediaLibraryField, setMediaLibraryField] = useState<'mainVideoUrl' | 'imageUrl' | null>(null);
  /** Which equipment dropdown is currently open (null = all closed). */
  const [openDropdown, setOpenDropdown] = useState<'fixed' | 'personal' | 'improvised' | null>(null);
  const [equipmentSearch, setEquipmentSearch] = useState('');
  const [isEquipmentPanelOpen, setIsEquipmentPanelOpen] = useState(false);
  const equipmentSearchRef = useRef<HTMLInputElement>(null);
  const equipmentPanelRef = useRef<HTMLDivElement>(null);
  
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

  // Phase 5.5 — i18n: helpers for LocalizedText fields
  const getMethodName = (): LocalizedText =>
    (method.methodName && typeof method.methodName === 'object' && 'he' in method.methodName)
      ? (method.methodName as LocalizedText)
      : { he: typeof method.methodName === 'string' ? method.methodName as string : '', en: '' };

  const setMethodName = (lang: ExerciseLang, value: string) => {
    const current = getMethodName();
    safeUpdate({ ...method, methodName: { ...current, [lang]: value } as LocalizedText });
  };

  const getCues = (): LocalizedText[] =>
    (method.specificCues ?? []).map((c) =>
      (c && typeof c === 'object' && 'he' in c)
        ? (c as LocalizedText)
        : { he: typeof c === 'string' ? c : '', en: '' }
    );

  const setCue = (index: number, lang: ExerciseLang, value: string) => {
    const cues = getCues();
    const next = [...cues];
    next[index] = { ...next[index], [lang]: value };
    safeUpdate({ ...method, specificCues: next });
  };

  const addCue = () => {
    const cues = getCues();
    if (cues.length >= 8) return;
    safeUpdate({ ...method, specificCues: [...cues, { he: '', en: '' }] });
  };

  const removeCue = (index: number) => {
    const cues = getCues();
    safeUpdate({ ...method, specificCues: cues.filter((_, i) => i !== index) });
  };

  const getHighlights = (): LocalizedText[] =>
    (method.highlights ?? []).map((h) =>
      (h && typeof h === 'object' && 'he' in h)
        ? (h as LocalizedText)
        : { he: typeof h === 'string' ? h : '', en: '' }
    );

  const setHighlight = (index: number, lang: ExerciseLang, value: string) => {
    const hl = getHighlights();
    const next = [...hl];
    next[index] = { ...next[index], [lang]: value };
    safeUpdate({ ...method, highlights: next });
  };

  const addHighlight = () => {
    const hl = getHighlights();
    if (hl.length >= 6) return;
    safeUpdate({ ...method, highlights: [...hl, { he: '', en: '' }] });
  };

  const removeHighlight = (index: number) => {
    const hl = getHighlights();
    safeUpdate({ ...method, highlights: hl.filter((_, i) => i !== index) });
  };

  const getPerMethodVideo = (field: 'previewVideo' | 'fullTutorial', lang: ExerciseLang): ExternalVideo | undefined => {
    const map = method.media?.[field] as Partial<Record<ExerciseLang, ExternalVideo>> | undefined;
    return map?.[lang];
  };

  const setPerMethodVideo = (field: 'previewVideo' | 'fullTutorial', lang: ExerciseLang, next: ExternalVideo | undefined) => {
    const prevMap = (method.media?.[field] ?? {}) as Partial<Record<ExerciseLang, ExternalVideo>>;
    const nextMap: Partial<Record<ExerciseLang, ExternalVideo>> = { ...prevMap };
    if (next) { nextMap[lang] = next; } else { delete nextMap[lang]; }
    safeUpdate({ ...method, media: { ...method.media, [field]: Object.keys(nextMap).length > 0 ? nextMap : undefined } });
  };

  // Defensive wrapper — keeps equipment IDs as plain string arrays
  const safeUpdate = (updated: ExecutionMethod) => {
    const sanitized: ExecutionMethod = {
      ...updated,
      // methodName is now LocalizedText — pass through as-is (normalizer handles it on save)
      methodName: (updated.methodName && typeof updated.methodName === 'object' && 'he' in updated.methodName)
        ? updated.methodName as LocalizedText
        : { he: typeof updated.methodName === 'string' ? updated.methodName as string : '', en: '' } as LocalizedText,
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

  /**
   * Location labels — Hebrew text from centralized constants (Single Source of Truth).
   * Icons are admin-specific (Lucide React components).
   */
  const locationLabels: Record<ExecutionLocation, { label: string; icon: React.ReactNode }> = {
    home: { label: EXECUTION_LOCATION_LABELS.home.he, icon: <Home size={16} /> },
    park: { label: EXECUTION_LOCATION_LABELS.park.he, icon: <Trees size={16} /> },
    street: { label: EXECUTION_LOCATION_LABELS.street.he, icon: <Navigation size={16} /> },
    office: { label: EXECUTION_LOCATION_LABELS.office.he, icon: <Building2 size={16} /> },
    school: { label: EXECUTION_LOCATION_LABELS.school.he, icon: <Building2 size={16} /> },
    gym: { label: EXECUTION_LOCATION_LABELS.gym.he, icon: <Dumbbell size={16} /> },
    airport: { label: EXECUTION_LOCATION_LABELS.airport.he, icon: <Plane size={16} /> },
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
    type: 'fixed' as const,
    iconKey: eq.iconKey,
  }));

  // Get personal gear list (user_gear - excludes improvised)
  const personalGearList = gearDefinitionsList
    .filter((gear) => gear.category !== 'improvised')
    .map((gear) => ({
      id: gear.id,
      name: gear.name.he || gear.name.en || '',
      type: 'personal' as const,
      iconKey: gear.iconKey,
    }));

  // Get improvised items list
  const improvisedList = gearDefinitionsList
    .filter((gear) => gear.category === 'improvised')
    .map((gear) => ({
      id: gear.id,
      name: gear.name.he || gear.name.en || '',
      type: 'improvised' as const,
      iconKey: gear.iconKey,
    }));

  // ── Unified equipment list for search ──────────────────────────────────
  type UnifiedItem = { id: string; name: string; type: 'fixed' | 'personal' | 'improvised'; iconKey?: string };

  const allEquipmentItems = useMemo<UnifiedItem[]>(() => [
    ...fixedEquipmentList,
    ...personalGearList,
    ...improvisedList,
  ], [fixedEquipmentList, personalGearList, improvisedList]);

  const selectedIds = useMemo(() => new Set([
    ...(method.equipmentIds || []),
    ...(method.gearIds || []),
  ]), [method.equipmentIds, method.gearIds]);

  const filteredEquipmentItems = useMemo(() => {
    const available = allEquipmentItems.filter((item) => !selectedIds.has(item.id));
    if (!equipmentSearch.trim()) return available;
    const q = equipmentSearch.trim().toLowerCase();
    return available.filter((item) => {
      if (item.name.toLowerCase().includes(q)) return true;
      if (item.iconKey && item.iconKey.toLowerCase().includes(q)) return true;
      const normalizedIconKey = item.iconKey?.replace(/_/g, ' ') ?? '';
      if (normalizedIconKey.includes(q)) return true;
      return false;
    });
  }, [allEquipmentItems, selectedIds, equipmentSearch]);

  const groupedResults = useMemo(() => ({
    fixed: filteredEquipmentItems.filter((i) => i.type === 'fixed'),
    personal: filteredEquipmentItems.filter((i) => i.type === 'personal'),
    improvised: filteredEquipmentItems.filter((i) => i.type === 'improvised'),
  }), [filteredEquipmentItems]);

  const handleEquipmentSelect = useCallback((item: UnifiedItem) => {
    if (item.type === 'fixed') {
      const currentIds = method.equipmentIds || [];
      if (!currentIds.includes(item.id)) {
        safeUpdate({ ...method, equipmentIds: [...currentIds, item.id], requiredGearType: method.requiredGearType || 'fixed_equipment' });
      }
    } else {
      const currentIds = method.gearIds || [];
      if (!currentIds.includes(item.id)) {
        const gearType = item.type === 'improvised' ? 'improvised' : 'user_gear';
        safeUpdate({ ...method, gearIds: [...currentIds, item.id], requiredGearType: method.requiredGearType || gearType });
      }
    }
    setEquipmentSearch('');
    equipmentSearchRef.current?.focus();
  }, [method, safeUpdate]);

  useEffect(() => {
    if (!isEquipmentPanelOpen) return;
    const handler = (e: MouseEvent) => {
      if (equipmentPanelRef.current && !equipmentPanelRef.current.contains(e.target as Node)) {
        setIsEquipmentPanelOpen(false);
        setEquipmentSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isEquipmentPanelOpen]);

  // Helper to get item info by ID from any list
  const getItemNameById = (
    id: string,
  ): { name: string; type: 'fixed' | 'personal' | 'improvised'; iconKey?: string } | null => {
    const fixed = fixedEquipmentList.find((e) => e.id === id);
    if (fixed) return { name: fixed.name, type: 'fixed', iconKey: fixed.iconKey };

    const personal = personalGearList.find((g) => g.id === id);
    if (personal) return { name: personal.name, type: 'personal', iconKey: personal.iconKey };

    const improvised = improvisedList.find((g) => g.id === id);
    if (improvised) return { name: improvised.name, type: 'improvised', iconKey: improvised.iconKey };

    return null;
  };

  /**
   * For a broken equipment ID (not found in any loaded list), try to find a
   * replacement whose canonical key EXACTLY matches.
   *
   * Category guard: a replacement is only accepted when its canonical key
   * equals the broken ID's canonical key. This prevents cross-category
   * mismatches (e.g. suggesting "Rings" for a "Pull-up bar" ID).
   */
  const findReplacement = (brokenId: string): (GearDefinition | GymEquipment) | null => {
    if (typeof ALIAS_TO_CANONICAL === 'undefined' || !brokenId) return null;
    const canonical = ALIAS_TO_CANONICAL[brokenId];
    if (!canonical || canonical === 'unknown_gear') return null;

    // Strict match: the replacement item's own canonical key must be identical.
    const gearMatch = gearDefinitionsList.find((g) => {
      const itemCanonical = g.iconKey ? normalizeGearId(g.iconKey) : normalizeGearId(g.id);
      return itemCanonical === canonical;
    });
    if (gearMatch) return gearMatch;

    const gymMatch = gymEquipmentList.find((g) => {
      const itemCanonical = g.iconKey ? normalizeGearId(g.iconKey) : normalizeGearId(g.id);
      return itemCanonical === canonical;
    });
    return gymMatch || null;
  };
  
  type ReplacementItem = GearDefinition | GymEquipment;

  /**
   * Pre-computed broken-link maps — keyed by broken equipment ID, value is the
   * suggested replacement item (or null when none is found).
   *
   * Using useMemo keeps the expensive look-up out of the JSX render path and
   * prevents any accidental side-effect-in-render warnings from React strict mode.
   */
  const brokenFixedLinks = useMemo<Map<string, ReplacementItem | null>>(() => {
    const map = new Map<string, ReplacementItem | null>();
    for (const id of method.equipmentIds ?? []) {
      if (!getItemNameById(id)) {
        map.set(id, findReplacement(id));
      }
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [method.equipmentIds, gymEquipmentList, gearDefinitionsList]);

  const brokenGearLinks = useMemo<Map<string, ReplacementItem | null>>(() => {
    const map = new Map<string, ReplacementItem | null>();
    for (const id of method.gearIds ?? []) {
      if (!getItemNameById(id)) {
        map.set(id, findReplacement(id));
      }
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [method.gearIds, gymEquipmentList, gearDefinitionsList]);

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
              {getMethodName().he || getMethodName().en || 'שיטת ביצוע חדשה'}
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

      {/* ── Language Tabs ────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-bold text-gray-600">
          <Languages size={13} className="text-cyan-500" />
          שפת עריכה
        </span>
        <div className="flex gap-1 text-xs font-bold bg-gray-100 rounded-full p-0.5">
          {([
            { id: 'he' as ExerciseLang, label: 'HE' },
            { id: 'en' as ExerciseLang, label: 'EN' },
          ] as const).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setActiveLang(opt.id)}
              className={`px-3 py-1 rounded-full transition-all ${
                activeLang === opt.id
                  ? 'bg-cyan-500 text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Method Name */}
      <div>
        <label className="block text-xs font-bold text-gray-500 mb-1.5">
          שם שיטת הביצוע {activeLang === 'he' ? '(עברית)' : '(English)'}
        </label>
        <input
          type="text"
          dir={activeLang === 'he' ? 'rtl' : 'ltr'}
          value={getMethodName()[activeLang] || ''}
          onChange={(e) => setMethodName(activeLang, e.target.value)}
          className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
          placeholder={
            activeLang === 'he'
              ? 'לדוגמה: מתח עם גומיות, שכיבות סמיכה על ספסל'
              : 'e.g. Resistance Band Pull-up, Bench Push-up'
          }
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
        <GenderedTextInput
          value={method.notificationText}
          onChange={(value) => safeUpdate({ ...method, notificationText: value })}
          placeholder="למשל: הגב תפוס מהישיבה? בוא נתמתח על הכיסא..."
          multiline
          rows={2}
          maxLength={100}
        />
        <p className="text-[10px] text-gray-500 mt-1">
          טקסט זה יוצג בהתראה לפני תחילת התרגיל. ניתן לפצל לפי מגדר עם כפתור "פיצול מגדרי".
        </p>
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

              {/* ── Fixed Equipment Tags ─────────────────────────────── */}
              {(method.equipmentIds || []).map((itemId: string) => {
                const item = getItemNameById(itemId);

                // Broken link — ID no longer exists in gym_equipment
                if (!item) {
                  const replacement = brokenFixedLinks.get(itemId) ?? null;
                  return (
                    <span
                      key={`fixed-${itemId}`}
                      className="inline-flex items-center gap-1 px-2 py-1 bg-red-50 text-red-700 border border-red-300 rounded-lg text-xs font-semibold"
                    >
                      <AlertCircle size={11} className="text-red-500 flex-shrink-0" />
                      <span className="text-[9px] bg-red-200 px-1 rounded">פגוע</span>
                      <span className="font-mono text-[9px] opacity-60">{itemId.slice(0, 8)}…</span>
                      {replacement && (
                        <button
                          type="button"
                          title={`תקן → ${typeof replacement.name === 'string' ? replacement.name : (replacement.name.he || replacement.name.en)}`}
                          onClick={() => {
                            const newIds = (method.equipmentIds || []).map((id) => (id === itemId ? replacement.id : id));
                            safeUpdate({ ...method, equipmentIds: newIds });
                          }}
                          className="text-[9px] underline text-green-700 hover:text-green-900 ms-0.5"
                        >
                          תקן ↻
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => safeUpdate({ ...method, equipmentIds: (method.equipmentIds || []).filter((id) => id !== itemId) })}
                        className="text-red-500 hover:text-red-800"
                      >
                        <X size={12} />
                      </button>
                    </span>
                  );
                }

                // Valid chip — show SVG icon when available
                const svgPath = item.iconKey ? resolveEquipmentSvgPath(item.iconKey) : null;
                return (
                  <span
                    key={`fixed-${itemId}`}
                    className="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 text-purple-800 rounded-lg text-xs font-semibold"
                  >
                    {svgPath ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={svgPath} alt="" width={12} height={12} className="object-contain flex-shrink-0" />
                    ) : (
                      <span className="text-[9px] bg-purple-200 px-1 rounded">מתקן</span>
                    )}
                    {item.name}
                    <button
                      type="button"
                      onClick={() => safeUpdate({ ...method, equipmentIds: (method.equipmentIds || []).filter((id) => id !== itemId) })}
                      className="text-purple-600 hover:text-purple-900"
                    >
                      <X size={12} />
                    </button>
                  </span>
                );
              })}

              {/* ── Personal / Improvised Gear Tags ─────────────────── */}
              {(method.gearIds || []).map((itemId: string) => {
                const item = getItemNameById(itemId);

                // Broken link — ID no longer exists in gear_definitions
                if (!item) {
                  const replacement = brokenGearLinks.get(itemId) ?? null;
                  return (
                    <span
                      key={`gear-${itemId}`}
                      className="inline-flex items-center gap-1 px-2 py-1 bg-red-50 text-red-700 border border-red-300 rounded-lg text-xs font-semibold"
                    >
                      <AlertCircle size={11} className="text-red-500 flex-shrink-0" />
                      <span className="text-[9px] bg-red-200 px-1 rounded">פגוע</span>
                      <span className="font-mono text-[9px] opacity-60">{itemId.slice(0, 8)}…</span>
                      {replacement && (
                        <button
                          type="button"
                          title={`תקן → ${typeof replacement.name === 'string' ? replacement.name : (replacement.name.he || replacement.name.en)}`}
                          onClick={() => {
                            const newIds = (method.gearIds || []).map((id) => (id === itemId ? replacement.id : id));
                            safeUpdate({ ...method, gearIds: newIds });
                          }}
                          className="text-[9px] underline text-green-700 hover:text-green-900 ms-0.5"
                        >
                          תקן ↻
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => safeUpdate({ ...method, gearIds: (method.gearIds || []).filter((id) => id !== itemId) })}
                        className="text-red-500 hover:text-red-800"
                      >
                        <X size={12} />
                      </button>
                    </span>
                  );
                }

                // Valid chip — show SVG icon when available
                const isImprovised = item.type === 'improvised';
                const svgPath = item.iconKey ? resolveEquipmentSvgPath(item.iconKey) : null;
                return (
                  <span
                    key={`gear-${itemId}`}
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold ${
                      isImprovised ? 'bg-amber-100 text-amber-800' : 'bg-cyan-100 text-cyan-800'
                    }`}
                  >
                    {svgPath ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={svgPath} alt="" width={12} height={12} className="object-contain flex-shrink-0" />
                    ) : (
                      <span className={`text-[9px] px-1 rounded ${isImprovised ? 'bg-amber-200' : 'bg-cyan-200'}`}>
                        {isImprovised ? 'מאולתר' : 'אישי'}
                      </span>
                    )}
                    {item.name}
                    <button
                      type="button"
                      onClick={() => safeUpdate({ ...method, gearIds: (method.gearIds || []).filter((id) => id !== itemId) })}
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

        {/* ── Unified Searchable Equipment Selector ──────────────────────── */}
        <div ref={equipmentPanelRef} className="relative">
          <div className="relative">
            <Search size={14} className="absolute start-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              ref={equipmentSearchRef}
              type="text"
              dir="auto"
              value={equipmentSearch}
              disabled={loadingRequirements || allEquipmentItems.length === 0}
              onChange={(e) => {
                setEquipmentSearch(e.target.value);
                if (!isEquipmentPanelOpen) setIsEquipmentPanelOpen(true);
              }}
              onFocus={() => setIsEquipmentPanelOpen(true)}
              placeholder="חפש ציוד... (עברית או English)"
              className="w-full ps-8 pe-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-cyan-500 focus:border-transparent disabled:opacity-50 placeholder:text-gray-400"
            />
            {equipmentSearch && (
              <button
                type="button"
                onClick={() => { setEquipmentSearch(''); equipmentSearchRef.current?.focus(); }}
                className="absolute end-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {isEquipmentPanelOpen && (
            <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-72 overflow-y-auto">
              {filteredEquipmentItems.length === 0 ? (
                <div className="px-3 py-4 text-center text-xs text-gray-400">
                  {equipmentSearch ? `לא נמצא ציוד עבור "${equipmentSearch}"` : 'כל הציוד נבחר'}
                </div>
              ) : (
                <>
                  {/* ── Fixed (Park) Equipment ── */}
                  {groupedResults.fixed.length > 0 && (
                    <div>
                      <div className="sticky top-0 z-10 flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 border-b border-purple-100">
                        <span className="w-2 h-2 bg-purple-500 rounded-full" />
                        <span className="text-[10px] font-bold text-purple-700">מתקן קבוע</span>
                        <span className="text-[9px] text-purple-400 ms-auto">{groupedResults.fixed.length}</span>
                      </div>
                      {groupedResults.fixed.map((item) => {
                        const svgPath = item.iconKey ? resolveEquipmentSvgPath(item.iconKey) : null;
                        return (
                          <button
                            key={`eq-${item.id}`}
                            type="button"
                            onClick={() => handleEquipmentSelect(item)}
                            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-purple-50 text-xs text-gray-700 text-right transition-colors"
                          >
                            {svgPath ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={svgPath} alt="" width={16} height={16} className="object-contain flex-shrink-0" />
                            ) : (
                              <Package size={16} className="text-purple-300 flex-shrink-0" />
                            )}
                            <span className="flex-1">{item.name}</span>
                            <Plus size={12} className="text-gray-300 flex-shrink-0" />
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* ── Personal Gear ── */}
                  {groupedResults.personal.length > 0 && (
                    <div>
                      <div className="sticky top-0 z-10 flex items-center gap-1.5 px-3 py-1.5 bg-cyan-50 border-b border-cyan-100">
                        <span className="w-2 h-2 bg-cyan-500 rounded-full" />
                        <span className="text-[10px] font-bold text-cyan-700">ציוד אישי</span>
                        <span className="text-[9px] text-cyan-400 ms-auto">{groupedResults.personal.length}</span>
                      </div>
                      {groupedResults.personal.map((item) => {
                        const svgPath = item.iconKey ? resolveEquipmentSvgPath(item.iconKey) : null;
                        return (
                          <button
                            key={`eq-${item.id}`}
                            type="button"
                            onClick={() => handleEquipmentSelect(item)}
                            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-cyan-50 text-xs text-gray-700 text-right transition-colors"
                          >
                            {svgPath ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={svgPath} alt="" width={16} height={16} className="object-contain flex-shrink-0" />
                            ) : (
                              <Package size={16} className="text-cyan-300 flex-shrink-0" />
                            )}
                            <span className="flex-1">{item.name}</span>
                            <Plus size={12} className="text-gray-300 flex-shrink-0" />
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* ── Improvised Items ── */}
                  {groupedResults.improvised.length > 0 && (
                    <div>
                      <div className="sticky top-0 z-10 flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border-b border-amber-100">
                        <span className="w-2 h-2 bg-amber-500 rounded-full" />
                        <span className="text-[10px] font-bold text-amber-700">פריט מאולתר</span>
                        <span className="text-[9px] text-amber-400 ms-auto">{groupedResults.improvised.length}</span>
                      </div>
                      {groupedResults.improvised.map((item) => {
                        const svgPath = item.iconKey ? resolveEquipmentSvgPath(item.iconKey) : null;
                        return (
                          <button
                            key={`eq-${item.id}`}
                            type="button"
                            onClick={() => handleEquipmentSelect(item)}
                            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-amber-50 text-xs text-gray-700 text-right transition-colors"
                          >
                            {svgPath ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={svgPath} alt="" width={16} height={16} className="object-contain flex-shrink-0" />
                            ) : (
                              <Package size={16} className="text-amber-300 flex-shrink-0" />
                            )}
                            <span className="flex-1">{item.name}</span>
                            <Plus size={12} className="text-gray-300 flex-shrink-0" />
                          </button>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Category legend */}
        <div className="flex items-center gap-4 mt-2">
          <span className="flex items-center gap-1 text-[9px] text-gray-400">
            <span className="w-1.5 h-1.5 bg-purple-500 rounded-full" />מתקן קבוע
          </span>
          <span className="flex items-center gap-1 text-[9px] text-gray-400">
            <span className="w-1.5 h-1.5 bg-cyan-500 rounded-full" />ציוד אישי
          </span>
          <span className="flex items-center gap-1 text-[9px] text-gray-400">
            <span className="w-1.5 h-1.5 bg-amber-500 rounded-full" />מאולתר
          </span>
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
                  const allTags = ['parent', 'student', 'school_student', 'office_worker', 'remote_worker', 'athlete', 'senior', 'reservist', 'active_soldier'];
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
                { id: 'school_student', label: 'תלמיד', icon: <Building2 size={12} /> },
                { id: 'office_worker', label: 'עובד משרד', icon: <Building2 size={12} /> },
                { id: 'remote_worker', label: 'עובד מהבית', icon: <Home size={12} /> },
                { id: 'athlete', label: 'ספורטאי', icon: <User size={12} /> },
                { id: 'senior', label: 'גיל הזהב', icon: <User size={12} /> },
                { id: 'reservist', label: 'מילואימניק', icon: <User size={12} /> },
                { id: 'active_soldier', label: 'חייל סדיר', icon: <User size={12} /> },
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

            {/* Phase 5.5: Per-Method Bunny.net Slots — per language */}
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-2">
                Bunny.net לשיטה זו (אופציונלי — דורס את הגלובלי)
              </label>
              {(['he', 'en'] as ExerciseLang[]).map((lang) => (
                <div key={lang} className="mb-3">
                  <div className="text-[10px] font-bold text-gray-400 mb-1.5">
                    {lang === 'he' ? '🇮🇱 עברית' : '🇺🇸 English'}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <BunnyVideoUploader
                      label={`Preview (לולאה)`}
                      value={getPerMethodVideo('previewVideo', lang)}
                      onChange={(next) => setPerMethodVideo('previewVideo', lang, next)}
                      uploadTitle={`${getMethodName().he || method.location} — preview — ${lang}`}
                    />
                    <BunnyVideoUploader
                      label={`Tutorial (מלא)`}
                      value={getPerMethodVideo('fullTutorial', lang)}
                      onChange={(next) => setPerMethodVideo('fullTutorial', lang, next)}
                      uploadTitle={`${getMethodName().he || method.location} — tutorial — ${lang}`}
                    />
                  </div>
                </div>
              ))}
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
                <ImagePreview
                  url={typeof method.media.imageUrl === 'string' ? method.media.imageUrl : String(method.media.imageUrl || '')}
                  onRemove={() =>
                    safeUpdate({
                      ...method,
                      media: { ...method.media, imageUrl: '' },
                    })
                  }
                />
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
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle size={12} className="text-amber-500" />
                <label className="text-xs font-bold text-gray-500">
                  דגשי ביצוע (Specific Cues) — {activeLang === 'he' ? 'עברית' : 'English'}
                </label>
              </div>
              <p className="text-[10px] text-gray-500 mb-2">
                {activeLang === 'he'
                  ? 'נקודות קצרות לביצוע נכון בשיטה זו.'
                  : 'Short coaching cues in English.'}
              </p>
              <div className="space-y-2">
                {getCues().map((cue, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="shrink-0 w-5 h-5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold flex items-center justify-center">
                      {idx + 1}
                    </span>
                    <input
                      type="text"
                      dir={activeLang === 'he' ? 'rtl' : 'ltr'}
                      value={cue[activeLang] || ''}
                      onChange={(e) => setCue(idx, activeLang, e.target.value)}
                      className="flex-1 px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-400 focus:border-transparent"
                      placeholder={activeLang === 'he' ? 'הוסף דגש ביצוע...' : 'Add coaching cue...'}
                    />
                    <button type="button" onClick={() => removeCue(idx)} className="text-gray-300 hover:text-red-400">
                      <X size={14} />
                    </button>
                  </div>
                ))}
                {getCues().length < 8 && (
                  <button
                    type="button"
                    onClick={addCue}
                    className="flex items-center gap-1 text-xs font-bold text-amber-600 hover:text-amber-700"
                  >
                    <Plus size={13} /> הוסף דגש
                  </button>
                )}
              </div>
            </div>

            {/* Highlights */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Star size={12} className="text-green-500" />
                <label className="text-xs font-bold text-gray-500">
                  נקודות מרכזיות (Highlights) — {activeLang === 'he' ? 'עברית' : 'English'}
                </label>
              </div>
              <p className="text-[10px] text-gray-500 mb-2">
                {activeLang === 'he'
                  ? 'יתרונות וטיפים לשיטת ביצוע זו.'
                  : 'Benefits and tips for this method.'}
              </p>
              <div className="space-y-2">
                {getHighlights().map((hl, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Star size={12} className="shrink-0 text-green-400" />
                    <input
                      type="text"
                      dir={activeLang === 'he' ? 'rtl' : 'ltr'}
                      value={hl[activeLang] || ''}
                      onChange={(e) => setHighlight(idx, activeLang, e.target.value)}
                      className="flex-1 px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-400 focus:border-transparent"
                      placeholder={activeLang === 'he' ? 'הוסף נקודה מרכזית...' : 'Add highlight...'}
                    />
                    <button type="button" onClick={() => removeHighlight(idx)} className="text-gray-300 hover:text-red-400">
                      <X size={14} />
                    </button>
                  </div>
                ))}
                {getHighlights().length < 6 && (
                  <button
                    type="button"
                    onClick={addHighlight}
                    className="flex items-center gap-1 text-xs font-bold text-green-600 hover:text-green-700"
                  >
                    <Plus size={13} /> הוסף נקודה
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Media Library Modal */}
      <ErrorBoundary
        fallback={
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl p-6 max-w-md shadow-2xl">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-red-100 rounded-lg">
                  <AlertCircle size={24} className="text-red-600" />
                </div>
                <h2 className="text-lg font-bold text-red-900">
                  שגיאה בספריית המדיה
                </h2>
              </div>
              <p className="text-sm text-gray-700 mb-4">
                אירעה שגיאה בטעינת ספריית המדיה. הנתונים שלך נשמרו באופן אוטומטי.
              </p>
              <button
                onClick={() => {
                  setShowMediaLibrary(false);
                  setMediaLibraryField(null);
                }}
                className="w-full px-4 py-2 bg-gray-600 text-white rounded-lg font-bold hover:bg-gray-700 transition-colors"
              >
                סגור
              </button>
            </div>
          </div>
        }
        onReset={() => {
          setShowMediaLibrary(false);
          setMediaLibraryField(null);
        }}
      >
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
      </ErrorBoundary>
    </div>
  );
}
