'use client';

/** The drawer's filter chips (הכול / כוח / ריצה / הליכה / משולב), board RP-4 phone א. Render-only. */

import { Chip, HScroller } from '@/components/ui/v2';
import { useT } from '@/hooks/useT';
import { map } from '@/messages/ns/map';
import { PLACES_CHIPS, type PlacesChip } from './places-drawer.logic';

export interface PlacesDrawerChipsProps {
  value: PlacesChip;
  onChange: (chip: PlacesChip) => void;
}

export default function PlacesDrawerChips({ value, onChange }: PlacesDrawerChipsProps) {
  const t = useT(map);
  return (
    <HScroller gap={2} edge={5} snap={false} role="group" aria-label={t('placesDrawer.chipsLabel')} className="pb-1">
      {PLACES_CHIPS.map((chip) => {
        const on = chip === value;
        return (
          <button key={chip} type="button" aria-pressed={on} onClick={() => onChange(chip)} data-places-chip={chip}
            className="rounded-full transition-transform duration-150 ease-v2 active:scale-[0.97]">
            <Chip tone={on ? 'accent' : 'neutral'} className="h-8 px-3.5 text-[13px]">
              {t('placesDrawer.chip', { chip })}
            </Chip>
          </button>
        );
      })}
    </HScroller>
  );
}
