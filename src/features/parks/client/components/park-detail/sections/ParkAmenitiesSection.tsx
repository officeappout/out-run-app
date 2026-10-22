'use client';

import type { Park } from '@/features/parks/core/types/park.types';
import IconChip from '../IconChip';
import { AMENITY_ICON_MAP, AMENITY_DISPLAY_ORDER } from '../amenity-icons';
import { sectionTitleClass } from './section-styles';
import { useT } from '@/hooks/useT';
import { map as mapNs } from '@/messages/ns/map';

/**
 * AMENITIES — "פירוט על הפארק": the wider park context (shade, lighting,
 * benches, accessibility…) as compact chips in the same `IconChip` style as
 * the strength-workout equipment tags. Each tag falls back through dedicated
 * SVG asset → lucide vector → emoji placeholder (see `amenity-icons.ts`).
 */
export default function ParkAmenitiesSection({ park, v2 }: { park: Park; v2: boolean }) {
  const t = useT(mapNs);
  return (
    <section className="mb-6">
      <h3 className={sectionTitleClass(v2)}>{t('parkDetail.amenities.title')}</h3>
      {park.featureTags && park.featureTags.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {AMENITY_DISPLAY_ORDER
            .filter((tag) => park.featureTags?.includes(tag))
            .map((tag) => {
              const cfg = AMENITY_ICON_MAP[tag];
              if (!cfg) return null;
              return (
                <IconChip
                  key={tag}
                  label={cfg.label}
                  iconSrc={cfg.iconSrc}
                  IconComponent={cfg.IconComponent}
                  v2={v2}
                />
              );
            })}
        </div>
      ) : (
        <div className="text-center py-4 bg-gray-50 dark:bg-slate-800/30 rounded-xl">
          <p className="text-sm text-gray-400">{t('parkDetail.amenities.empty')}</p>
        </div>
      )}
    </section>
  );
}
