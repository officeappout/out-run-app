'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
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
    Lock,
    Clock,
} from 'lucide-react';
import dynamicImport from 'next/dynamic';
import { Route, ActivityType } from '@/features/parks';
import { InventoryService } from '@/features/parks';
import { ROUTE_SUB_SPORT_MAPPING } from '@/features/parks';
import { getAllAuthorities } from '@/features/admin/services/authority.service';
import { auth } from '@/lib/firebase';
import type { Authority } from '@/types/admin-types';
import 'mapbox-gl/dist/mapbox-gl.css';

// ── Dynamic map imports (SSR-safe) ─────────────────────────────────
const MapComponent = dynamicImport(
    () => import('react-map-gl').then(mod => mod.default),
    { ssr: false, loading: () => <div className="h-full w-full bg-gray-100 animate-pulse rounded-2xl" /> }
);
const Source = dynamicImport(() => import('react-map-gl').then(mod => mod.Source), { ssr: false });
const Layer  = dynamicImport(() => import('react-map-gl').then(mod => mod.Layer),  { ssr: false });
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

// ── Types ───────────────────────────────────────────────────────────
interface SnappedSegment {
    geometry: [number, number][];
    distanceKm: number;
}

export interface RouteEditorProps {
    /** When provided the authority picker is hidden and this value is used */
    lockedAuthorityId?: string;
    lockedAuthorityName?: string;
    /**
     * 'published' = visible on app immediately (super-admin default).
     * 'pending'   = requires approval (municipality admin default).
     */
    defaultStatus?: 'pending' | 'published';
    /** Where to redirect after a successful save. Defaults to /admin/routes */
    redirectPath?: string;
    /** Optional callback fired after successful save */
    onSaved?: () => void;
    /** City center to focus the map on load — fetched from authority.coordinates */
    initialLat?: number;
    initialLng?: number;
    initialZoom?: number;
}

// ── Helpers ─────────────────────────────────────────────────────────
async function fetchSnappedRoute(
    from: [number, number],
    to: [number, number],
    profile: 'walking' | 'cycling'
): Promise<SnappedSegment> {
    const coords = `${from[0]},${from[1]};${to[0]},${to[1]}`;
    const url = `https://api.mapbox.com/directions/v5/mapbox/${profile}/${coords}?geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Directions API: ${res.status}`);
    const data = await res.json();
    if (!data.routes || data.routes.length === 0) {
        return { geometry: [from, to], distanceKm: haversineKm([from, to]) };
    }
    return {
        geometry: data.routes[0].geometry.coordinates as [number, number][],
        distanceKm: (data.routes[0].distance || 0) / 1000,
    };
}

function haversineKm(coords: [number, number][]): number {
    let total = 0;
    for (let i = 1; i < coords.length; i++) {
        const [lng1, lat1] = coords[i - 1];
        const [lng2, lat2] = coords[i];
        const R = 6371;
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

// ── Option sets ─────────────────────────────────────────────────────
const activityOptions: { id: ActivityType; label: string; icon: typeof Zap }[] = [
    { id: 'running', label: 'ריצה', icon: Zap },
    { id: 'cycling', label: 'רכיבה', icon: Bike },
    { id: 'walking', label: 'הליכה', icon: MapPin },
];

const terrainOptions: { id: 'asphalt' | 'dirt' | 'mixed'; label: string; icon: typeof Layers }[] = [
    { id: 'asphalt', label: 'אספלט', icon: Layers },
    { id: 'dirt',    label: 'שטח/עפר', icon: Mountain },
    { id: 'mixed',   label: 'מעורב', icon: Trees },
];

const envOptions: { id: 'urban' | 'nature' | 'park' | 'beach'; label: string }[] = [
    { id: 'urban',  label: 'עירוני' },
    { id: 'nature', label: 'טבע' },
    { id: 'park',   label: 'פארק' },
    { id: 'beach',  label: 'חוף' },
];

const difficultyOptions: { id: 'easy' | 'medium' | 'hard'; label: string; color: string }[] = [
    { id: 'easy',   label: 'קל',    color: '#10B981' },
    { id: 'medium', label: 'בינוני', color: '#F59E0B' },
    { id: 'hard',   label: 'קשה',   color: '#EF4444' },
];

// ── Main component ──────────────────────────────────────────────────
export default function RouteEditor({
    lockedAuthorityId,
    lockedAuthorityName,
    defaultStatus = 'published',
    redirectPath = '/admin/routes',
    onSaved,
    initialLat,
    initialLng,
    initialZoom,
}: RouteEditorProps) {
    const router = useRouter();
    const isPending = defaultStatus === 'pending';

    // Map state
    const [waypoints, setWaypoints] = useState<[number, number][]>([]);
    const [segments,  setSegments]  = useState<SnappedSegment[]>([]);
    const [isDrawing, setIsDrawing] = useState(true);
    const [isFetchingSegment, setIsFetchingSegment] = useState(false);

    // Metadata
    const [routeName,    setRouteName]    = useState('');
    const [activity,     setActivity]     = useState<ActivityType>('walking');
    const [terrain,      setTerrain]      = useState<'asphalt' | 'dirt' | 'mixed'>('asphalt');
    const [environment,  setEnvironment]  = useState<'urban' | 'nature' | 'park' | 'beach'>('urban');
    const [difficulty,   setDifficulty]   = useState<'easy' | 'medium' | 'hard'>('easy');
    const [qualityScore, setQualityScore] = useState(5);
    const [routeRating,  setRouteRating]  = useState(3.0);
    const [description,  setDescription]  = useState('');

    // Authority (only used when NOT locked)
    const [authorities,           setAuthorities]           = useState<Authority[]>([]);
    const [selectedAuthorityId,   setSelectedAuthorityId]   = useState(lockedAuthorityId || '');
    const [authoritySearch,       setAuthoritySearch]       = useState('');
    const [showAuthorityDropdown, setShowAuthorityDropdown] = useState(false);
    const authorityDropdownRef = useRef<HTMLDivElement>(null);

    // UI
    const [isSaving,     setIsSaving]     = useState(false);
    const [saveSuccess,  setSaveSuccess]  = useState(false);

    useEffect(() => {
        if (!lockedAuthorityId) {
            getAllAuthorities().then(setAuthorities).catch(console.error);
        }
    }, [lockedAuthorityId]);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (authorityDropdownRef.current && !authorityDropdownRef.current.contains(e.target as Node)) {
                setShowAuthorityDropdown(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const selectedAuthority = lockedAuthorityId
        ? { id: lockedAuthorityId, name: lockedAuthorityName || lockedAuthorityId }
        : authorities.find(a => a.id === selectedAuthorityId);

    const filteredAuthorities = authoritySearch
        ? authorities.filter(a => a.name?.toLowerCase().includes(authoritySearch.toLowerCase()))
        : authorities;

    const directionsProfile: 'walking' | 'cycling' = activity === 'cycling' ? 'cycling' : 'walking';
    const totalDistanceKm = segments.reduce((sum, seg) => sum + seg.distanceKm, 0);
    const fullPath: [number, number][] = segments.reduce<[number, number][]>((acc, seg, idx) => {
        const coords = idx === 0 ? seg.geometry : seg.geometry.slice(1);
        return [...acc, ...coords];
    }, []);
    const autoSportLabel = ROUTE_SUB_SPORT_MAPPING[`${terrain}_${environment}`]?.label || 'מסלול כללי';
    const routeColor = activity === 'cycling' ? '#8B5CF6' : activity === 'walking' ? '#10B981' : '#06B6D4';

    // ── Map click ──────────────────────────────────────────────────
    const handleMapClick = useCallback(
        async (evt: any) => {
            if (!isDrawing || isFetchingSegment) return;
            const { lng, lat } = evt.lngLat;
            const newPoint: [number, number] = [lng, lat];
            setWaypoints(prev => [...prev, newPoint]);

            if (waypoints.length >= 1) {
                const fromPoint = waypoints[waypoints.length - 1];
                setIsFetchingSegment(true);
                try {
                    const segment = await fetchSnappedRoute(fromPoint, newPoint, directionsProfile);
                    setSegments(prev => [...prev, segment]);
                } catch {
                    setSegments(prev => [...prev, {
                        geometry: [fromPoint, newPoint],
                        distanceKm: haversineKm([fromPoint, newPoint]),
                    }]);
                } finally {
                    setIsFetchingSegment(false);
                }
            }
        },
        [isDrawing, isFetchingSegment, waypoints, directionsProfile]
    );

    const handleUndo = () => {
        if (waypoints.length === 0) return;
        setWaypoints(prev => prev.slice(0, -1));
        if (segments.length > 0) setSegments(prev => prev.slice(0, -1));
    };

    const handleClear = () => { setWaypoints([]); setSegments([]); setIsDrawing(true); };

    // Re-snap when activity changes
    const prevActivityRef = useRef(activity);
    useEffect(() => {
        if (prevActivityRef.current === activity) return;
        prevActivityRef.current = activity;
        if (waypoints.length < 2) return;
        const refetch = async () => {
            setIsFetchingSegment(true);
            const newProfile: 'walking' | 'cycling' = activity === 'cycling' ? 'cycling' : 'walking';
            const newSegments: SnappedSegment[] = [];
            for (let i = 1; i < waypoints.length; i++) {
                try {
                    newSegments.push(await fetchSnappedRoute(waypoints[i - 1], waypoints[i], newProfile));
                } catch {
                    newSegments.push({ geometry: [waypoints[i - 1], waypoints[i]], distanceKm: haversineKm([waypoints[i - 1], waypoints[i]]) });
                }
            }
            setSegments(newSegments);
            setIsFetchingSegment(false);
        };
        refetch();
    }, [activity, waypoints]);

    // ── Save ───────────────────────────────────────────────────────
    const handleSave = async () => {
        if (waypoints.length < 2) { alert('יש לסמן לפחות 2 נקודות על המפה'); return; }
        if (!routeName.trim())    { alert('יש להזין שם מסלול'); return; }

        setIsSaving(true);
        try {
            const estimatedDuration = Math.round(
                totalDistanceKm * (activity === 'cycling' ? 3 : activity === 'running' ? 6 : 12)
            );
            const effectiveAuthorityId = lockedAuthorityId || selectedAuthorityId;

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
                source: { type: 'system', name: 'Manual Route Builder' },
                authorityId: effectiveAuthorityId || undefined,
                city: selectedAuthority?.name || undefined,
                importBatchId: `manual_${Date.now()}`,
                importSourceName: isPending ? 'Municipality Route (Pending Approval)' : 'ציור ידני',
                isInfrastructure: false,
                // Approval workflow
                status: defaultStatus,
                published: !isPending,
                // Attribution
                createdByUser: auth.currentUser?.uid ?? 'unknown',
                origin: isPending ? 'authority_admin' : 'super_admin',
            } as Route;

            await InventoryService.saveRoutes([route]);
            setSaveSuccess(true);
            onSaved?.();
            setTimeout(() => router.push(redirectPath), 1500);
        } catch (err) {
            console.error('Error saving route:', err);
            alert('שגיאה בשמירת המסלול');
        } finally {
            setIsSaving(false);
        }
    };

    const lineGeoJSON = {
        type: 'Feature' as const,
        properties: {},
        geometry: { type: 'LineString' as const, coordinates: fullPath },
    };

    // ── Render ─────────────────────────────────────────────────────
    return (
        <div className="h-screen flex flex-col bg-gray-50" dir="rtl">
            {/* Top Bar */}
            <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between z-20 shrink-0">
                <div className="flex items-center gap-4">
                    <h1 className="text-lg font-black text-gray-900 flex items-center gap-2">
                        <MousePointerClick size={20} className="text-cyan-500" />
                        בניית מסלול חדש
                        {isPending && (
                            <span className="flex items-center gap-1 text-xs font-bold bg-amber-100 text-amber-700 px-2 py-1 rounded-full">
                                <Clock size={11} />
                                ישלח לאישור מנהל העל
                            </span>
                        )}
                    </h1>
                </div>
                <div className="flex items-center gap-3">
                    <button onClick={handleUndo} disabled={waypoints.length === 0 || isFetchingSegment}
                        className="flex items-center gap-2 bg-white text-gray-600 px-4 py-2 rounded-xl font-bold border border-gray-200 hover:bg-gray-50 transition-all disabled:opacity-30 text-sm">
                        <Undo2 size={16} />
                        <span>ביטול נקודה</span>
                    </button>
                    <button onClick={handleClear} disabled={waypoints.length === 0}
                        className="flex items-center gap-2 bg-white text-red-500 px-4 py-2 rounded-xl font-bold border border-red-200 hover:bg-red-50 transition-all disabled:opacity-30 text-sm">
                        <Trash2 size={16} />
                        <span>נקה הכל</span>
                    </button>
                    <button onClick={handleSave} disabled={waypoints.length < 2 || !routeName.trim() || isSaving || isFetchingSegment}
                        className={`flex items-center gap-2 text-white px-6 py-2 rounded-xl font-bold shadow-lg transition-all disabled:opacity-50 disabled:shadow-none text-sm ${
                            isPending
                                ? 'bg-amber-500 hover:bg-amber-600 shadow-amber-200'
                                : 'bg-cyan-500 hover:bg-cyan-600 shadow-cyan-200'
                        }`}>
                        {isSaving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                        <span>{isPending ? 'שלח לאישור' : 'שמור מסלול'}</span>
                    </button>
                </div>
            </div>

            {/* Success toast */}
            {saveSuccess && (
                <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 bg-green-500 text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-top">
                    <CheckCircle2 size={22} />
                    <span className="font-bold">
                        {isPending ? 'המסלול נשלח לאישור!' : 'המסלול נשמר בהצלחה!'}
                    </span>
                </div>
            )}

            {/* Pending notice banner */}
            {isPending && (
                <div className="bg-amber-50 border-b border-amber-200 px-6 py-2 flex items-center gap-2 text-xs font-bold text-amber-700 shrink-0">
                    <Clock size={13} />
                    המסלול ישמר בסטטוס &ldquo;ממתין לאישור&rdquo; ויופיע לאחר אישור מנהל העל.
                    {lockedAuthorityId && (
                        <span className="flex items-center gap-1 mr-3 bg-amber-100 px-2 py-0.5 rounded-full">
                            <Lock size={10} />
                            {lockedAuthorityName || lockedAuthorityId}
                        </span>
                    )}
                </div>
            )}

            {/* Main: Sidebar + Map */}
            <div className="flex-1 flex overflow-hidden">
                {/* Sidebar */}
                <div className="w-[380px] bg-white border-l border-gray-200 overflow-y-auto p-6 space-y-6 shrink-0">
                    {/* Route Name */}
                    <div className="space-y-2">
                        <label className="text-xs font-black text-gray-400 uppercase tracking-widest">שם המסלול</label>
                        <input type="text" value={routeName} onChange={e => setRouteName(e.target.value)}
                            placeholder="למשל: המסלול הירוק - נאות השקמה"
                            className="w-full bg-gray-50 border-2 border-transparent focus:border-cyan-400 focus:bg-white px-4 py-3 rounded-xl text-sm outline-none transition-all" />
                    </div>

                    {/* Description */}
                    <div className="space-y-2">
                        <label className="text-xs font-black text-gray-400 uppercase tracking-widest">תיאור (אופציונלי)</label>
                        <textarea value={description} onChange={e => setDescription(e.target.value)}
                            placeholder="מסלול מואר ובטוח לאורך הפארק..." rows={2}
                            className="w-full bg-gray-50 border-2 border-transparent focus:border-cyan-400 focus:bg-white px-4 py-3 rounded-xl text-sm outline-none transition-all resize-none" />
                    </div>

                    <div className="border-t border-gray-100" />

                    {/* Authority — locked or free-choice */}
                    <div className="space-y-3">
                        <label className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                            <Building2 size={14} className="text-indigo-400" />
                            שיוך לרשות / עיר
                            {lockedAuthorityId && <Lock size={11} className="text-amber-500" />}
                        </label>

                        {lockedAuthorityId ? (
                            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
                                <Building2 size={14} className="text-amber-600" />
                                <span className="text-sm font-bold text-amber-800">{lockedAuthorityName || lockedAuthorityId}</span>
                                <Lock size={12} className="text-amber-400 mr-auto" />
                            </div>
                        ) : (
                            <div className="relative" ref={authorityDropdownRef}>
                                <div className="flex items-center gap-2">
                                    <div className="relative flex-1">
                                        <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                                        <input type="text" value={authoritySearch}
                                            onChange={e => { setAuthoritySearch(e.target.value); setShowAuthorityDropdown(true); }}
                                            onFocus={() => setShowAuthorityDropdown(true)}
                                            placeholder={selectedAuthority ? (selectedAuthority as Authority).name || '' : 'חפש רשות מקומית...'}
                                            className="w-full pr-9 pl-3 py-2.5 bg-gray-50 rounded-xl border-2 border-transparent focus:border-indigo-400 focus:bg-white transition-all outline-none text-sm" />
                                    </div>
                                    {selectedAuthorityId && (
                                        <button type="button" onClick={() => { setSelectedAuthorityId(''); setAuthoritySearch(''); }}
                                            className="p-2 text-gray-400 hover:text-red-500 rounded-lg transition-colors">
                                            <Trash2 size={14} />
                                        </button>
                                    )}
                                </div>
                                {showAuthorityDropdown && authoritySearch && (
                                    <div className="absolute top-full mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg z-30 max-h-48 overflow-y-auto">
                                        {filteredAuthorities.length === 0 ? (
                                            <p className="p-3 text-sm text-gray-400 text-center">לא נמצאו רשויות</p>
                                        ) : filteredAuthorities.slice(0, 15).map(a => (
                                            <button key={a.id} type="button"
                                                className="w-full px-4 py-2.5 text-right text-sm hover:bg-indigo-50 transition-colors flex items-center gap-2"
                                                onClick={() => { setSelectedAuthorityId(a.id); setAuthoritySearch(''); setShowAuthorityDropdown(false); }}>
                                                <Building2 size={14} className="text-gray-300" />
                                                <span className="font-bold text-gray-700">{a.name}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                                {selectedAuthority && (
                                    <p className="text-xs text-green-600 flex items-center gap-1 mt-1">
                                        <CheckCircle2 size={12} />
                                        משויך ל&ldquo;{(selectedAuthority as Authority).name}&rdquo;
                                    </p>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="border-t border-gray-100" />

                    {/* Activity */}
                    <div className="space-y-3">
                        <label className="text-xs font-black text-gray-400 uppercase tracking-widest">סוג פעילות</label>
                        <div className="grid grid-cols-3 gap-2">
                            {activityOptions.map(opt => (
                                <button key={opt.id} onClick={() => setActivity(opt.id)}
                                    className={`flex flex-col items-center gap-2 p-3 rounded-2xl border-2 transition-all ${
                                        activity === opt.id ? 'border-cyan-500 bg-cyan-50 text-cyan-600' : 'border-gray-100 bg-gray-50 text-gray-400'
                                    }`}>
                                    <opt.icon size={20} />
                                    <span className="text-xs font-bold">{opt.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Terrain */}
                    <div className="space-y-3">
                        <label className="text-xs font-black text-gray-400 uppercase tracking-widest">סוג תוואי</label>
                        <div className="grid grid-cols-3 gap-2">
                            {terrainOptions.map(opt => (
                                <button key={opt.id} onClick={() => setTerrain(opt.id)}
                                    className={`flex flex-col items-center gap-2 p-3 rounded-2xl border-2 transition-all ${
                                        terrain === opt.id ? 'border-purple-500 bg-purple-50 text-purple-600' : 'border-gray-100 bg-gray-50 text-gray-400'
                                    }`}>
                                    <opt.icon size={20} />
                                    <span className="text-xs font-bold">{opt.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Environment */}
                    <div className="space-y-3">
                        <label className="text-xs font-black text-gray-400 uppercase tracking-widest">סביבה</label>
                        <div className="grid grid-cols-2 gap-2">
                            {envOptions.map(opt => (
                                <button key={opt.id} onClick={() => setEnvironment(opt.id)}
                                    className={`px-4 py-2.5 rounded-xl border-2 text-sm font-bold transition-all ${
                                        environment === opt.id ? 'border-green-500 bg-green-50 text-green-600' : 'border-gray-100 bg-gray-50 text-gray-400'
                                    }`}>
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Auto sport mapping */}
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-start gap-3">
                        <span className="text-lg mt-0.5">🧠</span>
                        <div>
                            <p className="text-xs font-bold text-blue-700">מיפוי אוטומטי</p>
                            <p className="text-xs text-blue-600 mt-0.5">{autoSportLabel}</p>
                        </div>
                    </div>

                    {/* Difficulty */}
                    <div className="space-y-3">
                        <label className="text-xs font-black text-gray-400 uppercase tracking-widest">רמת קושי</label>
                        <div className="grid grid-cols-3 gap-2">
                            {difficultyOptions.map(opt => (
                                <button key={opt.id} onClick={() => setDifficulty(opt.id)}
                                    className={`px-4 py-2.5 rounded-xl border-2 text-sm font-bold transition-all ${
                                        difficulty === opt.id ? 'text-white shadow-md' : 'border-gray-100 bg-gray-50 text-gray-400'
                                    }`}
                                    style={{
                                        backgroundColor: difficulty === opt.id ? opt.color : undefined,
                                        borderColor:     difficulty === opt.id ? opt.color : undefined,
                                    }}>
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="border-t border-gray-100" />

                    {/* Rating */}
                    <div className="space-y-3">
                        <label className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                            <Star size={14} className="text-amber-400" />
                            דירוג (1-5) ⭐
                        </label>
                        <div className="flex items-center gap-4">
                            <input type="range" min={1} max={5} step={0.1} value={routeRating}
                                onChange={e => setRouteRating(Number(e.target.value))}
                                className="flex-1 accent-amber-500" />
                            <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 px-3 py-2 rounded-xl min-w-[70px] justify-center">
                                <span className="text-amber-500 text-sm">⭐</span>
                                <span className="font-black text-amber-700 text-lg">{routeRating.toFixed(1)}</span>
                            </div>
                        </div>
                    </div>

                    {/* Quality Score */}
                    <div className="space-y-3">
                        <label className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                            <Star size={14} className="text-amber-400" />
                            דירוג איכות (1-10)
                        </label>
                        <div className="flex items-center gap-4">
                            <input type="range" min={1} max={10} value={qualityScore}
                                onChange={e => setQualityScore(Number(e.target.value))}
                                className="flex-1 accent-amber-500" />
                            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-lg shadow-lg ${
                                qualityScore >= 8 ? 'bg-green-500 text-white' : qualityScore >= 5 ? 'bg-amber-400 text-white' : 'bg-gray-300 text-white'
                            }`}>
                                {qualityScore}
                            </div>
                        </div>
                    </div>

                    <div className="border-t border-gray-100" />

                    {/* Stats summary */}
                    <div className="bg-gray-50 rounded-2xl p-4 space-y-3">
                        <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">סיכום</h3>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="bg-white rounded-xl p-3 text-center">
                                <p className="text-2xl font-black text-gray-900">{waypoints.length}</p>
                                <p className="text-[10px] text-gray-400 font-bold">נקודות</p>
                            </div>
                            <div className="bg-white rounded-xl p-3 text-center">
                                <p className="text-2xl font-black text-gray-900">
                                    {totalDistanceKm < 1 ? `${Math.round(totalDistanceKm * 1000)}m` : `${totalDistanceKm.toFixed(1)}km`}
                                </p>
                                <p className="text-[10px] text-gray-400 font-bold">מרחק (כביש)</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-cyan-600">
                            <Navigation size={12} />
                            <span className="font-bold">ניתוב כבישים אמיתי</span>
                        </div>
                    </div>
                </div>

                {/* Map Area */}
                <div className="flex-1 relative">
                    <MapComponent
                        initialViewState={{ longitude: initialLng ?? 34.5955, latitude: initialLat ?? 31.525, zoom: initialZoom ?? 14 }}
                        style={{ width: '100%', height: '100%' }}
                        mapStyle="mapbox://styles/mapbox/streets-v12"
                        mapboxAccessToken={MAPBOX_TOKEN}
                        onClick={handleMapClick}
                        onLoad={(e: any) => { applyHebrewLabels(e.target); e.target?.on?.('style.load', () => applyHebrewLabels(e.target)); }}
                        cursor={isDrawing && !isFetchingSegment ? 'crosshair' : 'grab'}
                        interactiveLayerIds={[]}
                    >
                        {fullPath.length >= 2 && (
                            <Source id="route-line" type="geojson" data={lineGeoJSON}>
                                <Layer id="route-line-outline" type="line"
                                    paint={{ 'line-color': '#ffffff', 'line-width': 8, 'line-opacity': 0.4 }}
                                    layout={{ 'line-cap': 'round', 'line-join': 'round' }} />
                                <Layer id="route-line-layer" type="line"
                                    paint={{ 'line-color': routeColor, 'line-width': 5, 'line-opacity': 0.85 }}
                                    layout={{ 'line-cap': 'round', 'line-join': 'round' }} />
                            </Source>
                        )}

                        {waypoints.map((point, idx) => (
                            <Marker key={`wp-${idx}`} longitude={point[0]} latitude={point[1]} anchor="center">
                                <div className={`flex items-center justify-center rounded-full shadow-lg border-2 border-white text-white text-[10px] font-black ${
                                    idx === 0 ? 'w-8 h-8' : idx === waypoints.length - 1 ? 'w-8 h-8' : 'w-6 h-6'
                                }`}
                                style={{ backgroundColor: idx === 0 ? '#10B981' : idx === waypoints.length - 1 ? '#EF4444' : routeColor }}>
                                    {idx === 0 ? 'A' : idx === waypoints.length - 1 ? 'B' : idx}
                                </div>
                            </Marker>
                        ))}
                    </MapComponent>

                    {waypoints.length === 0 && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                            <div className="bg-white/90 backdrop-blur-xl p-8 rounded-3xl shadow-2xl text-center border border-white/50 max-w-sm pointer-events-auto">
                                <MousePointerClick className="mx-auto text-cyan-500 mb-4" size={48} />
                                <h3 className="text-lg font-black text-gray-800">לחץ על המפה להתחלה</h3>
                                <p className="text-sm text-gray-500 mt-2">
                                    כל לחיצה מוסיפה נקודה. המערכת תנתב אוטומטית לפי כבישים ומדרכות.
                                </p>
                                {lockedAuthorityId && (
                                    <p className="mt-3 text-xs font-bold text-amber-600 bg-amber-50 px-3 py-1.5 rounded-xl">
                                        🔒 מסלול עבור: {lockedAuthorityName || lockedAuthorityId}
                                    </p>
                                )}
                            </div>
                        </div>
                    )}

                    {isDrawing && waypoints.length > 0 && (
                        <div className="absolute top-4 left-4 bg-cyan-500 text-white px-4 py-2 rounded-xl shadow-lg flex items-center gap-2 z-10 text-sm font-bold">
                            <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
                            {isFetchingSegment ? 'מנתב...' : 'מצב ציור — לחץ להוספת נקודה'}
                        </div>
                    )}

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
