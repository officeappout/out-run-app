'use client';

import { useState } from 'react';
import { PersonStanding } from 'lucide-react';
import { resolveEquipmentSvgPath } from '@/features/workout-engine/shared/utils/gear-mapping.utils';

interface DrawerEquipmentBadgeProps {
  /** Canonical equipment key (already normalised by `collectEquipment`). */
  id: string;
  /** Hebrew display label, pre-resolved by the parent. */
  label: string;
}

/**
 * Frosted pill that renders an equipment icon + its Hebrew label.
 * Falls back to a generic `PersonStanding` glyph if the SVG asset fails
 * to load (e.g. asset missing from the public bundle).
 */
export default function DrawerEquipmentBadge({ id, label }: DrawerEquipmentBadgeProps) {
  const iconSrc = resolveEquipmentSvgPath(id);
  // Track whether the SVG failed to load so we can fall back to PersonStanding.
  const [imgFailed, setImgFailed] = useState(false);
  const showImg = !imgFailed && iconSrc && iconSrc.startsWith('/');

  return (
    <div
      className="flex-shrink-0 flex items-center gap-2 bg-white dark:bg-slate-800/90 shadow-sm rounded-lg px-4 py-2"
      style={{ border: '0.5px solid #E0E9FF' }}
      dir="rtl"
    >
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={iconSrc!}
          alt={label}
          width={18}
          height={18}
          className="object-contain"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <PersonStanding size={18} className="text-slate-400 flex-shrink-0" />
      )}
      <span className="text-sm font-normal text-gray-800 dark:text-gray-100 whitespace-nowrap">{label}</span>
    </div>
  );
}
