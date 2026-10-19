'use client';

import React, { useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Loader2, MapPin, Trees } from 'lucide-react';
import { getParksByAuthority } from '@/features/admin/services/parks.service';
import { reverseGeocode } from '@/features/user/onboarding/components/steps/UnifiedLocation/location-utils';
import type { Park } from '@/features/parks/core/types/park.types';
import { FieldLabel } from './FieldLabel';
import { ScheduleSlotsEditor } from './ScheduleSlotsEditor';
import { sortParksByDistance } from './wizard-logic';
import { WizardV2, V2C } from './wizard-v2';
import type { UpdateForm, WizardForm } from './wizard-types';

// Mapbox components are client-only — lazy-loaded to avoid SSR errors
const MiniLocationPicker = dynamic(
  () => import('@/features/admin/components/MiniLocationPicker'),
  { ssr: false, loading: () => <div className="h-44 w-full rounded-xl bg-gray-100 animate-pulse" /> },
);

const CommunityAddressSearch = dynamic(
  () => import('@/features/arena/components/CommunityAddressSearch'),
  { ssr: false, loading: () => <div className="h-12 w-full rounded-xl bg-gray-100 animate-pulse" /> },
);

// ── Step 3: When & Where (location + schedule combined) ──────────────────────

export function StepWhenWhere({
  form,
  updateForm,
  authorityId,
  hasRealAnchor,
  slotDay,
  slotTime,
  setSlotDay,
  setSlotTime,
  addSlot,
  removeSlot,
}: {
  form: WizardForm;
  updateForm: UpdateForm;
  authorityId: string;
  /** True when profile.core.anchorLat/Lng are set — enables proximity sort. */
  hasRealAnchor: boolean;
  slotDay: number;
  slotTime: string;
  setSlotDay: (d: number) => void;
  setSlotTime: (t: string) => void;
  addSlot: () => void;
  removeSlot: (i: number) => void;
}) {
  const [rawParks, setRawParks] = React.useState<Park[]>([]);
  const [parksLoading, setParksLoading] = React.useState(false);
  const [selectedParkId, setSelectedParkId] = React.useState<string | null>(null);
  const [geocoding, setGeocoding] = React.useState(false);
  const v2 = React.useContext(WizardV2);

  // Derive sorted list: by distance when anchor/pin is known; fallback to A-Z (raw DB order).
  const parks = React.useMemo(() => {
    if (!hasRealAnchor && !form.locationSelected) return rawParks;
    return sortParksByDistance(rawParks, { lat: form.coords.lat, lng: form.coords.lng });
  }, [rawParks, hasRealAnchor, form.locationSelected, form.coords.lat, form.coords.lng]);

  // Fetch city parks once when the step mounts
  React.useEffect(() => {
    if (!authorityId) return;
    setParksLoading(true);
    getParksByAuthority(authorityId)
      .then(setRawParks)
      .catch(() => setRawParks([]))
      .finally(() => setParksLoading(false));
  }, [authorityId]);

  // Address search → update address + coords + set locationSelected
  const handleAddressSelect = useCallback(
    ({ address, coords }: { address: string; coords: { lat: number; lng: number } }) => {
      setSelectedParkId(null);
      setForm_address(address, coords);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [updateForm],
  );

  // Park chip tap → fill address from park name, move pin
  const handleParkSelect = useCallback(
    (park: Park) => {
      const label = [park.name, park.address].filter(Boolean).join(', ');
      setSelectedParkId(park.id);
      setForm_address(label, { lat: park.location.lat, lng: park.location.lng });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [updateForm],
  );

  // Map pin click → update coords, reverse-geocode to fill address automatically
  const handleMapPinChange = useCallback(
    (coords: { lat: number; lng: number }) => {
      setSelectedParkId(null);
      updateForm('coords', coords);
      updateForm('locationSelected', true);
      setGeocoding(true);
      reverseGeocode(coords.lat, coords.lng)
        .then(({ displayName }) => {
          updateForm('address', displayName || 'מיקום על המפה');
        })
        .catch(() => {
          if (!form.address.trim()) updateForm('address', 'מיקום על המפה');
        })
        .finally(() => setGeocoding(false));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [form.address, updateForm],
  );

  // Helper that atomically sets address + coords + locationSelected
  function setForm_address(address: string, coords: { lat: number; lng: number }) {
    updateForm('address', address);
    updateForm('coords', coords);
    updateForm('locationSelected', true);
  }

  return (
    <div className="space-y-5 pt-4">
      {/* ── Address autocomplete ─────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <FieldLabel>חפש כתובת, פארק או מקום</FieldLabel>
          {geocoding && <Loader2 className={`w-3.5 h-3.5 animate-spin ${v2 ? 'text-v2-deep' : 'text-cyan-500'}`} />}
        </div>
        <CommunityAddressSearch
          value={form.address}
          onChange={handleAddressSelect}
          proximity={form.coords}
          v2={v2}
        />
      </div>

      {/* ── City parks list ──────────────────────────────── */}
      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <Trees className={`w-3.5 h-3.5 ${v2 ? 'mb-2 text-v2-deep' : 'text-emerald-500'}`} />
          <FieldLabel>בחר מפארקים עירוניים</FieldLabel>
        </div>

        {parksLoading ? (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className={`h-9 w-28 flex-shrink-0 animate-pulse ${v2 ? 'rounded-full bg-v2-surface ring-1 ring-inset ring-v2-hairline' : 'rounded-xl bg-gray-100'}`} />
            ))}
          </div>
        ) : parks.length === 0 ? (
          <p className={v2 ? `${V2C.hint} py-1` : 'text-[11px] text-gray-400 py-1'}>
            {authorityId ? 'לא נמצאו פארקים עירוניים' : 'הרשאת עיר לא מוגדרת'}
          </p>
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide -mx-1 px-1 snap-x">
            {parks.map((park) => {
              const isSelected = selectedParkId === park.id;
              return (
                <button
                  key={park.id}
                  type="button"
                  onClick={() => handleParkSelect(park)}
                  aria-pressed={v2 ? isSelected : undefined}
                  className={
                    v2
                      ? `flex h-10 flex-shrink-0 snap-start items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[13.5px] font-extrabold ${V2C.press} ${isSelected ? V2C.chipOn : V2C.chipOff}`
                      : [
                    'flex-shrink-0 snap-start flex items-center gap-1.5 px-3 py-2 rounded-xl border-2 text-xs font-bold transition-all active:scale-95',
                    isSelected
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                      : 'border-gray-100 bg-gray-50 text-gray-700 hover:border-gray-200',
                  ].join(' ')}
                >
                  <MapPin className={`w-3 h-3 flex-shrink-0 ${v2 ? (isSelected ? 'text-v2-deep' : 'text-v2-muted') : isSelected ? 'text-emerald-500' : 'text-gray-400'}`} />
                  <span className="truncate max-w-[120px]">{park.name}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Map pin fine-tuning ──────────────────────────── */}
      <div>
        <FieldLabel>
          {form.locationSelected ? 'כיוון עדין על המפה' : 'או לחץ על המפה לסימון מיקום'}
        </FieldLabel>
        <div className={v2 ? 'overflow-hidden rounded-[20px] shadow-v2-ring' : undefined}>
          <MiniLocationPicker
            value={form.coords}
            onChange={handleMapPinChange}
            v2={v2}
          />
        </div>
        <p className={v2 ? `${V2C.hint} mt-1.5` : 'text-[10px] text-gray-400 mt-1.5'}>
          לחץ על המפה כדי לדייק את הפין
        </p>
      </div>

      {/* ── Schedule ─────────────────────────────────────── */}
      <ScheduleSlotsEditor
        scheduleSlots={form.scheduleSlots}
        slotDay={slotDay}
        slotTime={slotTime}
        setSlotDay={setSlotDay}
        setSlotTime={setSlotTime}
        addSlot={addSlot}
        removeSlot={removeSlot}
      />
    </div>
  );
}
