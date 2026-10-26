'use client';

/**
 * A tapped park's workouts inside the drawer (board RP-4 phone ב) — the park page's own
 * "מתאים לך כאן" (ParkPlaceWorkouts, no fork). Its equipment docs are read here and its first
 * workout is generated (inside ParkPlaceWorkouts) — only on tap, never for the list. The lead card's
 * label drives the drawer's sticky "התחל" button.
 */

import type { Park } from '@/features/parks/core/types/park.types';
import ParkPlaceWorkouts, { type PlaceLeadCta } from '../place-workouts/ParkPlaceWorkouts';
import { useParkEquipment } from '../park-detail/hooks/useParkDetailData';

export interface DrawerParkWorkoutsProps {
  /** The full record (point-fetched by the caller); null while it loads. */
  park: Park | null;
  loading: boolean;
  userLocation: { lat: number; lng: number } | null;
  onClose: () => void;
  onLeadChange: (lead: PlaceLeadCta | null) => void;
}

export default function DrawerParkWorkouts({ park, loading, userLocation, onClose, onLeadChange }: DrawerParkWorkoutsProps) {
  const { parkEquipment } = useParkEquipment(!!park, park);
  if (loading) return <div className="mx-5 mb-4 h-[196px] animate-pulse rounded-v2-card bg-v2-surface" aria-hidden />;
  if (!park) return null;
  return (
    <div className="px-5">
      <ParkPlaceWorkouts park={park} equipment={parkEquipment} userLocation={userLocation} onClose={onClose} onLeadChange={onLeadChange} />
    </div>
  );
}
