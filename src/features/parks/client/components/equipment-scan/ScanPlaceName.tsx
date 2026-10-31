'use client';

/**
 * Park mapping, inside the location step (ScanMap board "מיקום ושם"): the GPS accuracy line and
 * the name, pre-filled once from the nearest street (reverseGeocodeStreet) and always editable.
 */
import { useEffect, useRef, useState } from 'react';
import { reverseGeocodeStreet } from '@/features/user/onboarding/components/steps/UnifiedLocation/location-utils';
import { useT } from '@/hooks/useT';
import { map } from '@/messages/ns/map';
import { V2_INPUT, V2_LABEL } from '../contribution-wizard/wizard-v2';
import { streetForName } from './park-scan-mapping';

export interface ScanPlaceNameProps {
  location: { lat: number; lng: number } | null;
  accuracy?: number | null;
  name: string;
  onName: (name: string) => void;
}

export default function ScanPlaceName({ location, accuracy, name, onName }: ScanPlaceNameProps) {
  const t = useT(map);
  const [street, setStreet] = useState<string | null>(null);
  const asked = useRef(false);

  useEffect(() => {
    if (asked.current || !location) return;
    asked.current = true;
    reverseGeocodeStreet(location.lat, location.lng).then((s) => {
      const part = streetForName(s);
      if (!part) return;
      setStreet(s);
      if (!name.trim()) onName(t('wizard.scan.place.suggestion', { street: part }));
    }).catch(() => {});
    // Once, from the first location: later pin moves keep the user's name.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location]);

  return (
    <div className="mb-4">
      {typeof accuracy === 'number' && (
        <p className="mb-3 text-[12.5px] font-bold text-v2-muted">{t('wizard.scan.place.gps', { m: String(Math.round(accuracy)) })}</p>
      )}
      <label className={V2_LABEL} htmlFor="scan-place-name">{t('wizard.scan.place.nameLabel')}</label>
      <input id="scan-place-name" type="text" value={name} onChange={(e) => onName(e.target.value)} className={V2_INPUT} />
      {street && <p className="mt-1.5 text-[12px] font-bold text-v2-muted">{t('wizard.scan.place.suggestionHint', { street })}</p>}
    </div>
  );
}
