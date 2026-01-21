'use client';

import { useState, useRef } from 'react';
import {
    Plus,
    Trash2,
    Save,
    Upload,
    Database,
    Layers,
    Eye,
    Zap,
    Bike,
    Trees,
    Mountain,
    CheckCircle2,
    AlertCircle,
    Loader2,
    ChevronLeft,
    Globe,
    MapPin
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import dynamic from 'next/dynamic';
import { GISParserService } from '@/features/parks';
import { Route, ActivityType, MapFacility, FacilityType } from '@/features/parks';
import { useMapStore } from '@/features/parks';
import { InventoryService } from '@/features/parks';
import { useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { checkUserRole, isOnlyAuthorityManager } from '@/features/admin/services/auth.service';

// Dynamic import for Map to avoid SSR issues
const Map = dynamic(
    () => import('react-map-gl').then(mod => mod.default),
    { ssr: false, loading: () => <div className="h-full w-full bg-gray-100 animate-pulse rounded-2xl" /> }
);
const Source = dynamic(
    () => import('react-map-gl').then(mod => mod.Source),
    { ssr: false }
);
const Layer = dynamic(
    () => import('react-map-gl').then(mod => mod.Layer),
    { ssr: false }
);
const Marker = dynamic(
    () => import('react-map-gl').then(mod => mod.Marker),
    { ssr: false }
);

import 'mapbox-gl/dist/mapbox-gl.css';

const MAPBOX_TOKEN = "pk.eyJ1IjoiZGF2aWQtb3V0IiwiYSI6ImNtanZpZmJ0djM5MTEzZXF5YXNmcm9zNGwifQ.8MD8s4TZOr0WYYgEpFfpzw";

type Tab = 'add' | 'inventory';

export default function AdminRouteManager() {
    const [activeTab, setActiveTab] = useState<Tab>('add');
    const [sourceType, setSourceType] = useState<'file' | 'url'>('file');
    const [externalUrl, setExternalUrl] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [previewRoutes, setPreviewRoutes] = useState<Route[]>([]);
    const [previewFacilities, setPreviewFacilities] = useState<MapFacility[]>([]);

    // Inventory state
    const [existingRoutes, setExistingRoutes] = useState<Route[]>([]);
    const [existingFacilities, setExistingFacilities] = useState<MapFacility[]>([]);
    const [inventoryFilter, setInventoryFilter] = useState<'all' | 'route' | 'facility'>('all');
    const [isAuthorityManagerOnly, setIsAuthorityManagerOnly] = useState(false);
    const [userAuthorityIds, setUserAuthorityIds] = useState<string[]>([]);

    // UI State
    const [dataType, setDataType] = useState<'route' | 'facility'>('route');
    const [selectedFacilityType, setSelectedFacilityType] = useState<FacilityType>('water');

    const addFacilities = useMapStore(state => state.addFacilities);

    // Check user role on mount
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (user) {
                try {
                    const roleInfo = await checkUserRole(user.uid);
                    const isOnly = await isOnlyAuthorityManager(user.uid);
                    setIsAuthorityManagerOnly(isOnly);
                    setUserAuthorityIds(roleInfo.authorityIds || []);
                } catch (error) {
                    console.error('Error checking user role:', error);
                }
            }
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        if (activeTab === 'inventory') {
            loadInventory();
        }
    }, [activeTab, userAuthorityIds]);

    const loadInventory = async () => {
        setIsSubmitting(true);
        try {
            const [routes, facilities] = await Promise.all([
                // Pass authorityIds for filtering if user is authority_manager
                InventoryService.fetchOfficialRoutes(
                    isAuthorityManagerOnly && userAuthorityIds.length > 0 
                        ? userAuthorityIds 
                        : undefined
                ),
                InventoryService.fetchFacilities()
            ]);
            setExistingRoutes(routes);
            setExistingFacilities(facilities);
        } catch (err) {
            console.error('Failed to load inventory:', err);
        } finally {
            setIsSubmitting(false);
        }
    };

    // Classification State
    const [classification, setClassification] = useState({
        activity: 'running' as ActivityType,
        terrain: 'asphalt' as 'asphalt' | 'dirt' | 'mixed',
        environment: 'urban' as 'urban' | 'nature' | 'park' | 'beach',
        difficulty: 'easy' as 'easy' | 'medium' | 'hard'
    });

    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            const json = await GISParserService.parseFile(file);
            if (dataType === 'route') {
                const parsed = GISParserService.parseGeoJSON(json, {
                    activity: classification.activity,
                    terrain: classification.terrain,
                    environment: classification.environment,
                    difficulty: classification.difficulty
                });
                setPreviewRoutes(parsed);
                setPreviewFacilities([]);
            } else {
                const parsed = GISParserService.parseFacilities(json, selectedFacilityType);
                setPreviewFacilities(parsed);
                setPreviewRoutes([]);
            }
        } catch (err: any) {
            alert(err.message || 'Error parsing file. Please upload a valid GeoJSON or Shapefile (.zip)');
        }
    };

    const activityOptions: { id: ActivityType; label: string; icon: any }[] = [
        { id: 'running', label: 'ריצה', icon: Zap },
        { id: 'cycling', label: 'רכיבה', icon: Bike },
        { id: 'walking', label: 'הליכה', icon: MapPin }
    ];

    const terrainOptions: { id: typeof classification.terrain; label: string; icon: any }[] = [
        { id: 'asphalt', label: 'אספלט', icon: Layers },
        { id: 'dirt', label: 'שטח/עפר', icon: Mountain },
        { id: 'mixed', label: 'מעורב', icon: Trees }
    ];

    const envOptions: { id: typeof classification.environment; label: string; icon: any }[] = [
        { id: 'urban', label: 'עירוני', icon: Database },
        { id: 'nature', label: 'טבע', icon: Trees },
        { id: 'park', label: 'פארק', icon: Trees }
    ];

    const handleUrlSync = async () => {
        if (!externalUrl) return;
        try {
            setIsSubmitting(true);
            const { GISIntegrationService } = await import('@/features/admin/services/gis-integration.service');
            const paths = await GISIntegrationService.fetchFromArcGIS(externalUrl);
            setPreviewRoutes(paths);
            setPreviewFacilities([]);
            setDataType('route');
            setClassification({
                ...classification,
                activity: 'cycling',
                terrain: 'asphalt',
                environment: 'urban'
            });
        } catch (err) {
            alert('סנכרון נכשל. וודא שהכתובת תקינה והשרת זמין.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const getRouteColor = (route: Route) => {
        if (route.features?.environment === 'nature') return '#34D399'; // Green
        if (route.activityType === 'cycling') return '#8B5CF6'; // Purple
        return '#06B6D4'; // Cyan (Urban Run)
    };

    return (
        <div className="max-w-6xl mx-auto space-y-8 pb-20 p-4" dir="rtl">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 flex items-center gap-3">
                        <Layers className="text-cyan-500" size={32} />
                        ניהול מסלולים חכם
                    </h1>
                    <p className="text-gray-500 mt-1">יבוא, סיווג וניהול מאגר המסלולים של OUT RUN</p>
                </div>

                <div className="flex gap-3">
                    <button
                        className="flex items-center gap-2 bg-white text-gray-700 px-5 py-2.5 rounded-2xl font-bold shadow-sm border border-gray-100 hover:bg-gray-50 transition-all"
                        onClick={() => {
                            setPreviewRoutes([]);
                            setPreviewFacilities([]);
                        }}
                    >
                        <Trash2 size={18} />
                        <span>נקה תצוגה</span>
                    </button>
                    <button
                        disabled={(previewRoutes.length === 0 && previewFacilities.length === 0) || isSubmitting}
                        className="flex items-center gap-2 bg-cyan-500 text-white px-8 py-2.5 rounded-2xl font-bold shadow-lg shadow-cyan-200 hover:bg-cyan-600 transition-all disabled:opacity-50 disabled:shadow-none"
                        onClick={async () => {
                            setIsSubmitting(true);
                            try {
                                if (dataType === 'route') {
                                    await InventoryService.saveRoutes(previewRoutes);
                                    alert(`${previewRoutes.length} מסלולים נשמרו בהצלחה במערכת!`);
                                    setPreviewRoutes([]);
                                } else {
                                    await InventoryService.saveFacilities(previewFacilities);
                                    addFacilities(previewFacilities);
                                    alert(`${previewFacilities.length} נקודות עניין נשמרו בהצלחה במערכת!`);
                                    setPreviewFacilities([]);
                                }
                                await loadInventory();
                                setActiveTab('inventory');
                            } catch (err) {
                                alert('שגיאה בשמירה');
                            } finally {
                                setIsSubmitting(false);
                            }
                        }}
                    >
                        {isSubmitting ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
                        <span>שמור למאגר ({dataType === 'route' ? previewRoutes.length : previewFacilities.length})</span>
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex p-1 bg-gray-100 rounded-2xl w-full max-w-sm">
                {[
                    { id: 'add' as Tab, label: 'הוספת נתונים', icon: Plus },
                    { id: 'inventory' as Tab, label: 'מלאי קיים', icon: Layers }
                ].map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold transition-all ${activeTab === tab.id
                            ? 'bg-white text-cyan-500 shadow-sm'
                            : 'text-gray-500 hover:text-gray-700'
                            }`}
                    >
                        <tab.icon size={18} />
                        <span>{tab.label}</span>
                    </button>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Sidebar Controls - Only show in 'add' tab */}
                {activeTab === 'add' && (
                    <div className="lg:col-span-4 space-y-6">
                        <div className="bg-white p-6 rounded-[32px] shadow-xl border border-gray-50 space-y-8">
                            <h2 className="text-xl font-black text-gray-800 flex items-center gap-2">
                                <Plus className="text-cyan-500" size={20} />
                                הגדרות קליטת נתונים
                            </h2>

                            {/* Data Type Selector */}
                            <div className="space-y-4">
                                <label className="text-sm font-black text-gray-400 uppercase tracking-widest px-1">סוג נתונים</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {[
                                        { id: 'route', label: 'מסלול (Line)', icon: Layers },
                                        { id: 'facility', label: 'מתקן (Point)', icon: MapPin }
                                    ].map((opt) => (
                                        <button
                                            key={opt.id}
                                            onClick={() => {
                                                setDataType(opt.id as any);
                                                setPreviewRoutes([]);
                                                setPreviewFacilities([]);
                                            }}
                                            className={`flex items-center justify-center gap-2 p-3 rounded-2xl border-2 transition-all ${dataType === opt.id
                                                ? 'border-cyan-500 bg-cyan-50 text-cyan-600'
                                                : 'border-gray-50 bg-gray-50 text-gray-400'
                                                }`}
                                        >
                                            <opt.icon size={18} />
                                            <span className="text-xs font-bold">{opt.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {dataType === 'route' ? (
                                <AnimatePresence mode="wait">
                                    <motion.div
                                        key="route-classification"
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        className="space-y-8 overflow-hidden"
                                    >
                                        <div className="space-y-4">
                                            <label className="text-sm font-black text-gray-400 uppercase tracking-widest px-1">סוג פעילות</label>
                                            <div className="grid grid-cols-3 gap-2">
                                                {activityOptions.map((opt) => (
                                                    <button
                                                        key={opt.id}
                                                        onClick={() => setClassification({ ...classification, activity: opt.id })}
                                                        className={`flex flex-col items-center gap-2 p-3 rounded-2xl border-2 transition-all ${classification.activity === opt.id
                                                            ? 'border-cyan-500 bg-cyan-50 text-cyan-600'
                                                            : 'border-gray-50 bg-gray-50 text-gray-400'
                                                            }`}
                                                    >
                                                        <opt.icon size={20} />
                                                        <span className="text-xs font-bold">{opt.label}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="space-y-4">
                                            <label className="text-sm font-black text-gray-400 uppercase tracking-widest px-1">תוואי שטח</label>
                                            <div className="grid grid-cols-3 gap-2">
                                                {terrainOptions.map((opt) => (
                                                    <button
                                                        key={opt.id}
                                                        onClick={() => setClassification({ ...classification, terrain: opt.id })}
                                                        className={`flex flex-col items-center gap-2 p-3 rounded-2xl border-2 transition-all ${classification.terrain === opt.id
                                                            ? 'border-purple-500 bg-purple-50 text-purple-600'
                                                            : 'border-gray-50 bg-gray-50 text-gray-400'
                                                            }`}
                                                    >
                                                        <opt.icon size={20} />
                                                        <span className="text-xs font-bold">{opt.label}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="space-y-4">
                                            <label className="text-sm font-black text-gray-400 uppercase tracking-widest px-1">סביבה</label>
                                            <div className="grid grid-cols-3 gap-2">
                                                {envOptions.map((opt) => (
                                                    <button
                                                        key={opt.id}
                                                        onClick={() => setClassification({ ...classification, environment: opt.id })}
                                                        className={`flex flex-col items-center gap-2 p-3 rounded-2xl border-2 transition-all ${classification.environment === opt.id
                                                            ? 'border-green-500 bg-green-50 text-green-600'
                                                            : 'border-gray-50 bg-gray-50 text-gray-400'
                                                            }`}
                                                    >
                                                        <opt.icon size={20} />
                                                        <span className="text-xs font-bold">{opt.label}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </motion.div>
                                </AnimatePresence>
                            ) : (
                                <AnimatePresence mode="wait">
                                    <motion.div
                                        key="facility-classification"
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        className="space-y-4 overflow-hidden"
                                    >
                                        <label className="text-sm font-black text-gray-400 uppercase tracking-widest px-1">סוג מתקן</label>
                                        <div className="grid grid-cols-2 gap-2">
                                            {[
                                                { id: 'water', label: 'ברזיה', icon: Zap },
                                                { id: 'toilet', label: 'שירותים', icon: MapPin },
                                                { id: 'gym', label: 'מתקני כושר', icon: Bike },
                                                { id: 'parking', label: 'חניה', icon: Database }
                                            ].map((opt) => (
                                                <button
                                                    key={opt.id}
                                                    onClick={() => setSelectedFacilityType(opt.id as any)}
                                                    className={`flex flex-col items-center gap-2 p-3 rounded-2xl border-2 transition-all ${selectedFacilityType === opt.id
                                                        ? 'border-orange-500 bg-orange-50 text-orange-600'
                                                        : 'border-gray-50 bg-gray-50 text-gray-400'
                                                        }`}
                                                >
                                                    <opt.icon size={20} />
                                                    <span className="text-xs font-bold">{opt.label}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </motion.div>
                                </AnimatePresence>
                            )}

                            <div className="space-y-6 pt-4">
                                <div className="space-y-3">
                                    <label className="text-xs font-black text-gray-400 uppercase tracking-widest px-1">מקור הנתונים</label>
                                    <div className="grid grid-cols-2 gap-2 p-1 bg-gray-50 rounded-xl">
                                        {[
                                            { id: 'file', label: 'העלאת קובץ', icon: Upload },
                                            { id: 'url', label: 'כתובת חיצונית (URL)', icon: Globe }
                                        ].map(s => (
                                            <button
                                                key={s.id}
                                                onClick={() => setSourceType(s.id as any)}
                                                className={`flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-lg transition-all ${sourceType === s.id ? 'bg-white shadow-sm text-cyan-600' : 'text-gray-400'}`}
                                            >
                                                <s.icon size={14} />
                                                <span>{s.label}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {sourceType === 'file' ? (
                                    <div
                                        onClick={() => fileInputRef.current?.click()}
                                        className="border-2 border-dashed border-gray-200 rounded-[24px] p-8 flex flex-col items-center justify-center gap-3 hover:border-cyan-500 hover:bg-cyan-50 transition-all cursor-pointer group"
                                    >
                                        <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center text-gray-400 group-hover:bg-cyan-100 group-hover:text-cyan-500 transition-all">
                                            <Upload size={24} />
                                        </div>
                                        <div className="text-center">
                                            <span className="block font-black text-gray-800">לחץ להעלאת קובץ</span>
                                            <span className="text-xs text-gray-400 mt-1">GeoJSON או Shapefile (.zip)</span>
                                        </div>
                                        <input
                                            type="file"
                                            ref={fileInputRef}
                                            onChange={handleFileUpload}
                                            className="hidden"
                                            accept=".json,.geojson,.zip"
                                        />
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        <div className="bg-cyan-50 p-4 rounded-2xl space-y-3">
                                            <label className="text-xs font-bold text-cyan-700">הדבק כתובת ArcGIS GIS כאן:</label>
                                            <div className="flex gap-2">
                                                <input
                                                    type="text"
                                                    value={externalUrl}
                                                    onChange={(e) => setExternalUrl(e.target.value)}
                                                    placeholder="https://gis.server.com/arcgis/rest/services/..."
                                                    className="flex-1 bg-white border border-cyan-100 px-4 py-2 text-xs rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-500"
                                                />
                                                <button
                                                    onClick={handleUrlSync}
                                                    disabled={isSubmitting || !externalUrl}
                                                    className="bg-cyan-500 text-white px-4 py-2 rounded-xl font-bold text-xs hover:bg-cyan-600 transition-all disabled:opacity-50"
                                                >
                                                    {isSubmitting ? <Loader2 className="animate-spin" size={16} /> : 'סנכרן'}
                                                </button>
                                            </div>
                                        </div>
                                        <p className="text-[10px] text-gray-400 px-2">
                                            * המערכת תבצע המרה אוטומטית מ-EsriJSON ל-GeoJSON במידת הצורך.
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Main Content Area */}
                <div className={`${activeTab === 'add' ? 'lg:col-span-8' : 'lg:col-span-12'} space-y-6`}>
                    <div className="bg-white rounded-[32px] shadow-xl border border-gray-50 overflow-hidden flex flex-col h-[700px]">
                        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-white z-10">
                            <h2 className="text-xl font-black text-gray-800 flex items-center gap-2">
                                <Eye className="text-cyan-500" size={20} />
                                {activeTab === 'add' ? 'תצוגה מקדימה וצביעה' : 'תצוגת מלאי מלאה'}
                            </h2>
                        </div>

                        <div className="flex-1 relative bg-gray-50">
                            <Map
                                initialViewState={{
                                    longitude: 34.7818,
                                    latitude: 32.0853,
                                    zoom: 12
                                }}
                                style={{ width: '100%', height: '100%' }}
                                mapStyle="mapbox://styles/mapbox/dark-v11"
                                mapboxAccessToken={MAPBOX_TOKEN}
                            >
                                {/* Preview Data */}
                                {activeTab === 'add' && previewRoutes.map((route) => (
                                    <Source
                                        key={route.id}
                                        id={route.id}
                                        type="geojson"
                                        data={{
                                            type: 'Feature',
                                            properties: {},
                                            geometry: {
                                                type: 'LineString',
                                                coordinates: route.path
                                            }
                                        }}
                                    >
                                        <Layer
                                            id={`${route.id}-layer`}
                                            type="line"
                                            paint={{
                                                'line-color': getRouteColor(route),
                                                'line-width': 4,
                                                'line-opacity': 0.8
                                            }}
                                        />
                                    </Source>
                                ))}

                                {activeTab === 'add' && previewFacilities.map((f) => (
                                    <Marker
                                        key={f.id}
                                        longitude={f.location.lng}
                                        latitude={f.location.lat}
                                        anchor="center"
                                    >
                                        <div style={{ opacity: 0.6, width: '12px', height: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', transform: 'translate(-50%, -50%)' }}>
                                            {f.type === 'water' ? '🚰' : (
                                                <span style={{ fontSize: '10px', lineHeight: 1 }}>
                                                    {f.type === 'toilet' && '🚽'}
                                                    {f.type === 'gym' && '💪'}
                                                    {f.type === 'parking' && '🅿️'}
                                                </span>
                                            )}
                                        </div>
                                    </Marker>
                                ))}

                                {/* Existing Inventory */}
                                {activeTab === 'inventory' && existingRoutes.map((route) => (
                                    <Source
                                        key={route.id}
                                        id={route.id}
                                        type="geojson"
                                        data={{
                                            type: 'Feature',
                                            properties: {},
                                            geometry: {
                                                type: 'LineString',
                                                coordinates: route.path
                                            }
                                        }}
                                    >
                                        <Layer
                                            id={`${route.id}-layer`}
                                            type="line"
                                            paint={{
                                                'line-color': getRouteColor(route),
                                                'line-width': 4,
                                                'line-opacity': 0.8
                                            }}
                                        />
                                    </Source>
                                ))}

                                {activeTab === 'inventory' && existingFacilities.map((f) => (
                                    <Marker
                                        key={f.id}
                                        longitude={f.location.lng}
                                        latitude={f.location.lat}
                                        anchor="center"
                                    >
                                        <div style={{ opacity: 0.6, width: '12px', height: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', transform: 'translate(-50%, -50%)' }}>
                                            {f.type === 'water' ? '🚰' : (
                                                <span style={{ fontSize: '10px', lineHeight: 1 }}>
                                                    {f.type === 'toilet' && '🚽'}
                                                    {f.type === 'gym' && '💪'}
                                                    {f.type === 'parking' && '🅿️'}
                                                </span>
                                            )}
                                        </div>
                                    </Marker>
                                ))}
                            </Map>

                            {/* Overlays */}
                            {activeTab === 'add' && previewRoutes.length === 0 && previewFacilities.length === 0 && (
                                <div className="absolute inset-0 flex items-center justify-center bg-black/5 backdrop-blur-[2px] z-20">
                                    <div className="bg-white/90 backdrop-blur-xl p-8 rounded-3xl shadow-2xl text-center border border-white/50 max-w-sm">
                                        <Layers className="mx-auto text-cyan-500 mb-4" size={48} />
                                        <h3 className="text-lg font-black text-gray-800">טרם נטענו נתונים</h3>
                                        <p className="text-sm text-gray-500 mt-2">העלה קובץ או בחר כתובת חיצונית כדי להמשיך</p>
                                    </div>
                                </div>
                            )}

                            {activeTab === 'inventory' && existingRoutes.length === 0 && existingFacilities.length === 0 && !isSubmitting && (
                                <div className="absolute inset-0 flex items-center justify-center bg-black/5 backdrop-blur-[2px] z-20">
                                    <div className="bg-white/90 backdrop-blur-xl p-8 rounded-3xl shadow-2xl text-center border border-white/50 max-w-sm">
                                        <Database className="mx-auto text-cyan-500 mb-4" size={48} />
                                        <h3 className="text-lg font-black text-gray-800">המלאי ריק</h3>
                                        <p className="text-sm text-gray-500 mt-2">החל להוסיף נתונים בלשונית הקודמת</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Inventory Table (When in Inventory Tab) */}
                    {activeTab === 'inventory' && (
                        <div className="bg-white rounded-[32px] shadow-xl border border-gray-50 p-6">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-xl font-black text-gray-800 flex items-center gap-2">
                                    <Database size={24} className="text-cyan-500" />
                                    רשימת מלאי
                                </h3>
                                <div className="flex gap-2 p-1 bg-gray-50 rounded-xl">
                                    {['all', 'route', 'facility'].map(f => (
                                        <button
                                            key={f}
                                            onClick={() => setInventoryFilter(f as any)}
                                            className={`px-4 py-1.5 text-xs font-black rounded-lg transition-all ${inventoryFilter === f ? 'bg-white shadow-sm text-cyan-500' : 'text-gray-400'}`}
                                        >
                                            {f === 'all' ? 'הכל' : f === 'route' ? 'מסלולים' : 'מתקנים'}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[400px] overflow-y-auto custom-scrollbar p-1">
                                {inventoryFilter !== 'facility' && existingRoutes.map(route => (
                                    <div key={route.id} className="p-4 bg-gray-50 rounded-2xl border border-gray-100 flex items-center justify-between group">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-cyan-100 flex items-center justify-center text-cyan-600">
                                                <Bike size={20} />
                                            </div>
                                            <div>
                                                <p className="text-sm font-black text-gray-800">{route.name}</p>
                                                <p className="text-xs font-bold text-gray-400">{Math.round(route.distance)} ק"מ | {route.type}</p>
                                            </div>
                                        </div>
                                        <button className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all">
                                            <Trash2 size={18} />
                                        </button>
                                    </div>
                                ))}

                                {inventoryFilter !== 'route' && existingFacilities.map(f => (
                                    <div key={f.id} className="p-4 bg-gray-50 rounded-2xl border border-gray-100 flex items-center justify-between group">
                                        <div className="flex items-center gap-3">
                                            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white ${f.type === 'water' ? 'bg-blue-500' : f.type === 'toilet' ? 'bg-gray-400' : f.type === 'gym' ? 'bg-orange-500' : 'bg-indigo-500'}`}>
                                                <MapPin size={20} />
                                            </div>
                                            <div>
                                                <p className="text-sm font-black text-gray-800">{f.name}</p>
                                                <p className="text-xs font-bold text-gray-400">{f.type}</p>
                                            </div>
                                        </div>
                                        <button className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all">
                                            <Trash2 size={18} />
                                        </button>
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
