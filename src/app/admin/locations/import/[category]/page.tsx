'use client';

export const dynamic = 'force-dynamic';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import {
    ArrowRight,
    Upload,
    Globe,
    Layers,
    MapPin,
    Save,
    Trash2,
    Eye,
    Loader2,
    Database,
    CheckCircle2,
    AlertCircle,
    Building2,
    Search,
    Dumbbell,
    Footprints,
    Trees,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import dynamicImport from 'next/dynamic';
import { GISParserService } from '@/features/parks';
import { createPark, getAutoSportTypes } from '@/features/parks';
import type {
    Park,
    ParkFacilityCategory,
    NatureType,
    CommunityType,
    UrbanType,
    StairsDetails,
    BenchDetails,
} from '@/features/parks';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { checkUserRole } from '@/features/admin/services/auth.service';
import { getAllAuthorities } from '@/features/admin/services/authority.service';
import { Authority } from '@/types/admin-types';
import {
    getCategoryBranding,
    SYSTEM_DEFAULT_ICONS,
    CATEGORY_LABELS,
} from '@/features/admin/services/category-branding.service';
import type { CategoryBrandingConfig, BrandingCategoryKey } from '@/features/admin/services/category-branding.service';
import { getFacilityIcon } from '@/utils/facility-icon';

import 'mapbox-gl/dist/mapbox-gl.css';

// Dynamic map imports (SSR-safe)
const MapComponent = dynamicImport(
    () => import('react-map-gl').then(mod => mod.default),
    { ssr: false, loading: () => <div className="h-full w-full bg-gray-100 animate-pulse rounded-2xl" /> }
);
const Marker = dynamicImport(
    () => import('react-map-gl').then(mod => mod.Marker),
    { ssr: false }
);

const MAPBOX_TOKEN = "pk.eyJ1IjoiZGF2aWQtb3V0IiwiYSI6ImNtanZpZmJ0djM5MTEzZXF5YXNmcm9zNGwifQ.8MD8s4TZOr0WYYgEpFfpzw";

// ============================================
// CATEGORY CONFIG
// ============================================

type ImportCategory = 'parks' | 'courts' | 'nature_community' | 'urban';

interface CategoryConfig {
    title: string;
    subtitle: string;
    facilityType: ParkFacilityCategory;
    color: string;
    icon: typeof MapPin;
    subTypeOptions: { id: string; label: string; emoji: string }[];
    /** Label for the sub-type selector */
    subTypeLabel: string;
    /** Extra field groups */
    hasEquipmentCluster?: boolean;
    hasStairsFields?: boolean;
    hasBenchFields?: boolean;
}

const CATEGORY_CONFIGS: Record<ImportCategory, CategoryConfig> = {
    parks: {
        title: 'ייבוא גינות כושר',
        subtitle: 'ייבוא גורף של גינות כושר, מתחמי כושר חיצוניים ומתקנים',
        facilityType: 'gym_park',
        color: '#06B6D4',
        icon: Dumbbell,
        subTypeOptions: [],
        subTypeLabel: '',
        hasEquipmentCluster: true,
    },
    courts: {
        title: 'ייבוא מגרשי ספורט',
        subtitle: 'ייבוא מגרשי כדורסל, כדורגל, טניס, פאדל ומגרשים נוספים',
        facilityType: 'court',
        color: '#F59E0B',
        icon: MapPin,
        subTypeOptions: [
            { id: 'basketball', label: 'כדורסל', emoji: '🏀' },
            { id: 'football', label: 'כדורגל', emoji: '⚽' },
            { id: 'tennis', label: 'טניס', emoji: '🎾' },
            { id: 'padel', label: 'פאדל', emoji: '🏓' },
        ],
        subTypeLabel: 'סוג מגרש',
    },
    nature_community: {
        title: 'ייבוא טבע וקהילה',
        subtitle: 'מעיינות, נקודות תצפית, גינות כלבים ומוקדי קהילה',
        facilityType: 'nature_community',
        color: '#10B981',
        icon: Trees,
        subTypeOptions: [
            { id: 'spring', label: 'מעיין', emoji: '🌊' },
            { id: 'observation_point', label: 'תצפית', emoji: '🏔️' },
            { id: 'dog_park', label: 'גינת כלבים', emoji: '🐕' },
        ],
        subTypeLabel: 'סוג טבע / קהילה',
    },
    urban: {
        title: 'ייבוא תשתית עירונית',
        subtitle: 'מדרגות, ספסלים, ברזיות, שירותים, חנייה, מתקני אופניים וסקייטפארקים',
        facilityType: 'urban_spot',
        color: '#6366F1',
        icon: Footprints,
        subTypeOptions: [
            { id: 'stairs', label: 'מדרגות', emoji: '🪜' },
            { id: 'bench', label: 'ספסלים', emoji: '🪑' },
            { id: 'skatepark', label: 'סקייטפארק', emoji: '🛹' },
            { id: 'water_fountain', label: 'ברזיות מים', emoji: '🚰' },
            { id: 'toilets', label: 'שירותים', emoji: '🚻' },
            { id: 'parking', label: 'חנייה', emoji: '🅿️' },
            { id: 'bike_rack', label: 'מתקני אופניים', emoji: '🚲' },
        ],
        subTypeLabel: 'סוג תשתית',
        hasStairsFields: true,
        hasBenchFields: true,
    },
};

// ============================================
// DEFAULT EQUIPMENT CLUSTERS (For Parks tab)
// ============================================

const EQUIPMENT_CLUSTERS = [
    { id: 'basic', label: 'בסיסי — מתח + מקבילים', items: ['pull_up_bar', 'parallel_bars'] },
    { id: 'intermediate', label: 'בינוני — מתח + מקבילים + ספסל + טבעות', items: ['pull_up_bar', 'parallel_bars', 'bench', 'rings'] },
    { id: 'full', label: 'מלא — סטנדרט מלא (10+ מתקנים)', items: ['pull_up_bar', 'parallel_bars', 'bench', 'rings', 'monkey_bars', 'dip_station', 'ab_bench', 'balance_beam'] },
    { id: 'none', label: 'ללא — לא להוסיף ציוד', items: [] },
];

// ============================================
// PARSED POINT TYPE
// ============================================

interface ParsedPoint {
    id: string;
    name: string;
    location: { lat: number; lng: number };
    properties?: Record<string, unknown>;
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function GISImportPage({ params }: { params: { category: string } }) {
    const category = params.category as ImportCategory;
    const config = CATEGORY_CONFIGS[category];

    // State
    const [sourceType, setSourceType] = useState<'file' | 'url'>('file');
    const [externalUrl, setExternalUrl] = useState('');
    const [previewPoints, setPreviewPoints] = useState<ParsedPoint[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [saveResult, setSaveResult] = useState<{ success: number; total: number } | null>(null);

    // Classification state
    const [selectedSubType, setSelectedSubType] = useState<string>(
        config?.subTypeOptions[0]?.id || ''
    );
    const [selectedEquipmentCluster, setSelectedEquipmentCluster] = useState('basic');

    // Urban-specific defaults
    const [defaultStairsDetails, setDefaultStairsDetails] = useState<StairsDetails>({
        steepness: 'medium',
        hasShade: false,
    });
    const [defaultBenchDetails, setDefaultBenchDetails] = useState<BenchDetails>({
        quantity: 3,
        hasShade: false,
        material: 'metal',
    });

    // Authority / City bulk assignment
    const [authorities, setAuthorities] = useState<Authority[]>([]);
    const [selectedAuthorityId, setSelectedAuthorityId] = useState<string>('');
    const [authoritySearch, setAuthoritySearch] = useState('');
    const [showAuthorityDropdown, setShowAuthorityDropdown] = useState(false);

    // Branding
    const [brandingConfig, setBrandingConfig] = useState<CategoryBrandingConfig>({});

    const fileInputRef = useRef<HTMLInputElement>(null);

    // Load authorities + branding on mount
    useEffect(() => {
        getAllAuthorities().then(setAuthorities).catch(console.error);
        getCategoryBranding().then(setBrandingConfig).catch(console.error);
    }, []);

    // Auth check (minimal — just for awareness)
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (user) {
                try {
                    await checkUserRole(user.uid);
                } catch (error) {
                    console.error('Error checking user role:', error);
                }
            }
        });
        return () => unsubscribe();
    }, []);

    // ============================================
    // GUARD: Invalid category
    // ============================================

    if (!config) {
        return (
            <div className="max-w-4xl mx-auto p-8 text-center" dir="rtl">
                <AlertCircle className="mx-auto text-red-400 mb-4" size={48} />
                <h2 className="text-xl font-bold text-gray-800">קטגוריה לא חוקית</h2>
                <p className="text-gray-500 mt-2">הקטגוריה &quot;{category}&quot; אינה נתמכת.</p>
                <Link href="/admin/locations" className="mt-4 inline-flex items-center gap-2 text-cyan-600 font-bold">
                    <ArrowRight size={16} />
                    חזור לניהול מיקומים
                </Link>
            </div>
        );
    }

    // ============================================
    // FILE PARSING — Points (not Lines)
    // ============================================

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            const json = await GISParserService.parseFile(file);
            if (!json || !json.features) {
                throw new Error('Invalid GeoJSON structure');
            }

            const points: ParsedPoint[] = json.features
                .filter((f: { geometry: { type: string } }) => f.geometry?.type === 'Point')
                .map((feature: { geometry: { coordinates: number[] }; properties?: Record<string, unknown> }, index: number) => {
                    const [lng, lat] = feature.geometry.coordinates;
                    const props = feature.properties || {};
                    const name = (props.name || props.label || props.Name || `נקודה ${index + 1}`) as string;

                    return {
                        id: `import-${category}-${Date.now()}-${index}`,
                        name,
                        location: { lat, lng },
                        properties: props,
                    };
                });

            if (points.length === 0) {
                alert('הקובץ לא מכיל נקודות (Point). וודא שהפורמט תקין ושיש features מסוג Point.');
                return;
            }

            setPreviewPoints(points);
            setSaveResult(null);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Error parsing file';
            alert(msg || 'שגיאה בקריאת הקובץ. וודא שזהו GeoJSON או Shapefile (.zip) תקין.');
        }
    };

    const handleUrlSync = async () => {
        if (!externalUrl) return;
        try {
            setIsSubmitting(true);
            const { GISIntegrationService } = await import('@/features/parks/core/services/gis-integration.service');
            // Attempt to fetch from ArcGIS — the service returns routes, but we extract points
            const result = await GISIntegrationService.fetchFromArcGIS(externalUrl);
            // If the service returns routes (lines), extract their start points
            if (Array.isArray(result) && result.length > 0 && result[0].path) {
                const points: ParsedPoint[] = result.map((r, idx) => ({
                    id: `url-${category}-${Date.now()}-${idx}`,
                    name: r.name || `נקודה ${idx + 1}`,
                    location: { lat: r.path[0][1], lng: r.path[0][0] },
                    properties: {},
                }));
                setPreviewPoints(points);
            }
            setSaveResult(null);
        } catch {
            alert('סנכרון נכשל. וודא שהכתובת תקינה והשרת זמין.');
        } finally {
            setIsSubmitting(false);
        }
    };

    // ============================================
    // SAVE TO FIRESTORE
    // ============================================

    const handleSaveAll = async () => {
        if (previewPoints.length === 0) return;

        setIsSubmitting(true);
        let successCount = 0;

        try {
            for (const point of previewPoints) {
                // Determine sub-type fields
                let natureType: NatureType | undefined;
                let communityType: CommunityType | undefined;
                let urbanType: UrbanType | undefined;
                let courtType: string | undefined;
                let stairsDetails: StairsDetails | undefined;
                let benchDetails: BenchDetails | undefined;

                if (category === 'courts') {
                    courtType = selectedSubType;
                } else if (category === 'nature_community') {
                    if (selectedSubType === 'dog_park') {
                        communityType = selectedSubType as CommunityType;
                    } else {
                        natureType = selectedSubType as NatureType;
                    }
                } else if (category === 'urban') {
                    urbanType = selectedSubType as UrbanType;
                    if (urbanType === 'stairs') {
                        stairsDetails = defaultStairsDetails;
                    } else if (urbanType === 'bench') {
                        benchDetails = defaultBenchDetails;
                    }
                }

                // Auto-sport mapping
                const autoSports = getAutoSportTypes(
                    config.facilityType,
                    natureType,
                    communityType,
                    undefined,
                    undefined,
                    urbanType,
                );

                // Auto-map rating: normalize source rating to 1–5
                const rawRating = (point.properties?.rating ?? point.properties?.Rating ?? point.properties?.score ?? point.properties?.Score) as number | undefined;
                let normalizedRating: number | undefined;
                if (rawRating != null && typeof rawRating === 'number' && rawRating > 0) {
                    // If source is 1–10, divide by 2; if already 1–5, keep as is
                    normalizedRating = rawRating > 5 ? Number((rawRating / 2).toFixed(1)) : Number(rawRating.toFixed(1));
                    normalizedRating = Math.max(1, Math.min(5, normalizedRating));
                }

                // Build the park data
                const parkData: Omit<Park, 'id' | 'createdAt' | 'updatedAt'> = {
                    name: point.name,
                    location: point.location,
                    facilityType: config.facilityType,
                    sportTypes: autoSports,
                    featureTags: [],
                    authorityId: selectedAuthorityId || undefined,
                    natureType: natureType || undefined,
                    communityType: communityType || undefined,
                    urbanType: urbanType || undefined,
                    stairsDetails: stairsDetails || undefined,
                    benchDetails: benchDetails || undefined,
                    isDogFriendly: communityType === 'dog_park',
                    externalSourceId: (point.properties?.id as string) || (point.properties?.GlobalID as string) || undefined,
                    rating: normalizedRating,
                    status: 'open',
                };

                // Courts: store the courtType in the properties (the model uses courtType on the document)
                if (courtType) {
                    (parkData as Record<string, unknown>).courtType = courtType;
                }

                // Parks: Equipment cluster note (store as a tag or note)
                if (category === 'parks' && selectedEquipmentCluster !== 'none') {
                    const cluster = EQUIPMENT_CLUSTERS.find(c => c.id === selectedEquipmentCluster);
                    if (cluster) {
                        parkData.description = `ציוד: ${cluster.label}`;
                    }
                }

                // Derive city from authority if available
                if (selectedAuthorityId) {
                    const auth = authorities.find(a => a.id === selectedAuthorityId);
                    if (auth) {
                        parkData.city = auth.name;
                    }
                }

                try {
                    await createPark(parkData as Omit<Park, 'id'>);
                    successCount++;
                } catch (err) {
                    console.error(`Error saving point ${point.name}:`, err);
                }
            }

            setSaveResult({ success: successCount, total: previewPoints.length });
            if (successCount > 0) {
                setPreviewPoints([]);
            }
        } catch (err) {
            console.error('Error in bulk save:', err);
            alert('שגיאה בשמירה הגורפת');
        } finally {
            setIsSubmitting(false);
        }
    };

    // ============================================
    // AUTHORITY SEARCH HELPERS
    // ============================================

    const filteredAuthorities = authorities.filter(a =>
        a.name?.toLowerCase().includes(authoritySearch.toLowerCase())
    );

    const selectedAuthority = authorities.find(a => a.id === selectedAuthorityId);

    // Resolve icon for the preview markers
    const markerIcon = (() => {
        const key = (selectedSubType || config.facilityType) as BrandingCategoryKey;
        const icon = getFacilityIcon(null, key, brandingConfig);
        return icon.type === 'emoji' ? icon.value : (SYSTEM_DEFAULT_ICONS[key] || '📍');
    })();

    // ============================================
    // RENDER
    // ============================================

    return (
        <div className="max-w-7xl mx-auto space-y-6 pb-20 p-4" dir="rtl">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex items-center gap-4">
                    <Link
                        href="/admin/locations"
                        className="flex items-center gap-1 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                        <ArrowRight size={20} />
                        <span className="text-sm font-bold">חזור</span>
                    </Link>
                    <div>
                        <h1 className="text-2xl font-black text-gray-900 flex items-center gap-3">
                            <div
                                className="w-10 h-10 rounded-xl flex items-center justify-center"
                                style={{ backgroundColor: `${config.color}15` }}
                            >
                                <config.icon size={22} style={{ color: config.color }} />
                            </div>
                            {config.title}
                            <span className="text-xs font-bold px-2 py-1 rounded-full bg-gray-100 text-gray-400">GIS</span>
                        </h1>
                        <p className="text-sm text-gray-500 mt-1">{config.subtitle}</p>
                    </div>
                </div>

                <div className="flex gap-3">
                    <button
                        className="flex items-center gap-2 bg-white text-gray-700 px-5 py-2.5 rounded-2xl font-bold shadow-sm border border-gray-100 hover:bg-gray-50 transition-all"
                        onClick={() => { setPreviewPoints([]); setSaveResult(null); }}
                    >
                        <Trash2 size={18} />
                        <span>נקה תצוגה</span>
                    </button>
                    <button
                        disabled={previewPoints.length === 0 || isSubmitting}
                        className="flex items-center gap-2 text-white px-8 py-2.5 rounded-2xl font-bold shadow-lg hover:opacity-90 transition-all disabled:opacity-50 disabled:shadow-none"
                        style={{ backgroundColor: config.color }}
                        onClick={handleSaveAll}
                    >
                        {isSubmitting ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
                        <span>שמור למאגר ({previewPoints.length})</span>
                    </button>
                </div>
            </div>

            {/* Success Result */}
            {saveResult && (
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`p-4 rounded-2xl flex items-center gap-3 ${
                        saveResult.success === saveResult.total
                            ? 'bg-green-50 border border-green-200'
                            : 'bg-amber-50 border border-amber-200'
                    }`}
                >
                    {saveResult.success === saveResult.total ? (
                        <CheckCircle2 size={22} className="text-green-500" />
                    ) : (
                        <AlertCircle size={22} className="text-amber-500" />
                    )}
                    <p className="text-sm font-bold text-gray-800">
                        {saveResult.success} מתוך {saveResult.total} נקודות נשמרו בהצלחה
                        {selectedAuthority && ` · שויכו ל"${selectedAuthority.name}"`}
                    </p>
                </motion.div>
            )}

            {/* City / Authority Bulk Assignment */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                <div className="flex items-center gap-3 mb-3">
                    <Building2 size={18} style={{ color: config.color }} />
                    <h3 className="font-bold text-gray-800 text-sm">שיוך גורף לרשות / עיר</h3>
                    <span className="text-[10px] bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full font-bold">חל על כל הנקודות בייבוא</span>
                </div>
                <div className="relative max-w-md">
                    <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                            <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                                type="text"
                                value={authoritySearch}
                                onChange={(e) => { setAuthoritySearch(e.target.value); setShowAuthorityDropdown(true); }}
                                onFocus={() => setShowAuthorityDropdown(true)}
                                placeholder={selectedAuthority ? selectedAuthority.name : 'חפש רשות מקומית...'}
                                className="w-full pr-9 pl-3 py-2.5 bg-gray-50 rounded-xl border-2 border-transparent focus:border-blue-400 focus:bg-white transition-all outline-none text-sm"
                            />
                        </div>
                        {selectedAuthorityId && (
                            <button
                                type="button"
                                onClick={() => { setSelectedAuthorityId(''); setAuthoritySearch(''); }}
                                className="p-2 text-gray-400 hover:text-red-500 rounded-lg"
                            >
                                <Trash2 size={14} />
                            </button>
                        )}
                    </div>
                    {showAuthorityDropdown && authoritySearch && (
                        <div className="absolute top-full mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg z-30 max-h-48 overflow-y-auto">
                            {filteredAuthorities.length === 0 ? (
                                <p className="p-3 text-sm text-gray-400 text-center">לא נמצאו רשויות</p>
                            ) : (
                                filteredAuthorities.slice(0, 15).map(a => (
                                    <button
                                        key={a.id}
                                        type="button"
                                        className="w-full px-4 py-2.5 text-right text-sm hover:bg-gray-50 transition-colors flex items-center gap-2"
                                        onClick={() => {
                                            setSelectedAuthorityId(a.id);
                                            setAuthoritySearch('');
                                            setShowAuthorityDropdown(false);
                                        }}
                                    >
                                        <Building2 size={14} className="text-gray-300" />
                                        <span className="font-bold text-gray-700">{a.name}</span>
                                        {a.type && (
                                            <span className="text-[10px] bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded-full mr-auto">
                                                {a.type === 'city' ? 'עיר' : a.type === 'regional_council' ? 'מועצה' : a.type}
                                            </span>
                                        )}
                                    </button>
                                ))
                            )}
                        </div>
                    )}
                </div>
                {selectedAuthority && (
                    <p className="text-xs text-green-600 mt-2 flex items-center gap-1">
                        <CheckCircle2 size={12} />
                        כל הנקודות ישויכו ל&quot;{selectedAuthority.name}&quot;
                    </p>
                )}
            </div>

            {/* Main Grid: Sidebar + Map */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Sidebar Controls */}
                <div className="lg:col-span-4 space-y-5">
                    <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 space-y-6">
                        <h2 className="text-lg font-black text-gray-800 flex items-center gap-2">
                            <Database size={18} style={{ color: config.color }} />
                            הגדרות מיפוי
                        </h2>

                        {/* Sub-Type Selector (Courts / Nature / Urban) */}
                        {config.subTypeOptions.length > 0 && (
                            <div className="space-y-3">
                                <label className="text-xs font-black text-gray-400 uppercase tracking-widest">{config.subTypeLabel}</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {config.subTypeOptions.map(opt => (
                                        <button
                                            key={opt.id}
                                            onClick={() => setSelectedSubType(opt.id)}
                                            className={`flex items-center justify-center gap-2 p-3 rounded-2xl border-2 transition-all ${
                                                selectedSubType === opt.id
                                                    ? 'text-white shadow-md'
                                                    : 'border-gray-100 bg-gray-50 text-gray-500 hover:border-gray-200'
                                            }`}
                                            style={{
                                                backgroundColor: selectedSubType === opt.id ? config.color : undefined,
                                                borderColor: selectedSubType === opt.id ? config.color : undefined,
                                            }}
                                        >
                                            <span className="text-lg">{opt.emoji}</span>
                                            <span className="text-xs font-bold">{opt.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Parks: Equipment Cluster */}
                        {category === 'parks' && (
                            <div className="space-y-3">
                                <label className="text-xs font-black text-gray-400 uppercase tracking-widest">אשכול ציוד ברירת מחדל</label>
                                <p className="text-xs text-gray-400">הציוד ישויך לכל הגינות בייבוא</p>
                                <div className="space-y-2">
                                    {EQUIPMENT_CLUSTERS.map(cluster => (
                                        <button
                                            key={cluster.id}
                                            onClick={() => setSelectedEquipmentCluster(cluster.id)}
                                            className={`w-full p-3 text-right rounded-xl border-2 transition-all text-sm ${
                                                selectedEquipmentCluster === cluster.id
                                                    ? 'border-cyan-500 bg-cyan-50 text-cyan-700 font-bold'
                                                    : 'border-gray-100 bg-gray-50 text-gray-500 hover:border-gray-200'
                                            }`}
                                        >
                                            <span className="flex items-center gap-2">
                                                <Dumbbell size={14} className={selectedEquipmentCluster === cluster.id ? 'text-cyan-500' : 'text-gray-300'} />
                                                {cluster.label}
                                            </span>
                                            {cluster.items.length > 0 && (
                                                <span className="text-[10px] text-gray-400 block mt-1 mr-6">
                                                    {cluster.items.length} מתקנים
                                                </span>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Urban: Stairs defaults */}
                        {category === 'urban' && selectedSubType === 'stairs' && (
                            <AnimatePresence mode="wait">
                                <motion.div
                                    key="stairs-fields"
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="space-y-3 overflow-hidden"
                                >
                                    <label className="text-xs font-black text-gray-400 uppercase tracking-widest">הגדרות ברירת מחדל — מדרגות</label>
                                    <div className="space-y-2">
                                        <div className="flex items-center gap-3">
                                            <span className="text-xs font-bold text-gray-500 w-16">תלילות</span>
                                            <div className="flex gap-1.5">
                                                {(['low', 'medium', 'high'] as const).map(s => (
                                                    <button
                                                        key={s}
                                                        onClick={() => setDefaultStairsDetails(prev => ({ ...prev, steepness: s }))}
                                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                                            defaultStairsDetails.steepness === s
                                                                ? 'bg-indigo-500 text-white'
                                                                : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                                                        }`}
                                                    >
                                                        {s === 'low' ? 'נמוכה' : s === 'medium' ? 'בינונית' : 'גבוהה'}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={defaultStairsDetails.hasShade ?? false}
                                                onChange={(e) => setDefaultStairsDetails(prev => ({ ...prev, hasShade: e.target.checked }))}
                                                className="rounded"
                                            />
                                            יש צל
                                        </label>
                                    </div>
                                </motion.div>
                            </AnimatePresence>
                        )}

                        {/* Urban: Bench defaults */}
                        {category === 'urban' && selectedSubType === 'bench' && (
                            <AnimatePresence mode="wait">
                                <motion.div
                                    key="bench-fields"
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="space-y-3 overflow-hidden"
                                >
                                    <label className="text-xs font-black text-gray-400 uppercase tracking-widest">הגדרות ברירת מחדל — ספסלים</label>
                                    <div className="space-y-3">
                                        <div className="flex items-center gap-3">
                                            <span className="text-xs font-bold text-gray-500 w-16">כמות</span>
                                            <input
                                                type="number"
                                                min={1}
                                                max={50}
                                                value={defaultBenchDetails.quantity || 3}
                                                onChange={(e) => setDefaultBenchDetails(prev => ({ ...prev, quantity: parseInt(e.target.value) || 3 }))}
                                                className="w-20 p-2 bg-gray-50 rounded-lg border-2 border-transparent focus:border-indigo-400 text-sm text-center outline-none"
                                            />
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <span className="text-xs font-bold text-gray-500 w-16">חומר</span>
                                            <div className="flex gap-1.5">
                                                {(['wood', 'metal', 'concrete', 'plastic'] as const).map(m => (
                                                    <button
                                                        key={m}
                                                        onClick={() => setDefaultBenchDetails(prev => ({ ...prev, material: m }))}
                                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                                            defaultBenchDetails.material === m
                                                                ? 'bg-indigo-500 text-white'
                                                                : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                                                        }`}
                                                    >
                                                        {m === 'wood' ? 'עץ' : m === 'metal' ? 'מתכת' : m === 'concrete' ? 'בטון' : 'פלסטיק'}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={defaultBenchDetails.hasShade ?? false}
                                                onChange={(e) => setDefaultBenchDetails(prev => ({ ...prev, hasShade: e.target.checked }))}
                                                className="rounded"
                                            />
                                            יש צל
                                        </label>
                                    </div>
                                </motion.div>
                            </AnimatePresence>
                        )}

                        {/* Auto-assigned Sports Preview */}
                        <div className="space-y-2">
                            <label className="text-xs font-black text-gray-400 uppercase tracking-widest">ענפי ספורט (אוטומטי)</label>
                            <div className="flex flex-wrap gap-1.5">
                                {getAutoSportTypes(
                                    config.facilityType,
                                    category === 'nature_community' && selectedSubType !== 'dog_park' ? selectedSubType as NatureType : undefined,
                                    category === 'nature_community' && selectedSubType === 'dog_park' ? 'dog_park' as CommunityType : undefined,
                                    undefined,
                                    undefined,
                                    category === 'urban' ? selectedSubType as UrbanType : undefined,
                                ).map(sport => (
                                    <span
                                        key={sport}
                                        className="text-[10px] font-bold px-2 py-1 rounded-full"
                                        style={{
                                            backgroundColor: `${config.color}15`,
                                            color: config.color,
                                        }}
                                    >
                                        {sport}
                                    </span>
                                ))}
                            </div>
                        </div>

                        {/* Divider */}
                        <div className="border-t border-gray-100" />

                        {/* Data Source */}
                        <div className="space-y-4">
                            <label className="text-xs font-black text-gray-400 uppercase tracking-widest">מקור נתונים</label>
                            <div className="grid grid-cols-2 gap-2 p-1 bg-gray-50 rounded-xl">
                                {[
                                    { id: 'file' as const, label: 'העלאת קובץ', icon: Upload },
                                    { id: 'url' as const, label: 'כתובת חיצונית', icon: Globe },
                                ].map(s => (
                                    <button
                                        key={s.id}
                                        onClick={() => setSourceType(s.id)}
                                        className={`flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-lg transition-all ${
                                            sourceType === s.id ? 'bg-white shadow-sm text-gray-700' : 'text-gray-400'
                                        }`}
                                    >
                                        <s.icon size={14} />
                                        <span>{s.label}</span>
                                    </button>
                                ))}
                            </div>

                            {sourceType === 'file' ? (
                                <div
                                    onClick={() => fileInputRef.current?.click()}
                                    className="border-2 border-dashed border-gray-200 rounded-2xl p-6 flex flex-col items-center justify-center gap-3 hover:border-blue-400 hover:bg-blue-50/50 transition-all cursor-pointer group"
                                >
                                    <div
                                        className="w-12 h-12 rounded-full flex items-center justify-center text-gray-400 group-hover:text-white transition-all"
                                        style={{ backgroundColor: `${config.color}15` }}
                                    >
                                        <Upload size={24} style={{ color: config.color }} />
                                    </div>
                                    <div className="text-center">
                                        <span className="block font-black text-gray-800 text-sm">לחץ להעלאת קובץ</span>
                                        <span className="text-xs text-gray-400 mt-1">GeoJSON, CSV או Shapefile (.zip)</span>
                                    </div>
                                    <input
                                        type="file"
                                        ref={fileInputRef}
                                        onChange={handleFileUpload}
                                        className="hidden"
                                        accept=".json,.geojson,.zip,.csv"
                                    />
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    <div
                                        className="p-4 rounded-2xl space-y-3"
                                        style={{ backgroundColor: `${config.color}08` }}
                                    >
                                        <label className="text-xs font-bold" style={{ color: config.color }}>
                                            הדבק כתובת ArcGIS / GIS כאן:
                                        </label>
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                value={externalUrl}
                                                onChange={(e) => setExternalUrl(e.target.value)}
                                                placeholder="https://gis.server.com/arcgis/rest/services/..."
                                                className="flex-1 bg-white border border-gray-200 px-4 py-2 text-xs rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400"
                                            />
                                            <button
                                                onClick={handleUrlSync}
                                                disabled={isSubmitting || !externalUrl}
                                                className="text-white px-4 py-2 rounded-xl font-bold text-xs transition-all disabled:opacity-50"
                                                style={{ backgroundColor: config.color }}
                                            >
                                                {isSubmitting ? <Loader2 className="animate-spin" size={16} /> : 'סנכרן'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Map Preview */}
                <div className="lg:col-span-8 space-y-5">
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col h-[650px]">
                        <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-white z-10">
                            <h2 className="text-lg font-black text-gray-800 flex items-center gap-2">
                                <Eye size={18} style={{ color: config.color }} />
                                תצוגה מקדימה
                            </h2>
                            {previewPoints.length > 0 && (
                                <span
                                    className="text-xs font-bold px-3 py-1 rounded-full text-white"
                                    style={{ backgroundColor: config.color }}
                                >
                                    {previewPoints.length} נקודות
                                </span>
                            )}
                        </div>

                        <div className="flex-1 relative bg-gray-50">
                            <MapComponent
                                initialViewState={{
                                    longitude: 34.7818,
                                    latitude: 32.0853,
                                    zoom: 10,
                                }}
                                style={{ width: '100%', height: '100%' }}
                                mapStyle="mapbox://styles/mapbox/light-v11"
                                mapboxAccessToken={MAPBOX_TOKEN}
                            >
                                {previewPoints.map((point) => (
                                    <Marker
                                        key={point.id}
                                        longitude={point.location.lng}
                                        latitude={point.location.lat}
                                        anchor="center"
                                    >
                                        <div
                                            className="flex items-center justify-center w-8 h-8 rounded-full shadow-md text-sm border-2 border-white"
                                            style={{ backgroundColor: `${config.color}20` }}
                                            title={point.name}
                                        >
                                            {markerIcon}
                                        </div>
                                    </Marker>
                                ))}
                            </MapComponent>

                            {/* Empty state */}
                            {previewPoints.length === 0 && !isSubmitting && (
                                <div className="absolute inset-0 flex items-center justify-center bg-black/5 backdrop-blur-[2px] z-20">
                                    <div className="bg-white/90 backdrop-blur-xl p-8 rounded-3xl shadow-2xl text-center border border-white/50 max-w-sm">
                                        <Layers className="mx-auto mb-4" style={{ color: config.color }} size={48} />
                                        <h3 className="text-lg font-black text-gray-800">טרם נטענו נתונים</h3>
                                        <p className="text-sm text-gray-500 mt-2">
                                            העלה קובץ GeoJSON / Shapefile או הדבק כתובת חיצונית כדי להתחיל
                                        </p>
                                    </div>
                                </div>
                            )}

                            {isSubmitting && (
                                <div className="absolute inset-0 flex items-center justify-center bg-black/10 backdrop-blur-[2px] z-20">
                                    <div className="bg-white/90 backdrop-blur-xl p-6 rounded-3xl shadow-2xl flex items-center gap-3">
                                        <Loader2 className="animate-spin" style={{ color: config.color }} size={24} />
                                        <span className="font-bold text-gray-800">שומר...</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Points List */}
                    {previewPoints.length > 0 && (
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                            <h3 className="text-sm font-black text-gray-800 flex items-center gap-2 mb-4">
                                <Database size={16} style={{ color: config.color }} />
                                רשימת נקודות ({previewPoints.length})
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[300px] overflow-y-auto custom-scrollbar p-1">
                                {previewPoints.map((point, idx) => (
                                    <div
                                        key={point.id}
                                        className="p-3 bg-gray-50 rounded-xl border border-gray-100 flex items-center gap-3 group"
                                    >
                                        <div
                                            className="w-9 h-9 rounded-lg flex items-center justify-center text-sm flex-shrink-0"
                                            style={{ backgroundColor: `${config.color}15` }}
                                        >
                                            {markerIcon}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-xs font-bold text-gray-800 truncate">{point.name}</p>
                                            <p className="text-[10px] text-gray-400">
                                                {point.location.lat.toFixed(4)}, {point.location.lng.toFixed(4)}
                                            </p>
                                        </div>
                                        <span className="text-[10px] text-gray-300 font-bold">#{idx + 1}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
