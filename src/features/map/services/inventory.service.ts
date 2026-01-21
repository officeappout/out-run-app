import { db } from '@/lib/firebase';
import {
    collection,
    getDocs,
    addDoc,
    writeBatch,
    doc,
    query,
    where,
    orderBy,
    serverTimestamp
} from 'firebase/firestore';
import { Route, MapFacility } from '../types/map-objects.type';
import { getParksByAuthority } from '@/features/admin/services/parks.service';

export const InventoryService = {
    /**
     * Save multiple facilities to Firestore
     */
    saveFacilities: async (facilities: MapFacility[]) => {
        try {
            const batch = writeBatch(db);
            const facilitiesRef = collection(db, 'facilities');

            facilities.forEach((f) => {
                const newDocRef = doc(facilitiesRef);
                batch.set(newDocRef, {
                    ...f,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp()
                });
            });

            await batch.commit();
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
     * Save multiple routes to Firestore
     */
    saveRoutes: async (routes: Route[]) => {
        try {
            const batch = writeBatch(db);
            const routesRef = collection(db, 'official_routes');

            routes.forEach((r) => {
                const newDocRef = doc(routesRef);
                // Transform path from [lng, lat][] to {lng, lat}[] for Firestore
                const transformedPath = r.path.map(p => ({
                    lng: p[0],
                    lat: p[1]
                }));

                batch.set(newDocRef, {
                    ...r,
                    path: transformedPath,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp()
                });
            });

            await batch.commit();
            console.log(`✅ Saved ${routes.length} routes to Firestore`);
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
    }
};
