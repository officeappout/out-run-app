'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { deleteDoc, doc } from 'firebase/firestore';
import {
    Park,
    ParkFacilityCategory,
    ParkSportType,
    ParkFeatureTag,
    getAutoSportTypes,
    ROUTE_SUB_SPORT_MAPPING,
} from '@/features/parks';
import type { NatureType, CommunityType, UrbanType, StairsDetails, BenchDetails, ParkingDetails, ParkingPaymentType, RouteTerrainType, RouteEnvironment } from '@/features/parks';
import {
    getAllParks,
    getParksByAuthority,
    createPark,
    updatePark,
    InventoryService,
} from '@/features/parks';
import type { Route as RouteType } from '@/features/parks';
import {
    Plus,
    Trash2,
    Edit,
    MapPin,
    Building2,
    RefreshCw,
    Map,
    Loader2,
    Trophy,
    Route,
    Trees,
    X,
    Save,
    Tag,
    Layers,
    Dog,
    Eye,
    ArrowRight,
    Upload,
    Image as ImageIcon,
    Footprints,
} from 'lucide-react';
import { checkUserRole, isOnlyAuthorityManager } from '@/features/admin/services/auth.service';
import { getAllAuthorities } from '@/features/admin/services/authority.service';
import { remapParksToAuthorities } from '@/features/admin/services/remap-parks-to-authorities';
import { Authority } from '@/types/admin-types';
import { safeRenderText } from '@/utils/render-helpers';
import { ref, uploadBytes, getDownloadURL, getStorage } from 'firebase/storage';
import dynamicImport from 'next/dynamic';
import {
    getCategoryBranding,
    setCategoryBrandIcon,
    resetCategoryBrandIcon,
    invalidateBrandingCache,
    SYSTEM_DEFAULT_ICONS,
    CATEGORY_LABELS,
    BRANDING_GROUPS,
} from '@/features/admin/services/category-branding.service';
import type { CategoryBrandingConfig, BrandingCategoryKey } from '@/features/admin/services/category-branding.service';
import { getFacilityIcon, resolveCategoryKey } from '@/utils/facility-icon';

const storage = getStorage();

// Dynamic import for Map to avoid SSR issues
const LocationPicker = dynamicImport(
    () => import('@/features/admin/components/LocationPicker'),
    { ssr: false, loading: () => <div className="h-64 bg-gray-100 animate-pulse rounded-2xl" /> }
);

// ============================================
// TAB & FACILITY TYPE CONFIGURATION
// ============================================

type LocationTab = 'parks' | 'courts' | 'routes' | 'nature_community' | 'urban' | 'branding';

interface TabConfig {
    id: LocationTab;
    label: string;
    icon: React.ElementType;
    facilityTypes: ParkFacilityCategory[];
    description: string;
    color: string;
}

const TABS: TabConfig[] = [
    {
        id: 'parks',
        label: 'פארקים וגינות',
        icon: MapPin,
        facilityTypes: ['gym_park'],
        description: 'גינות כושר, מתקני אימון ומתחמי ספורט',
        color: '#8B5CF6',
    },
    {
        id: 'courts',
        label: 'מגרשי ספורט',
        icon: Trophy,
        facilityTypes: ['court'],
        description: 'כדורסל, כדורגל, טניס ופאדל',
        color: '#F59E0B',
    },
    {
        id: 'routes',
        label: 'מסלולים',
        icon: Route,
        facilityTypes: ['route'],
        description: 'ריצה, הליכה, רכיבת אופניים',
        color: '#3B82F6',
    },
    {
        id: 'nature_community',
        label: 'טבע וקהילה',
        icon: Trees,
        facilityTypes: ['nature_community', 'zen_spot'],
        description: 'מעיינות, תצפיות, גינות כלבים',
        color: '#10B981',
    },
    {
        id: 'urban',
        label: 'תשתית עירונית',
        icon: Footprints,
        facilityTypes: ['urban_spot'],
        description: 'מדרגות, ספסלים, ברזיות, שירותים, חנייה, אופניים',
        color: '#6366F1',
    },
    {
        id: 'branding',
        label: 'ניהול מיתוג',
        icon: ImageIcon,
        facilityTypes: [],
        description: 'ניהול אייקונים ומיתוג קטגוריות',
        color: '#EC4899',
    },
];

// Court type options
type CourtType = 'basketball' | 'football' | 'tennis' | 'padel' | 'multi';
const COURT_TYPE_OPTIONS: { id: CourtType; label: string }[] = [
    { id: 'basketball', label: 'כדורסל' },
    { id: 'football', label: 'כדורגל' },
    { id: 'tennis', label: 'טניס' },
    { id: 'padel', label: 'פאדל' },
    { id: 'multi', label: 'רב תכליתי' },
];

// Nature type options
const NATURE_TYPE_OPTIONS: { id: NatureType; label: string; icon: string }[] = [
    { id: 'spring', label: 'מעיין / עין מים', icon: '🌊' },
    { id: 'observation_point', label: 'נקודת תצפית', icon: '🏔️' },
];

// Community type options
const COMMUNITY_TYPE_OPTIONS: { id: CommunityType; label: string; icon: string }[] = [
    { id: 'dog_park', label: 'גינת כלבים', icon: '🐕' },
];

// Urban type options
const URBAN_TYPE_OPTIONS: { id: UrbanType; label: string; icon: string }[] = [
    { id: 'stairs', label: 'גרם מדרגות', icon: '🪜' },
    { id: 'bench', label: 'ספסלי רחוב', icon: '🪑' },
    { id: 'skatepark', label: 'סקייטפארק', icon: '🛹' },
    { id: 'water_fountain', label: 'ברזיית מים', icon: '🚰' },
    { id: 'toilets', label: 'שירותים', icon: '🚻' },
    { id: 'parking', label: 'חנייה', icon: '🅿️' },
    { id: 'bike_rack', label: 'מתקן אופניים', icon: '🚲' },
];

// Parking payment type options
const PARKING_PAYMENT_OPTIONS: { id: ParkingPaymentType; label: string }[] = [
    { id: 'free', label: 'חינם' },
    { id: 'paid', label: 'בתשלום' },
    { id: 'resident_only', label: 'תושבים בלבד' },
];

// Steepness options for stairs
const STEEPNESS_OPTIONS: { id: 'low' | 'medium' | 'high'; label: string }[] = [
    { id: 'low', label: 'נמוכה' },
    { id: 'medium', label: 'בינונית' },
    { id: 'high', label: 'גבוהה' },
];

// Material options for benches
const BENCH_MATERIAL_OPTIONS: { id: 'wood' | 'metal' | 'concrete' | 'plastic'; label: string }[] = [
    { id: 'wood', label: 'עץ' },
    { id: 'metal', label: 'מתכת' },
    { id: 'concrete', label: 'בטון' },
    { id: 'plastic', label: 'פלסטיק' },
];

// Default category icons/images when no image is uploaded
const DEFAULT_CATEGORY_ICONS: Record<string, string> = {
    gym_park: '🏋️',
    court: '🏀',
    route: '🛤️',
    zen_spot: '🧘',
    urban_spot: '🏙️',
    nature_community: '🌿',
    // Court sub-types
    basketball: '🏀',
    football: '⚽',
    tennis: '🎾',
    padel: '🏓',
    multi: '🏟️',
    volleyball: '🏐',
    // Urban sub-types — Movement
    stairs: '🪜',
    bench: '🪑',
    skatepark: '🛹',
    // Urban sub-types — Assets
    water_fountain: '🚰',
    toilets: '🚻',
    parking: '🅿️',
    bike_rack: '🚲',
    // Nature sub-types
    spring: '🌊',
    observation_point: '🏔️',
    dog_park: '🐕',
};

// Sport options per tab
const SPORT_OPTIONS_BY_TAB: Record<LocationTab, { id: ParkSportType; label: string }[]> = {
    parks: [
        { id: 'calisthenics', label: 'קליסטניקס' },
        { id: 'crossfit', label: 'קרוספיט' },
        { id: 'functional', label: 'אימון פונקציונלי' },
        { id: 'movement', label: 'מובמנט' },
        { id: 'boxing', label: 'איגרוף' },
        { id: 'mma', label: 'קראטה/MMA' },
        { id: 'self_defense', label: 'הגנה עצמית' },
    ],
    courts: [
        { id: 'basketball', label: 'כדורסל' },
        { id: 'football', label: 'כדורגל' },
        { id: 'tennis_padel', label: 'טניס ופאדל' },
    ],
    routes: [
        { id: 'running', label: 'ריצה' },
        { id: 'walking', label: 'הליכה' },
        { id: 'cycling', label: 'אופניים' },
    ],
    nature_community: [
        { id: 'walking', label: 'הליכה' },
        { id: 'yoga', label: 'יוגה' },
        { id: 'stretching', label: 'מתיחות' },
    ],
    urban: [
        { id: 'crossfit', label: 'HIIT' },
        { id: 'running', label: 'קרדיו' },
        { id: 'functional', label: 'פונקציונלי' },
        { id: 'calisthenics', label: 'כוח גוף' },
        { id: 'skateboard', label: 'סקייטבורד' },
        { id: 'climbing', label: 'טיפוס' },
    ],
    branding: [],
};

// Feature tags — SINGLE source of truth for park amenities & features
const FEATURE_TAG_OPTIONS: { id: ParkFeatureTag; label: string; icon: string }[] = [
    { id: 'shaded', label: 'מוצל', icon: '☀️' },
    { id: 'night_lighting', label: 'תאורת לילה', icon: '💡' },
    { id: 'water_fountain', label: 'ברזיית מים', icon: '🚰' },
    { id: 'has_toilets', label: 'שירותים', icon: '🚻' },
    { id: 'parkour_friendly', label: 'ידידותי לפארקור', icon: '🤸' },
    { id: 'stairs_training', label: 'מדרגות לאימון', icon: '🪜' },
    { id: 'rubber_floor', label: 'ריצפת גומי', icon: '🟫' },
    { id: 'near_water', label: 'ליד מים', icon: '🌊' },
    { id: 'dog_friendly', label: 'ידידותי לכלבים', icon: '🐕' },
    { id: 'wheelchair_accessible', label: 'נגיש לכיסא גלגלים', icon: '♿' },
];

// Route terrain/environment options (for Routes tab auto sub-sport mapping)
const TERRAIN_OPTIONS: { id: RouteTerrainType; label: string; icon: string }[] = [
    { id: 'asphalt', label: 'אספלט', icon: '🛣️' },
    { id: 'dirt', label: 'שטח/עפר', icon: '⛰️' },
    { id: 'mixed', label: 'מעורב', icon: '🌲' },
];

const ENVIRONMENT_OPTIONS: { id: RouteEnvironment; label: string; icon: string }[] = [
    { id: 'urban', label: 'עירוני', icon: '🏙️' },
    { id: 'nature', label: 'טבע', icon: '🌿' },
    { id: 'park', label: 'פארק', icon: '🌳' },
    { id: 'beach', label: 'חוף', icon: '🏖️' },
];

// Facility type label map
const FACILITY_TYPE_LABELS: Record<ParkFacilityCategory, string> = {
    gym_park: 'גינת כושר',
    court: 'מגרש ספורט',
    route: 'מסלול',
    zen_spot: 'פינת גוף-נפש',
    urban_spot: 'אורבן / אקסטרים',
    nature_community: 'טבע וקהילה',
};

// ============================================
// ADD/EDIT MODAL COMPONENT
// ============================================

interface LocationFormData {
    name: string;
    city: string;
    description: string;
    location: { lat: number; lng: number };
    facilityType: ParkFacilityCategory;
    sportTypes: ParkSportType[];
    featureTags: ParkFeatureTag[];
    courtType?: CourtType;
    hasWaterFountain: boolean;
    isDogFriendly: boolean;
    natureType?: NatureType;
    communityType?: CommunityType;
    terrainType?: RouteTerrainType;
    environment?: RouteEnvironment;
    urbanType?: UrbanType;
    stairsDetails?: StairsDetails;
    benchDetails?: BenchDetails;
    parkingDetails?: ParkingDetails;
    externalSourceId?: string;
    imageFile?: File | null;
    authorityId?: string;
    /** Star rating 1–5 with decimal precision (e.g. 4.3) */
    rating?: number;
}

function AddLocationModal({
    isOpen,
    onClose,
    activeTab,
    onSave,
    editingPark,
    authorities = [],
}: {
    isOpen: boolean;
    onClose: () => void;
    activeTab: LocationTab;
    onSave: (data: LocationFormData) => Promise<void>;
    editingPark?: Park | null;
    authorities?: Authority[];
}) {
    const tabConfig = TABS.find(t => t.id === activeTab)!;
    const sportOptions = SPORT_OPTIONS_BY_TAB[activeTab];
    const isCourtTab = activeTab === 'courts';
    const isNatureTab = activeTab === 'nature_community';
    const isParksTab = activeTab === 'parks';
    const isRoutesTab = activeTab === 'routes';
    const isUrbanTab = activeTab === 'urban';

    const defaultFacilityType = tabConfig.facilityTypes[0];

    const [formData, setFormData] = useState<LocationFormData>({
        name: '',
        city: '',
        description: '',
        location: { lat: 32.0853, lng: 34.7818 },
        facilityType: defaultFacilityType,
        sportTypes: [],
        featureTags: [],
        courtType: undefined,
        hasWaterFountain: false,
        isDogFriendly: false,
        natureType: undefined,
        communityType: undefined,
        terrainType: undefined,
        environment: undefined,
        urbanType: undefined,
        stairsDetails: undefined,
        benchDetails: undefined,
        parkingDetails: undefined,
        externalSourceId: undefined,
        imageFile: null,
        authorityId: undefined,
        rating: undefined,
    });
    const [isSaving, setIsSaving] = useState(false);
    const [citySearch, setCitySearch] = useState('');
    const [showCityDropdown, setShowCityDropdown] = useState(false);
    const [authoritySearch, setAuthoritySearch] = useState('');
    const [showAuthorityDropdown, setShowAuthorityDropdown] = useState(false);

    // Derive unique cities from authority names
    const uniqueCities = Array.from(new Set(authorities.map(a => a.name).filter(Boolean)));
    const filteredCities = citySearch
        ? uniqueCities.filter(c => c?.toLowerCase().includes(citySearch.toLowerCase()))
        : uniqueCities;
    const filteredAuthorities = authoritySearch
        ? authorities.filter(a => a.name?.toLowerCase().includes(authoritySearch.toLowerCase()))
        : authorities;

    // Auto-assign sports when courtType changes (for courts tab)
    useEffect(() => {
        if (isCourtTab && formData.courtType) {
            const autoSports = getAutoSportTypes(
                formData.facilityType,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                formData.courtType,
            );
            setFormData(prev => ({ ...prev, sportTypes: autoSports }));
        }
    }, [formData.courtType, isCourtTab]); // eslint-disable-line react-hooks/exhaustive-deps

    // Populate form when editing
    useEffect(() => {
        if (editingPark) {
            setFormData({
                name: editingPark.name || '',
                city: editingPark.city || '',
                description: editingPark.description || '',
                location: editingPark.location || { lat: 32.0853, lng: 34.7818 },
                facilityType: editingPark.facilityType || defaultFacilityType,
                sportTypes: editingPark.sportTypes || [],
                featureTags: editingPark.featureTags || [],
                courtType: (editingPark as Record<string, unknown>).courtType as CourtType | undefined,
                hasWaterFountain: editingPark.hasWaterFountain ?? false,
                isDogFriendly: editingPark.isDogFriendly ?? false,
                natureType: editingPark.natureType,
                communityType: editingPark.communityType,
                terrainType: editingPark.terrainType,
                environment: editingPark.environment,
                urbanType: editingPark.urbanType,
                stairsDetails: editingPark.stairsDetails,
                benchDetails: editingPark.benchDetails,
                parkingDetails: editingPark.parkingDetails,
                externalSourceId: editingPark.externalSourceId,
                imageFile: null,
                authorityId: editingPark.authorityId,
                rating: editingPark.rating,
            });
            // Pre-fill authority search text
            if (editingPark.authorityId) {
                const auth = authorities.find(a => a.id === editingPark.authorityId);
                if (auth) setAuthoritySearch(auth.name || '');
            }
            // Pre-fill city search
            if (editingPark.city) setCitySearch(editingPark.city);
        } else {
            setFormData({
                name: '',
                city: '',
                description: '',
                location: { lat: 32.0853, lng: 34.7818 },
                facilityType: defaultFacilityType,
                sportTypes: [],
                featureTags: [],
                courtType: undefined,
                hasWaterFountain: false,
                isDogFriendly: false,
                natureType: undefined,
                communityType: undefined,
                terrainType: undefined,
                environment: undefined,
                urbanType: undefined,
                stairsDetails: undefined,
                benchDetails: undefined,
                parkingDetails: undefined,
                externalSourceId: undefined,
                imageFile: null,
                authorityId: undefined,
                rating: undefined,
            });
            setCitySearch('');
            setAuthoritySearch('');
        }
    }, [editingPark, defaultFacilityType, authorities]);

    const toggleSport = (sportId: ParkSportType) => {
        setFormData(prev => ({
            ...prev,
            sportTypes: prev.sportTypes.includes(sportId)
                ? prev.sportTypes.filter(s => s !== sportId)
                : [...prev.sportTypes, sportId],
        }));
    };

    const toggleTag = (tagId: ParkFeatureTag) => {
        setFormData(prev => ({
            ...prev,
            featureTags: prev.featureTags.includes(tagId)
                ? prev.featureTags.filter(t => t !== tagId)
                : [...prev.featureTags, tagId],
        }));
    };

    const handleSubmit = async () => {
        if (!formData.name || !formData.city) {
            alert('נא למלא שם ועיר');
            return;
        }
        setIsSaving(true);
        try {
            await onSave(formData);
            onClose();
        } catch (err) {
            alert('שגיאה בשמירה');
        } finally {
            setIsSaving(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center pt-8 overflow-y-auto pb-8">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl mx-4" dir="rtl">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-100">
                    <div className="flex items-center gap-3">
                        <div
                            className="w-10 h-10 rounded-xl flex items-center justify-center"
                            style={{ backgroundColor: `${tabConfig.color}15` }}
                        >
                            <tabConfig.icon size={20} style={{ color: tabConfig.color }} />
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-gray-900">
                                {editingPark ? 'עריכת' : 'הוספת'} {tabConfig.label}
                            </h2>
                            <p className="text-xs text-gray-400">{tabConfig.description}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 rounded-xl hover:bg-gray-100 transition-all">
                        <X size={20} />
                    </button>
                </div>

                {/* Form Body */}
                <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
                    {/* Image Upload — at the top for high visibility */}
                    <div className="space-y-2">
                        <label className="text-sm font-bold text-gray-700 flex items-center gap-2">
                            <ImageIcon size={14} className="text-blue-500" />
                            תמונת המיקום
                        </label>
                        {formData.imageFile ? (
                            <div className="relative">
                                <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl p-3">
                                    <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                        <ImageIcon size={20} className="text-green-600" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-bold text-green-700 truncate">{formData.imageFile.name}</p>
                                        <p className="text-xs text-green-500">{(formData.imageFile.size / 1024).toFixed(0)} KB</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setFormData(prev => ({ ...prev, imageFile: null }))}
                                        className="p-1.5 text-green-600 hover:bg-green-100 rounded-lg transition-colors"
                                    >
                                        <X size={16} />
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <label className="flex flex-col items-center justify-center gap-2 cursor-pointer bg-gray-50 hover:bg-blue-50 border-2 border-dashed border-gray-300 hover:border-blue-400 rounded-xl p-4 transition-all">
                                <Upload size={24} className="text-gray-400" />
                                <span className="text-sm text-gray-500">גרור תמונה או לחץ לבחירה</span>
                                <span className="text-xs text-gray-400">
                                    {!formData.imageFile && `ברירת מחדל: ${DEFAULT_CATEGORY_ICONS[formData.urbanType || formData.courtType || formData.facilityType || 'gym_park'] || '📍'}`}
                                </span>
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={(e) => {
                                        const file = e.target.files?.[0] || null;
                                        setFormData(prev => ({ ...prev, imageFile: file }));
                                    }}
                                    className="hidden"
                                />
                            </label>
                        )}
                    </div>

                    {/* Name & City */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-bold text-gray-700">שם המיקום *</label>
                            <input
                                value={formData.name}
                                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                                className="w-full p-3 bg-gray-50 rounded-xl border-2 border-transparent focus:border-blue-500 focus:bg-white transition-all outline-none"
                                placeholder={
                                    isCourtTab ? 'מגרש הכדורסל - פארק הירקון' :
                                    isNatureTab ? 'עין גדי / תצפית הר הכרמל' :
                                    isUrbanTab ? 'מדרגות רחוב הנביאים / ספסלי גן סאקר' :
                                    'לדוגמה: ספורטק הרצליה'
                                }
                            />
                        </div>
                        <div className="space-y-2 relative">
                            <label className="text-sm font-bold text-gray-700">עיר *</label>
                            <input
                                value={citySearch}
                                onChange={(e) => {
                                    setCitySearch(e.target.value);
                                    setFormData(prev => ({ ...prev, city: e.target.value }));
                                    setShowCityDropdown(true);
                                }}
                                onFocus={() => setShowCityDropdown(true)}
                                onBlur={() => setTimeout(() => setShowCityDropdown(false), 200)}
                                className="w-full p-3 bg-gray-50 rounded-xl border-2 border-transparent focus:border-blue-500 focus:bg-white transition-all outline-none"
                                placeholder="הקלד לחיפוש עיר..."
                            />
                            {showCityDropdown && filteredCities.length > 0 && (
                                <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                                    {filteredCities.map(city => (
                                        <button
                                            key={city}
                                            type="button"
                                            onMouseDown={(e) => e.preventDefault()}
                                            onClick={() => {
                                                setCitySearch(city || '');
                                                setFormData(prev => ({ ...prev, city: city || '' }));
                                                setShowCityDropdown(false);
                                            }}
                                            className={`w-full text-right px-4 py-2.5 text-sm hover:bg-blue-50 transition-colors ${
                                                formData.city === city ? 'bg-blue-50 text-blue-700 font-bold' : 'text-gray-700'
                                            }`}
                                        >
                                            {city}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Authority - searchable select */}
                    <div className="space-y-2 relative">
                        <label className="text-sm font-bold text-gray-700 flex items-center gap-2">
                            <Building2 size={14} className="text-indigo-500" />
                            רשות משויכת
                        </label>
                        <div className="relative">
                            <input
                                value={authoritySearch}
                                onChange={(e) => {
                                    setAuthoritySearch(e.target.value);
                                    setShowAuthorityDropdown(true);
                                    if (!e.target.value) {
                                        setFormData(prev => ({ ...prev, authorityId: undefined }));
                                    }
                                }}
                                onFocus={() => setShowAuthorityDropdown(true)}
                                onBlur={() => setTimeout(() => setShowAuthorityDropdown(false), 200)}
                                className="w-full p-3 bg-gray-50 rounded-xl border-2 border-transparent focus:border-indigo-500 focus:bg-white transition-all outline-none"
                                placeholder="הקלד לחיפוש רשות..."
                            />
                            {formData.authorityId && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setFormData(prev => ({ ...prev, authorityId: undefined }));
                                        setAuthoritySearch('');
                                    }}
                                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-500 transition-colors"
                                >
                                    <X size={16} />
                                </button>
                            )}
                        </div>
                        {showAuthorityDropdown && filteredAuthorities.length > 0 && (
                            <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                                    {filteredAuthorities.map(auth => (
                                    <button
                                        key={auth.id}
                                        type="button"
                                        onMouseDown={(e) => e.preventDefault()}
                                        onClick={() => {
                                            setFormData(prev => ({ ...prev, authorityId: auth.id, city: auth.name || prev.city }));
                                            setAuthoritySearch(auth.name || '');
                                            setCitySearch(auth.name || '');
                                            setShowAuthorityDropdown(false);
                                        }}
                                        className={`w-full text-right px-4 py-2.5 text-sm hover:bg-indigo-50 transition-colors ${
                                            formData.authorityId === auth.id ? 'bg-indigo-50 text-indigo-700 font-bold' : 'text-gray-700'
                                        }`}
                                    >
                                        <span>{auth.name}</span>
                                        {auth.type && <span className="text-xs text-gray-400 mr-2">({auth.type === 'city' ? 'עיר' : auth.type === 'regional_council' ? 'מועצה אזורית' : auth.type === 'local_council' ? 'מועצה מקומית' : auth.type})</span>}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Description */}
                    <div className="space-y-2">
                        <label className="text-sm font-bold text-gray-700">תיאור</label>
                        <textarea
                            value={formData.description}
                            onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                            rows={2}
                            className="w-full p-3 bg-gray-50 rounded-xl border-2 border-transparent focus:border-blue-500 focus:bg-white transition-all outline-none resize-none"
                            placeholder="תיאור כללי..."
                        />
                    </div>

                    {/* ====== TAB-SPECIFIC FIELDS ====== */}

                    {/* Note: Water fountain is now a feature tag ('water_fountain') — 
                         no separate toggle needed. The tag system is the single source of truth. */}

                    {/* Court-specific fields (simplified — no facilityCount) */}
                    {isCourtTab && (
                        <div className="space-y-2">
                            <label className="text-sm font-bold text-gray-700">סוג מגרש</label>
                            <div className="flex flex-wrap gap-2">
                                {COURT_TYPE_OPTIONS.map(opt => {
                                    const isSelected = formData.courtType === opt.id;
                                    return (
                                        <button
                                            key={opt.id}
                                            type="button"
                                            onClick={() => setFormData(prev => ({ ...prev, courtType: prev.courtType === opt.id ? undefined : opt.id }))}
                                            className={`px-4 py-2.5 rounded-xl border-2 text-sm font-medium transition-all flex items-center gap-2 ${
                                                isSelected
                                                    ? 'bg-amber-50 border-amber-400 text-amber-700'
                                                    : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                                            }`}
                                        >
                                            <span>{DEFAULT_CATEGORY_ICONS[opt.id] || '🏟️'}</span>
                                            <span>{opt.label}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Nature & Community specific fields */}
                    {isNatureTab && (
                        <div className="space-y-4">
                            {/* Nature Type */}
                            <div className="space-y-3">
                                <label className="text-sm font-bold text-gray-700 flex items-center gap-2">
                                    <Eye size={14} className="text-emerald-500" />
                                    סוג טבע
                                </label>
                                <div className="flex flex-wrap gap-2">
                                    {NATURE_TYPE_OPTIONS.map(opt => {
                                        const isSelected = formData.natureType === opt.id;
                                        return (
                                            <button
                                                key={opt.id}
                                                type="button"
                                                onClick={() => setFormData(prev => ({
                                                    ...prev,
                                                    natureType: prev.natureType === opt.id ? undefined : opt.id,
                                                    communityType: undefined,
                                                    facilityType: 'nature_community',
                                                }))}
                                                className={`px-4 py-2.5 rounded-xl border-2 text-sm font-medium transition-all flex items-center gap-2 ${
                                                    isSelected
                                                        ? 'bg-emerald-50 border-emerald-400 text-emerald-700'
                                                        : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                                                }`}
                                            >
                                                <span>{opt.icon}</span>
                                                <span>{opt.label}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Community Type */}
                            <div className="space-y-3">
                                <label className="text-sm font-bold text-gray-700 flex items-center gap-2">
                                    <Dog size={14} className="text-amber-500" />
                                    קהילה
                                </label>
                                <div className="flex flex-wrap gap-2">
                                    {COMMUNITY_TYPE_OPTIONS.map(opt => {
                                        const isSelected = formData.communityType === opt.id;
                                        return (
                                            <button
                                                key={opt.id}
                                                type="button"
                                                onClick={() => setFormData(prev => ({
                                                    ...prev,
                                                    communityType: prev.communityType === opt.id ? undefined : opt.id,
                                                    natureType: undefined,
                                                    facilityType: 'nature_community',
                                                    isDogFriendly: opt.id === 'dog_park' ? true : prev.isDogFriendly,
                                                }))}
                                                className={`px-4 py-2.5 rounded-xl border-2 text-sm font-medium transition-all flex items-center gap-2 ${
                                                    isSelected
                                                        ? 'bg-amber-50 border-amber-400 text-amber-700'
                                                        : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                                                }`}
                                            >
                                                <span>{opt.icon}</span>
                                                <span>{opt.label}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Dog Friendly Toggle (auto-on for dog parks) */}
                            <div className="bg-amber-50 rounded-2xl p-4 border border-amber-100">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
                                            <Dog size={20} className="text-amber-600" />
                                        </div>
                                        <div>
                                            <p className="font-bold text-gray-800">ידידותי לכלבים</p>
                                            <p className="text-xs text-gray-500">מקום מתאים לבעלי כלבים</p>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setFormData(prev => ({ ...prev, isDogFriendly: !prev.isDogFriendly }))}
                                        className={`relative w-14 h-7 rounded-full transition-all duration-200 ${
                                            formData.isDogFriendly ? 'bg-amber-500' : 'bg-gray-300'
                                        }`}
                                    >
                                        <div className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow-md transition-all duration-200 ${
                                            formData.isDogFriendly ? 'right-0.5' : 'right-[calc(100%-26px)]'
                                        }`} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Routes-specific fields: Terrain × Environment → Auto Sub-Sport */}
                    {isRoutesTab && (
                        <div className="space-y-4">
                            {/* Terrain Type */}
                            <div className="space-y-3">
                                <label className="text-sm font-bold text-gray-700">סוג תוואי</label>
                                <div className="flex flex-wrap gap-2">
                                    {TERRAIN_OPTIONS.map(opt => {
                                        const isSelected = formData.terrainType === opt.id;
                                        return (
                                            <button
                                                key={opt.id}
                                                type="button"
                                                onClick={() => {
                                                    const newTerrain = formData.terrainType === opt.id ? undefined : opt.id;
                                                    const env = formData.environment;
                                                    const autoSports = newTerrain && env
                                                        ? getAutoSportTypes('route', undefined, undefined, newTerrain, env)
                                                        : getAutoSportTypes('route');
                                                    setFormData(prev => ({
                                                        ...prev,
                                                        terrainType: newTerrain,
                                                        sportTypes: autoSports,
                                                    }));
                                                }}
                                                className={`px-4 py-2.5 rounded-xl border-2 text-sm font-medium transition-all flex items-center gap-2 ${
                                                    isSelected
                                                        ? 'bg-blue-50 border-blue-400 text-blue-700'
                                                        : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                                                }`}
                                            >
                                                <span>{opt.icon}</span>
                                                <span>{opt.label}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Environment */}
                            <div className="space-y-3">
                                <label className="text-sm font-bold text-gray-700">סביבה</label>
                                <div className="flex flex-wrap gap-2">
                                    {ENVIRONMENT_OPTIONS.map(opt => {
                                        const isSelected = formData.environment === opt.id;
                                        return (
                                            <button
                                                key={opt.id}
                                                type="button"
                                                onClick={() => {
                                                    const newEnv = formData.environment === opt.id ? undefined : opt.id;
                                                    const terrain = formData.terrainType;
                                                    const autoSports = terrain && newEnv
                                                        ? getAutoSportTypes('route', undefined, undefined, terrain, newEnv)
                                                        : getAutoSportTypes('route');
                                                    setFormData(prev => ({
                                                        ...prev,
                                                        environment: newEnv,
                                                        sportTypes: autoSports,
                                                    }));
                                                }}
                                                className={`px-4 py-2.5 rounded-xl border-2 text-sm font-medium transition-all flex items-center gap-2 ${
                                                    isSelected
                                                        ? 'bg-green-50 border-green-400 text-green-700'
                                                        : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                                                }`}
                                            >
                                                <span>{opt.icon}</span>
                                                <span>{opt.label}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Auto Sub-Sport result indicator */}
                            {formData.terrainType && formData.environment && (
                                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-start gap-3">
                                    <span className="text-lg mt-0.5">🧠</span>
                                    <div>
                                        <p className="text-xs font-bold text-blue-700">מיפוי אוטומטי</p>
                                        <p className="text-xs text-blue-600 mt-0.5">
                                            {ROUTE_SUB_SPORT_MAPPING[`${formData.terrainType}_${formData.environment}`]?.label || 'מסלול כללי'}
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Urban Infrastructure fields */}
                    {isUrbanTab && (
                        <div className="space-y-4">
                            {/* Urban Type Selection */}
                            <div className="space-y-3">
                                <label className="text-sm font-bold text-gray-700 flex items-center gap-2">
                                    <Footprints size={14} className="text-indigo-500" />
                                    סוג תשתית
                                </label>
                                <div className="flex flex-wrap gap-2">
                                    {URBAN_TYPE_OPTIONS.map(opt => {
                                        const isSelected = formData.urbanType === opt.id;
                                        return (
                                            <button
                                                key={opt.id}
                                                type="button"
                                                onClick={() => {
                                                    const newUrbanType = formData.urbanType === opt.id ? undefined : opt.id;
                                                    const autoSports = newUrbanType
                                                        ? getAutoSportTypes('urban_spot', undefined, undefined, undefined, undefined, newUrbanType)
                                                        : getAutoSportTypes('urban_spot');
                                                    setFormData(prev => ({
                                                        ...prev,
                                                        urbanType: newUrbanType,
                                                        sportTypes: autoSports,
                                                        facilityType: 'urban_spot',
                                                        stairsDetails: newUrbanType === 'stairs' ? (prev.stairsDetails || {}) : undefined,
                                                        benchDetails: newUrbanType === 'bench' ? (prev.benchDetails || {}) : undefined,
                                                        parkingDetails: newUrbanType === 'parking' ? (prev.parkingDetails || {}) : undefined,
                                                    }));
                                                }}
                                                className={`px-4 py-2.5 rounded-xl border-2 text-sm font-medium transition-all flex items-center gap-2 ${
                                                    isSelected
                                                        ? 'bg-indigo-50 border-indigo-400 text-indigo-700'
                                                        : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                                                }`}
                                            >
                                                <span>{opt.icon}</span>
                                                <span>{opt.label}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Auto-mapping indicator */}
                            {formData.urbanType && (
                                <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 flex items-start gap-3">
                                    <span className="text-lg mt-0.5">🧠</span>
                                    <div>
                                        <p className="text-xs font-bold text-indigo-700">מיפוי אוטומטי</p>
                                        <p className="text-xs text-indigo-600 mt-0.5">
                                            {formData.urbanType === 'stairs' && 'מדרגות → HIIT + קרדיו (מיפוי אוטומטי)'}
                                            {formData.urbanType === 'bench' && 'ספסלים → פונקציונלי + כוח גוף (מיפוי אוטומטי)'}
                                            {formData.urbanType === 'skatepark' && 'סקייטפארק → סקייטבורד + טיפוס (מיפוי אוטומטי)'}
                                            {formData.urbanType === 'water_fountain' && 'ברזיית מים — נכס תשתיתי (ללא שיוך ספורט)'}
                                            {formData.urbanType === 'toilets' && 'שירותים — נכס תשתיתי (ללא שיוך ספורט)'}
                                            {formData.urbanType === 'parking' && 'חנייה — נכס תשתיתי (ללא שיוך ספורט)'}
                                            {formData.urbanType === 'bike_rack' && 'מתקן אופניים → רכיבת אופניים (מיפוי אוטומטי)'}
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Stairs-specific fields */}
                            {formData.urbanType === 'stairs' && (
                                <div className="bg-gray-50 rounded-2xl p-4 border border-gray-200 space-y-4">
                                    <p className="text-sm font-bold text-gray-700">🪜 פרטי גרם מדרגות</p>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-gray-500">מספר מדרגות (אופציונלי)</label>
                                            <input
                                                type="number"
                                                min={1}
                                                max={500}
                                                value={formData.stairsDetails?.numberOfSteps || ''}
                                                onChange={(e) => setFormData(prev => ({
                                                    ...prev,
                                                    stairsDetails: {
                                                        ...prev.stairsDetails,
                                                        numberOfSteps: e.target.value ? parseInt(e.target.value) : undefined,
                                                    },
                                                }))}
                                                className="w-full p-3 bg-white rounded-xl border-2 border-transparent focus:border-indigo-500 transition-all outline-none"
                                                placeholder="לדוגמה: 80"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-gray-500">תלילות</label>
                                            <div className="flex gap-2">
                                                {STEEPNESS_OPTIONS.map(opt => {
                                                    const isSelected = formData.stairsDetails?.steepness === opt.id;
                                                    return (
                                                        <button
                                                            key={opt.id}
                                                            type="button"
                                                            onClick={() => setFormData(prev => ({
                                                                ...prev,
                                                                stairsDetails: {
                                                                    ...prev.stairsDetails,
                                                                    steepness: opt.id,
                                                                },
                                                            }))}
                                                            className={`flex-1 px-3 py-2 rounded-lg border-2 text-xs font-medium transition-all ${
                                                                isSelected
                                                                    ? 'bg-indigo-50 border-indigo-400 text-indigo-700'
                                                                    : 'bg-white border-gray-200 text-gray-500'
                                                            }`}
                                                        >
                                                            {opt.label}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <button
                                            type="button"
                                            onClick={() => setFormData(prev => ({
                                                ...prev,
                                                stairsDetails: {
                                                    ...prev.stairsDetails,
                                                    hasShade: !prev.stairsDetails?.hasShade,
                                                },
                                            }))}
                                            className={`flex items-center gap-2 px-4 py-2 rounded-xl border-2 text-sm font-medium transition-all ${
                                                formData.stairsDetails?.hasShade
                                                    ? 'bg-yellow-50 border-yellow-400 text-yellow-700'
                                                    : 'bg-white border-gray-200 text-gray-500'
                                            }`}
                                        >
                                            <span>☀️</span>
                                            <span>יש צל</span>
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Bench-specific fields */}
                            {formData.urbanType === 'bench' && (
                                <div className="bg-gray-50 rounded-2xl p-4 border border-gray-200 space-y-4">
                                    <p className="text-sm font-bold text-gray-700">🪑 פרטי ספסלים</p>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-gray-500">כמות ספסלים באשכול</label>
                                            <input
                                                type="number"
                                                min={1}
                                                max={50}
                                                value={formData.benchDetails?.quantity || ''}
                                                onChange={(e) => setFormData(prev => ({
                                                    ...prev,
                                                    benchDetails: {
                                                        ...prev.benchDetails,
                                                        quantity: e.target.value ? parseInt(e.target.value) : undefined,
                                                    },
                                                }))}
                                                className="w-full p-3 bg-white rounded-xl border-2 border-transparent focus:border-indigo-500 transition-all outline-none"
                                                placeholder="לדוגמה: 4"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-gray-500">חומר</label>
                                            <div className="flex flex-wrap gap-2">
                                                {BENCH_MATERIAL_OPTIONS.map(opt => {
                                                    const isSelected = formData.benchDetails?.material === opt.id;
                                                    return (
                                                        <button
                                                            key={opt.id}
                                                            type="button"
                                                            onClick={() => setFormData(prev => ({
                                                                ...prev,
                                                                benchDetails: {
                                                                    ...prev.benchDetails,
                                                                    material: opt.id,
                                                                },
                                                            }))}
                                                            className={`px-3 py-2 rounded-lg border-2 text-xs font-medium transition-all ${
                                                                isSelected
                                                                    ? 'bg-indigo-50 border-indigo-400 text-indigo-700'
                                                                    : 'bg-white border-gray-200 text-gray-500'
                                                            }`}
                                                        >
                                                            {opt.label}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <button
                                            type="button"
                                            onClick={() => setFormData(prev => ({
                                                ...prev,
                                                benchDetails: {
                                                    ...prev.benchDetails,
                                                    hasShade: !prev.benchDetails?.hasShade,
                                                },
                                            }))}
                                            className={`flex items-center gap-2 px-4 py-2 rounded-xl border-2 text-sm font-medium transition-all ${
                                                formData.benchDetails?.hasShade
                                                    ? 'bg-yellow-50 border-yellow-400 text-yellow-700'
                                                    : 'bg-white border-gray-200 text-gray-500'
                                            }`}
                                        >
                                            <span>☀️</span>
                                            <span>יש צל</span>
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Parking-specific fields */}
                            {formData.urbanType === 'parking' && (
                                <div className="bg-gray-50 rounded-2xl p-4 border border-gray-200 space-y-4">
                                    <p className="text-sm font-bold text-gray-700">🅿️ פרטי חנייה</p>
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-gray-500">סוג תשלום</label>
                                        <div className="flex flex-wrap gap-2">
                                            {PARKING_PAYMENT_OPTIONS.map(opt => {
                                                const isSelected = formData.parkingDetails?.paymentType === opt.id;
                                                return (
                                                    <button
                                                        key={opt.id}
                                                        type="button"
                                                        onClick={() => setFormData(prev => ({
                                                            ...prev,
                                                            parkingDetails: {
                                                                ...prev.parkingDetails,
                                                                paymentType: opt.id,
                                                            },
                                                        }))}
                                                        className={`px-4 py-2.5 rounded-xl border-2 text-sm font-medium transition-all ${
                                                            isSelected
                                                                ? 'bg-indigo-50 border-indigo-400 text-indigo-700'
                                                                : 'bg-white border-gray-200 text-gray-500'
                                                        }`}
                                                    >
                                                        {opt.label}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <button
                                            type="button"
                                            onClick={() => setFormData(prev => ({
                                                ...prev,
                                                parkingDetails: {
                                                    ...prev.parkingDetails,
                                                    hasShade: !prev.parkingDetails?.hasShade,
                                                },
                                            }))}
                                            className={`flex items-center gap-2 px-4 py-2 rounded-xl border-2 text-sm font-medium transition-all ${
                                                formData.parkingDetails?.hasShade
                                                    ? 'bg-yellow-50 border-yellow-400 text-yellow-700'
                                                    : 'bg-white border-gray-200 text-gray-500'
                                            }`}
                                        >
                                            <span>☀️</span>
                                            <span>חנייה מקורה</span>
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Map Picker (shared across all tabs) */}
                    <div className="space-y-2">
                        <label className="text-sm font-bold text-gray-700">מיקום במפה</label>
                        <p className="text-xs text-gray-400">לחץ על המפה כדי לסמן את המיקום</p>
                        <LocationPicker
                            value={formData.location}
                            onChange={(loc) => setFormData(prev => ({ ...prev, location: loc }))}
                        />
                        <div className="flex gap-4 text-xs bg-gray-50 p-2 rounded-lg text-gray-500 font-mono" dir="ltr">
                            <span>Lat: {formData.location.lat.toFixed(6)}</span>
                            <span>Lng: {formData.location.lng.toFixed(6)}</span>
                        </div>
                    </div>

                    {/* Sport Types — hidden for courts when courtType is selected (auto-assigned) */}
                    {!(isCourtTab && formData.courtType) && (
                    <div className="space-y-3">
                        <label className="text-sm font-bold text-gray-700 flex items-center gap-2">
                            <Tag size={14} style={{ color: tabConfig.color }} />
                            ענפי ספורט
                            {formData.sportTypes.length > 0 && (
                                <span
                                    className="text-xs font-bold text-white px-2 py-0.5 rounded-full"
                                    style={{ backgroundColor: tabConfig.color }}
                                >
                                    {formData.sportTypes.length}
                                </span>
                            )}
                        </label>
                        <div className="flex flex-wrap gap-2">
                            {sportOptions.map(sport => {
                                const isSelected = formData.sportTypes.includes(sport.id);
                                return (
                                    <button
                                        key={sport.id}
                                        type="button"
                                        onClick={() => toggleSport(sport.id)}
                                        className={`px-3 py-2 rounded-xl border-2 text-sm font-medium transition-all ${
                                            isSelected
                                                ? 'text-white shadow-sm'
                                                : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                                        }`}
                                        style={{
                                            backgroundColor: isSelected ? tabConfig.color : undefined,
                                            borderColor: isSelected ? tabConfig.color : undefined,
                                        }}
                                    >
                                        {sport.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                    )}

                    {/* Auto-assigned sports indicator for courts */}
                    {isCourtTab && formData.courtType && formData.sportTypes.length > 0 && (
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                            <p className="text-xs font-bold text-amber-700 mb-1.5">ענפי ספורט (שיוך אוטומטי)</p>
                            <div className="flex flex-wrap gap-1.5">
                                {formData.sportTypes.map(sport => (
                                    <span key={sport} className="px-2.5 py-1 bg-amber-100 text-amber-800 rounded-lg text-xs font-medium">
                                        {sport}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Feature Tags — SINGLE source of truth for amenities & features */}
                    <div className="space-y-3">
                        <label className="text-sm font-bold text-gray-700 flex items-center gap-2">
                            <Tag size={14} className="text-purple-500" />
                            תגיות ומאפיינים
                            {formData.featureTags.length > 0 && (
                                <span className="text-xs font-bold text-white bg-purple-500 px-2 py-0.5 rounded-full">
                                    {formData.featureTags.length}
                                </span>
                            )}
                        </label>
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                            {FEATURE_TAG_OPTIONS.map(tag => {
                                const isSelected = formData.featureTags.includes(tag.id);
                                return (
                                    <button
                                        key={tag.id}
                                        type="button"
                                        onClick={() => toggleTag(tag.id)}
                                        className={`px-3 py-2.5 rounded-xl border-2 text-sm font-medium transition-all flex items-center gap-2 ${
                                            isSelected
                                                ? 'bg-purple-50 border-purple-400 text-purple-700'
                                                : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                                        }`}
                                    >
                                        <span>{tag.icon}</span>
                                        <span>{tag.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Star Rating (1-5) */}
                    <div className="space-y-3">
                        <label className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                            ⭐ דירוג (Rating)
                        </label>
                        <p className="text-[11px] text-gray-400">דירוג כוכבים 1-5 (עשרוני) שיוצג למשתמשים</p>
                        <div className="flex items-center gap-4">
                            <input
                                type="range"
                                min={1}
                                max={5}
                                step={0.1}
                                value={formData.rating ?? 3}
                                onChange={(e) => setFormData(prev => ({ ...prev, rating: Number(e.target.value) }))}
                                className="flex-1 accent-amber-500"
                            />
                            <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 px-3 py-2 rounded-xl min-w-[80px] justify-center">
                                <span className="text-amber-500 text-sm">⭐</span>
                                <span className="font-black text-amber-700 text-lg">{(formData.rating ?? 0).toFixed(1)}</span>
                            </div>
                        </div>
                        {/* Visual stars */}
                        <div className="flex items-center gap-0.5">
                            {[1, 2, 3, 4, 5].map((star) => (
                                <span
                                    key={star}
                                    className={`text-lg transition-all ${
                                        star <= Math.round(formData.rating ?? 0)
                                            ? 'text-amber-400 scale-110'
                                            : 'text-gray-200'
                                    }`}
                                >
                                    ★
                                </span>
                            ))}
                        </div>
                    </div>

                    {/* GIS External Source ID — hidden/advanced field for future syncs */}
                    <details className="group">
                        <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600 transition-colors">
                            🔗 שדות GIS מתקדמים
                        </summary>
                        <div className="mt-2 space-y-2">
                            <label className="text-xs font-bold text-gray-500">מזהה מקור חיצוני (External Source ID)</label>
                            <input
                                value={formData.externalSourceId || ''}
                                onChange={(e) => setFormData(prev => ({ ...prev, externalSourceId: e.target.value || undefined }))}
                                className="w-full p-2.5 bg-gray-50 rounded-xl border-2 border-transparent focus:border-blue-500 focus:bg-white transition-all outline-none text-sm font-mono"
                                placeholder="לדוגמה: GIS-TLV-00234"
                                dir="ltr"
                            />
                        </div>
                    </details>
                </div>

                {/* Footer with Back button */}
                <div className="flex items-center justify-between p-6 border-t border-gray-100">
                    <button
                        onClick={onClose}
                        className="flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-gray-600 hover:bg-gray-100 transition-all"
                    >
                        <ArrowRight size={16} />
                        <span>חזור</span>
                    </button>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={onClose}
                            className="px-6 py-3 rounded-xl font-bold text-gray-600 hover:bg-gray-100 transition-all"
                        >
                            ביטול
                        </button>
                        <button
                            onClick={handleSubmit}
                            disabled={isSaving}
                            className="flex items-center gap-2 px-8 py-3 rounded-xl font-bold text-white shadow-lg transition-all disabled:opacity-50"
                            style={{ backgroundColor: tabConfig.color }}
                        >
                            {isSaving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                            <span>{isSaving ? 'שומר...' : editingPark ? 'עדכן' : 'שמור'}</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ============================================
// MAIN PAGE COMPONENT
// ============================================

export default function LocationsPage() {
    const router = useRouter();
    const [activeTab, setActiveTab] = useState<LocationTab>('parks');
    const [parks, setParks] = useState<Park[]>([]);
    const [authorities, setAuthorities] = useState<Authority[]>([]);
    const [loading, setLoading] = useState(true);
    const [isAuthorityManagerOnly, setIsAuthorityManagerOnly] = useState(false);
    const [userAuthorityIds, setUserAuthorityIds] = useState<string[]>([]);
    const [remapping, setRemapping] = useState(false);
    const [showAddModal, setShowAddModal] = useState(false);
    const [editingPark, setEditingPark] = useState<Park | null>(null);
    // Official routes from the dedicated routes collection
    const [officialRoutes, setOfficialRoutes] = useState<Park[]>([]);

    // Branding tab state
    const [brandingConfig, setBrandingConfig] = useState<CategoryBrandingConfig>({});
    const [loadingBranding, setLoadingBranding] = useState(false);
    const [uploadingIcon, setUploadingIcon] = useState<string | null>(null); // key currently uploading
    const [brandingSyncSuccess, setBrandingSyncSuccess] = useState<string | null>(null); // key that just synced

    // Auth & Data loading
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (user) {
                try {
                    const roleInfo = await checkUserRole(user.uid);
                    const isOnly = await isOnlyAuthorityManager(user.uid);
                    setIsAuthorityManagerOnly(isOnly);
                    setUserAuthorityIds(roleInfo.authorityIds || []);
                    fetchParks(isOnly, roleInfo.authorityIds || []);
                } catch (error) {
                    console.error('Error checking user role:', error);
                    fetchParks(false, []);
                }
            } else {
                setLoading(false);
            }
        });
        return () => unsubscribe();
    }, []);

    // Load branding config on mount (needed for table icons)
    useEffect(() => {
        getCategoryBranding().then(config => setBrandingConfig(config)).catch(console.error);
    }, []);

    // Fetch official routes when routes tab is active, converting to Park-like objects
    useEffect(() => {
        if (activeTab !== 'routes') return;
        const loadOfficialRoutes = async () => {
            try {
                const routes = await InventoryService.fetchOfficialRoutes(
                    isAuthorityManagerOnly && userAuthorityIds.length > 0
                        ? userAuthorityIds
                        : undefined
                );
                // Convert Route objects to Park-like objects for the table
                const routeParks: Park[] = routes.map((r: RouteType) => ({
                    id: r.id,
                    name: r.name,
                    description: r.description || '',
                    location: r.path && r.path.length > 0
                        ? { lat: r.path[0][1], lng: r.path[0][0] }
                        : { lat: 0, lng: 0 },
                    facilityType: 'route' as ParkFacilityCategory,
                    sportTypes: (r.activityType ? [r.activityType] : [r.type]) as ParkSportType[],
                    featureTags: [],
                    status: 'open' as const,
                    city: r.city || '',
                    authorityId: r.authorityId || undefined,
                    _isOfficialRoute: true,
                    _importBatchId: r.importBatchId || undefined,
                    _importSourceName: r.importSourceName || undefined,
                } as Park & { _isOfficialRoute?: boolean; _importBatchId?: string; _importSourceName?: string }));
                setOfficialRoutes(routeParks);
            } catch (err) {
                console.error('Error loading official routes:', err);
            }
        };
        loadOfficialRoutes();
    }, [activeTab, isAuthorityManagerOnly, userAuthorityIds]);

    const fetchParks = async (filterByAuthority: boolean = false, authorityIds: string[] = []) => {
        try {
            setLoading(true);
            const allAuthorities = await getAllAuthorities();
            setAuthorities(allAuthorities);

            let fetchedParks: Park[] = [];
            if (filterByAuthority && authorityIds.length > 0) {
                const parksPromises = authorityIds.map(authId => getParksByAuthority(authId));
                const parksArrays = await Promise.all(parksPromises);
                fetchedParks = parksArrays.flat();
                const uniqueParks = new Map<string, Park>();
                fetchedParks.forEach(park => {
                    if (!uniqueParks.has(park.id)) uniqueParks.set(park.id, park);
                });
                fetchedParks = Array.from(uniqueParks.values());
            } else {
                fetchedParks = await getAllParks();
            }

            setParks(fetchedParks);
        } catch (error) {
            console.error('Error fetching parks:', error);
        } finally {
            setLoading(false);
        }
    };

    const getAuthorityName = (authorityId?: string): string | null => {
        if (!authorityId) return null;
        const authority = authorities.find(a => a.id === authorityId);
        if (!authority) return null;
        const name = authority.name;
        if (typeof name === 'string') return name;
        if (typeof name === 'object' && name !== null) {
            return (name as any).he || (name as any).en || String(name);
        }
        return String(name || '');
    };

    const handleDelete = async (id: string) => {
        if (!confirm('האם אתה בטוח שברצונך למחוק מיקום זה?')) return;
        try {
            await deleteDoc(doc(db, 'parks', id));
            setParks(prev => prev.filter(park => park.id !== id));
        } catch (error) {
            console.error('Error deleting location:', error);
            alert('שגיאה במחיקה');
        }
    };

    const handleRemapParks = async () => {
        if (!confirm('פעולה זו תסרוק את כל המיקומים ותקשר אותם לרשויות לפי שם העיר. האם להמשיך?')) return;
        try {
            setRemapping(true);
            const result = await remapParksToAuthorities();
            let message = `המיפוי הושלם!\n✓ עודכנו: ${result.updated}\n⊘ דולגו: ${result.skipped}\n`;
            if (result.errors > 0) message += `✗ שגיאות: ${result.errors}`;
            alert(message);
            if (!isAuthorityManagerOnly) {
                const fetchedParks = await getAllParks();
                setParks(fetchedParks);
            }
        } catch (error) {
            console.error('Error remapping:', error);
            alert('שגיאה במיפוי');
        } finally {
            setRemapping(false);
        }
    };

    const handleSaveLocation = async (data: LocationFormData) => {
        // Auto-assign sports from System Brain mapping (merged with manual selections)
        const autoSports = getAutoSportTypes(
            data.facilityType,
            data.natureType,
            data.communityType,
            data.terrainType,
            data.environment,
            data.urbanType,
            data.courtType,
        );
        const mergedSports = Array.from(new Set([...autoSports, ...data.sportTypes]));

        // Derive hasWaterFountain from feature tags (single source of truth)
        const hasWaterFromTags = data.featureTags.includes('water_fountain');

        // Upload image if provided
        let imageUrl: string | undefined = undefined;
        if (data.imageFile) {
            try {
                const storageRef = ref(storage, `locations/${Date.now()}_${data.imageFile.name}`);
                const snapshot = await uploadBytes(storageRef, data.imageFile);
                imageUrl = await getDownloadURL(snapshot.ref);
            } catch (err) {
                console.error('Error uploading image:', err);
                // Continue without image
            }
        }

        const parkData: Partial<Omit<Park, 'id' | 'createdAt' | 'updatedAt'>> = {
            name: data.name,
            city: data.city,
            description: data.description,
            location: data.location,
            facilityType: data.facilityType,
            sportTypes: mergedSports.length > 0 ? mergedSports : undefined,
            featureTags: data.featureTags.length > 0 ? data.featureTags : undefined,
            hasWaterFountain: hasWaterFromTags || data.hasWaterFountain,
            isDogFriendly: data.isDogFriendly,
            natureType: data.natureType,
            communityType: data.communityType,
            urbanType: data.urbanType,
            stairsDetails: data.stairsDetails,
            benchDetails: data.benchDetails,
            parkingDetails: data.parkingDetails,
            courtType: data.courtType,
            terrainType: data.terrainType,
            environment: data.environment,
            externalSourceId: data.externalSourceId,
            authorityId: data.authorityId,
            rating: data.rating,
            status: 'open',
        };

        // Add image if uploaded (or keep existing)
        if (imageUrl) {
            parkData.image = imageUrl;
        }

        if (editingPark) {
            await updatePark(editingPark.id, parkData);
            setParks(prev => prev.map(p => p.id === editingPark.id ? { ...p, ...parkData } as Park : p));
        } else {
            const id = await createPark(parkData as Omit<Park, 'id' | 'createdAt' | 'updatedAt'>);
            setParks(prev => [...prev, { id, ...parkData } as Park]);
        }
        setEditingPark(null);
    };

    // ============================================
    // BRANDING TAB LOGIC
    // ============================================

    // Load branding config when branding tab is selected
    useEffect(() => {
        if (activeTab === 'branding') {
            loadBrandingConfig();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab]);

    const loadBrandingConfig = async () => {
        try {
            setLoadingBranding(true);
            const config = await getCategoryBranding();
            setBrandingConfig(config);
        } catch (error) {
            console.error('Error loading branding config:', error);
        } finally {
            setLoadingBranding(false);
        }
    };

    const handleBrandIconUpload = async (key: BrandingCategoryKey, file: File) => {
        try {
            setUploadingIcon(key);

            // Upload to Firebase Storage
            const storagePath = `category_branding/${key}_${Date.now()}.${file.name.split('.').pop()}`;
            const storageRef = ref(storage, storagePath);
            const snapshot = await uploadBytes(storageRef, file);
            const downloadUrl = await getDownloadURL(snapshot.ref);

            // Save to Firestore
            await setCategoryBrandIcon(key, downloadUrl);
            invalidateBrandingCache();

            // Update local state
            setBrandingConfig(prev => ({
                ...prev,
                [key]: { iconUrl: downloadUrl, updatedAt: new Date().toISOString() },
            }));

            // Show success indicator
            setBrandingSyncSuccess(key);
            setTimeout(() => setBrandingSyncSuccess(null), 2500);
        } catch (error) {
            console.error(`Error uploading icon for ${key}:`, error);
            alert('שגיאה בהעלאת האייקון');
        } finally {
            setUploadingIcon(null);
        }
    };

    const handleBrandIconReset = async (key: BrandingCategoryKey) => {
        if (!window.confirm(`לאפס את האייקון של "${CATEGORY_LABELS[key]}" לברירת מחדל?`)) return;
        try {
            setUploadingIcon(key);
            await resetCategoryBrandIcon(key);
            invalidateBrandingCache();
            setBrandingConfig(prev => {
                const updated = { ...prev };
                if (updated[key]) {
                    updated[key] = { ...updated[key], iconUrl: undefined };
                }
                return updated;
            });
            setBrandingSyncSuccess(key);
            setTimeout(() => setBrandingSyncSuccess(null), 2500);
        } catch (error) {
            console.error(`Error resetting icon for ${key}:`, error);
            alert('שגיאה באיפוס האייקון');
        } finally {
            setUploadingIcon(null);
        }
    };

    // Filter parks by active tab's facilityTypes
    const filteredParksList = parks.filter(park => {
        const tabConfig = TABS.find(t => t.id === activeTab)!;

        if (park.facilityType) {
            return tabConfig.facilityTypes.includes(park.facilityType);
        }

        // Default: unclassified parks show in the "parks" tab
        return activeTab === 'parks';
    });

    // For routes tab: merge official routes from the dedicated collection
    const filteredParks = activeTab === 'routes'
        ? (() => {
            const existingIds = new Set(filteredParksList.map(p => p.id));
            const merged = [...filteredParksList];
            for (const route of officialRoutes) {
                if (!existingIds.has(route.id)) {
                    merged.push(route);
                }
            }
            return merged;
        })()
        : filteredParksList;

    const currentTabConfig = TABS.find(t => t.id === activeTab)!;

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-10 h-10 text-cyan-500 animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-6" dir="rtl">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-cyan-50 rounded-2xl flex items-center justify-center">
                        <Map size={24} className="text-cyan-600" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black text-gray-900">ניהול מיקומים על המפה</h1>
                        <p className="text-sm text-gray-500 mt-0.5">
                            {parks.length} מיקומים במערכת · {filteredParks.length} ב{currentTabConfig.label}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {!isAuthorityManagerOnly && activeTab !== 'branding' && (
                        <button
                            onClick={handleRemapParks}
                            disabled={remapping}
                            className="flex items-center gap-2 bg-white text-gray-600 px-4 py-2.5 rounded-xl font-bold border border-gray-200 hover:bg-gray-50 transition-all disabled:opacity-50"
                        >
                            <RefreshCw size={16} className={remapping ? 'animate-spin' : ''} />
                            <span className="text-sm">{remapping ? 'ממפה...' : 'מפה לרשויות'}</span>
                        </button>
                    )}
                    {activeTab !== 'branding' && (
                        <div className="flex items-center gap-2">
                            {activeTab === 'routes' ? (
                                <Link
                                    href="/admin/routes"
                                    className="flex items-center gap-2 bg-white text-gray-600 px-4 py-2.5 rounded-xl font-bold border border-gray-200 hover:bg-gray-50 transition-all"
                                >
                                    <Layers size={16} />
                                    <span className="text-sm">GIS מתקדם</span>
                                </Link>
                            ) : (
                                <Link
                                    href={`/admin/locations/import/${activeTab}`}
                                    className="flex items-center gap-2 bg-white text-gray-600 px-4 py-2.5 rounded-xl font-bold border border-gray-200 hover:bg-gray-50 transition-all"
                                >
                                    <Layers size={16} />
                                    <span className="text-sm">GIS מתקדם</span>
                                </Link>
                            )}
                            {activeTab === 'parks' ? (
                                <Link
                                    href="/admin/parks/new"
                                    className="flex items-center gap-2 text-white px-5 py-2.5 rounded-xl font-bold shadow-lg hover:opacity-90 transition-all"
                                    style={{ backgroundColor: currentTabConfig.color }}
                                >
                                    <Plus size={18} />
                                    <span>הוסף פארק וגינה</span>
                                </Link>
                            ) : activeTab === 'routes' ? (
                                <Link
                                    href="/admin/routes/new"
                                    className="flex items-center gap-2 text-white px-5 py-2.5 rounded-xl font-bold shadow-lg hover:opacity-90 transition-all"
                                    style={{ backgroundColor: currentTabConfig.color }}
                                >
                                    <Plus size={18} />
                                    <span>הוסף מסלול</span>
                                </Link>
                            ) : (
                                <button
                                    onClick={() => { setEditingPark(null); setShowAddModal(true); }}
                                    className="flex items-center gap-2 text-white px-5 py-2.5 rounded-xl font-bold shadow-lg hover:opacity-90 transition-all"
                                    style={{ backgroundColor: currentTabConfig.color }}
                                >
                                    <Plus size={18} />
                                    <span>הוסף {currentTabConfig.label}</span>
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Tabs */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-1.5">
                <div className="flex gap-1">
                    {TABS.map(tab => {
                        const isActive = activeTab === tab.id;
                        const isBrandingTab = tab.id === 'branding';
                        const count = isBrandingTab ? 0 : parks.filter(p => {
                            if (p.facilityType) {
                                return tab.facilityTypes.includes(p.facilityType);
                            }
                            return tab.id === 'parks';
                        }).length;

                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold text-sm transition-all ${
                                    isActive
                                        ? 'text-white shadow-md'
                                        : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
                                }`}
                                style={{
                                    backgroundColor: isActive ? tab.color : undefined,
                                }}
                            >
                                <tab.icon size={18} />
                                <span className="hidden sm:inline">{tab.label}</span>
                                {!isBrandingTab && (
                                    <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                                        isActive ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-400'
                                    }`}>
                                        {count}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Content: Branding tab vs Location table */}
            {activeTab === 'branding' ? (
                /* ============ BRANDING TAB ============ */
                <div className="space-y-6">
                    {/* Branding Header */}
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="w-10 h-10 bg-pink-50 rounded-xl flex items-center justify-center">
                                <ImageIcon size={20} className="text-pink-500" />
                            </div>
                            <div>
                                <h2 className="text-xl font-black text-gray-900">ניהול מיתוג קטגוריות</h2>
                                <p className="text-xs text-gray-500 mt-0.5">
                                    העלו אייקונים מותאמים (SVG / PNG) לכל סוג מתקן. האייקונים ישתקפו בכל המערכת — טבלאות ניהול, מפה ואונבורדינג.
                                </p>
                            </div>
                        </div>
                        <div className="mt-4 bg-pink-50 border border-pink-200 rounded-xl p-3 flex items-start gap-3">
                            <span className="text-lg mt-0.5">🎨</span>
                            <div>
                                <p className="text-xs font-bold text-pink-700">היררכיית תצוגה</p>
                                <p className="text-xs text-pink-600 mt-0.5">
                                    1. <strong>תמונת המיקום</strong> (אם הועלתה לאתר ספציפי) →
                                    2. <strong>אייקון מיתוג</strong> (מה שמוגדר כאן) →
                                    3. <strong>ברירת מחדל</strong> (אימוג&apos;י של המערכת)
                                </p>
                            </div>
                        </div>
                    </div>

                    {loadingBranding ? (
                        <div className="flex items-center justify-center py-20">
                            <Loader2 className="w-8 h-8 text-pink-500 animate-spin" />
                        </div>
                    ) : (
                        BRANDING_GROUPS.map((group) => (
                            <div key={group.label} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                                <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
                                    <div
                                        className="w-1.5 h-6 rounded-full"
                                        style={{ backgroundColor: group.color }}
                                    />
                                    <h3 className="font-bold text-gray-800">{group.label}</h3>
                                </div>
                                <div className="p-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                                    {group.keys.map((key) => {
                                        const entry = brandingConfig[key];
                                        const hasCustomIcon = !!entry?.iconUrl;
                                        const isUploading = uploadingIcon === key;
                                        const justSynced = brandingSyncSuccess === key;
                                        const defaultEmoji = SYSTEM_DEFAULT_ICONS[key] || '📍';

                                        return (
                                            <div
                                                key={key}
                                                className={`relative bg-gray-50 rounded-2xl border-2 p-4 flex flex-col items-center gap-3 transition-all hover:shadow-md ${
                                                    hasCustomIcon
                                                        ? 'border-pink-200 hover:border-pink-400'
                                                        : 'border-gray-200 hover:border-gray-300'
                                                } ${justSynced ? 'ring-2 ring-green-400 ring-offset-2' : ''}`}
                                            >
                                                {/* Success indicator */}
                                                {justSynced && (
                                                    <div className="absolute -top-2 -left-2 w-6 h-6 bg-green-500 text-white rounded-full flex items-center justify-center text-xs font-bold shadow-sm animate-in zoom-in">
                                                        ✓
                                                    </div>
                                                )}

                                                {/* Icon Preview */}
                                                <div className="w-16 h-16 rounded-xl overflow-hidden bg-white border border-gray-200 flex items-center justify-center shadow-sm">
                                                    {isUploading ? (
                                                        <Loader2 size={24} className="text-pink-500 animate-spin" />
                                                    ) : hasCustomIcon ? (
                                                        // eslint-disable-next-line @next/next/no-img-element
                                                        <img
                                                            src={entry!.iconUrl!}
                                                            alt={CATEGORY_LABELS[key]}
                                                            className="w-full h-full object-contain p-1"
                                                            onError={(e) => {
                                                                (e.target as HTMLImageElement).style.display = 'none';
                                                            }}
                                                        />
                                                    ) : (
                                                        <span className="text-3xl">{defaultEmoji}</span>
                                                    )}
                                                </div>

                                                {/* Label */}
                                                <p className="text-sm font-bold text-gray-800 text-center">{CATEGORY_LABELS[key]}</p>

                                                {/* Status */}
                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                                    hasCustomIcon
                                                        ? 'bg-pink-100 text-pink-600'
                                                        : 'bg-gray-100 text-gray-400'
                                                }`}>
                                                    {hasCustomIcon ? 'מותאם אישית' : 'ברירת מחדל'}
                                                </span>

                                                {/* Actions */}
                                                <div className="flex items-center gap-2 w-full">
                                                    <label className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-white border-2 border-gray-200 hover:border-pink-400 rounded-xl text-xs font-bold text-gray-600 hover:text-pink-600 cursor-pointer transition-all">
                                                        <Upload size={12} />
                                                        <span>העלאה</span>
                                                        <input
                                                            type="file"
                                                            accept=".svg,.png,.jpg,.jpeg,.webp"
                                                            className="hidden"
                                                            onChange={(e) => {
                                                                const file = e.target.files?.[0];
                                                                if (file) {
                                                                    handleBrandIconUpload(key, file);
                                                                    e.target.value = '';
                                                                }
                                                            }}
                                                            disabled={isUploading}
                                                        />
                                                    </label>
                                                    {hasCustomIcon && (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleBrandIconReset(key)}
                                                            disabled={isUploading}
                                                            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all disabled:opacity-50"
                                                            title="איפוס לברירת מחדל"
                                                        >
                                                            <RefreshCw size={14} />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            ) : (
                /* ============ LOCATION TABLE ============ */
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    {filteredParks.length === 0 ? (
                        <div className="text-center py-20">
                            <div
                                className="inline-flex p-4 rounded-full mb-4"
                                style={{ backgroundColor: `${currentTabConfig.color}15` }}
                            >
                                <currentTabConfig.icon size={32} style={{ color: currentTabConfig.color }} />
                            </div>
                            <h3 className="text-lg font-bold text-gray-900">אין {currentTabConfig.label} במערכת</h3>
                            <p className="text-gray-500 mt-2">התחל על ידי הוספת הראשון</p>
                            {activeTab === 'parks' ? (
                                <Link
                                    href="/admin/parks/new"
                                    className="mt-4 inline-flex items-center gap-2 text-white px-6 py-3 rounded-xl font-bold transition-all"
                                    style={{ backgroundColor: currentTabConfig.color }}
                                >
                                    <Plus size={18} />
                                    <span>הוסף פארק וגינה</span>
                                </Link>
                            ) : (
                                <button
                                    onClick={() => { setEditingPark(null); setShowAddModal(true); }}
                                    className="mt-4 inline-flex items-center gap-2 text-white px-6 py-3 rounded-xl font-bold transition-all"
                                    style={{ backgroundColor: currentTabConfig.color }}
                                >
                                    <Plus size={18} />
                                    <span>הוסף {currentTabConfig.label}</span>
                                </button>
                            )}
                        </div>
                    ) : (
                            <LocationTable
                            parks={filteredParks}
                            getAuthorityName={getAuthorityName}
                            onEdit={(park) => {
                                if (activeTab === 'parks') {
                                    // Parks: navigate to full edit page
                                    router.push(`/admin/parks/${park.id}/edit`);
                                } else {
                                    // Other categories: use the modal
                                    setEditingPark(park);
                                    setShowAddModal(true);
                                }
                            }}
                            onDelete={handleDelete}
                            tabColor={currentTabConfig.color}
                            activeTab={activeTab}
                            brandingConfig={brandingConfig}
                        />
                    )}
                </div>
            )}

            {/* Add/Edit Modal */}
            <AddLocationModal
                isOpen={showAddModal}
                onClose={() => { setShowAddModal(false); setEditingPark(null); }}
                activeTab={activeTab}
                onSave={handleSaveLocation}
                editingPark={editingPark}
                authorities={authorities}
            />
        </div>
    );
}

// ============================================
// LOCATION TABLE COMPONENT
// ============================================

function LocationTable({
    parks,
    getAuthorityName,
    onEdit,
    onDelete,
    tabColor,
    activeTab,
    brandingConfig,
}: {
    parks: Park[];
    getAuthorityName: (id?: string) => string | null;
    onEdit: (park: Park) => void;
    onDelete: (id: string) => void;
    tabColor: string;
    activeTab: LocationTab;
    brandingConfig?: CategoryBrandingConfig;
}) {
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-right">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase font-bold sticky top-0">
                    <tr>
                        <th className="px-6 py-4 rounded-tr-2xl">שם</th>
                        <th className="px-6 py-4">עיר</th>
                        <th className="px-6 py-4">סיווג</th>
                        <th className="px-6 py-4">
                            {activeTab === 'parks' ? 'תגיות' : activeTab === 'nature_community' ? 'סוג' : activeTab === 'urban' ? 'תשתית' : 'ענפים'}
                        </th>
                        <th className="px-6 py-4">רשות</th>
                        <th className="px-6 py-4 rounded-tl-2xl text-center">פעולות</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                    {parks.map(park => (
                        <tr key={park.id} className="hover:bg-blue-50/50 transition-colors group">
                            <td className="px-6 py-4">
                                <div className="flex items-center gap-3">
                                    {(() => {
                                        const catKey = resolveCategoryKey(park);
                                        const icon = getFacilityIcon(park.image, catKey, brandingConfig || null);
                                        if (icon.type === 'image') {
                                            return (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img
                                                    src={icon.value}
                                                    alt=""
                                                    className={`w-10 h-10 rounded-lg bg-gray-200 ${
                                                        icon.tier === 'site_photo' ? 'object-cover' : 'object-contain p-1'
                                                    }`}
                                                />
                                            );
                                        }
                                        return (
                                            <div
                                                className="w-10 h-10 rounded-lg flex items-center justify-center text-lg"
                                                style={{ backgroundColor: `${tabColor}15` }}
                                            >
                                                {icon.value}
                                            </div>
                                        );
                                    })()}
                                    <div>
                                        <span className="font-bold text-gray-900">{park.name}</span>
                                        {park.featureTags && park.featureTags.length > 0 && (
                                            <div className="flex gap-1 mt-1">
                                                {park.featureTags.slice(0, 3).map(tag => {
                                                    const tagOption = FEATURE_TAG_OPTIONS.find(t => t.id === tag);
                                                    return tagOption ? (
                                                        <span key={tag} className="text-xs" title={tagOption.label}>
                                                            {tagOption.icon}
                                                        </span>
                                                    ) : null;
                                                })}
                                                {park.featureTags.length > 3 && (
                                                    <span className="text-xs text-gray-400">+{park.featureTags.length - 3}</span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </td>
                            <td className="px-6 py-4 text-gray-600">{park.city}</td>
                            <td className="px-6 py-4">
                                {park.facilityType ? (
                                    <span
                                        className="text-xs font-bold px-3 py-1 rounded-full"
                                        style={{
                                            backgroundColor: `${tabColor}15`,
                                            color: tabColor,
                                        }}
                                    >
                                        {FACILITY_TYPE_LABELS[park.facilityType] || park.facilityType}
                                    </span>
                                ) : (
                                    <span className="text-xs text-gray-400">לא מסווג</span>
                                )}
                            </td>
                            <td className="px-6 py-4">
                                {/* Parks tab: show key feature tags */}
                                {activeTab === 'parks' ? (
                                    park.featureTags && park.featureTags.length > 0 ? (
                                        <div className="flex flex-wrap gap-1">
                                            {park.featureTags.slice(0, 3).map(tag => {
                                                const tagOption = FEATURE_TAG_OPTIONS.find(t => t.id === tag);
                                                return tagOption ? (
                                                    <span key={tag} className="text-xs bg-purple-50 text-purple-600 px-2 py-0.5 rounded-full font-medium" title={tagOption.label}>
                                                        {tagOption.icon} {tagOption.label}
                                                    </span>
                                                ) : null;
                                            })}
                                            {park.featureTags.length > 3 && (
                                                <span className="text-xs text-gray-400">+{park.featureTags.length - 3}</span>
                                            )}
                                        </div>
                                    ) : (
                                        <span className="text-xs text-gray-400">—</span>
                                    )
                                ) : activeTab === 'nature_community' ? (
                                    /* Nature/Community tab: show sub-type */
                                    <div className="flex flex-wrap gap-1">
                                        {park.communityType === 'dog_park' && (
                                            <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full">
                                                🐕 גינת כלבים
                                            </span>
                                        )}
                                        {park.natureType === 'spring' && (
                                            <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">
                                                🌊 מעיין
                                            </span>
                                        )}
                                        {park.natureType === 'observation_point' && (
                                            <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">
                                                🏔️ תצפית
                                            </span>
                                        )}
                                        {!park.communityType && !park.natureType && (
                                            <span className="text-xs text-gray-400">—</span>
                                        )}
                                        {park.isDogFriendly && !park.communityType && (
                                            <span className="text-xs" title="ידידותי לכלבים">🐕</span>
                                        )}
                                    </div>
                                ) : activeTab === 'urban' ? (
                                    /* Urban tab: show urban type */
                                    <div className="flex flex-wrap gap-1">
                                        {park.urbanType === 'stairs' && (
                                            <span className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full">
                                                🪜 מדרגות
                                                {park.stairsDetails?.numberOfSteps && ` (${park.stairsDetails.numberOfSteps})`}
                                            </span>
                                        )}
                                        {park.urbanType === 'bench' && (
                                            <span className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full">
                                                🪑 ספסלים
                                                {park.benchDetails?.quantity && ` (${park.benchDetails.quantity})`}
                                            </span>
                                        )}
                                        {park.urbanType === 'skatepark' && (
                                            <span className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full">
                                                🛹 סקייטפארק
                                            </span>
                                        )}
                                        {park.urbanType === 'water_fountain' && (
                                            <span className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full">
                                                🚰 ברזייה
                                            </span>
                                        )}
                                        {park.urbanType === 'toilets' && (
                                            <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-600 bg-slate-50 px-2.5 py-1 rounded-full">
                                                🚻 שירותים
                                            </span>
                                        )}
                                        {park.urbanType === 'parking' && (
                                            <span className="inline-flex items-center gap-1 text-xs font-bold text-violet-600 bg-violet-50 px-2.5 py-1 rounded-full">
                                                🅿️ חנייה
                                                {park.parkingDetails?.paymentType && ` (${park.parkingDetails.paymentType === 'free' ? 'חינם' : park.parkingDetails.paymentType === 'paid' ? 'בתשלום' : 'תושבים'})`}
                                            </span>
                                        )}
                                        {park.urbanType === 'bike_rack' && (
                                            <span className="inline-flex items-center gap-1 text-xs font-bold text-teal-600 bg-teal-50 px-2.5 py-1 rounded-full">
                                                🚲 אופניים
                                            </span>
                                        )}
                                        {!park.urbanType && (
                                            <span className="text-xs text-gray-400">—</span>
                                        )}
                                    </div>
                                ) : activeTab === 'courts' ? (
                                    /* Courts tab: show court type badge + sports */
                                    <div className="flex flex-wrap gap-1">
                                        {(park as Record<string, unknown>).courtType ? (
                                            <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full">
                                                {DEFAULT_CATEGORY_ICONS[(park as Record<string, unknown>).courtType as string] || '🏟️'}
                                                {' '}
                                                {COURT_TYPE_OPTIONS.find(c => c.id === (park as Record<string, unknown>).courtType)?.label || (park as Record<string, unknown>).courtType as string}
                                            </span>
                                        ) : park.sportTypes && park.sportTypes.length > 0 ? (
                                            park.sportTypes.slice(0, 2).map(sport => (
                                                <span key={sport} className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-xs font-medium">
                                                    {sport}
                                                </span>
                                            ))
                                        ) : (
                                            <span className="text-xs text-gray-400">—</span>
                                        )}
                                    </div>
                                ) : (
                                    /* Routes: show sport types */
                                    park.sportTypes && park.sportTypes.length > 0 ? (
                                        <div className="flex flex-wrap gap-1">
                                            {park.sportTypes.slice(0, 2).map(sport => (
                                                <span key={sport} className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-xs font-medium">
                                                    {sport}
                                                </span>
                                            ))}
                                            {park.sportTypes.length > 2 && (
                                                <span className="text-xs text-gray-400 px-1">+{park.sportTypes.length - 2}</span>
                                            )}
                                        </div>
                                    ) : (
                                        <span className="text-xs text-gray-400">—</span>
                                    )
                                )}
                            </td>
                            <td className="px-6 py-4">
                                {park.authorityId ? (
                                    <div className="flex items-center gap-2">
                                        <Building2 size={14} className="text-blue-500" />
                                        <span className="text-xs font-semibold text-gray-700">
                                            {safeRenderText(getAuthorityName(park.authorityId)) || park.authorityId}
                                        </span>
                                    </div>
                                ) : (
                                    <span className="text-xs text-red-500 font-bold">לא משויך</span>
                                )}
                            </td>
                            <td className="px-6 py-4">
                                <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                        onClick={() => onEdit(park)}
                                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                        title="עריכה"
                                    >
                                        <Edit size={16} />
                                    </button>
                                    <button
                                        onClick={() => onDelete(park.id)}
                                        className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                        title="מחק"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
