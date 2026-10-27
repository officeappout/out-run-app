'use client';

/**
 * Nothing in walking range (board RP-4 phone ג) — or nothing for the chosen chip: ONE action,
 * "צור לי מסלול באזור שלי", which opens the EXISTING route generator (the free-run drawer's
 * "עם מסלול", fired once). Run / walk pick only — no new generator, no invented preview numbers.
 */

import { useState } from 'react';
import { MapPin } from 'lucide-react';
import { Button, Chip } from '@/components/ui/v2';
import { useT } from '@/hooks/useT';
import { map } from '@/messages/ns/map';
import type { GeneratorActivity } from './places-drawer.logic';

const ACTIVITIES: readonly GeneratorActivity[] = ['running', 'walking'];

export interface PlacesDrawerEmptyProps {
  reason: 'none_near' | 'none_for_chip';
  initialActivity: GeneratorActivity;
  onGenerate: (activity: GeneratorActivity) => void;
}

export default function PlacesDrawerEmpty({ reason, initialActivity, onGenerate }: PlacesDrawerEmptyProps) {
  const t = useT(map);
  const [activity, setActivity] = useState<GeneratorActivity>(initialActivity);
  return (
    <div className="px-5 pb-4 pt-2 text-center" data-places-empty={reason}>
      <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-v2-tint text-v2-deep" aria-hidden>
        <MapPin size={22} />
      </span>
      <h4 className="text-[17px] font-black text-v2-ink">
        {reason === 'none_near' ? t('placesDrawer.empty.titleNear') : t('placesDrawer.empty.titleChip')}
      </h4>
      <p className="mt-1 text-[13px] font-bold leading-snug text-v2-muted">{t('placesDrawer.empty.body')}</p>
      <div className="mt-3 flex justify-center gap-2">
        {ACTIVITIES.map((a) => (
          <button key={a} type="button" aria-pressed={a === activity} onClick={() => setActivity(a)}
            className="rounded-full transition-transform duration-150 ease-v2 active:scale-[0.97]">
            <Chip tone={a === activity ? 'accent' : 'neutral'} className="h-8 px-4 text-[13px]">
              {t('placesDrawer.empty.activity', { activity: a })}
            </Chip>
          </button>
        ))}
      </div>
      <Button variant="cta" block className="mt-4" onClick={() => onGenerate(activity)}>
        {t('placesDrawer.empty.cta')}
      </Button>
      <p className="mt-2 text-[12px] font-bold text-v2-muted">{t('placesDrawer.empty.hint')}</p>
    </div>
  );
}
