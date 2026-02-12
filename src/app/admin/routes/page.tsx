'use client';

// Force dynamic rendering to prevent SSR issues with window/localStorage
export const dynamic = 'force-dynamic';

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
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
    Globe,
    MapPin,
    MousePointerClick,
    Building2,
    Search,
    Package,
    Calendar,
    RefreshCw,
    X,
    ArrowRight,
    FlaskConical,
    Filter,
    Dumbbell,
    Sparkles,
} from 'lucide-react';
import dynamicImport from 'next/dynamic';
import { GISParserService } from '@/features/parks';
import { Route, ActivityType } from '@/features/parks';
import { InventoryService, ImportBatchSummary, RouteStitchingService } from '@/features/parks';
import { GISIntegrationService, GISFetchProgress } from '@/features/parks/core/services/gis-integration.service';
import { Park } from '@/features/parks/core/types/park.types';
import { getParksByAuthority } from '@/features/parks/core/services/parks.service';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { checkUserRole, isOnlyAuthorityManager } from '@/features/admin/services/auth.service';
import { getAllAuthorities } from '@/features/admin/services/authority.service';
import { Authority } from '@/types/admin-types';

// Dynamic import for Map to avoid SSR issues
const Map = dynamicImport(
    () => import('react-map-gl').then(mod => mod.default),
    { ssr: false, loading: () => <div className="h-full w-full bg-gray-100 animate-pulse rounded-2xl" /> }
);
const Source = dynamicImport(
    () => import('react-map-gl').then(mod => mod.Source),
    { ssr: false }
);
const Layer = dynamicImport(
    () => import('react-map-gl').then(mod => mod.Layer),
    { ssr: false }
);
const Marker = dynamicImport(
    () => import('react-map-gl').then(mod => mod.Marker),
    { ssr: false }
);
const Popup = dynamicImport(
    () => import('react-map-gl').then(mod => mod.Popup),
    { ssr: false }
);
import 'mapbox-gl/dist/mapbox-gl.css';

const MAPBOX_TOKEN = "pk.eyJ1IjoiZGF2aWQtb3V0IiwiYSI6ImNtanZpZmJ0djM5MTEzZXF5YXNmcm9zNGwifQ.8MD8s4TZOr0WYYgEpFfpzw";

type Tab = 'add' | 'inventory' | 'imports' | 'lab';

// ── Lab Helper Functions ──────────────────────────────────────────────

type LabActivityMode = ActivityType | 'yoga' | 'all';

/** Get marker color & emoji for a park/facility based on its type */
function getFacilityMarkerConfig(park: Park): { color: string; emoji: string; label: string } {
    if (park.urbanType === 'water_fountain' || park.hasWaterFountain)
        return { color: '#3B82F6', emoji: '💧', label: 'ברזיית מים' };
    if (park.facilityType === 'gym_park')
        return { color: '#F97316', emoji: '🏋️', label: 'מתקני כושר' };
    if (park.urbanType === 'stairs')
        return { color: '#6B7280', emoji: '🪜', label: 'מדרגות' };
    if (park.urbanType === 'bench')
        return { color: '#D97706', emoji: '🪑', label: 'ספסל' };
    if (park.natureType === 'observation_point')
        return { color: '#10B981', emoji: '🌅', label: 'תצפית נוף' };
    if (park.natureType === 'spring')
        return { color: '#06B6D4', emoji: '💧', label: 'מעיין' };
    if (park.facilityType === 'zen_spot')
        return { color: '#8B5CF6', emoji: '🧘', label: 'אזור שקט' };
    return { color: '#9CA3AF', emoji: '📍', label: park.facilityType || 'מתקן' };
}

/** Get polyline color for an infrastructure segment */
function getInfraLayerColor(route: Route): string {
    const mode = route.infrastructureMode || 'shared';
    if (mode === 'cycling') return '#A78BFA';   // Purple-400
    if (mode === 'pedestrian') return '#34D399'; // Green-400
    return '#FBBF24'; // Amber-400 for shared
}

/** Get polyline color for a curated route */
function getCuratedRouteColor(route: Route): string {
    if (route.isHybrid) return '#F97316';
    if (route.activityType === 'cycling' || route.type === 'cycling') return '#8B5CF6';
    if (route.activityType === 'running' || route.type === 'running') return '#06B6D4';
    return '#10B981';
}

/** Get activity emoji */
function getActivityEmoji(type?: ActivityType | string): string {
    if (type === 'running') return '🏃';
    if (type === 'walking') return '🚶';
    if (type === 'cycling') return '🚴';
    if (type === 'workout') return '🏋️';
    return '🛤️';
}

/** Build a short facility summary from a route's facilityStops */
function getFacilitySummary(route: Route): string {
    if (!route.facilityStops || route.facilityStops.length === 0) return '—';
    const counts: Record<string, number> = {};
    for (const stop of route.facilityStops) {
        const label = stop.type || 'Unknown';
        counts[label] = (counts[label] || 0) + 1;
    }
    return Object.entries(counts).map(([type, count]) => `${count} ${type}`).join(', ');
}

/** Haversine distance between two [lng, lat] points in meters */
function haversineMeters(p1: [number, number], p2: [number, number]): number {
    const R = 6371e3;
    const lat1 = (p1[1] * Math.PI) / 180;
    const lat2 = (p2[1] * Math.PI) / 180;
    const dLat = ((p2[1] - p1[1]) * Math.PI) / 180;
    const dLng = ((p2[0] - p1[0]) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Compute total KM for an array of routes by summing Haversine distances */
function computeTotalKm(routes: Route[]): number {
    let totalMeters = 0;
    for (const r of routes) {
        if (r.path && r.path.length >= 2) {
            for (let i = 1; i < r.path.length; i++) {
                totalMeters += haversineMeters(r.path[i - 1], r.path[i]);
            }
        }
    }
    return Math.round((totalMeters / 1000) * 10) / 10;
}

/** Check if a facility matches a specific layer filter category */
function matchesFacilityLayer(park: Park): 'water_fountain' | 'gym_park' | 'stairs' | 'bench' | 'scenic' | 'spring' | 'zen' | null {
    if (park.urbanType === 'water_fountain' || park.hasWaterFountain) return 'water_fountain';
    if (park.facilityType === 'gym_park') return 'gym_park';
    if (park.urbanType === 'stairs') return 'stairs';
    if (park.urbanType === 'bench') return 'bench';
    if (park.natureType === 'observation_point') return 'scenic';
    if (park.natureType === 'spring') return 'spring';
    if (park.facilityType === 'zen_spot') return 'zen';
    return null;
}

export default function AdminRouteManager() {
    const [activeTab, setActiveTab] = useState<Tab>('add');
    const [sourceType, setSourceType] = useState<'file' | 'url'>('file');
    const [externalUrl, setExternalUrl] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [previewRoutes, setPreviewRoutes] = useState<Route[]>([]);

    // Inventory state
    const [existingRoutes, setExistingRoutes] = useState<Route[]>([]);
    const [isAuthorityManagerOnly, setIsAuthorityManagerOnly] = useState(false);
    const [userAuthorityIds, setUserAuthorityIds] = useState<string[]>([]);

    // Authority / City state
    const [authorities, setAuthorities] = useState<Authority[]>([]);
    const [selectedAuthorityId, setSelectedAuthorityId] = useState('');
    const [authoritySearch, setAuthoritySearch] = useState('');
    const [showAuthorityDropdown, setShowAuthorityDropdown] = useState(false);

    // Import batch management state
    const [importBatches, setImportBatches] = useState<ImportBatchSummary[]>([]);
    const [isDeletingBatch, setIsDeletingBatch] = useState<string | null>(null);
    const [lastImportFileName, setLastImportFileName] = useState('');

    // Full pipeline state (Fetch → Save → Stitch)
    const [isPipelineRunning, setIsPipelineRunning] = useState(false);
    const [pipelinePhase, setPipelinePhase] = useState<string>('');
    const [pipelineDetail, setPipelineDetail] = useState<string>('');
    const [pipelinePercent, setPipelinePercent] = useState(0);
    const [pipelineResult, setPipelineResult] = useState<string | null>(null);
    const [fetchProgress, setFetchProgress] = useState<GISFetchProgress | null>(null);

    // Hero Loop Regeneration state
    const [isRegenerating, setIsRegenerating] = useState(false);
    const [regenProgress, setRegenProgress] = useState<{ phase: string; detail: string; percent: number } | null>(null);
    const [regenResult, setRegenResult] = useState<string | null>(null);
    const [regenActivityType, setRegenActivityType] = useState<ActivityType>('running');
    const [enableHybrid, setEnableHybrid] = useState(true);

    // ── Lab (Testing Lab) State ─────────────────────────────────────────
    const [labAuthorityId, setLabAuthorityId] = useState('');
    const [labAuthoritySearch, setLabAuthoritySearch] = useState('');
    const [showLabAuthorityDropdown, setShowLabAuthorityDropdown] = useState(false);
    const [labActivityMode, setLabActivityMode] = useState<LabActivityMode>('all');
    const [labInfraLayers, setLabInfraLayers] = useState({ cycling: true, pedestrian: true, shared: true });
    const [labFacilityLayers, setLabFacilityLayers] = useState({ water_fountain: true, gym_park: true, stairs: true, bench: true });
    const [labPoiLayers, setLabPoiLayers] = useState({ scenic: true, spring: true, zen: true });

    // Lab data
    const [labInfraRoutes, setLabInfraRoutes] = useState<Route[]>([]);
    const [labCuratedRoutes, setLabCuratedRoutes] = useState<Route[]>([]);
    const [labParks, setLabParks] = useState<Park[]>([]);
    const [isLabLoading, setIsLabLoading] = useState(false);
    const [labHighlightedRouteId, setLabHighlightedRouteId] = useState<string | null>(null);
    const [labHoveredFacility, setLabHoveredFacility] = useState<Park | null>(null);
    const [labPioneerMessage, setLabPioneerMessage] = useState<string | null>(null);
    const labMapRef = useRef<any>(null);

    // Lab derived
    const labAuthority = authorities.find(a => a.id === labAuthorityId);
    const filteredLabAuthorities = labAuthoritySearch
        ? authorities.filter(a => a.name?.toLowerCase().includes(labAuthoritySearch.toLowerCase()))
        : authorities;

    // Derived
    const selectedAuthority = authorities.find(a => a.id === selectedAuthorityId);
    const filteredAuthorities = authoritySearch
        ? authorities.filter(a => a.name?.toLowerCase().includes(authoritySearch.toLowerCase()))
        : authorities;
    // Check user role on mount + load authorities
    useEffect(() => {
        getAllAuthorities().then(setAuthorities).catch(console.error);
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
        if (activeTab === 'imports') {
            loadImportBatches();
        }
    }, [activeTab, userAuthorityIds]);

    const loadInventory = async () => {
        setIsSubmitting(true);
        try {
            const routes = await InventoryService.fetchOfficialRoutes(
                isAuthorityManagerOnly && userAuthorityIds.length > 0 
                    ? userAuthorityIds 
                    : undefined
            );
            setExistingRoutes(routes);
        } catch (err) {
            console.error('Failed to load inventory:', err);
        } finally {
            setIsSubmitting(false);
        }
    };

    const loadImportBatches = async () => {
        try {
            const batches = await InventoryService.fetchImportBatches();
            setImportBatches(batches);
        } catch (err) {
            console.error('Failed to load import batches:', err);
        }
    };

    const handleDeleteBatch = async (batchId: string) => {
        if (!confirm(`האם למחוק את כל המסלולים בייבוא "${batchId}"? פעולה זו אינה הפיכה.`)) return;
        setIsDeletingBatch(batchId);
        try {
            const count = await InventoryService.deleteImportBatch(batchId);
            alert(`${count} מסלולים נמחקו בהצלחה`);
            await loadImportBatches();
            // Also refresh inventory if visible
            if (existingRoutes.length > 0) await loadInventory();
        } catch {
            alert('שגיאה במחיקת הייבוא');
        } finally {
            setIsDeletingBatch(null);
        }
    };

    // ── Lab: Data Loader ────────────────────────────────────────────────
    const loadLabData = useCallback(async () => {
        if (!labAuthorityId) return;
        setIsLabLoading(true);
        setLabPioneerMessage(null);
        try {
            const [infraRoutes, curatedRoutes, parks] = await Promise.all([
                InventoryService.fetchInfrastructureByAuthority(labAuthorityId),
                InventoryService.fetchCuratedRoutesByAuthority(labAuthorityId),
                getParksByAuthority(labAuthorityId),
            ]);
            setLabInfraRoutes(infraRoutes);
            setLabCuratedRoutes(curatedRoutes);
            setLabParks(parks);
        } catch (err) {
            console.error('Lab data fetch error:', err);
        } finally {
            setIsLabLoading(false);
        }
    }, [labAuthorityId]);

    // Load lab data when tab or authority changes
    useEffect(() => {
        if (activeTab === 'lab' && labAuthorityId) {
            loadLabData();
        }
    }, [activeTab, labAuthorityId, loadLabData]);

    // ── Lab: Filtered Data (useMemo) ──────────────────────────────────
    const filteredLabInfra = useMemo(() => {
        return labInfraRoutes.filter(r => {
            const mode = (r.infrastructureMode || 'shared') as keyof typeof labInfraLayers;
            return labInfraLayers[mode] ?? true;
        });
    }, [labInfraRoutes, labInfraLayers]);

    const filteredLabCurated = useMemo(() => {
        // Smart Sync: Yoga/static → hide all routes
        if (labActivityMode === 'yoga') return [];
        if (labActivityMode === 'all') return labCuratedRoutes;
        return labCuratedRoutes.filter(r =>
            r.activityType === labActivityMode || r.type === labActivityMode
        );
    }, [labCuratedRoutes, labActivityMode]);

    const filteredLabFacilities = useMemo(() => {
        // Smart Sync: Yoga → show ONLY scenic/zen POIs
        const isYoga = labActivityMode === 'yoga';

        return labParks.filter(p => {
            const category = matchesFacilityLayer(p);
            if (!category) return !isYoga; // show uncategorized parks unless yoga mode

            // Facility layers
            if (category === 'water_fountain') return !isYoga && labFacilityLayers.water_fountain;
            if (category === 'gym_park') return !isYoga && labFacilityLayers.gym_park;
            if (category === 'stairs') return !isYoga && labFacilityLayers.stairs;
            if (category === 'bench') return !isYoga && labFacilityLayers.bench;

            // POI layers
            if (category === 'scenic') return labPoiLayers.scenic;
            if (category === 'spring') return labPoiLayers.spring;
            if (category === 'zen') return labPoiLayers.zen;

            return !isYoga;
        });
    }, [labParks, labFacilityLayers, labPoiLayers, labActivityMode]);

    // ── Lab: Filtered Stats ───────────────────────────────────────────
    const labFilteredStats = useMemo(() => {
        const totalKm = computeTotalKm(filteredLabInfra);
        return {
            totalKm,
            segmentCount: filteredLabInfra.length,
            curatedCount: filteredLabCurated.length,
            facilitiesCount: filteredLabFacilities.length,
        };
    }, [filteredLabInfra, filteredLabCurated, filteredLabFacilities]);

    // ── Lab: Pioneer Card Detection ───────────────────────────────────
    useEffect(() => {
        if (labInfraRoutes.length === 0 && labCuratedRoutes.length === 0) {
            setLabPioneerMessage(null);
            return;
        }
        if (labActivityMode === 'all' || labActivityMode === 'yoga') {
            setLabPioneerMessage(null);
            return;
        }
        // Check if any infra or curated routes exist for this activity
        const hasCompatibleInfra = labInfraRoutes.some(r => {
            const mode = r.infrastructureMode || 'shared';
            if (labActivityMode === 'cycling') return mode === 'cycling' || mode === 'shared';
            return mode === 'pedestrian' || mode === 'shared';
        });
        const hasCompatibleCurated = labCuratedRoutes.some(r =>
            r.activityType === labActivityMode || r.type === labActivityMode
        );
        if (!hasCompatibleInfra && !hasCompatibleCurated) {
            const activityLabel = labActivityMode === 'running' ? 'ריצה' : labActivityMode === 'walking' ? 'הליכה' : labActivityMode === 'cycling' ? 'רכיבה' : labActivityMode;
            setLabPioneerMessage(`⚠️ לא נמצאה תשתית תואמת עבור ${activityLabel} ברשות זו`);
        } else {
            setLabPioneerMessage(null);
        }
    }, [labActivityMode, labInfraRoutes, labCuratedRoutes]);

    // ── Lab: Route Row → fitBounds ────────────────────────────────────
    const handleLabRouteClick = useCallback((route: Route) => {
        setLabHighlightedRouteId(route.id);
        const map = labMapRef.current?.getMap?.();
        if (!map || !route.path || route.path.length < 2) return;

        let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
        for (const [lng, lat] of route.path) {
            if (lng < minLng) minLng = lng;
            if (lng > maxLng) maxLng = lng;
            if (lat < minLat) minLat = lat;
            if (lat > maxLat) maxLat = lat;
        }
        // Include facility stops in bounds
        if (route.facilityStops) {
            for (const stop of route.facilityStops) {
                if (stop.lng < minLng) minLng = stop.lng;
                if (stop.lng > maxLng) maxLng = stop.lng;
                if (stop.lat < minLat) minLat = stop.lat;
                if (stop.lat > maxLat) maxLat = stop.lat;
            }
        }

        try {
            map.fitBounds([[minLng, minLat], [maxLng, maxLat]], {
                padding: { top: 60, bottom: 60, left: 60, right: 60 },
                duration: 800,
                maxZoom: 16,
            });
        } catch { /* map not ready */ }

        // Auto-clear highlight after 5s
        setTimeout(() => setLabHighlightedRouteId(prev => prev === route.id ? null : prev), 5000);
    }, []);

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

        setLastImportFileName(file.name);

        try {
            const json = await GISParserService.parseFile(file);
            const parsed = GISParserService.parseGeoJSON(json, {
                activity: classification.activity,
                terrain: classification.terrain,
                environment: classification.environment,
                difficulty: classification.difficulty
            });
            setPreviewRoutes(parsed);
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

    /** Extract a friendly source name from an ArcGIS URL */
    const extractSourceName = (url: string): string => {
        try {
            const parts = url.split('/');
            return parts.find(p => p.includes('Server') || p.includes('Service')) || parts[parts.length - 1] || 'ArcGIS';
        } catch {
            return 'ArcGIS';
        }
    };

    /** Preview-only: fetch from URL and display on map (no save) */
    const handleUrlSync = async () => {
        if (!externalUrl) return;
        try {
            setIsSubmitting(true);
            const sourceName = extractSourceName(externalUrl);
            setLastImportFileName(sourceName);

            const paths = await GISIntegrationService.fetchFromArcGIS(
                externalUrl,
                classification,
                (p) => setFetchProgress(p)
            );
            setPreviewRoutes(paths);
            setFetchProgress(null);
        } catch (err) {
            setFetchProgress(null);
            alert('סנכרון נכשל. וודא שהכתובת תקינה והשרת זמין.');
        } finally {
            setIsSubmitting(false);
        }
    };

    /**
     * Full Pipeline: Fetch → Tag as Infrastructure → Save → Stitch
     * One-click operation for ingesting a new GIS source.
     */
    const handleFullPipeline = async () => {
        if (!externalUrl) {
            alert('יש להזין כתובת URL');
            return;
        }
        if (!selectedAuthorityId || !selectedAuthority) {
            alert('אנא בחר רשות לפני משיכת נתונים');
            return;
        }

        setIsPipelineRunning(true);
        setPipelineResult(null);

        try {
            // ── Phase 1: Fetch ───────────────────────────────────────────
            setPipelinePhase('fetch');
            setPipelineDetail('מוריד נתונים מה-API...');
            setPipelinePercent(5);

            const sourceName = extractSourceName(externalUrl);

            const routes = await GISIntegrationService.fetchFromArcGIS(
                externalUrl,
                classification,
                (p) => {
                    setPipelineDetail(p.detail);
                    setPipelinePercent(Math.round(p.percent * 0.3)); // 0-30%
                }
            );

            if (routes.length === 0) {
                setPipelineResult('❌ לא נמצאו מסלולים ב-URL שסופק.');
                return;
            }

            // ── Phase 2: Tag & Save ──────────────────────────────────────
            setPipelinePhase('save');
            setPipelineDetail(`שומר ${routes.length} מקטעי תשתית...`);
            setPipelinePercent(35);

            const batchId = `import_${Date.now()}_${sourceName.replace(/[^a-zA-Z0-9_.-]/g, '_')}`;

            // IMPORTANT: never pass `undefined` — Firestore rejects it
            const authorityId = selectedAuthorityId || '';
            const cityName = selectedAuthority?.name || '';

            const enrichedRoutes = routes.map(r => ({
                ...r,
                importBatchId: batchId,
                importSourceName: sourceName,
                authorityId,
                city: cityName,
                isInfrastructure: true,
            }));

            await InventoryService.saveRoutes(enrichedRoutes);

            setPipelineDetail(`${enrichedRoutes.length} מקטעים נשמרו. מפעיל מנוע תפירה...`);
            setPipelinePercent(50);

            // ── Phase 3: Stitch ──────────────────────────────────────────
            setPipelinePhase('stitch');

            const stitchResult = await RouteStitchingService.generateCuratedRoutes(
                selectedAuthorityId,
                selectedAuthority.name || '',
                classification.activity,
                (sp) => {
                    setPipelineDetail(sp.detail);
                    // Map stitching progress (0-100%) to pipeline range (50-95%)
                    setPipelinePercent(50 + Math.round(sp.percent * 0.45));
                }
            );

            // ── Done ─────────────────────────────────────────────────────
            setPipelinePercent(100);
            setPipelinePhase('done');
            setPipelineDetail('הושלם!');

            const dataSourceLabels: Record<string, string> = {
                cycling: '🚴 Cycling Infra',
                pedestrian: '🚶 Pedestrian Infra',
                mixed: '🔀 Mixed',
                none: '⚠️ No compatible infra',
            };

            const summary = [
                `✅ צינור מלא הושלם עבור "${selectedAuthority.name}"`,
                `📥 ${enrichedRoutes.length} מקטעי תשתית נשמרו`,
                `🛤️ ${stitchResult.stats.tiersGenerated} מסלולי Hero Loop נוצרו`,
                `📏 ${stitchResult.stats.totalInfrastructureKm} ק"מ תשתית`,
                `🏋️ ${stitchResult.stats.hybridRoutes || 0} היברידיים`,
                `📍 ${stitchResult.stats.clustersFound || 0} אשכולות`,
                `${dataSourceLabels[stitchResult.stats.dataSource] || ''} (${stitchResult.stats.compatibleSegments}/${stitchResult.stats.segmentsProcessed} תואמים)`,
            ].join(' | ');
            setPipelineResult(summary);

            // Refresh data views
            setPreviewRoutes(enrichedRoutes);
            await loadImportBatches();
            if (existingRoutes.length > 0) await loadInventory();
        } catch (err) {
            console.error('Pipeline error:', err);
            setPipelineResult('❌ שגיאה בהפעלת הצינור. ראה קונסול לפרטים.');
        } finally {
            setIsPipelineRunning(false);
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
                    <Link
                        href="/admin/routes/new"
                        className="flex items-center gap-2 bg-white text-gray-700 px-5 py-2.5 rounded-2xl font-bold shadow-sm border border-gray-100 hover:bg-gray-50 transition-all"
                    >
                        <MousePointerClick size={18} />
                        <span>ציור ידני</span>
                    </Link>
                    <button
                        className="flex items-center gap-2 bg-white text-gray-700 px-5 py-2.5 rounded-2xl font-bold shadow-sm border border-gray-100 hover:bg-gray-50 transition-all"
                        onClick={() => setPreviewRoutes([])}
                    >
                        <Trash2 size={18} />
                        <span>נקה תצוגה</span>
                    </button>
                    <button
                        disabled={previewRoutes.length === 0 || isSubmitting}
                        className="flex items-center gap-2 bg-cyan-500 text-white px-8 py-2.5 rounded-2xl font-bold shadow-lg shadow-cyan-200 hover:bg-cyan-600 transition-all disabled:opacity-50 disabled:shadow-none"
                        onClick={async () => {
                            setIsSubmitting(true);
                            try {
                                // Generate a unique import batch ID
                                const batchId = `import_${Date.now()}_${lastImportFileName.replace(/[^a-zA-Z0-9_.-]/g, '_') || 'unknown'}`;
                                const sourceName = lastImportFileName || 'Unknown Source';

                                // Inject batch tracking + authority + infrastructure flag into every route
                                // IMPORTANT: never pass `undefined` — Firestore rejects it
                                const enrichedRoutes = previewRoutes.map(r => ({
                                    ...r,
                                    importBatchId: batchId,
                                    importSourceName: sourceName,
                                    authorityId: selectedAuthorityId || r.authorityId || '',
                                    city: selectedAuthority?.name || r.city || '',
                                    isInfrastructure: true, // GIS imports are always infrastructure
                                }));

                                await InventoryService.saveRoutes(enrichedRoutes);
                                alert(`${enrichedRoutes.length} מסלולים נשמרו בהצלחה במערכת!`);
                                setPreviewRoutes([]);
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
                        <span>שמור למאגר ({previewRoutes.length})</span>
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex p-1 bg-gray-100 rounded-2xl w-full max-w-lg">
                {[
                    { id: 'add' as Tab, label: 'הוספת נתונים', icon: Plus },
                    { id: 'inventory' as Tab, label: 'מלאי קיים', icon: Layers },
                    { id: 'imports' as Tab, label: 'ניהול ייבואים', icon: Package },
                    { id: 'lab' as Tab, label: 'מעבדת בדיקות', icon: FlaskConical },
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

            {/* Authority / City Bulk Assignment (shown in add tab) */}
            {activeTab === 'add' && (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                    <div className="flex items-center gap-3 mb-3">
                        <Building2 size={18} className="text-cyan-500" />
                        <h3 className="font-bold text-gray-800 text-sm">שיוך גורף לרשות / עיר</h3>
                        <span className="text-[10px] bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full font-bold">חל על כל המסלולים בייבוא</span>
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
                                    className="w-full pr-9 pl-3 py-2.5 bg-gray-50 rounded-xl border-2 border-transparent focus:border-cyan-400 focus:bg-white transition-all outline-none text-sm"
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
                            כל המסלולים ישויכו ל&quot;{selectedAuthority.name}&quot;
                        </p>
                    )}
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Sidebar Controls - Only show in 'add' tab */}
                {activeTab === 'add' && (
                    <div className="lg:col-span-4 space-y-6">
                        <div className="bg-white p-6 rounded-3xl shadow-premium border border-gray-50 space-y-8">
                            <h2 className="text-xl font-black text-gray-800 flex items-center gap-2">
                                <Plus className="text-cyan-500" size={20} />
                                הגדרות קליטת נתונים
                            </h2>

                            {/* Route Classification */}
                            <div className="space-y-8">
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
                            </div>

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
                                            <label className="text-xs font-bold text-cyan-700">הדבק כתובת ArcGIS REST כאן:</label>
                                            <div className="flex gap-2">
                                                <input
                                                    type="text"
                                                    value={externalUrl}
                                                    onChange={(e) => setExternalUrl(e.target.value)}
                                                    placeholder="https://gisn.tel-aviv.gov.il/arcgis/rest/services/..."
                                                    className="flex-1 bg-white border border-cyan-100 px-4 py-2 text-xs rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-500 text-left"
                                                    dir="ltr"
                                                />
                                                {externalUrl && (
                                                    <button
                                                        onClick={() => setExternalUrl('')}
                                                        className="text-gray-400 hover:text-red-500 transition-all"
                                                    >
                                                        <X size={16} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        {/* Two action buttons: Preview OR Full Pipeline */}
                                        <div className="grid grid-cols-2 gap-2">
                                            <button
                                                onClick={handleUrlSync}
                                                disabled={isSubmitting || isPipelineRunning || !externalUrl}
                                                className="flex items-center justify-center gap-2 bg-gray-100 text-gray-700 px-3 py-2.5 rounded-xl font-bold text-xs hover:bg-gray-200 transition-all disabled:opacity-50"
                                            >
                                                {isSubmitting ? (
                                                    <Loader2 className="animate-spin" size={14} />
                                                ) : (
                                                    <Eye size={14} />
                                                )}
                                                תצוגה מקדימה
                                            </button>
                                            <button
                                                onClick={handleFullPipeline}
                                                disabled={isSubmitting || isPipelineRunning || !externalUrl || !selectedAuthorityId}
                                                className="flex items-center justify-center gap-2 bg-gradient-to-l from-amber-500 to-cyan-500 text-white px-3 py-2.5 rounded-xl font-bold text-xs hover:opacity-90 transition-all disabled:opacity-50 shadow-lg"
                                            >
                                                {isPipelineRunning ? (
                                                    <Loader2 className="animate-spin" size={14} />
                                                ) : (
                                                    <Zap size={14} />
                                                )}
                                                משוך → שמור → תפור
                                            </button>
                                        </div>

                                        {!selectedAuthorityId && (
                                            <p className="text-[10px] text-amber-600 font-bold px-2 flex items-center gap-1">
                                                <ArrowRight size={10} className="rotate-90" />
                                                לצינור המלא, בחרו רשות/עיר למעלה
                                            </p>
                                        )}

                                        {/* Fetch progress (preview only) */}
                                        {isSubmitting && fetchProgress && (
                                            <div className="bg-white p-3 rounded-xl border border-cyan-100">
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className="text-[10px] font-bold text-gray-600">{fetchProgress.detail}</span>
                                                    <span className="text-[10px] font-bold text-cyan-600">{fetchProgress.featuresSoFar} תכונות</span>
                                                </div>
                                                <div className="w-full bg-gray-100 rounded-full h-1.5">
                                                    <div className="bg-cyan-500 h-1.5 rounded-full transition-all" style={{ width: `${fetchProgress.percent}%` }} />
                                                </div>
                                            </div>
                                        )}

                                        {/* Pipeline progress */}
                                        {isPipelineRunning && (
                                            <div className="bg-white p-4 rounded-xl border border-amber-200 space-y-2">
                                                <div className="flex items-center gap-2">
                                                    <Loader2 className="animate-spin text-amber-500" size={14} />
                                                    <span className="text-xs font-black text-gray-800">
                                                        {pipelinePhase === 'fetch' && '🌐 שלב 1/3 — הורדת נתונים'}
                                                        {pipelinePhase === 'save' && '💾 שלב 2/3 — שמירת תשתיות'}
                                                        {pipelinePhase === 'stitch' && '🧵 שלב 3/3 — תפירת מסלולים'}
                                                        {pipelinePhase === 'done' && '✅ הושלם!'}
                                                    </span>
                                                </div>
                                                <p className="text-[10px] text-gray-500">{pipelineDetail}</p>
                                                <div className="w-full bg-gray-100 rounded-full h-2">
                                                    <div
                                                        className="bg-gradient-to-l from-amber-500 to-cyan-500 h-2 rounded-full transition-all duration-500"
                                                        style={{ width: `${pipelinePercent}%` }}
                                                    />
                                                </div>
                                                <p className="text-[10px] text-left text-gray-400 font-mono" dir="ltr">{pipelinePercent}%</p>
                                            </div>
                                        )}

                                        {/* Pipeline result */}
                                        {pipelineResult && !isPipelineRunning && (
                                            <div className={`p-3 rounded-xl text-xs font-bold ${pipelineResult.includes('❌') ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-700'}`}>
                                                {pipelineResult}
                                            </div>
                                        )}

                                        <p className="text-[10px] text-gray-400 px-2">
                                            * המערכת מטפלת אוטומטית ב-Pagination, המרת EsriJSON ותיוג כ-Infrastructure.
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* ── Lab Sidebar ─────────────────────────────────────────── */}
                {activeTab === 'lab' && (
                    <div className="lg:col-span-4 space-y-4 max-h-[calc(100vh-200px)] overflow-y-auto custom-scrollbar">
                        {/* Stats Banner */}
                        <div className="bg-gradient-to-l from-purple-600 to-indigo-600 rounded-2xl p-4 text-white">
                            <div className="flex items-center gap-2 mb-3">
                                <FlaskConical size={18} />
                                <h3 className="font-black text-sm">מעבדת בדיקות</h3>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <div className="bg-white/15 rounded-xl p-2.5 text-center backdrop-blur-sm">
                                    <p className="text-lg font-black">{labFilteredStats.totalKm}</p>
                                    <p className="text-[10px] opacity-80">ק&quot;מ תשתית</p>
                                </div>
                                <div className="bg-white/15 rounded-xl p-2.5 text-center backdrop-blur-sm">
                                    <p className="text-lg font-black">{labFilteredStats.segmentCount}</p>
                                    <p className="text-[10px] opacity-80">מקטעים</p>
                                </div>
                                <div className="bg-white/15 rounded-xl p-2.5 text-center backdrop-blur-sm">
                                    <p className="text-lg font-black">{labFilteredStats.curatedCount}</p>
                                    <p className="text-[10px] opacity-80">מסלולים</p>
                                </div>
                                <div className="bg-white/15 rounded-xl p-2.5 text-center backdrop-blur-sm">
                                    <p className="text-lg font-black">{labFilteredStats.facilitiesCount}</p>
                                    <p className="text-[10px] opacity-80">מתקנים</p>
                                </div>
                            </div>
                        </div>

                        {/* Pioneer Card */}
                        {labPioneerMessage && (
                            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                                <div className="flex items-start gap-2">
                                    <AlertCircle size={16} className="text-amber-500 mt-0.5 flex-shrink-0" />
                                    <p className="text-xs font-bold text-amber-700">{labPioneerMessage}</p>
                                </div>
                            </div>
                        )}

                        {/* Authority Selector */}
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                            <div className="flex items-center gap-2 mb-3">
                                <Building2 size={16} className="text-indigo-500" />
                                <h4 className="font-black text-gray-800 text-xs uppercase tracking-wider">רשות / עיר</h4>
                            </div>
                            <div className="relative">
                                <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input
                                    type="text"
                                    value={labAuthoritySearch}
                                    onChange={(e) => { setLabAuthoritySearch(e.target.value); setShowLabAuthorityDropdown(true); }}
                                    onFocus={() => setShowLabAuthorityDropdown(true)}
                                    placeholder={labAuthority ? labAuthority.name : 'חפש רשות...'}
                                    className="w-full pr-9 pl-3 py-2 bg-gray-50 rounded-xl border-2 border-transparent focus:border-indigo-400 focus:bg-white transition-all outline-none text-sm"
                                />
                                {showLabAuthorityDropdown && labAuthoritySearch && (
                                    <div className="absolute top-full mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg z-30 max-h-40 overflow-y-auto">
                                        {filteredLabAuthorities.slice(0, 10).map(a => (
                                            <button
                                                key={a.id}
                                                type="button"
                                                className="w-full px-4 py-2 text-right text-sm hover:bg-gray-50 flex items-center gap-2"
                                                onClick={() => {
                                                    setLabAuthorityId(a.id);
                                                    setLabAuthoritySearch('');
                                                    setShowLabAuthorityDropdown(false);
                                                }}
                                            >
                                                <Building2 size={14} className="text-gray-300" />
                                                <span className="font-bold text-gray-700">{a.name}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                            {labAuthority && (
                                <div className="flex items-center justify-between mt-2">
                                    <p className="text-xs text-green-600 flex items-center gap-1">
                                        <CheckCircle2 size={12} />
                                        {labAuthority.name}
                                    </p>
                                    <button
                                        onClick={() => { setLabAuthorityId(''); setLabAuthoritySearch(''); setLabInfraRoutes([]); setLabCuratedRoutes([]); setLabParks([]); }}
                                        className="text-gray-400 hover:text-red-500 text-xs"
                                    >
                                        <X size={14} />
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Activity Mode */}
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                            <div className="flex items-center gap-2 mb-3">
                                <Filter size={16} className="text-indigo-500" />
                                <h4 className="font-black text-gray-800 text-xs uppercase tracking-wider">מצב פעילות</h4>
                            </div>
                            <div className="grid grid-cols-5 gap-1.5">
                                {([
                                    { id: 'all' as LabActivityMode, label: 'הכל', emoji: '🌍' },
                                    { id: 'running' as LabActivityMode, label: 'ריצה', emoji: '🏃' },
                                    { id: 'walking' as LabActivityMode, label: 'הליכה', emoji: '🚶' },
                                    { id: 'cycling' as LabActivityMode, label: 'רכיבה', emoji: '🚴' },
                                    { id: 'yoga' as LabActivityMode, label: 'יוגה', emoji: '🧘' },
                                ] as const).map(opt => (
                                    <button
                                        key={opt.id}
                                        onClick={() => setLabActivityMode(opt.id)}
                                        className={`flex flex-col items-center gap-1 p-2 rounded-xl text-[10px] font-bold transition-all ${
                                            labActivityMode === opt.id
                                                ? 'bg-indigo-100 text-indigo-700 border-2 border-indigo-400 shadow-sm'
                                                : 'bg-gray-50 text-gray-500 border-2 border-transparent hover:bg-gray-100'
                                        }`}
                                    >
                                        <span className="text-base">{opt.emoji}</span>
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Infrastructure Layers */}
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                            <div className="flex items-center gap-2 mb-3">
                                <Layers size={16} className="text-indigo-500" />
                                <h4 className="font-black text-gray-800 text-xs uppercase tracking-wider">שכבות תשתית</h4>
                            </div>
                            <div className="space-y-2">
                                {([
                                    { id: 'cycling' as const, label: '🚴 שבילי אופניים', color: 'purple' },
                                    { id: 'pedestrian' as const, label: '🚶 שבילי הולכי רגל', color: 'green' },
                                    { id: 'shared' as const, label: '↔️ שבילים משותפים', color: 'amber' },
                                ]).map(layer => (
                                    <label key={layer.id} className="flex items-center gap-2.5 cursor-pointer group">
                                        <input
                                            type="checkbox"
                                            checked={labInfraLayers[layer.id]}
                                            onChange={(e) => setLabInfraLayers(prev => ({ ...prev, [layer.id]: e.target.checked }))}
                                            className={`w-4 h-4 rounded border-gray-300 text-${layer.color}-500 focus:ring-${layer.color}-400`}
                                        />
                                        <div className={`w-3 h-1 rounded-full ${layer.color === 'purple' ? 'bg-purple-400' : layer.color === 'green' ? 'bg-green-400' : 'bg-amber-400'}`} />
                                        <span className="text-xs font-bold text-gray-600 group-hover:text-gray-800">{layer.label}</span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        {/* Facility Layers */}
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                            <div className="flex items-center gap-2 mb-3">
                                <Dumbbell size={16} className="text-indigo-500" />
                                <h4 className="font-black text-gray-800 text-xs uppercase tracking-wider">שכבת מתקנים</h4>
                            </div>
                            <div className="space-y-2">
                                {([
                                    { id: 'water_fountain' as const, label: '💧 ברזיות מים', dotColor: 'bg-blue-400' },
                                    { id: 'gym_park' as const, label: '🏋️ מתקני כושר', dotColor: 'bg-orange-400' },
                                    { id: 'stairs' as const, label: '🪜 מדרגות ציבוריות', dotColor: 'bg-gray-400' },
                                    { id: 'bench' as const, label: '🪑 ספסלים', dotColor: 'bg-amber-600' },
                                ]).map(layer => (
                                    <label key={layer.id} className="flex items-center gap-2.5 cursor-pointer group">
                                        <input
                                            type="checkbox"
                                            checked={labFacilityLayers[layer.id]}
                                            onChange={(e) => setLabFacilityLayers(prev => ({ ...prev, [layer.id]: e.target.checked }))}
                                            className="w-4 h-4 rounded border-gray-300 text-indigo-500 focus:ring-indigo-400"
                                        />
                                        <div className={`w-2.5 h-2.5 rounded-full ${layer.dotColor}`} />
                                        <span className="text-xs font-bold text-gray-600 group-hover:text-gray-800">{layer.label}</span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        {/* POI Layers */}
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                            <div className="flex items-center gap-2 mb-3">
                                <Sparkles size={16} className="text-indigo-500" />
                                <h4 className="font-black text-gray-800 text-xs uppercase tracking-wider">נקודות עניין (POI)</h4>
                            </div>
                            <div className="space-y-2">
                                {([
                                    { id: 'scenic' as const, label: '🌅 תצפיות נוף', dotColor: 'bg-emerald-400' },
                                    { id: 'spring' as const, label: '💧 מעיינות / מים', dotColor: 'bg-cyan-400' },
                                    { id: 'zen' as const, label: '🧘 אזורי שקט / Zen', dotColor: 'bg-purple-400' },
                                ]).map(layer => (
                                    <label key={layer.id} className="flex items-center gap-2.5 cursor-pointer group">
                                        <input
                                            type="checkbox"
                                            checked={labPoiLayers[layer.id]}
                                            onChange={(e) => setLabPoiLayers(prev => ({ ...prev, [layer.id]: e.target.checked }))}
                                            className="w-4 h-4 rounded border-gray-300 text-purple-500 focus:ring-purple-400"
                                        />
                                        <div className={`w-2.5 h-2.5 rounded-full ${layer.dotColor}`} />
                                        <span className="text-xs font-bold text-gray-600 group-hover:text-gray-800">{layer.label}</span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        {/* Reload Button */}
                        <button
                            onClick={loadLabData}
                            disabled={!labAuthorityId || isLabLoading}
                            className="w-full flex items-center justify-center gap-2 bg-indigo-50 text-indigo-600 px-4 py-2.5 rounded-xl text-xs font-bold hover:bg-indigo-100 transition-all disabled:opacity-50"
                        >
                            {isLabLoading ? <Loader2 className="animate-spin" size={14} /> : <RefreshCw size={14} />}
                            רענן נתונים
                        </button>
                    </div>
                )}

                {/* Main Content Area */}
                <div className={`${activeTab === 'add' || activeTab === 'lab' ? 'lg:col-span-8' : 'lg:col-span-12'} space-y-6`}>
                    <div className="bg-white rounded-3xl shadow-premium border border-gray-50 overflow-hidden flex flex-col h-[700px]">
                        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-white z-10">
                            <h2 className="text-xl font-black text-gray-800 flex items-center gap-2">
                                <Eye className="text-cyan-500" size={20} />
                                {activeTab === 'add' ? 'תצוגה מקדימה וצביעה' : 'תצוגת מלאי מלאה'}
                            </h2>
                        </div>

                        <div className="flex-1 relative bg-gray-50">
                            <Map
                                ref={activeTab === 'lab' ? labMapRef : undefined}
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

                                {/* ── LAB: Infrastructure Polylines ─────────────── */}
                                {activeTab === 'lab' && filteredLabInfra.map((route) => (
                                    <Source
                                        key={`lab-infra-${route.id}`}
                                        id={`lab-infra-${route.id}`}
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
                                            id={`lab-infra-${route.id}-layer`}
                                            type="line"
                                            paint={{
                                                'line-color': getInfraLayerColor(route),
                                                'line-width': 2.5,
                                                'line-opacity': 0.5,
                                                'line-dasharray': [2, 2],
                                            }}
                                        />
                                    </Source>
                                ))}

                                {/* ── LAB: Curated Route Polylines ─────────────── */}
                                {activeTab === 'lab' && filteredLabCurated.map((route) => {
                                    const isHighlighted = labHighlightedRouteId === route.id;
                                    return (
                                        <Source
                                            key={`lab-curated-${route.id}`}
                                            id={`lab-curated-${route.id}`}
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
                                                id={`lab-curated-${route.id}-layer`}
                                                type="line"
                                                paint={{
                                                    'line-color': isHighlighted ? '#FFFFFF' : getCuratedRouteColor(route),
                                                    'line-width': isHighlighted ? 7 : 5,
                                                    'line-opacity': isHighlighted ? 1 : 0.85,
                                                }}
                                                layout={{
                                                    'line-cap': 'round',
                                                    'line-join': 'round',
                                                }}
                                            />
                                            {/* Glow outline for highlighted route */}
                                            {isHighlighted && (
                                                <Layer
                                                    id={`lab-curated-${route.id}-glow`}
                                                    type="line"
                                                    paint={{
                                                        'line-color': getCuratedRouteColor(route),
                                                        'line-width': 12,
                                                        'line-opacity': 0.3,
                                                        'line-blur': 4,
                                                    }}
                                                    layout={{
                                                        'line-cap': 'round',
                                                        'line-join': 'round',
                                                    }}
                                                />
                                            )}
                                        </Source>
                                    );
                                })}

                                {/* ── LAB: Facility Stop Markers (for highlighted route) ── */}
                                {activeTab === 'lab' && labHighlightedRouteId && (() => {
                                    const highlightedRoute = filteredLabCurated.find(r => r.id === labHighlightedRouteId);
                                    if (!highlightedRoute?.facilityStops) return null;
                                    return highlightedRoute.facilityStops.map((stop, idx) => (
                                        <Marker
                                            key={`lab-stop-${stop.id}-${idx}`}
                                            longitude={stop.lng}
                                            latitude={stop.lat}
                                            anchor="center"
                                        >
                                            <div className="relative">
                                                <div className="absolute inset-0 w-8 h-8 -m-1 rounded-full bg-cyan-400 opacity-40 animate-ping" />
                                                <div className="w-6 h-6 bg-white border-2 border-cyan-500 rounded-full flex items-center justify-center text-[10px] font-black shadow-lg z-10 relative">
                                                    {stop.priority === 1 ? '🏋️' : stop.priority === 2 ? '🪜' : '🪑'}
                                                </div>
                                            </div>
                                        </Marker>
                                    ));
                                })()}

                                {/* ── LAB: Facility / POI Markers ─────────────── */}
                                {activeTab === 'lab' && filteredLabFacilities.map((park) => {
                                    const config = getFacilityMarkerConfig(park);
                                    return (
                                        <Marker
                                            key={`lab-fac-${park.id}`}
                                            longitude={park.location?.lng || park.lng || 0}
                                            latitude={park.location?.lat || park.lat || 0}
                                            anchor="center"
                                            onClick={(e) => {
                                                e.originalEvent.stopPropagation();
                                                setLabHoveredFacility(park);
                                            }}
                                        >
                                            <div
                                                className="cursor-pointer group relative"
                                                title={`${park.name} — ${config.label}`}
                                            >
                                                <div
                                                    className="w-7 h-7 rounded-full flex items-center justify-center text-xs shadow-lg border-2 border-white transform transition-transform group-hover:scale-125"
                                                    style={{ backgroundColor: config.color }}
                                                >
                                                    <span style={{ fontSize: '12px', lineHeight: 1 }}>{config.emoji}</span>
                                                </div>
                                                {/* Tooltip on hover */}
                                                <div className="absolute -bottom-7 left-1/2 -translate-x-1/2 bg-black/85 text-white text-[9px] px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-20 font-bold">
                                                    {park.name}
                                                </div>
                                            </div>
                                        </Marker>
                                    );
                                })}

                                {/* ── LAB: Popup for selected facility ─────── */}
                                {activeTab === 'lab' && labHoveredFacility && (
                                    <Popup
                                        longitude={labHoveredFacility.location?.lng || labHoveredFacility.lng || 0}
                                        latitude={labHoveredFacility.location?.lat || labHoveredFacility.lat || 0}
                                        anchor="bottom"
                                        offset={20}
                                        onClose={() => setLabHoveredFacility(null)}
                                        closeButton={false}
                                        className="z-50"
                                    >
                                        <div className="p-3 min-w-[180px] bg-white rounded-xl shadow-xl border border-gray-100 text-right" dir="rtl">
                                            <div className="flex items-center gap-2 mb-2 justify-between">
                                                <h4 className="font-black text-gray-800 text-sm">{labHoveredFacility.name}</h4>
                                                <div className="p-1 rounded-lg" style={{ backgroundColor: getFacilityMarkerConfig(labHoveredFacility).color + '20' }}>
                                                    <span className="text-sm">{getFacilityMarkerConfig(labHoveredFacility).emoji}</span>
                                                </div>
                                            </div>
                                            <div className="space-y-1">
                                                <p className="text-[10px] font-bold text-gray-400">{getFacilityMarkerConfig(labHoveredFacility).label}</p>
                                                {labHoveredFacility.featureTags && labHoveredFacility.featureTags.length > 0 && (
                                                    <div className="flex flex-wrap gap-1 mt-1">
                                                        {labHoveredFacility.featureTags.map(tag => (
                                                            <span key={tag} className="text-[9px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">{tag}</span>
                                                        ))}
                                                    </div>
                                                )}
                                                {labHoveredFacility.sportTypes && labHoveredFacility.sportTypes.length > 0 && (
                                                    <p className="text-[10px] text-indigo-500 font-bold mt-1">
                                                        ספורט: {labHoveredFacility.sportTypes.join(', ')}
                                                    </p>
                                                )}
                                            </div>
                                            <button
                                                onClick={() => setLabHoveredFacility(null)}
                                                className="mt-2 text-[10px] text-gray-400 hover:text-red-500 font-bold w-full text-center"
                                            >
                                                סגור
                                            </button>
                                        </div>
                                    </Popup>
                                )}

                            </Map>

                            {/* Overlays */}
                            {activeTab === 'add' && previewRoutes.length === 0 && (
                                <div className="absolute inset-0 flex items-center justify-center bg-black/5 backdrop-blur-[2px] z-20">
                                    <div className="bg-white/90 backdrop-blur-xl p-8 rounded-3xl shadow-2xl text-center border border-white/50 max-w-sm">
                                        <Layers className="mx-auto text-cyan-500 mb-4" size={48} />
                                        <h3 className="text-lg font-black text-gray-800">טרם נטענו נתונים</h3>
                                        <p className="text-sm text-gray-500 mt-2">העלה קובץ או בחר כתובת חיצונית כדי להמשיך</p>
                                    </div>
                                </div>
                            )}

                            {activeTab === 'inventory' && existingRoutes.length === 0 && !isSubmitting && (
                                <div className="absolute inset-0 flex items-center justify-center bg-black/5 backdrop-blur-[2px] z-20">
                                    <div className="bg-white/90 backdrop-blur-xl p-8 rounded-3xl shadow-2xl text-center border border-white/50 max-w-sm">
                                        <Database className="mx-auto text-cyan-500 mb-4" size={48} />
                                        <h3 className="text-lg font-black text-gray-800">המלאי ריק</h3>
                                        <p className="text-sm text-gray-500 mt-2">החל להוסיף נתונים בלשונית הקודמת</p>
                                    </div>
                                </div>
                            )}

                            {/* Lab: Empty State */}
                            {activeTab === 'lab' && !labAuthorityId && (
                                <div className="absolute inset-0 flex items-center justify-center bg-black/5 backdrop-blur-[2px] z-20">
                                    <div className="bg-white/90 backdrop-blur-xl p-8 rounded-3xl shadow-2xl text-center border border-white/50 max-w-sm">
                                        <FlaskConical className="mx-auto text-indigo-500 mb-4" size={48} />
                                        <h3 className="text-lg font-black text-gray-800">מעבדת בדיקות</h3>
                                        <p className="text-sm text-gray-500 mt-2">בחר רשות / עיר בסרגל הצד כדי לטעון נתונים</p>
                                    </div>
                                </div>
                            )}

                            {/* Lab: Loading */}
                            {activeTab === 'lab' && isLabLoading && (
                                <div className="absolute top-4 left-4 bg-white/90 backdrop-blur-sm rounded-xl px-4 py-2 shadow-lg z-20 flex items-center gap-2">
                                    <Loader2 className="animate-spin text-indigo-500" size={16} />
                                    <span className="text-xs font-bold text-gray-700">טוען נתונים...</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Inventory Table (When in Inventory Tab) */}
                    {activeTab === 'inventory' && (
                        <div className="bg-white rounded-3xl shadow-premium border border-gray-50 p-6">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-xl font-black text-gray-800 flex items-center gap-2">
                                    <Database size={24} className="text-cyan-500" />
                                    רשימת מסלולים
                                    <span className="text-sm font-bold text-gray-400">({existingRoutes.length})</span>
                                </h3>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[400px] overflow-y-auto custom-scrollbar p-1">
                                {existingRoutes.map(route => {
                                    // Derive data source label for admin transparency
                                    const infraMode = route.infrastructureMode || (
                                        route.activityType === 'cycling' ? 'cycling' :
                                        route.activityType === 'running' || route.activityType === 'walking' ? 'pedestrian' :
                                        'shared'
                                    );
                                    const dataSourceLabel =
                                        infraMode === 'cycling' ? 'Cycling Infra' :
                                        infraMode === 'pedestrian' ? 'Pedestrian Infra' :
                                        'Mixed';
                                    const dataSourceColor =
                                        infraMode === 'cycling' ? 'bg-purple-50 text-purple-600' :
                                        infraMode === 'pedestrian' ? 'bg-green-50 text-green-600' :
                                        'bg-amber-50 text-amber-600';

                                    return (
                                    <div key={route.id} className="p-4 bg-gray-50 rounded-2xl border border-gray-100 flex items-center justify-between group">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-cyan-100 flex items-center justify-center text-cyan-600">
                                                <Bike size={20} />
                                            </div>
                                            <div>
                                                <p className="text-sm font-black text-gray-800">{route.name}</p>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                <p className="text-xs font-bold text-gray-400">
                                                    {Math.round(route.distance)} ק&quot;מ | {route.type}
                                                    {route.city && ` | ${route.city}`}
                                                </p>
                                                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${dataSourceColor}`}>
                                                        {dataSourceLabel}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        <button className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all">
                                            <Trash2 size={18} />
                                        </button>
                                    </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* ── Lab: Enhanced Route Table ("The Log") ─────────── */}
                    {activeTab === 'lab' && labAuthorityId && (
                        <div className="bg-white rounded-3xl shadow-premium border border-gray-50 p-6">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-lg font-black text-gray-800 flex items-center gap-2">
                                    <Database size={20} className="text-indigo-500" />
                                    יומן מסלולים
                                    <span className="text-sm font-bold text-gray-400">({filteredLabCurated.length})</span>
                                </h3>
                                {labActivityMode !== 'all' && (
                                    <span className="text-xs font-bold text-indigo-500 bg-indigo-50 px-3 py-1 rounded-full">
                                        {getActivityEmoji(labActivityMode)} מסונן: {labActivityMode}
                                    </span>
                                )}
                            </div>

                            {/* Pioneer Card */}
                            {labPioneerMessage && (
                                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 flex items-start gap-3">
                                    <AlertCircle size={18} className="text-amber-500 mt-0.5 flex-shrink-0" />
                                    <div>
                                        <p className="text-sm font-bold text-amber-700">{labPioneerMessage}</p>
                                        <p className="text-[10px] text-amber-500 mt-1">עדיין אין מסלולים מוסדרים לסוג פעילות זה — הפעל את ה-Pipeline כדי ליצור</p>
                                    </div>
                                </div>
                            )}

                            {filteredLabCurated.length === 0 && !labPioneerMessage ? (
                                <div className="text-center py-8">
                                    <Database size={36} className="mx-auto text-gray-200 mb-3" />
                                    <p className="text-gray-400 font-bold text-sm">
                                        {labActivityMode === 'yoga' ? 'מצב יוגה — מסלולים מוסתרים. רק נקודות עניין מוצגות.' : 'אין מסלולים תואמים'}
                                    </p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm" dir="rtl">
                                        <thead>
                                            <tr className="border-b border-gray-100">
                                                <th className="text-right py-2 px-3 text-[10px] font-black text-gray-400 uppercase tracking-wider w-10">#</th>
                                                <th className="text-right py-2 px-3 text-[10px] font-black text-gray-400 uppercase tracking-wider">שם מסלול</th>
                                                <th className="text-center py-2 px-3 text-[10px] font-black text-gray-400 uppercase tracking-wider w-16">פעילות</th>
                                                <th className="text-center py-2 px-3 text-[10px] font-black text-gray-400 uppercase tracking-wider w-20">מרחק</th>
                                                <th className="text-center py-2 px-3 text-[10px] font-black text-gray-400 uppercase tracking-wider w-24">סוג היברידי</th>
                                                <th className="text-right py-2 px-3 text-[10px] font-black text-gray-400 uppercase tracking-wider">סיכום מתקנים</th>
                                                <th className="text-center py-2 px-3 text-[10px] font-black text-gray-400 uppercase tracking-wider w-28">מקור נתונים</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredLabCurated.map((route, idx) => {
                                                const isHighlighted = labHighlightedRouteId === route.id;
                                                const infraMode = route.infrastructureMode || 'shared';
                                                const dsLabel = infraMode === 'cycling' ? 'Cycling' : infraMode === 'pedestrian' ? 'Pedestrian' : 'Mixed';
                                                const dsColor = infraMode === 'cycling' ? 'bg-purple-50 text-purple-600' : infraMode === 'pedestrian' ? 'bg-green-50 text-green-600' : 'bg-amber-50 text-amber-600';
                                                const hybridLabel = route.hybridType === 'primary' ? '🏋️ כושר'
                                                    : route.hybridType === 'secondary' ? '🪜 מדרגות'
                                                    : route.hybridType === 'tertiary' ? '🪑 ספסלים'
                                                    : route.hybridType === 'mixed' ? '🔄 משולב'
                                                    : '—';

                                                return (
                                                    <tr
                                                        key={route.id}
                                                        onClick={() => handleLabRouteClick(route)}
                                                        className={`border-b border-gray-50 cursor-pointer transition-all ${
                                                            isHighlighted
                                                                ? 'bg-indigo-50 border-indigo-200'
                                                                : 'hover:bg-gray-50'
                                                        }`}
                                                    >
                                                        <td className="py-2.5 px-3 text-gray-400 font-mono text-xs">{idx + 1}</td>
                                                        <td className="py-2.5 px-3">
                                                            <div className="flex items-center gap-2">
                                                                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: getCuratedRouteColor(route) }} />
                                                                <span className="font-bold text-gray-800 text-xs truncate max-w-[200px]">{route.name}</span>
                                                                {route.isHybrid && (
                                                                    <span className="text-[9px] bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full font-bold flex-shrink-0">Hybrid</span>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td className="py-2.5 px-3 text-center">
                                                            <span className="text-base">{getActivityEmoji(route.activityType || route.type)}</span>
                                                        </td>
                                                        <td className="py-2.5 px-3 text-center">
                                                            <span className="text-xs font-bold text-gray-600">
                                                                {route.distance < 1 ? `${Math.round(route.distance * 1000)}מ` : `${Math.round(route.distance * 10) / 10} ק״מ`}
                                                            </span>
                                                        </td>
                                                        <td className="py-2.5 px-3 text-center">
                                                            <span className="text-[10px] font-bold">{hybridLabel}</span>
                                                        </td>
                                                        <td className="py-2.5 px-3">
                                                            <span className="text-[10px] text-gray-500 font-bold">{getFacilitySummary(route)}</span>
                                                        </td>
                                                        <td className="py-2.5 px-3 text-center">
                                                            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${dsColor}`}>{dsLabel}</span>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Imports Management Tab */}
                    {activeTab === 'imports' && (
                        <div className="space-y-6">
                            {/* Import Batches List */}
                            <div className="bg-white rounded-3xl shadow-premium border border-gray-50 p-6">
                                <div className="flex justify-between items-center mb-6">
                                    <h3 className="text-xl font-black text-gray-800 flex items-center gap-2">
                                        <Package size={24} className="text-cyan-500" />
                                        ייבואים אחרונים
                                    </h3>
                                    <button
                                        onClick={loadImportBatches}
                                        className="flex items-center gap-2 text-gray-500 hover:text-cyan-600 text-sm font-bold transition-all"
                                    >
                                        <RefreshCw size={14} />
                                        רענן
                                    </button>
                                </div>

                                {importBatches.length === 0 ? (
                                    <div className="text-center py-12">
                                        <Package size={48} className="mx-auto text-gray-200 mb-4" />
                                        <p className="text-gray-400 font-bold">אין ייבואים מתועדים</p>
                                        <p className="text-xs text-gray-300 mt-1">ייבואים חדשים יופיעו כאן עם מזהה ייחודי</p>
                                    </div>
                                ) : (
                                    <div className="space-y-3 max-h-[500px] overflow-y-auto custom-scrollbar p-1">
                                        {importBatches.map(batch => (
                                            <div
                                                key={batch.batchId}
                                                className="p-4 bg-gray-50 rounded-2xl border border-gray-100 flex items-center justify-between group hover:border-gray-200 transition-all"
                                            >
                                                <div className="flex items-center gap-4 flex-1 min-w-0">
                                                    <div className="w-10 h-10 rounded-xl bg-cyan-100 flex items-center justify-center text-cyan-600 flex-shrink-0">
                                                        <Upload size={18} />
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <p className="text-sm font-black text-gray-800 truncate">{batch.sourceName}</p>
                                                        <div className="flex items-center gap-3 mt-1">
                                                            {batch.createdAt && (
                                                                <span className="text-[10px] text-gray-400 flex items-center gap-1">
                                                                    <Calendar size={10} />
                                                                    {batch.createdAt.toLocaleDateString('he-IL')}
                                                                </span>
                                                            )}
                                                            <span className="text-[10px] text-gray-400 flex items-center gap-1">
                                                                <Layers size={10} />
                                                                {batch.count} מסלולים
                                                            </span>
                                                            {batch.authorityId && (
                                                                <span className="text-[10px] bg-green-50 text-green-600 px-1.5 py-0.5 rounded-full flex items-center gap-1">
                                                                    <Building2 size={10} />
                                                                    משויך
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => handleDeleteBatch(batch.batchId)}
                                                    disabled={isDeletingBatch === batch.batchId}
                                                    className="flex items-center gap-2 bg-red-50 text-red-500 px-4 py-2 rounded-xl text-xs font-bold hover:bg-red-100 transition-all disabled:opacity-50 flex-shrink-0"
                                                >
                                                    {isDeletingBatch === batch.batchId ? (
                                                        <Loader2 className="animate-spin" size={14} />
                                                    ) : (
                                                        <Trash2 size={14} />
                                                    )}
                                                    מחק את כל הרשימה
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* ── Regenerate Hero Loops ── */}
                            <div className="bg-white rounded-3xl shadow-premium border border-gray-50 p-6">
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="text-xl font-black text-gray-800 flex items-center gap-2">
                                        <RefreshCw size={24} className="text-orange-500" />
                                        יצירת מסלולי Hero Loop
                                        <span className="text-[10px] bg-orange-50 text-orange-600 px-2 py-0.5 rounded-full font-bold">
                                            Diamond Engine v2
                                        </span>
                                    </h3>
                                </div>

                                <p className="text-sm text-gray-500 mb-4">
                                    מוחק את כל המסלולים הקיימים של הרשות ומייצר מסלולי &quot;Hero Loop&quot; חדשים
                                    באמצעות לוגיקת Diamond — לולאות מעגליות עם אשכולות צפיפות אוטומטיים.
                                </p>

                                {/* Authority selector */}
                                <div className="mb-4">
                                    <label className="text-xs font-bold text-gray-500 mb-1 block">רשות / עיר</label>
                                    <div className="relative max-w-md">
                                        <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                        <input
                                            type="text"
                                            value={authoritySearch}
                                            onChange={(e) => { setAuthoritySearch(e.target.value); setShowAuthorityDropdown(true); }}
                                            onFocus={() => setShowAuthorityDropdown(true)}
                                            placeholder={selectedAuthority ? selectedAuthority.name : 'חפש רשות...'}
                                            className="w-full pr-9 pl-3 py-2.5 bg-gray-50 rounded-xl border-2 border-transparent focus:border-orange-400 focus:bg-white transition-all outline-none text-sm"
                                        />
                                        {showAuthorityDropdown && authoritySearch && (
                                            <div className="absolute top-full mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg z-30 max-h-40 overflow-y-auto">
                                                {filteredAuthorities.slice(0, 10).map(a => (
                                                    <button
                                                        key={a.id}
                                                        type="button"
                                                        className="w-full px-4 py-2 text-right text-sm hover:bg-gray-50 flex items-center gap-2"
                                                        onClick={() => {
                                                            setSelectedAuthorityId(a.id);
                                                            setAuthoritySearch('');
                                                            setShowAuthorityDropdown(false);
                                                        }}
                                                    >
                                                        <Building2 size={14} className="text-gray-300" />
                                                        <span className="font-bold text-gray-700">{a.name}</span>
                                                    </button>
                                                ))}
                        </div>
                    )}
                </div>
                                    {selectedAuthority && (
                                        <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                                            <CheckCircle2 size={12} />
                                            רשות: {selectedAuthority.name}
                                        </p>
                                    )}
            </div>

                                {/* Activity type + Hybrid toggle */}
                                <div className="grid grid-cols-2 gap-4 mb-4">
                                    <div>
                                        <label className="text-xs font-bold text-gray-500 mb-1 block">סוג פעילות</label>
                                        <div className="grid grid-cols-3 gap-1.5">
                                            {(['running', 'walking', 'cycling'] as ActivityType[]).map(act => (
                                                <button
                                                    key={act}
                                                    onClick={() => setRegenActivityType(act)}
                                                    className={`py-2 px-2 text-xs font-bold rounded-lg transition-all ${
                                                        regenActivityType === act
                                                            ? 'bg-orange-100 text-orange-700 border-2 border-orange-400'
                                                            : 'bg-gray-50 text-gray-500 border-2 border-transparent'
                                                    }`}
                                                >
                                                    {act === 'running' ? '🏃 ריצה' : act === 'walking' ? '🚶 הליכה' : '🚴 רכיבה'}
                                                </button>
                                            ))}
        </div>
                                    </div>
                                    <div className="flex items-end">
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={enableHybrid}
                                                onChange={(e) => setEnableHybrid(e.target.checked)}
                                                className="w-4 h-4 rounded border-gray-300 text-orange-500 focus:ring-orange-400"
                                            />
                                            <span className="text-xs font-bold text-gray-600">
                                                🏋️ Hybrid (חיפוש מתקני כושר)
                                            </span>
                                        </label>
                                    </div>
                                </div>

                                {/* Regenerate button */}
                                <button
                                    disabled={!selectedAuthorityId || isRegenerating || isPipelineRunning}
                                    onClick={async () => {
                                        if (!selectedAuthorityId || !selectedAuthority) return;
                                        if (!confirm(`⚠️ פעולה זו תמחק את כל המסלולים הקיימים של "${selectedAuthority.name}" ותיצור מסלולי Hero Loop חדשים. להמשיך?`)) return;

                                        setIsRegenerating(true);
                                        setRegenResult(null);
                                        setRegenProgress(null);

                                        try {
                                            const result = await RouteStitchingService.generateCuratedRoutes(
                                                selectedAuthorityId,
                                                selectedAuthority.name || '',
                                                regenActivityType,
                                                (p) => setRegenProgress(p),
                                                { enableHybrid }
                                            );

                                            const dsLabels: Record<string, string> = {
                                                cycling: '🚴 Cycling Infra',
                                                pedestrian: '🚶 Pedestrian Infra',
                                                mixed: '🔀 Mixed',
                                                none: '⚠️ No compatible infra',
                                            };

                                            setRegenResult(
                                                result.stats.dataSource === 'none'
                                                    ? `⚠️ אין תשתית תואמת לסוג הפעילות שנבחר (${result.stats.segmentsProcessed} מקטעים קיימים אך אף אחד לא תואם)`
                                                    : `✅ ${result.stats.tiersGenerated} מסלולי Hero Loop נוצרו | ` +
                                                      `${result.stats.clustersFound} אשכולות | ` +
                                                      `${result.stats.hybridRoutes} היברידיים | ` +
                                                      `${result.stats.totalInfrastructureKm} ק"מ תשתית | ` +
                                                      `${dsLabels[result.stats.dataSource] || ''} (${result.stats.compatibleSegments}/${result.stats.segmentsProcessed})`
                                            );

                                            // Refresh views
                                            await loadImportBatches();
                                            if (existingRoutes.length > 0) await loadInventory();
                                        } catch (err) {
                                            console.error('Regeneration error:', err);
                                            setRegenResult('❌ שגיאה ביצירת Hero Loops. ראה קונסול.');
                                        } finally {
                                            setIsRegenerating(false);
                                        }
                                    }}
                                    className="w-full flex items-center justify-center gap-2 bg-gradient-to-l from-orange-500 to-amber-500 text-white px-6 py-3 rounded-2xl font-bold shadow-lg shadow-orange-200 hover:opacity-90 transition-all disabled:opacity-50 disabled:shadow-none"
                                >
                                    {isRegenerating ? (
                                        <Loader2 className="animate-spin" size={18} />
                                    ) : (
                                        <RefreshCw size={18} />
                                    )}
                                    {isRegenerating ? 'מייצר Hero Loops...' : 'יצירת מסלולי Hero Loop'}
                                </button>

                                {/* Progress */}
                                {isRegenerating && regenProgress && (
                                    <div className="mt-3 bg-orange-50 p-3 rounded-xl border border-orange-100">
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-[10px] font-bold text-gray-700">{regenProgress.detail}</span>
                                            <span className="text-[10px] font-mono text-orange-600">{regenProgress.percent}%</span>
                                        </div>
                                        <div className="w-full bg-gray-100 rounded-full h-1.5">
                                            <div
                                                className="bg-gradient-to-l from-orange-500 to-amber-500 h-1.5 rounded-full transition-all duration-500"
                                                style={{ width: `${regenProgress.percent}%` }}
                                            />
                                        </div>
                                    </div>
                                )}

                                {/* Result */}
                                {regenResult && !isRegenerating && (
                                    <div className={`mt-3 p-3 rounded-xl text-xs font-bold ${
                                        regenResult.includes('❌') ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-700'
                                    }`}>
                                        {regenResult}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
