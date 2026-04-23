'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Save,
  Loader2,
  MapPin,
  Lock,
  CheckCircle2,
  Clock,
  Trees,
  Building2,
  Dumbbell,
  Circle,
  Waves,
  Tag,
  Pencil,
  Droplets,
  Lightbulb,
  Toilet,
  Sun,
  Plus,
} from 'lucide-react';
import dynamicImport from 'next/dynamic';
import {
  Park,
  ParkFacilityCategory,
  ParkFeatureTag,
  NatureType,
  CommunityType,
  UrbanType,
} from '@/features/parks/core/types/park.types';
import { createPark, updatePark } from '@/features/admin/services/parks.service';
import { getAllAuthorities } from '@/features/admin/services/authority.service';
import { getAllGymEquipment } from '@/features/content/equipment/gym';
import type { GymEquipment } from '@/features/content/equipment/gym';
import { auth } from '@/lib/firebase';
import type { Authority } from '@/types/admin-types';
import type { ParkGymEquipment } from '@/features/content/equipment/gym';
import { Search, ChevronDown, Trash2 } from 'lucide-react';
import 'mapbox-gl/dist/mapbox-gl.css';

// ── Dynamic map imports (SSR-safe) ─────────────────────────────────
const MapComponent = dynamicImport(
  () => import('react-map-gl').then(mod => mod.default),
  { ssr: false, loading: () => <div className="h-full w-full bg-slate-100 animate-pulse rounded-2xl" /> }
);
const Marker = dynamicImport(() => import('react-map-gl').then(mod => mod.Marker), { ssr: false });

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

function applyHebrewLabels(map: any) {
  try {
    const style = map.getStyle?.();
    if (!style?.layers) return;
    for (const layer of style.layers) {
      if (layer.type === 'symbol' && layer.layout?.['text-field']) {
        try {
          map.setLayoutProperty(layer.id, 'text-field', ['coalesce', ['get', 'name_he'], ['get', 'name']]);
        } catch { /* skip locked layers */ }
      }
    }
  } catch { /* ignore */ }
}

// ── Labels ─────────────────────────────────────────────────────────
const FACILITY_TYPE_LABELS: Record<ParkFacilityCategory, string> = {
  gym_park:         'פארק כושר',
  court:            'מגרש ספורט',
  nature_community: 'טבע וקהילה',
  urban_spot:       'תשתית עירונית',
  route:            'מסלול טיול',
  zen_spot:         'אזור מנוחה',
};

const FEATURE_TAG_LABELS: Record<ParkFeatureTag, string> = {
  parkour_friendly:     'ידידותי לפארקור',
  shaded:               'מוצל',
  night_lighting:       'תאורת לילה',
  stairs_training:      'מדרגות לאימון',
  rubber_floor:         'רצפת גומי',
  near_water:           'קרוב למים',
  water_fountain:       'ברז שתייה',
  has_toilets:          'שירותים',
  has_benches:          'ספסלים',
  dog_friendly:         'ידידותי לכלבים',
  wheelchair_accessible:'נגיש לנכים',
  safe_zone:            'אזור בטוח / מיגונית',
  nearby_shelter:       'מיגונית קרובה',
};

const ALL_FEATURE_TAGS = Object.keys(FEATURE_TAG_LABELS) as ParkFeatureTag[];

const COURT_TYPES = [
  { value: 'basketball',   label: 'כדורסל' },
  { value: 'football',     label: 'כדורגל' },
  { value: 'tennis_padel', label: 'טניס / פאדל' },
  { value: 'multi',        label: 'רב-תכליתי' },
];

const NATURE_TYPES: { value: NatureType; label: string }[] = [
  { value: 'spring',            label: 'מעיין' },
  { value: 'observation_point', label: 'נקודת תצפית' },
];

const COMMUNITY_TYPES: { value: CommunityType; label: string }[] = [
  { value: 'dog_park', label: 'גן כלבים' },
];

const URBAN_TYPES: { value: UrbanType; label: string }[] = [
  { value: 'stairs',         label: 'מדרגות' },
  { value: 'bench',          label: 'ספסל' },
  { value: 'skatepark',      label: 'סקייטפארק' },
  { value: 'water_fountain', label: 'ברז שתייה' },
  { value: 'toilets',        label: 'שירותים' },
  { value: 'parking',        label: 'חניה' },
  { value: 'bike_rack',      label: 'עמדת אופניים' },
];

// Equipment row for the gym_park equipment picker
interface EquipmentRow {
  equipmentId: string;
  equipmentName: string;
  brandName: string;
}

const FACILITY_ICONS: Record<ParkFacilityCategory, React.ReactNode> = {
  gym_park:         <Dumbbell size={16} />,
  court:            <Circle size={16} />,
  nature_community: <Trees size={16} />,
  urban_spot:       <Building2 size={16} />,
  route:            <Waves size={16} />,
  zen_spot:         <MapPin size={16} />,
};

// ── Default Israel center (fallback if authority has no coordinates) ──
const ISRAEL_CENTER = { lat: 31.7683, lng: 35.2137 };
const DEFAULT_ZOOM  = 13;

// ── Props ───────────────────────────────────────────────────────────
export interface LocationEditorProps {
  /** When provided the authority picker is hidden and this value is used */
  lockedAuthorityId?: string;
  lockedAuthorityName?: string;
  /**
   * 'published' = visible on app immediately (super-admin default).
   * 'pending'   = requires Super Admin approval (municipality admin default).
   */
  defaultStatus?: 'pending' | 'published';
  /** Where to redirect after a successful save. */
  redirectPath?: string;
  /** Called after a successful save (alternative to redirect). */
  onSaved?: (parkId: string) => void;
  /** City center to focus the map on load — fetched from authority.coordinates */
  initialLat?: number;
  initialLng?: number;
  initialZoom?: number;
  /** When provided, editor enters Edit Mode and pre-populates the form */
  initialData?: Park;
}

// ── Component ───────────────────────────────────────────────────────
export default function LocationEditor({
  lockedAuthorityId,
  lockedAuthorityName,
  defaultStatus = 'published',
  redirectPath = '/admin/locations',
  onSaved,
  initialLat,
  initialLng,
  initialZoom = DEFAULT_ZOOM,
  initialData,
}: LocationEditorProps) {
  const router  = useRouter();
  const isEdit  = !!initialData;
  const isPending = defaultStatus === 'pending';

  // Use authority city center if provided, else Israel center
  const startLat = initialData?.location?.lat ?? initialLat ?? ISRAEL_CENTER.lat;
  const startLng = initialData?.location?.lng ?? initialLng ?? ISRAEL_CENTER.lng;

  // Map state
  const [markerLng, setMarkerLng] = useState<number>(startLng);
  const [markerLat, setMarkerLat] = useState<number>(startLat);
  const [hasPin,    setHasPin]    = useState(!!initialData?.location);
  const [viewport,  setViewport]  = useState({
    longitude: startLng,
    latitude:  startLat,
    zoom:      initialData ? 15 : initialZoom,
  });

  // Update viewport when authority coordinates arrive after mount
  useEffect(() => {
    if (initialData) return; // Edit mode: already positioned
    if (initialLat && initialLng) {
      setViewport(v => ({ ...v, latitude: initialLat, longitude: initialLng }));
    }
  }, [initialLat, initialLng, initialData]);

  // ── Form state ─────────────────────────────────────────────────
  const [name,        setName]        = useState(initialData?.name        ?? '');
  const [description, setDescription] = useState(initialData?.description ?? '');
  const [facilityType, setFacilityType] = useState<ParkFacilityCategory>(
    initialData?.facilityType ?? 'gym_park'
  );
  const [courtType,    setCourtType]    = useState(initialData?.courtType    ?? '');
  const [natureType,   setNatureType]   = useState<NatureType | ''>(
    (initialData?.natureType   as NatureType)  ?? ''
  );
  const [communityType, setCommunityType] = useState<CommunityType | ''>(
    (initialData?.communityType as CommunityType) ?? ''
  );
  const [urbanType, setUrbanType] = useState<UrbanType | ''>(
    (initialData?.urbanType as UrbanType) ?? ''
  );
  const [featureTags, setFeatureTags] = useState<ParkFeatureTag[]>(
    initialData?.featureTags ?? []
  );

  // Authority picker (super-admin only)
  const [selectedAuthorityId, setSelectedAuthorityId] = useState(lockedAuthorityId ?? '');
  const [authorities,         setAuthorities]         = useState<Authority[]>([]);

  // ── gym_park expanded fields ──────────────────────────────────
  const [hasWaterFountain, setHasWaterFountain] = useState(initialData?.hasWaterFountain ?? false);
  const [isDogFriendly,    setIsDogFriendly]    = useState(initialData?.isDogFriendly    ?? false);
  const [hasLights,        setHasLights]        = useState(initialData?.hasLights        ?? false);
  const [isShaded,         setIsShaded]         = useState(initialData?.isShaded         ?? false);

  // Live equipment catalog from Firestore
  const [gymEquipmentCatalog, setGymEquipmentCatalog] = useState<GymEquipment[]>([]);
  const [loadingEquipment,    setLoadingEquipment]    = useState(false);

  // Row-based equipment picker (each row = one piece of gym equipment + selected brand)
  const [equipmentRows, setEquipmentRows] = useState<EquipmentRow[]>([]);
  // Search state per row
  const [eqSearchTerms,       setEqSearchTerms]       = useState<Record<number, string>>({});
  const [showEqDropdown,      setShowEqDropdown]      = useState<Record<number, boolean>>({});
  const [showBrandDropdown,   setShowBrandDropdown]   = useState<Record<number, boolean>>({});

  // ── Status ────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  const effectiveAuthorityId = lockedAuthorityId ?? selectedAuthorityId;

  // Load authorities for super-admin picker
  useEffect(() => {
    if (lockedAuthorityId) return;
    getAllAuthorities().then(setAuthorities).catch(() => {});
  }, [lockedAuthorityId]);

  // Load gym equipment catalog from Firestore
  useEffect(() => {
    if (facilityType !== 'gym_park') return;
    setLoadingEquipment(true);
    getAllGymEquipment()
      .then(data => {
        setGymEquipmentCatalog(data);
        // Hydrate rows from initialData when catalog loads
        if (initialData?.gymEquipment && initialData.gymEquipment.length > 0 && equipmentRows.length === 0) {
          const hydrated: EquipmentRow[] = initialData.gymEquipment.map(eq => {
            const found = data.find(e => e.id === eq.equipmentId);
            return {
              equipmentId: eq.equipmentId,
              equipmentName: found?.name || eq.equipmentId,
              brandName: eq.brandName,
            };
          });
          setEquipmentRows(hydrated);
          const terms: Record<number, string> = {};
          hydrated.forEach((row, i) => { terms[i] = row.equipmentName; });
          setEqSearchTerms(terms);
        }
      })
      .catch(console.error)
      .finally(() => setLoadingEquipment(false));
  }, [facilityType]); // eslint-disable-line react-hooks/exhaustive-deps

  // Map click handler
  const handleMapClick = useCallback((e: any) => {
    const { lng, lat } = e.lngLat;
    setMarkerLng(lng);
    setMarkerLat(lat);
    setHasPin(true);
  }, []);

  // Feature tag toggle
  const toggleTag = (tag: ParkFeatureTag) => {
    setFeatureTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  // Row management for equipment picker
  const addEquipmentRow = () => {
    setEquipmentRows(prev => [...prev, { equipmentId: '', equipmentName: '', brandName: '' }]);
  };

  const removeEquipmentRow = (index: number) => {
    setEquipmentRows(prev => prev.filter((_, i) => i !== index));
    setEqSearchTerms(prev => { const n = { ...prev }; delete n[index]; return n; });
    setShowEqDropdown(prev => { const n = { ...prev }; delete n[index]; return n; });
    setShowBrandDropdown(prev => { const n = { ...prev }; delete n[index]; return n; });
  };

  const selectEquipment = (index: number, eq: GymEquipment) => {
    setEquipmentRows(prev => prev.map((row, i) =>
      i === index ? { equipmentId: eq.id, equipmentName: eq.name, brandName: '' } : row
    ));
    setEqSearchTerms(prev => ({ ...prev, [index]: eq.name }));
    setShowEqDropdown(prev => ({ ...prev, [index]: false }));
  };

  const selectBrand = (index: number, brandName: string) => {
    setEquipmentRows(prev => prev.map((row, i) =>
      i === index ? { ...row, brandName } : row
    ));
    setShowBrandDropdown(prev => ({ ...prev, [index]: false }));
  };

  // Build gymEquipment array for Firestore
  const buildGymEquipment = (): ParkGymEquipment[] =>
    equipmentRows
      .filter(row => row.equipmentId !== '')
      .map(({ equipmentId, brandName }) => ({ equipmentId, brandName }));

  // ── Save handler ──────────────────────────────────────────────
  const handleSave = async () => {
    if (!name.trim()) { setError('שם המיקום הוא שדה חובה'); return; }
    if (!hasPin)       { setError('יש לסמן מיקום על המפה'); return; }

    setSaving(true);
    setError(null);

    const currentUid = auth.currentUser?.uid ?? 'unknown';
    const origin: 'authority_admin' | 'super_admin' = isPending
      ? 'authority_admin'
      : 'super_admin';

    // Build amenities from expanded toggles
    const amenities = {
      hasShadow:   isShaded,
      hasLighting: hasLights,
      hasToilets:  false,
      hasWater:    hasWaterFountain,
    };

    const parkData: Omit<Park, 'id' | 'createdAt' | 'updatedAt'> = {
      name:          name.trim(),
      description:   description.trim(),
      location:      { lat: markerLat, lng: markerLng },
      facilityType,
      featureTags,
      authorityId:   effectiveAuthorityId || undefined,
      courtType:     facilityType === 'court'            ? courtType || undefined : undefined,
      natureType:    facilityType === 'nature_community' ? (natureType as NatureType) || undefined : undefined,
      communityType: facilityType === 'nature_community' ? (communityType as CommunityType) || undefined : undefined,
      urbanType:     facilityType === 'urban_spot'       ? (urbanType as UrbanType) || undefined : undefined,
      // Approval workflow
      contentStatus: isPending ? 'pending_review' : 'published',
      published:     !isPending,
      status:        'open',
      // gym_park expanded fields
      gymEquipment:      facilityType === 'gym_park' ? buildGymEquipment() : [],
      facilities:        [],
      amenities,
      hasWaterFountain,
      isDogFriendly,
      hasLights,
      isShaded,
      // Attribution & tracking
      createdByUser: currentUid,
      origin,
    } as any;

    try {
      let parkId: string;
      const adminInfo = currentUid !== 'unknown'
        ? { adminId: currentUid, adminName: auth.currentUser?.displayName || currentUid }
        : undefined;

      if (isEdit && initialData?.id) {
        await updatePark(initialData.id, parkData as any, adminInfo);
        parkId = initialData.id;
      } else {
        parkId = await createPark(parkData, adminInfo, { forcePendingReview: isPending });
      }

      setSaved(true);
      if (onSaved) {
        onSaved(parkId);
      } else {
        setTimeout(() => router.push(redirectPath), 1200);
      }
    } catch (err: any) {
      setError(err?.message || 'שגיאה בשמירת המיקום');
    } finally {
      setSaving(false);
    }
  };

  // ── JSX ───────────────────────────────────────────────────────
  return (
    <div className="flex h-full w-full gap-0" dir="rtl">
      {/* ── Sidebar ── */}
      <div className="w-[400px] flex-shrink-0 flex flex-col bg-white border-l border-slate-200 overflow-y-auto">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            {isEdit ? <Pencil size={16} className="text-blue-500" /> : <MapPin size={18} className="text-emerald-600" />}
            <h2 className="font-bold text-slate-800 text-base">
              {isEdit ? 'עריכת מיקום' : 'הוספת מיקום חדש'}
            </h2>
            {isPending && !isEdit && (
              <span className="mr-auto flex items-center gap-1 text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 text-[11px] font-semibold">
                <Clock size={11} />
                ישלח לאישור מנהל העל
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {isEdit ? 'ערוך את פרטי המיקום ולחץ "שמור שינויים"' : 'לחץ על המפה כדי לסמן את מיקום הנכס'}
          </p>
        </div>

        <div className="flex-1 px-5 py-4 space-y-5">
          {/* Authority */}
          {lockedAuthorityId ? (
            <div className="flex items-center gap-2 text-sm bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-200">
              <Lock size={13} className="text-slate-400 flex-shrink-0" />
              <span className="text-slate-500">רשות:</span>
              <span className="font-semibold text-slate-700 truncate">
                {lockedAuthorityName || lockedAuthorityId}
              </span>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">שיוך לרשות</label>
              <select
                value={selectedAuthorityId}
                onChange={e => setSelectedAuthorityId(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400"
              >
                <option value="">ללא רשות</option>
                {authorities.map(a => (
                  <option key={a.id} value={a.id}>{a.name as string}</option>
                ))}
              </select>
            </div>
          )}

          {/* Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">שם המיקום *</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="פארק הבריאות נאות השקמה"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-400"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">תיאור</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              placeholder="תיאור קצר של המיקום..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-400 resize-none"
            />
          </div>

          {/* Facility Category */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-2">סוג מיקום *</label>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(FACILITY_TYPE_LABELS) as ParkFacilityCategory[]).map(cat => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => {
                    setFacilityType(cat);
                    setCourtType('');
                    setNatureType('');
                    setCommunityType('');
                    setUrbanType('');
                  }}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition-all ${
                    facilityType === cat
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-emerald-300'
                  }`}
                >
                  {FACILITY_ICONS[cat]}
                  {FACILITY_TYPE_LABELS[cat]}
                </button>
              ))}
            </div>
          </div>

          {/* Sub-type pickers */}
          {facilityType === 'court' && (
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">סוג מגרש</label>
              <select value={courtType} onChange={e => setCourtType(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400">
                <option value="">בחר סוג...</option>
                {COURT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          )}

          {facilityType === 'nature_community' && (
            <div className="space-y-2">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">סוג טבע</label>
                <select value={natureType} onChange={e => setNatureType(e.target.value as NatureType)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400">
                  <option value="">בחר סוג...</option>
                  {NATURE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">סוג קהילה</label>
                <select value={communityType} onChange={e => setCommunityType(e.target.value as CommunityType)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400">
                  <option value="">בחר סוג...</option>
                  {COMMUNITY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
            </div>
          )}

          {facilityType === 'urban_spot' && (
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">סוג תשתית</label>
              <select value={urbanType} onChange={e => setUrbanType(e.target.value as UrbanType)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400">
                <option value="">בחר סוג...</option>
                {URBAN_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          )}

          {/* ── GYM PARK EXPANDED SECTION ─────────────────────── */}
          {facilityType === 'gym_park' && (
            <div className="space-y-4 rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4">
              <p className="text-xs font-bold text-emerald-700 uppercase tracking-wide flex items-center gap-1.5">
                <Dumbbell size={13} />
                פרטי פארק כושר
              </p>

              {/* Amenity toggles */}
              <div>
                <p className="text-xs font-semibold text-slate-600 mb-2">מתקנים קיימים</p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { key: 'water',  label: 'ברז שתייה',    icon: <Droplets size={13} />,  value: hasWaterFountain, setter: setHasWaterFountain },
                    { key: 'lights', label: 'תאורת לילה',   icon: <Lightbulb size={13} />, value: hasLights,        setter: setHasLights },
                    { key: 'shade',  label: 'מוצל',          icon: <Sun size={13} />,       value: isShaded,         setter: setIsShaded },
                    { key: 'dog',    label: 'ידידותי לכלבים',icon: null,                    value: isDogFriendly,    setter: setIsDogFriendly },
                  ].map(({ key, label, icon, value, setter }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setter(!value)}
                      className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium transition-all ${
                        value
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-white text-slate-500 border-slate-200 hover:border-emerald-300'
                      }`}
                    >
                      {icon}
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Equipment rows — live from Firestore gym_equipment */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-slate-600">
                    מתקנים קבועים בפארק ({equipmentRows.length})
                  </p>
                  <button
                    type="button"
                    onClick={addEquipmentRow}
                    className="flex items-center gap-1 text-[11px] font-bold text-emerald-600 hover:text-emerald-700"
                  >
                    <Plus size={12} /> הוסף מתקן
                  </button>
                </div>

                {loadingEquipment && (
                  <div className="flex items-center gap-2 text-xs text-slate-400 py-2">
                    <Loader2 size={13} className="animate-spin" /> טוען מתקנים מהמאגר...
                  </div>
                )}

                <div className="space-y-3">
                  {equipmentRows.map((row, index) => {
                    const eqSearch = (eqSearchTerms[index] || '').toLowerCase();
                    const filteredEquipment = eqSearch
                      ? gymEquipmentCatalog.filter(e => e.name.toLowerCase().includes(eqSearch))
                      : gymEquipmentCatalog;

                    const selectedEq = gymEquipmentCatalog.find(e => e.id === row.equipmentId);
                    const availableBrands = selectedEq?.brands ?? [];

                    return (
                      <div key={index} className="bg-white rounded-xl border border-slate-200 p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-slate-400 uppercase">
                            מתקן #{index + 1}
                          </span>
                          <button type="button" onClick={() => removeEquipmentRow(index)}
                            className="text-red-400 hover:text-red-600 p-0.5">
                            <Trash2 size={12} />
                          </button>
                        </div>

                        {/* Equipment search */}
                        <div className="relative">
                          <label className="text-[10px] font-bold text-slate-500 mb-0.5 block">מתקן כושר *</label>
                          <div className="relative">
                            <Search size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                              type="text"
                              value={eqSearchTerms[index] ?? row.equipmentName ?? ''}
                              onChange={e => {
                                setEqSearchTerms(prev => ({ ...prev, [index]: e.target.value }));
                                setShowEqDropdown(prev => ({ ...prev, [index]: true }));
                                if (row.equipmentId) {
                                  setEquipmentRows(prev => prev.map((r, i) =>
                                    i === index ? { equipmentId: '', equipmentName: '', brandName: '' } : r
                                  ));
                                }
                              }}
                              onFocus={() => setShowEqDropdown(prev => ({ ...prev, [index]: true }))}
                              placeholder="הקלד לחיפוש מתקן..."
                              className="w-full pr-8 pl-2 py-1.5 bg-slate-50 rounded-lg border border-slate-200 text-xs focus:border-emerald-400 focus:outline-none"
                            />
                          </div>
                          {showEqDropdown[index] && !loadingEquipment && (
                            <div className="absolute z-20 w-full mt-1 max-h-40 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-lg">
                              {filteredEquipment.length > 0 ? filteredEquipment.map(eq => (
                                <button key={eq.id} type="button"
                                  onClick={() => selectEquipment(index, eq)}
                                  className={`w-full text-right px-3 py-2 hover:bg-emerald-50 text-xs transition-colors border-b border-slate-50 last:border-0 ${
                                    row.equipmentId === eq.id ? 'bg-emerald-50 font-bold text-emerald-700' : 'text-slate-700'
                                  }`}>
                                  <span className="font-medium">{eq.name}</span>
                                  {eq.muscleGroups?.length > 0 && (
                                    <span className="text-[9px] text-slate-400 mr-2">
                                      ({eq.muscleGroups.slice(0, 2).join(', ')})
                                    </span>
                                  )}
                                </button>
                              )) : (
                                <p className="px-3 py-2 text-xs text-slate-400 text-center">לא נמצאו מתקנים</p>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Brand picker — only when equipment selected */}
                        {row.equipmentId && (
                          <div className="relative">
                            <label className="text-[10px] font-bold text-slate-500 mb-0.5 block">חברה / יצרן</label>
                            {availableBrands.length === 0 ? (
                              <p className="text-[10px] text-slate-400 italic">אין יצרנים רשומים למתקן זה</p>
                            ) : (
                              <div className="relative">
                                <button type="button"
                                  onClick={() => setShowBrandDropdown(prev => ({ ...prev, [index]: !prev[index] }))}
                                  className="w-full flex items-center justify-between px-3 py-1.5 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-700">
                                  <span>{row.brandName || 'בחר יצרן...'}</span>
                                  <ChevronDown size={12} className="text-slate-400" />
                                </button>
                                {showBrandDropdown[index] && (
                                  <div className="absolute z-20 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-36 overflow-y-auto">
                                    {availableBrands.map(brand => (
                                      <button key={brand.brandName} type="button"
                                        onClick={() => selectBrand(index, brand.brandName)}
                                        className={`w-full text-right px-3 py-2 hover:bg-emerald-50 text-xs transition-colors border-b border-slate-50 last:border-0 ${
                                          row.brandName === brand.brandName ? 'bg-emerald-50 font-bold text-emerald-700' : 'text-slate-700'
                                        }`}>
                                        {brand.brandName}
                                        {brand.imageUrl && (
                                          <span className="text-[9px] text-slate-400 mr-1">📷</span>
                                        )}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {equipmentRows.length === 0 && !loadingEquipment && (
                  <button type="button" onClick={addEquipmentRow}
                    className="w-full mt-2 flex items-center justify-center gap-2 bg-white border-2 border-dashed border-slate-200 rounded-xl py-3 text-xs font-medium text-slate-400 hover:border-emerald-300 hover:text-emerald-500 transition-all">
                    <Dumbbell size={14} />
                    הוסף מתקן כושר ראשון
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Feature Tags */}
          <div>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 mb-2">
              <Tag size={13} />
              תכונות המיקום
            </label>
            <div className="flex flex-wrap gap-1.5">
              {ALL_FEATURE_TAGS.map(tag => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all ${
                    featureTags.includes(tag)
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-emerald-300'
                  }`}
                >
                  {FEATURE_TAG_LABELS[tag]}
                </button>
              ))}
            </div>
          </div>

          {/* Location pin indicator */}
          <div className={`rounded-xl border px-3 py-2.5 text-xs flex items-center gap-2 ${
            hasPin
              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
              : 'bg-amber-50 border-amber-200 text-amber-700'
          }`}>
            <MapPin size={13} />
            {hasPin
              ? `מיקום נבחר: ${markerLat.toFixed(5)}, ${markerLng.toFixed(5)}`
              : 'לחץ על המפה כדי לסמן את המיקום'
            }
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 px-3 py-2.5 text-xs">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-100">
          <button
            onClick={handleSave}
            disabled={saving || saved}
            className={`w-full flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-bold transition-all ${
              saved
                ? 'bg-emerald-500 text-white'
                : isEdit
                  ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-md'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-md'
            } disabled:opacity-60`}
          >
            {saved ? (
              <><CheckCircle2 size={16} /> נשמר בהצלחה!</>
            ) : saving ? (
              <><Loader2 size={16} className="animate-spin" /> שומר...</>
            ) : isEdit ? (
              <><Save size={16} /> שמור שינויים</>
            ) : (
              <><Save size={16} /> {isPending ? 'שלח לאישור' : 'פרסם מיקום'}</>
            )}
          </button>
          {isPending && !isEdit && !saved && (
            <p className="mt-2 text-center text-[11px] text-amber-600">
              המיקום יישלח לאישור מנהל המערכת לפני שיוצג למשתמשים
            </p>
          )}
        </div>
      </div>

      {/* ── Map ── */}
      <div className="flex-1 relative bg-slate-100">
        <MapComponent
          {...viewport}
          onMove={e => setViewport(e.viewState)}
          onClick={handleMapClick}
          onLoad={(e: any) => { applyHebrewLabels(e.target); e.target?.on?.('style.load', () => applyHebrewLabels(e.target)); }}
          mapboxAccessToken={MAPBOX_TOKEN}
          mapStyle="mapbox://styles/mapbox/streets-v12"
          style={{ width: '100%', height: '100%' }}
          cursor="crosshair"
        >
          {hasPin && (
            <Marker longitude={markerLng} latitude={markerLat} anchor="bottom">
              <div className="flex flex-col items-center">
                <div className="w-8 h-8 rounded-full bg-emerald-600 border-2 border-white shadow-lg flex items-center justify-center">
                  <MapPin size={16} className="text-white" />
                </div>
                <div className="w-0.5 h-3 bg-emerald-600" />
                <div className="w-2 h-1 bg-emerald-600 rounded-full opacity-30" />
              </div>
            </Marker>
          )}
        </MapComponent>

        {!hasPin && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur-sm border border-slate-200 rounded-2xl px-4 py-2.5 shadow-lg text-slate-700 text-sm flex items-center gap-2 pointer-events-none">
            <MapPin size={15} className="text-emerald-500" />
            לחץ על המפה לסימון המיקום
          </div>
        )}
      </div>
    </div>
  );
}
