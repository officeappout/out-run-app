'use client';

/**
 * The 36px icon in the add-location wizard's equipment pills (enable_home_v2).
 *
 * The v2 pill (#385) only knew `iconKey`, so every catalog item without an
 * authored SVG — most outdoor park machines — fell to the generic dumbbell,
 * while the flag-off EquipmentCard always showed the brand product photo.
 * Same sources as EquipmentCard, ordered for a small circle: the authored SVG
 * (crisp at 24px) → the first brand's photo → the dumbbell. A source that fails
 * to load falls through to the next one.
 */
import React, { useState } from 'react';
import { Dumbbell } from 'lucide-react';
import { bunnyImg } from '@/lib/bunny-image';
import type { GymEquipment } from '@/features/content/equipment/gym/core/gym-equipment.types';

type Source = { kind: 'icon' | 'photo'; src: string };

/** `preferPhoto`: the camera-scan screens show the real catalog photo first (owner 31.10: no line icons there). */
export function equipmentPillSources(eq: Pick<GymEquipment, 'iconKey' | 'brands'>, preferPhoto = false): Source[] {
  const out: Source[] = [];
  const icon: Source | null = eq.iconKey ? { kind: 'icon', src: `/assets/icons/equipment/${eq.iconKey}.svg` } : null;
  const photoUrl = eq.brands?.find((b) => !!b.imageUrl)?.imageUrl;
  const photo: Source | null = photoUrl ? { kind: 'photo', src: bunnyImg(photoUrl, 96) } : null;
  for (const s of preferPhoto ? [photo, icon] : [icon, photo]) if (s) out.push(s);
  return out;
}

export function EquipmentPillIcon({ equipment, selected, preferPhoto = false }: { equipment: GymEquipment; selected: boolean; preferPhoto?: boolean }) {
  const sources = equipmentPillSources(equipment, preferPhoto);
  const [failed, setFailed] = useState(0);
  const current = sources[failed];

  if (!current) {
    return <Dumbbell size={16} strokeWidth={2.4} className={selected ? 'text-v2-deep' : 'text-v2-muted'} />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      key={current.src}
      src={current.src}
      alt=""
      className={current.kind === 'photo' ? 'h-9 w-9 rounded-full object-cover' : 'h-6 w-6 object-contain'}
      loading="lazy"
      decoding="async"
      onError={() => setFailed((n) => n + 1)}
    />
  );
}
