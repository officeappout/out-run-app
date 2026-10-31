'use client';

/**
 * "תרגילים לפי רמה" — the machine's exercises as the exercise page's
 * progression strip (V2LevelNode on a white card over a dashed trail),
 * lowest level first, scrolling sideways when there are more than fit.
 * Render-only; nothing when the machine has no levels / variations.
 *
 * Camera scan boards (enable_equipment_scan_v1): items may carry a personal
 * state (completed / current / locked, V2LevelNode's own marks), a note line
 * under the title, and a footer (the strength-quiz row).
 */

import type { ReactNode } from 'react';
import { V2LevelNode, DETAIL_SECTION_FONT, DETAIL_V2_H3 } from '@/features/content/exercises/client/components/detail-v2/DetailV2Parts';
import type { EquipmentLevelItem, PersonalLevelState } from './equipment-levels';

export interface EquipmentLevelsSectionProps {
  title: string;
  items: readonly (EquipmentLevelItem & { state?: PersonalLevelState })[];
  levelLabel: (level: number, state?: PersonalLevelState) => string;
  note?: string;
  footer?: ReactNode;
}

export default function EquipmentLevelsSection({ title, items, levelLabel, note, footer }: EquipmentLevelsSectionProps) {
  if (items.length === 0) return null;
  return (
    <section className="mb-6" data-equipment-levels>
      <h3 className={`${DETAIL_V2_H3} ${note ? 'mb-1' : 'mb-3'}`} style={DETAIL_SECTION_FONT}>{title}</h3>
      {note && <p className="mb-3 text-[12.5px] font-bold text-v2-muted">{note}</p>}
      <div className="relative overflow-hidden rounded-v2-card bg-white shadow-v2-card">
        <div className="no-scrollbar overflow-x-auto px-3 pb-3.5 pt-4">
          <div className="relative flex w-max min-w-full items-start gap-2">
            <div aria-hidden className="pointer-events-none absolute inset-x-8 top-[44px] border-t-[3px] border-dashed border-v2-accent/40" />
            {items.map((it) => (
              <div key={it.id} className="flex w-[92px] shrink-0">
                <V2LevelNode
                  thumb={it.thumb}
                  name={it.name}
                  levelLabel={it.level > 0 ? levelLabel(it.level, it.state) : ''}
                  current={it.state === 'current'}
                  completed={it.state === 'completed'}
                  locked={it.state === 'locked'}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
      {footer}
    </section>
  );
}
