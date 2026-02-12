import { db } from '@/lib/firebase';
import {
    collection,
    getDocs,
    writeBatch,
    doc,
    query,
    where,
    orderBy,
    serverTimestamp,
} from 'firebase/firestore';
import { Route } from '../types/route.types';
import { MapFacility } from '../types/facility.types';
import { getParksByAuthority } from './parks.service';

/** Summary of an import batch for the management UI */
export interface ImportBatchSummary {
    batchId: string;
    sourceName: string;
    count: number;
    createdAt: Date | null;
    authorityId?: string;
}

/**
 * Recursively strips `undefined` values from an object.
 * Firestore does NOT accept `undefined` — this prevents WriteBatch.set() errors.
 */
function stripUndefined<T extends Record<string, any>>(obj: T): T {
    const clean = {} as any;
    for (const [key, value] of Object.entries(obj)) {
        if (value === undefined) continue;
        if (value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
            clean[key] = stripUndefined(value);
        } else {
            clean[key] = value;
        }
    }
    return clean as T;
}

export const InventoryService = {
    /**
     * Save multiple facilities to Firestore
     */
    saveFacilities: async (facilities: MapFacility[]) => {
        try {
            const facilitiesRef = collection(db, 'facilities');

            for (let i = 0; i < facilities.length; i += 500) {
                const batch = writeBatch(db);
                facilities.slice(i, i + 500).forEach((f) => {
                const newDocRef = doc(facilitiesRef);
                    batch.set(newDocRef, stripUndefined({
                    ...f,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp()
                    }));
                });
            await batch.commit();
            }

            console.log(`✅ Saved ${facilities.length} facilities to Firestore`);
            return true;
        } catch (error) {
            console.error('❌ Error saving facilities:', error);
            throw error;
        }
    },

    /**
     * Fetch all facilities from Firestore
     */
    fetchFacilities: async (): Promise<MapFacility[]> => {
        try {
            const querySnapshot = await getDocs(collection(db, 'facilities'));
            return querySnapshot.docs.map(doc => ({
                ...doc.data(),
                id: doc.id
            } as MapFacility));
        } catch (error) {
            console.error('❌ Error fetching facilities:', error);
            return [];
        }
    },

    /**
     * Save multiple routes to Firestore.
     * Handles chunking (500 per batch) and strips undefined fields.
     */
    saveRoutes: async (routes: Route[]) => {
        try {
            const routesRef = collection(db, 'official_routes');
            let saved = 0;

            // Firestore batch limit is 500
            for (let i = 0; i < routes.length; i += 500) {
                const batch = writeBatch(db);
                const chunk = routes.slice(i, i + 500);

                chunk.forEach((r, idx) => {
                    try {
                const newDocRef = doc(routesRef);
                // Transform path from [lng, lat][] to {lng, lat}[] for Firestore
                const transformedPath = r.path.map(p => ({
                    lng: p[0],
                    lat: p[1]
                }));

                        const routeDoc = stripUndefined({
                    ...r,
                    path: transformedPath,
                            // Ensure activityType is always persisted for downstream mapping
                            activityType: r.activityType || r.type,
                    createdAt: serverTimestamp(),
                            updatedAt: serverTimestamp(),
                        });

                        batch.set(newDocRef, routeDoc);
                    } catch (innerErr) {
                        console.error(`❌ Error preparing route #${i + idx} ("${r.name}"):`, innerErr, r);
                    }
            });

            await batch.commit();
                saved += chunk.length;
            }

            console.log(`✅ Saved ${saved} routes to official_routes collection`);
            return true;
        } catch (error) {
            console.error('❌ Error saving routes:', error);
            throw error;
        }
    },

    /**
     * Fetch all official routes from Firestore
     * If authorityIds are provided, only returns routes associated with parks in those authorities
     */
    fetchOfficialRoutes: async (authorityIds?: string[]): Promise<Route[]> => {
        try {
            let querySnapshot;
            
            if (authorityIds && authorityIds.length > 0) {
                // For authority_manager: fetch routes by filtering through park associations
                // First, get all parks for the authority
                const parksPromises = authorityIds.map(authId => getParksByAuthority(authId));
                const parksArrays = await Promise.all(parksPromises);
                const parks = parksArrays.flat();
                const parkIds = parks.map(p => p.id);
                
                if (parkIds.length === 0) {
                    // No parks found for this authority, return empty routes
                    return [];
                }
                
                // Fetch all routes
                querySnapshot = await getDocs(collection(db, 'official_routes'));
                
                // Filter routes that are associated with parks in the authority
                const filteredDocs = querySnapshot.docs.filter(doc => {
                    const data = doc.data();
                    const visitingParkId = data.visitingParkId;
                    return visitingParkId && parkIds.includes(visitingParkId);
                });
                
                return filteredDocs.map(doc => {
                    const data = doc.data();
                    // Map back from {lng, lat}[] to [number, number][]
                    const path = (data.path as { lng: number, lat: number }[]).map(p => [p.lng, p.lat] as [number, number]);

                    return {
                        ...data,
                        id: doc.id,
                        path
                    } as Route;
                });
            } else {
                // For super_admin/system_admin: fetch all routes
                querySnapshot = await getDocs(collection(db, 'official_routes'));
                return querySnapshot.docs.map(doc => {
                    const data = doc.data();
                    // Map back from {lng, lat}[] to [number, number][]
                    const path = (data.path as { lng: number, lat: number }[]).map(p => [p.lng, p.lat] as [number, number]);

                    return {
                        ...data,
                        id: doc.id,
                        path
                    } as Route;
                });
            }
        } catch (error) {
            console.error('❌ Error fetching official routes:', error);
            return [];
        }
    },

    /**
     * Fetch all import batches grouped by importBatchId
     */
    fetchImportBatches: async (): Promise<ImportBatchSummary[]> => {
        try {
            const querySnapshot = await getDocs(collection(db, 'official_routes'));
            const batchMap = new Map<string, ImportBatchSummary>();

            querySnapshot.docs.forEach(docSnap => {
                const data = docSnap.data();
                const batchId = data.importBatchId as string | undefined;
                if (!batchId) return; // skip routes without a batch ID (manual routes, legacy)

                if (batchMap.has(batchId)) {
                    batchMap.get(batchId)!.count++;
                } else {
                    batchMap.set(batchId, {
                        batchId,
                        sourceName: (data.importSourceName as string) || batchId,
                        count: 1,
                        createdAt: data.createdAt?.toDate?.() || null,
                        authorityId: data.authorityId as string | undefined,
                    });
                }
            });

            return Array.from(batchMap.values()).sort(
                (a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0)
            );
        } catch (error) {
            console.error('❌ Error fetching import batches:', error);
            return [];
        }
    },

    /**
     * Delete all routes belonging to a specific importBatchId
     */
    deleteImportBatch: async (batchId: string): Promise<number> => {
        try {
            const q = query(
                collection(db, 'official_routes'),
                where('importBatchId', '==', batchId)
            );
            const snapshot = await getDocs(q);

            if (snapshot.empty) return 0;

            // Firestore batch limit is 500, so chunk if needed
            const docs = snapshot.docs;
            let deleted = 0;
            for (let i = 0; i < docs.length; i += 500) {
                const batch = writeBatch(db);
                const chunk = docs.slice(i, i + 500);
                chunk.forEach(d => batch.delete(d.ref));
                await batch.commit();
                deleted += chunk.length;
            }

            console.log(`✅ Deleted ${deleted} routes from batch "${batchId}"`);
            return deleted;
        } catch (error) {
            console.error('❌ Error deleting import batch:', error);
            throw error;
        }
    },

    /**
     * Bulk-assign authorityId + city to routes that currently lack an authorityId.
     * If batchId is provided, only affects that batch; otherwise affects ALL unassigned routes.
     */
    bulkAssignAuthority: async (
        authorityId: string,
        cityName: string,
        batchId?: string
    ): Promise<number> => {
        try {
            const routesRef = collection(db, 'official_routes');
            const snapshot = await getDocs(routesRef);

            // Filter docs that need updating
            const toUpdate = snapshot.docs.filter(d => {
                const data = d.data();
                const hasNoAuthority = !data.authorityId;
                const matchesBatch = batchId ? data.importBatchId === batchId : true;
                return hasNoAuthority && matchesBatch;
            });

            if (toUpdate.length === 0) return 0;

            let updated = 0;
            for (let i = 0; i < toUpdate.length; i += 500) {
                const batch = writeBatch(db);
                const chunk = toUpdate.slice(i, i + 500);
                chunk.forEach(d => {
                    batch.update(d.ref, {
                        authorityId,
                        city: cityName,
                        updatedAt: serverTimestamp(),
                    });
                });
                await batch.commit();
                updated += chunk.length;
            }

            console.log(`✅ Assigned authority "${cityName}" to ${updated} routes`);
            return updated;
        } catch (error) {
            console.error('❌ Error bulk-assigning authority:', error);
            throw error;
        }
    },

    /**
     * Delete ALL routes for a specific authority (official_routes + curated_routes).
     * Used for a clean re-upload / fresh start.
     */
    deleteAllRoutesByAuthority: async (authorityId: string): Promise<number> => {
        try {
            let totalDeleted = 0;

            // 1️⃣ Delete from official_routes
            const officialQ = query(
                collection(db, 'official_routes'),
                where('authorityId', '==', authorityId)
            );
            const officialSnap = await getDocs(officialQ);
            for (let i = 0; i < officialSnap.docs.length; i += 500) {
                const batch = writeBatch(db);
                const chunk = officialSnap.docs.slice(i, i + 500);
                chunk.forEach(d => batch.delete(d.ref));
                await batch.commit();
                totalDeleted += chunk.length;
            }

            // 2️⃣ Delete from curated_routes
            const curatedQ = query(
                collection(db, 'curated_routes'),
                where('authorityId', '==', authorityId)
            );
            const curatedSnap = await getDocs(curatedQ);
            for (let i = 0; i < curatedSnap.docs.length; i += 500) {
                const batch = writeBatch(db);
                const chunk = curatedSnap.docs.slice(i, i + 500);
                chunk.forEach(d => batch.delete(d.ref));
                await batch.commit();
                totalDeleted += chunk.length;
            }

            console.log(`✅ Deleted ${totalDeleted} routes (official + curated) for authority "${authorityId}"`);
            return totalDeleted;
        } catch (error) {
            console.error('❌ Error deleting routes by authority:', error);
            throw error;
        }
    },

    // ══════════════════════════════════════════════════
    // Curated Routes — pre-calculated onboarding routes
    // ══════════════════════════════════════════════════

    /**
     * Save curated routes to both `curated_routes` (fast lookup) AND `official_routes` (unified).
     * Handles chunking and strips undefined fields.
     */
    saveCuratedRoutes: async (routes: Route[]): Promise<boolean> => {
        try {
            // Helper to build a clean Firestore document from a route
            const buildDoc = (r: Route) => {
                const transformedPath = r.path.map(p => ({ lng: p[0], lat: p[1] }));
                return stripUndefined({
                    ...r,
                    path: transformedPath,
                    activityType: r.activityType || r.type,
                    isInfrastructure: false,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                });
            };

            // 1️⃣ Save to curated_routes collection (indexed by authorityId for instant fetch)
            const curatedRef = collection(db, 'curated_routes');
            for (let i = 0; i < routes.length; i += 500) {
                const batch = writeBatch(db);
                routes.slice(i, i + 500).forEach(r => batch.set(doc(curatedRef), buildDoc(r)));
                await batch.commit();
            }

            // 2️⃣ Also save to official_routes (so they appear in inventory)
            const officialRef = collection(db, 'official_routes');
            for (let i = 0; i < routes.length; i += 500) {
                const batch = writeBatch(db);
                routes.slice(i, i + 500).forEach(r => batch.set(doc(officialRef), buildDoc(r)));
                await batch.commit();
            }

            console.log(`✅ Saved ${routes.length} curated routes to both collections`);
            return true;
        } catch (error) {
            console.error('❌ Error saving curated routes:', error);
            throw error;
        }
    },

    /**
     * Fetch curated routes for a specific authority — ultra-fast (<1s).
     * Used by onboarding to instantly show 3 stitched experience routes.
     */
    fetchCuratedRoutesByAuthority: async (authorityId: string): Promise<Route[]> => {
        try {
            const q = query(
                collection(db, 'curated_routes'),
                where('authorityId', '==', authorityId),
                orderBy('curatedTier')
            );
            const snapshot = await getDocs(q);
            return snapshot.docs
                .map(docSnap => {
                    const data = docSnap.data();
                    // Null-safe path handling
                    const rawPath = data.path;
                    if (!Array.isArray(rawPath) || rawPath.length < 2) return null;
                    const path = rawPath.map(
                        (p: any) => [Number(p.lng) || 0, Number(p.lat) || 0] as [number, number]
                    );
                    return {
                        ...data,
                        id: docSnap.id,
                        path,
                        // Null-safe numeric fields
                        distance: typeof data.distance === 'number' && !isNaN(data.distance) ? data.distance : 0,
                        rating: typeof data.rating === 'number' && !isNaN(data.rating) ? data.rating : 0,
                        duration: typeof data.duration === 'number' && !isNaN(data.duration) ? data.duration : 0,
                        score: typeof data.score === 'number' && !isNaN(data.score) ? data.score : 0,
                    } as Route;
                })
                .filter((r): r is Route => r !== null);
        } catch (error) {
            console.error('❌ Error fetching curated routes:', error);
            return [];
        }
    },

    /**
     * Fetch raw infrastructure segments for a specific authority.
     * Used by the stitching engine on the admin side.
     */
    fetchInfrastructureByAuthority: async (authorityId: string): Promise<Route[]> => {
        try {
            const q = query(
                collection(db, 'official_routes'),
                where('authorityId', '==', authorityId),
                where('isInfrastructure', '==', true)
            );
            const snapshot = await getDocs(q);
            return snapshot.docs
                .map(docSnap => {
                    const data = docSnap.data();
                    // Null-safe path handling
                    const rawPath = data.path;
                    if (!Array.isArray(rawPath) || rawPath.length < 2) return null;
                    const path = rawPath.map(
                        (p: any) => [Number(p.lng) || 0, Number(p.lat) || 0] as [number, number]
                    );
                    return {
                        ...data,
                        id: docSnap.id,
                        path,
                        // Null-safe numeric fields
                        distance: typeof data.distance === 'number' && !isNaN(data.distance) ? data.distance : 0,
                        rating: typeof data.rating === 'number' && !isNaN(data.rating) ? data.rating : 0,
                    } as Route;
                })
                .filter((r): r is Route => r !== null);
        } catch (error) {
            console.error('❌ Error fetching infrastructure:', error);
            return [];
        }
    },

    /**
     * Calculate total infrastructure stats for an authority (total KM, segment count).
     *
     * IMPORTANT: Computes distance from path coordinates (Haversine) — NOT from the
     * stored `distance` field — because GIS imports may use inconsistent units.
     * Uses a fresh Set on every call to prevent double-counting across re-renders.
     */
    fetchInfrastructureStats: async (authorityId: string): Promise<{ totalKm: number; segmentCount: number }> => {
        // Reset everything — fresh calculation each time
        let totalKm = 0;
        const seen = new Set<string>();

        try {
            const routes = await InventoryService.fetchInfrastructureByAuthority(authorityId);

            for (const r of routes) {
                const key = r.id || `${r.name}_${r.path?.length}`;
                if (seen.has(key)) continue;
                seen.add(key);

                // Compute distance from actual path coordinates, not stored field
                if (r.path && r.path.length >= 2) {
                    let segmentMeters = 0;
                    for (let i = 1; i < r.path.length; i++) {
                        const [lng1, lat1] = r.path[i - 1];
                        const [lng2, lat2] = r.path[i];
                        const R = 6371e3;
                        const p1 = (lat1 * Math.PI) / 180;
                        const p2 = (lat2 * Math.PI) / 180;
                        const dp = ((lat2 - lat1) * Math.PI) / 180;
                        const dl = ((lng2 - lng1) * Math.PI) / 180;
                        const a =
                            Math.sin(dp / 2) ** 2 +
                            Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
                        segmentMeters += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                    }
                    totalKm += segmentMeters / 1000;
                }
            }

            return { totalKm: Math.round(totalKm * 10) / 10, segmentCount: seen.size };
        } catch (error) {
            console.error('❌ Error fetching infrastructure stats:', error);
            return { totalKm: 0, segmentCount: 0 };
        }
    },

    /**
     * Delete all curated routes for an authority (before regenerating).
     */
    deleteCuratedRoutesByAuthority: async (authorityId: string): Promise<number> => {
        try {
            const q = query(
                collection(db, 'curated_routes'),
                where('authorityId', '==', authorityId)
            );
            const snapshot = await getDocs(q);
            if (snapshot.empty) return 0;

            let deleted = 0;
            for (let i = 0; i < snapshot.docs.length; i += 500) {
                const batch = writeBatch(db);
                const chunk = snapshot.docs.slice(i, i + 500);
                chunk.forEach(d => batch.delete(d.ref));
                await batch.commit();
                deleted += chunk.length;
            }

            console.log(`✅ Deleted ${deleted} curated routes for authority "${authorityId}"`);
            return deleted;
        } catch (error) {
            console.error('❌ Error deleting curated routes:', error);
            throw error;
        }
    },
};
