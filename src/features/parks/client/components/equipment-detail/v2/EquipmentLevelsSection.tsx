'use client';

/**
 * "תרגילים לפי רמה" — the machine's exercises as the exercise page's
 * progression strip (V2LevelNode on a white card over a dashed trail),
 * lowest level first, scrolling sideways when there are more than fit.
 * Render-only; nothing when the machine has no levels / variations.
 */

import { V2LevelNode, DETAIL_SECTION_FONT, DETAIL_V2_H3 } from '@/features/content/exercises/client/components/detail-v2/DetailV2Parts';
import type { EquipmentLevelItem } from './equipment-levels';

export interface EquipmentLevelsSectionProps {
  title: string;
  items: readonly EquipmentLevelItem[];
  levelLabel: (level: number) => string;
}

export default function EquipmentLevelsSection({ title, items, levelLabel }: EquipmentLevelsSectionProps) {
  if (items.length === 0) return null;
  return (
    <section className="mb-6" data-equipment-levels>
      <h3 className={`${DETAIL_V2_H3} mb-3`} style={DETAIL_SECTION_FONT}>{title}</h3>
      <div className="relative overflow-hidden rounded-v2-card bg-white shadow-v2-card">
        <div className="no-scrollbar overflow-x-auto px-3 pb-3.5 pt-4">
          <div className="relative flex w-max min-w-full items-start gap-2">
            <div aria-hidden className="pointer-events-none absolute inset-x-8 top-[44px] border-t-[3px] border-dashed border-v2-accent/40" />
            {items.map((it) => (
              <div key={it.id} className="flex w-[92px] shrink-0">
                <V2LevelNode thumb={it.thumb} name={it.name} levelLabel={it.level > 0 ? levelLabel(it.level) : ''} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
