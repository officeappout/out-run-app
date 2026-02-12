'use client';

export const dynamic = 'force-dynamic';

import { useState, useCallback, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
    ArrowRight,
    Save,
    Trash2,
    Undo2,
    Loader2,
    Zap,
    Bike,
    MapPin,
    Mountain,
    Trees,
    Layers,
    Star,
    CheckCircle2,
    MousePointerClick,
    Building2,
    Search,
    Navigation,
} from 'lucide-react';
import dynamicImport from 'next/dynamic';
import { Route, ActivityType } from '@/features/parks';
import { InventoryService } from '@/features/parks';
import { ROUTE_SUB_SPORT_MAPPING } from '@/features/parks';
import { getAllAuthorities } from '@/features/admin/services/authority.service';
import type { Authority } from '@/types/admin-types';
import 'mapbox-gl/dist/mapbox-gl.css';

// Dynamic map imports (SSR-safe)
const MapComponent = dynamicImport(
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

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

// ============================================
// TYPES — Snapped segment between two waypoints
// ============================================
interface SnappedSegment {
    /** The full coordinates returned by Mapbox Directions for this segment */
    geometry: [number, number][];
    /** Road distance in km for this segment */
    distanceKm: number;
}

// ============================================
// HELPER — Fetch snapped route between two points
// ============================================
async function fetchSnappedRoute(
    from: [number, number],
    to: [number, number],
    profile: 'walking' | 'cycling'
): Promise<SnappedSegment> {
    const coords = `${from[0]},${from[1]};${to[0]},${to[1]}`;
    const url = `https://api.mapbox.com/directions/v5/mapbox/${profile}/${coords}?geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`;

    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`Directions API error: ${res.status}`);
    }
    const data = await res.json();

    if (!data.routes || data.routes.length === 0) {
        // Fallback to straight line if no route found
        return {
            geometry: [from, to],
            distanceKm: haversineDistance([from, to]),
        };
    }

    const route = data.routes[0];
    return {
        geometry: route.geometry.coordinates as [number, number][],
        distanceKm: (route.distance || 0) / 1000, // meters → km
    };
}

// ============================================
// HELPER — Haversine distance (fallback)
// ============================================
function haversineDistance(coords: [number, number][]): number {
    let total = 0;
    for (let i = 1; i < coords.length; i++) {
        const [lng1, lat1] = coords[i - 1];
        const [lng2, lat2] = coords[i];
        const R = 6371; // km
        const dLat = ((lat2 - lat1) * Math.PI) / 180;
        const dLng = ((lng2 - lng1) * Math.PI) / 180;
        const a =
            Math.sin(dLat / 2) ** 2 +
            Math.cos((lat1 * Math.PI) / 180) *
            Math.cos((lat2 * Math.PI) / 180) *
            Math.sin(dLng / 2) ** 2;
        total += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }
    return total;
}

// ============================================
// OPTIONS
// ============================================
const activityOptions: { id: ActivityType; label: string; icon: typeof Zap }[] = [
    { id: 'running', label: 'ריצה', icon: Zap },
    { id: 'cycling', label: 'רכיבה', icon: Bike },
    { id: 'walking', label: 'הליכה', icon: MapPin },
];

const terrainOptions: { id: 'asphalt' | 'dirt' | 'mixed'; label: string; icon: typeof Layers }[] = [
    { id: 'asphalt', label: 'אספלט', icon: Layers },
    { id: 'dirt', label: 'שטח/עפר', icon: Mountain },
    { id: 'mixed', label: 'מעורב', icon: Trees },
];

const envOptions: { id: 'urban' | 'nature' | 'park' | 'beach'; label: string }[] = [
    { id: 'urban', label: 'עירוני' },
    { id: 'nature', label: 'טבע' },
    { id: 'park', label: 'פארק' },
    { id: 'beach', label: 'חוף' },
];

const difficultyOptions: { id: 'easy' | 'medium' | 'hard'; label: string; color: string }[] = [
    { id: 'easy', label: 'קל', color: '#10B981' },
    { id: 'medium', label: 'בינוני', color: '#F59E0B' },
    { id: 'hard', label: 'קשה', color: '#EF4444' },
];

// ============================================
// MAIN COMPONENT
// ============================================
export default function RouteBuilderPage() {
    const router = useRouter();

    // Waypoints: the user-clicked points (anchors)
    const [waypoints, setWaypoints] = useState<[number, number][]>([]);
    // Snapped segments: one per pair of consecutive waypoints
    const [segments, setSegments] = useState<SnappedSegment[]>([]);
    const [isDrawing, setIsDrawing] = useState(true);
    const [isFetchingSegment, setIsFetchingSegment] = useState(false);

    // Route metadata
    const [routeName, setRouteName] = useState('');
    const [activity, setActivity] = useState<ActivityType>('running');
    const [terrain, setTerrain] = useState<'asphalt' | 'dirt' | 'mixed'>('asphalt');
    const [environment, setEnvironment] = useState<'urban' | 'nature' | 'park' | 'beach'>('urban');
    const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('easy');
    const [qualityScore, setQualityScore] = useState(5);
    const [routeRating, setRouteRating] = useState(3.0);
    const [description, setDescription] = useState('');

    // Authority linkage
    const [authorities, setAuthorities] = useState<Authority[]>([]);
    const [selectedAuthorityId, setSelectedAuthorityId] = useState('');
    const [authoritySearch, setAuthoritySearch] = useState('');
    const [showAuthorityDropdown, setShowAuthorityDropdown] = useState(false);
    const authorityDropdownRef = useRef<HTMLDivElement>(null);

    // UI state
    const [isSaving, setIsSaving] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);

    // Load authorities on mount
    useEffect(() => {
        getAllAuthorities().then(setAuthorities).catch(console.error);
    }, []);

    // Close authority dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (authorityDropdownRef.current && !authorityDropdownRef.current.contains(e.target as Node)) {
                setShowAuthorityDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Derived values
    const selectedAuthority = authorities.find(a => a.id === selectedAuthorityId);
    const filteredAuthorities = authoritySearch
        ? authorities.filter(a => a.name?.toLowerCase().includes(authoritySearch.toLowerCase()))
        : authorities;

    // Directions API profile
    const directionsProfile: 'walking' | 'cycling' = activity === 'cycling' ? 'cycling' : 'walking';

    // Total distance from all snapped segments
    const totalDistanceKm = segments.reduce((sum, seg) => sum + seg.distanceKm, 0);

    // Full path: all snapped segment geometries concatenated
    const fullPath: [number, number][] = segments.reduce<[number, number][]>((acc, seg, idx) => {
        // Skip the first coordinate of subsequent segments to avoid duplication at junctions
        const coords = idx === 0 ? seg.geometry : seg.geometry.slice(1);
        return [...acc, ...coords];
    }, []);

    // Auto-sport mapping label
    const autoSportLabel = ROUTE_SUB_SPORT_MAPPING[`${terrain}_${environment}`]?.label || 'מסלול כללי';

    // ============================================
    // MAP CLICK — Drop a waypoint & fetch route
    // ============================================
    const handleMapClick = useCallback(
        async (evt: any) => {
            if (!isDrawing || isFetchingSegment) return;
            const { lng, lat } = evt.lngLat;
            const newPoint: [number, number] = [lng, lat];
            const prevWaypoints = [...waypoints, newPoint];
            setWaypoints(prevWaypoints);

            // If we have at least 2 waypoints, fetch the snapped route for the new segment
            if (waypoints.length >= 1) {
                const fromPoint = waypoints[waypoints.length - 1];
                setIsFetchingSegment(true);
                try {
                    const segment = await fetchSnappedRoute(fromPoint, newPoint, directionsProfile);
                    setSegments(prev => [...prev, segment]);
                } catch (err) {
                    console.error('Snap-to-road failed, using fallback:', err);
                    // Fallback to straight line
                    setSegments(prev => [...prev, {
                        geometry: [fromPoint, newPoint],
                        distanceKm: haversineDistance([fromPoint, newPoint]),
                    }]);
                } finally {
                    setIsFetchingSegment(false);
                }
            }
        },
        [isDrawing, isFetchingSegment, waypoints, directionsProfile]
    );

    // ============================================
    // UNDO — Remove last waypoint + its segment
    // ============================================
    const handleUndo = () => {
        if (waypoints.length === 0) return;
        setWaypoints(prev => prev.slice(0, -1));
        // Remove the last snapped segment (one segment per pair, so segments.length = waypoints.length - 1)
        if (segments.length > 0) {
            setSegments(prev => prev.slice(0, -1));
        }
    };

    // ============================================
    // CLEAR — Remove all
    // ============================================
    const handleClear = () => {
        setWaypoints([]);
        setSegments([]);
        setIsDrawing(true);
    };

    // ============================================
    // Re-fetch all segments when activity changes
    // (walking ↔ cycling changes the Directions profile)
    // ============================================
    const prevActivityRef = useRef(activity);
    useEffect(() => {
        if (prevActivityRef.current === activity) return;
        prevActivityRef.current = activity;

        // Re-snap all existing segments with the new profile
        if (waypoints.length < 2) return;
        const refetchSegments = async () => {
            setIsFetchingSegment(true);
            const newProfile: 'walking' | 'cycling' = activity === 'cycling' ? 'cycling' : 'walking';
            const newSegments: SnappedSegment[] = [];
            for (let i = 1; i < waypoints.length; i++) {
                try {
                    const seg = await fetchSnappedRoute(waypoints[i - 1], waypoints[i], newProfile);
                    newSegments.push(seg);
                } catch {
                    newSegments.push({
                        geometry: [waypoints[i - 1], waypoints[i]],
                        distanceKm: haversineDistance([waypoints[i - 1], waypoints[i]]),
                    });
                }
            }
            setSegments(newSegments);
            setIsFetchingSegment(false);
        };
        refetchSegments();
    }, [activity, waypoints]);

    // ============================================
    // SAVE — Build Route object and persist
    // ============================================
    const handleSave = async () => {
        if (waypoints.length < 2) {
            alert('יש לסמן לפחות 2 נקודות על המפה');
            return;
        }
        if (!routeName.trim()) {
            alert('יש להזין שם מסלול');
            return;
        }

        setIsSaving(true);
        try {
            const estimatedDuration = Math.round(
                totalDistanceKm * (activity === 'cycling' ? 3 : activity === 'running' ? 6 : 12)
            );

            const route: Route = {
                id: `manual-${activity}-${Date.now()}`,
                name: routeName.trim(),
                description: description.trim() || `${autoSportLabel} – ${routeName.trim()}`,
                distance: Number(totalDistanceKm.toFixed(2)),
                duration: estimatedDuration,
                score: Math.round(totalDistanceKm * 10),
                type: activity,
                activityType: activity,
                difficulty,
                rating: routeRating,
                calories: Math.round(totalDistanceKm * (activity === 'cycling' ? 30 : 65)),
                adminRating: qualityScore,
                path: fullPath.length > 0 ? fullPath : waypoints,
                segments: [],
                features: {
                    hasGym: false,
                    hasBenches: false,
                    scenic: environment === 'nature' || environment === 'beach',
                    lit: environment === 'urban',
                    terrain,
                    environment,
                    trafficLoad: environment === 'urban' ? 'medium' : 'none',
                    surface: terrain === 'asphalt' ? 'road' : 'trail',
                },
                source: {
                    type: 'system',
                    name: 'Manual Route Builder',
                },
                authorityId: selectedAuthorityId || undefined,
                city: selectedAuthority?.name || undefined,
                importBatchId: `manual_${Date.now()}`,
                importSourceName: 'ציור ידני',
                isInfrastructure: false, // Manual routes are experience routes, not infrastructure
            };

            await InventoryService.saveRoutes([route]);
            setSaveSuccess(true);

            // Redirect after a short delay
            setTimeout(() => {
                router.push('/admin/routes');
            }, 1500);
        } catch (err) {
            console.error('Error saving route:', err);
            alert('שגיאה בשמירת המסלול');
        } finally {
            setIsSaving(false);
        }
    };

    // ============================================
    // GeoJSON for the full snapped polyline
    // ============================================
    const lineGeoJSON = {
        type: 'Feature' as const,
        properties: {},
        geometry: {
            type: 'LineString' as const,
            coordinates: fullPath,
        },
    };

    // Route color based on activity
    const routeColor =
        activity === 'cycling' ? '#8B5CF6' : activity === 'walking' ? '#10B981' : '#06B6D4';

    // ============================================
    // RENDER
    // ============================================
    return (
        <div className="h-screen flex flex-col bg-gray-50" dir="rtl">
            {/* Top Bar */}
            <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between z-20 shrink-0">
                <div className="flex items-center gap-4">
                    <Link
                        href="/admin/routes"
                        className="flex items-center gap-1 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                        <ArrowRight size={20} />
                        <span className="text-sm font-bold">חזור</span>
                    </Link>
                    <div className="h-6 w-px bg-gray-200" />
                    <h1 className="text-lg font-black text-gray-900 flex items-center gap-2">
                        <MousePointerClick size={20} className="text-cyan-500" />
                        בניית מסלול חדש
                    </h1>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={handleUndo}
                        disabled={waypoints.length === 0 || isFetchingSegment}
                        className="flex items-center gap-2 bg-white text-gray-600 px-4 py-2 rounded-xl font-bold border border-gray-200 hover:bg-gray-50 transition-all disabled:opacity-30 disabled:cursor-not-allowed text-sm"
                    >
                        <Undo2 size={16} />
                        <span>ביטול נקודה אחרונה</span>
                    </button>
                    <button
                        onClick={handleClear}
                        disabled={waypoints.length === 0}
                        className="flex items-center gap-2 bg-white text-red-500 px-4 py-2 rounded-xl font-bold border border-red-200 hover:bg-red-50 transition-all disabled:opacity-30 disabled:cursor-not-allowed text-sm"
                    >
                        <Trash2 size={16} />
                        <span>נקה הכל</span>
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={waypoints.length < 2 || !routeName.trim() || isSaving || isFetchingSegment}
                        className="flex items-center gap-2 bg-cyan-500 text-white px-6 py-2 rounded-xl font-bold shadow-lg shadow-cyan-200 hover:bg-cyan-600 transition-all disabled:opacity-50 disabled:shadow-none text-sm"
                    >
                        {isSaving ? (
                            <Loader2 className="animate-spin" size={18} />
                        ) : (
                            <Save size={18} />
                        )}
                        <span>שמור מסלול</span>
                    </button>
                </div>
            </div>

            {/* Success Toast */}
            {saveSuccess && (
                <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 bg-green-500 text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-top">
                    <CheckCircle2 size={22} />
                    <span className="font-bold">המסלול נשמר בהצלחה!</span>
                </div>
            )}

            {/* Main Content: Sidebar + Map */}
            <div className="flex-1 flex overflow-hidden">
                {/* Sidebar */}
                <div className="w-[380px] bg-white border-l border-gray-200 overflow-y-auto p-6 space-y-6 shrink-0">
                    {/* Route Name */}
                    <div className="space-y-2">
                        <label className="text-xs font-black text-gray-400 uppercase tracking-widest">
                            שם המסלול
                        </label>
                        <input
                            type="text"
                            value={routeName}
                            onChange={(e) => setRouteName(e.target.value)}
                            placeholder="למשל: שביל פארק הירקון"
                            className="w-full bg-gray-50 border-2 border-transparent focus:border-cyan-400 focus:bg-white px-4 py-3 rounded-xl text-sm outline-none transition-all"
                        />
                    </div>

                    {/* Description */}
                    <div className="space-y-2">
                        <label className="text-xs font-black text-gray-400 uppercase tracking-widest">
                            תיאור (אופציונלי)
                        </label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="מסלול נוח לאורך הנהר..."
                            rows={2}
                            className="w-full bg-gray-50 border-2 border-transparent focus:border-cyan-400 focus:bg-white px-4 py-3 rounded-xl text-sm outline-none transition-all resize-none"
                        />
                    </div>

                    <div className="border-t border-gray-100" />

                    {/* Authority / City Linkage */}
                    <div className="space-y-3">
                        <label className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                            <Building2 size={14} className="text-indigo-400" />
                            שיוך לרשות / עיר
                        </label>
                        <div className="relative" ref={authorityDropdownRef}>
                            <div className="flex items-center gap-2">
                                <div className="relative flex-1">
                                    <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                                    <input
                                        type="text"
                                        value={authoritySearch}
                                        onChange={(e) => { setAuthoritySearch(e.target.value); setShowAuthorityDropdown(true); }}
                                        onFocus={() => setShowAuthorityDropdown(true)}
                                        placeholder={selectedAuthority ? selectedAuthority.name : 'חפש רשות מקומית...'}
                                        className="w-full pr-9 pl-3 py-2.5 bg-gray-50 rounded-xl border-2 border-transparent focus:border-indigo-400 focus:bg-white transition-all outline-none text-sm"
                                    />
                                </div>
                                {selectedAuthorityId && (
                                    <button
                                        type="button"
                                        onClick={() => { setSelectedAuthorityId(''); setAuthoritySearch(''); }}
                                        className="p-2 text-gray-400 hover:text-red-500 rounded-lg transition-colors"
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
                                                className="w-full px-4 py-2.5 text-right text-sm hover:bg-indigo-50 transition-colors flex items-center gap-2"
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
                            <p className="text-xs text-green-600 flex items-center gap-1">
                                <CheckCircle2 size={12} />
                                משויך ל&quot;{selectedAuthority.name}&quot;
                            </p>
                        )}
                    </div>

                    <div className="border-t border-gray-100" />

                    {/* Activity Type */}
                    <div className="space-y-3">
                        <label className="text-xs font-black text-gray-400 uppercase tracking-widest">
                            סוג פעילות
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                            {activityOptions.map((opt) => (
                                <button
                                    key={opt.id}
                                    onClick={() => setActivity(opt.id)}
                                    className={`flex flex-col items-center gap-2 p-3 rounded-2xl border-2 transition-all ${
                                        activity === opt.id
                                            ? 'border-cyan-500 bg-cyan-50 text-cyan-600'
                                            : 'border-gray-100 bg-gray-50 text-gray-400 hover:border-gray-200'
                                    }`}
                                >
                                    <opt.icon size={20} />
                                    <span className="text-xs font-bold">{opt.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Terrain */}
                    <div className="space-y-3">
                        <label className="text-xs font-black text-gray-400 uppercase tracking-widest">
                            סוג תוואי
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                            {terrainOptions.map((opt) => (
                                <button
                                    key={opt.id}
                                    onClick={() => setTerrain(opt.id)}
                                    className={`flex flex-col items-center gap-2 p-3 rounded-2xl border-2 transition-all ${
                                        terrain === opt.id
                                            ? 'border-purple-500 bg-purple-50 text-purple-600'
                                            : 'border-gray-100 bg-gray-50 text-gray-400 hover:border-gray-200'
                                    }`}
                                >
                                    <opt.icon size={20} />
                                    <span className="text-xs font-bold">{opt.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Environment */}
                    <div className="space-y-3">
                        <label className="text-xs font-black text-gray-400 uppercase tracking-widest">
                            סביבה
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                            {envOptions.map((opt) => (
                                <button
                                    key={opt.id}
                                    onClick={() => setEnvironment(opt.id)}
                                    className={`px-4 py-2.5 rounded-xl border-2 text-sm font-bold transition-all ${
                                        environment === opt.id
                                            ? 'border-green-500 bg-green-50 text-green-600'
                                            : 'border-gray-100 bg-gray-50 text-gray-400 hover:border-gray-200'
                                    }`}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Auto Sport Mapping */}
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-start gap-3">
                        <span className="text-lg mt-0.5">🧠</span>
                        <div>
                            <p className="text-xs font-bold text-blue-700">מיפוי אוטומטי</p>
                            <p className="text-xs text-blue-600 mt-0.5">{autoSportLabel}</p>
                        </div>
                    </div>

                    {/* Difficulty */}
                    <div className="space-y-3">
                        <label className="text-xs font-black text-gray-400 uppercase tracking-widest">
                            רמת קושי
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                            {difficultyOptions.map((opt) => (
                                <button
                                    key={opt.id}
                                    onClick={() => setDifficulty(opt.id)}
                                    className={`px-4 py-2.5 rounded-xl border-2 text-sm font-bold transition-all ${
                                        difficulty === opt.id
                                            ? 'text-white shadow-md'
                                            : 'border-gray-100 bg-gray-50 text-gray-400 hover:border-gray-200'
                                    }`}
                                    style={{
                                        backgroundColor:
                                            difficulty === opt.id ? opt.color : undefined,
                                        borderColor:
                                            difficulty === opt.id ? opt.color : undefined,
                                    }}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="border-t border-gray-100" />

                    {/* Star Rating (1-5) */}
                    <div className="space-y-3">
                        <label className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                            <Star size={14} className="text-amber-400" />
                            דירוג (Rating) ⭐
                        </label>
                        <p className="text-[11px] text-gray-400">
                            דירוג כוכבים 1-5 שיוצג למשתמשים
                        </p>
                        <div className="flex items-center gap-4">
                            <input
                                type="range"
                                min={1}
                                max={5}
                                step={0.1}
                                value={routeRating}
                                onChange={(e) => setRouteRating(Number(e.target.value))}
                                className="flex-1 accent-amber-500"
                            />
                            <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 px-3 py-2 rounded-xl min-w-[80px] justify-center">
                                <span className="text-amber-500 text-sm">⭐</span>
                                <span className="font-black text-amber-700 text-lg">{routeRating.toFixed(1)}</span>
                            </div>
                        </div>
                        {/* Visual stars */}
                        <div className="flex items-center gap-0.5">
                            {[1, 2, 3, 4, 5].map((star) => (
                                <span
                                    key={star}
                                    className={`text-lg transition-all ${
                                        star <= Math.round(routeRating)
                                            ? 'text-amber-400 scale-110'
                                            : 'text-gray-200'
                                    }`}
                                >
                                    ★
                                </span>
                            ))}
                        </div>
                    </div>

                    <div className="border-t border-gray-100" />

                    {/* Quality Score */}
                    <div className="space-y-3">
                        <label className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                            <Star size={14} className="text-amber-400" />
                            דירוג איכות מסלול (1-10)
                        </label>
                        <p className="text-[11px] text-gray-400">
                            מקטעים עם דירוג גבוה יקבלו עדיפות במנוע התכנון האוטומטי
                        </p>
                        <div className="flex items-center gap-4">
                            <input
                                type="range"
                                min={1}
                                max={10}
                                value={qualityScore}
                                onChange={(e) => setQualityScore(Number(e.target.value))}
                                className="flex-1 accent-amber-500"
                            />
                            <div
                                className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-lg shadow-lg ${
                                    qualityScore >= 8
                                        ? 'bg-green-500 text-white'
                                        : qualityScore >= 5
                                        ? 'bg-amber-400 text-white'
                                        : 'bg-gray-300 text-white'
                                }`}
                            >
                                {qualityScore}
                            </div>
                        </div>
                    </div>

                    <div className="border-t border-gray-100" />

                    {/* Stats Summary */}
                    <div className="bg-gray-50 rounded-2xl p-4 space-y-3">
                        <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">
                            סיכום
                        </h3>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="bg-white rounded-xl p-3 text-center">
                                <p className="text-2xl font-black text-gray-900">
                                    {waypoints.length}
                                </p>
                                <p className="text-[10px] text-gray-400 font-bold">נקודות</p>
                            </div>
                            <div className="bg-white rounded-xl p-3 text-center">
                                <p className="text-2xl font-black text-gray-900">
                                    {totalDistanceKm < 1
                                        ? `${Math.round(totalDistanceKm * 1000)}m`
                                        : `${totalDistanceKm.toFixed(1)}km`}
                                </p>
                                <p className="text-[10px] text-gray-400 font-bold">מרחק (כביש)</p>
                            </div>
                        </div>
                        {/* Snap-to-road indicator */}
                        <div className="flex items-center gap-2 text-[11px] text-cyan-600">
                            <Navigation size={12} />
                            <span className="font-bold">מרחק מבוסס ניתוב כבישים אמיתי</span>
                        </div>
                    </div>
                </div>

                {/* Map Area */}
                <div className="flex-1 relative">
                    <MapComponent
                        initialViewState={{
                            longitude: 34.7818,
                            latitude: 32.0853,
                            zoom: 14,
                        }}
                        style={{ width: '100%', height: '100%' }}
                        mapStyle="mapbox://styles/mapbox/streets-v12"
                        mapboxAccessToken={MAPBOX_TOKEN}
                        onClick={handleMapClick}
                        cursor={isDrawing && !isFetchingSegment ? 'crosshair' : 'grab'}
                        interactiveLayerIds={[]}
                    >
                        {/* Snapped Polyline */}
                        {fullPath.length >= 2 && (
                            <Source
                                id="route-line"
                                type="geojson"
                                data={lineGeoJSON}
                            >
                                <Layer
                                    id="route-line-layer"
                                    type="line"
                                    paint={{
                                        'line-color': routeColor,
                                        'line-width': 5,
                                        'line-opacity': 0.85,
                                    }}
                                    layout={{
                                        'line-cap': 'round',
                                        'line-join': 'round',
                                    }}
                                />
                                {/* White outline for visibility */}
                                <Layer
                                    id="route-line-outline"
                                    type="line"
                                    paint={{
                                        'line-color': '#ffffff',
                                        'line-width': 8,
                                        'line-opacity': 0.4,
                                    }}
                                    layout={{
                                        'line-cap': 'round',
                                        'line-join': 'round',
                                    }}
                                    beforeId="route-line-layer"
                                />
                            </Source>
                        )}

                        {/* Waypoint Markers */}
                        {waypoints.map((point, idx) => (
                            <Marker
                                key={`point-${idx}`}
                                longitude={point[0]}
                                latitude={point[1]}
                                anchor="center"
                            >
                                <div
                                    className={`flex items-center justify-center rounded-full shadow-lg border-2 border-white text-white text-[10px] font-black ${
                                        idx === 0
                                            ? 'w-8 h-8 bg-green-500'
                                            : idx === waypoints.length - 1
                                            ? 'w-8 h-8 bg-red-500'
                                            : 'w-6 h-6'
                                    }`}
                                    style={{
                                        backgroundColor:
                                            idx === 0
                                                ? '#10B981'
                                                : idx === waypoints.length - 1
                                                ? '#EF4444'
                                                : routeColor,
                                    }}
                                >
                                    {idx === 0 ? 'A' : idx === waypoints.length - 1 ? 'B' : idx}
                                </div>
                            </Marker>
                        ))}
                    </MapComponent>

                    {/* Drawing Instructions Overlay */}
                    {waypoints.length === 0 && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                            <div className="bg-white/90 backdrop-blur-xl p-8 rounded-3xl shadow-2xl text-center border border-white/50 max-w-sm pointer-events-auto">
                                <MousePointerClick
                                    className="mx-auto text-cyan-500 mb-4"
                                    size={48}
                                />
                                <h3 className="text-lg font-black text-gray-800">
                                    לחץ על המפה להתחלה
                                </h3>
                                <p className="text-sm text-gray-500 mt-2">
                                    כל לחיצה מוסיפה נקודה. המערכת תנתב אוטומטית לפי כבישים ומדרכות.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Drawing Mode Badge */}
                    {isDrawing && waypoints.length > 0 && (
                        <div className="absolute top-4 left-4 bg-cyan-500 text-white px-4 py-2 rounded-xl shadow-lg flex items-center gap-2 z-10 text-sm font-bold">
                            <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
                            {isFetchingSegment ? 'מנתב...' : 'מצב ציור — לחץ להוספת נקודה'}
                        </div>
                    )}

                    {/* Fetching segment spinner overlay */}
                    {isFetchingSegment && (
                        <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-sm px-4 py-2 rounded-xl shadow-lg flex items-center gap-2 z-10 text-sm font-bold text-cyan-600">
                            <Loader2 className="animate-spin" size={16} />
                            <span>מחשב ניתוב...</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
