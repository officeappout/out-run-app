'use client';

import { useEffect, useState } from 'react';
import { useMapStore } from '../store/useMapStore';
import { InventoryService } from '../services/inventory.service';

export function useFacilities() {
    const { facilities, setFacilities } = useMapStore();
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const load = async () => {
            if (facilities.length > 0) return; // Already loaded

            setLoading(true);
            try {
                const data = await InventoryService.fetchFacilities();
                setFacilities(data);
            } catch (err) {
                console.error('Failed to load facilities:', err);
            } finally {
                setLoading(true);
            }
        };

        load();
    }, [facilities.length, setFacilities]);

    return { facilities, loading };
}
