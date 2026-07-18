'use client';

import { Activity, Dumbbell, Footprints, type LucideIcon } from 'lucide-react';
import { type SegmentRailType, railColor } from './segment-rail.util';

export interface SegmentRailItem {
  id: string;
  type: SegmentRailType;
  label: string;
  /** Short plan/result detail, e.g. "1.2 ק״מ" or "3 סטים". */
  detail?: string;
  completed?: boolean;
}

const ICON_BY_TYPE: Record<SegmentRailType, LucideIcon> = {
  aerobic: Activity,
  strength: Dumbbell,
  stairs: Footprints,
};

interface SegmentRailProps {
  items: SegmentRailItem[];
}

/**
 * Moovit-style session rail (design spec v0.9 §2): a horizontal icon axis
 * (the story at a glance) above a vertical rail with one node per segment,
 * coloured by type. Presentational only — the composition page maps the
 * session's SessionSegmentRecord[] into SegmentRailItem[].
 */
export default function SegmentRail({ items }: SegmentRailProps) {
  if (!items.length) return null;

  return (
    <div dir="rtl" style={{ fontFamily: 'var(--font-simpler)' }}>
      {/* Horizontal icon axis — the story at a glance */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {items.map((item, i) => {
          const Icon = ICON_BY_TYPE[item.type];
          const color = railColor(item.type);
          return (
            <div key={`axis-${item.id}`} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 999,
                  background: `${color}22`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon size={16} color={color} />
              </div>
              {i < items.length - 1 && <span style={{ color: '#c4ccca' }}>‹</span>}
            </div>
          );
        })}
      </div>

      {/* Vertical rail — one node per segment */}
      <div style={{ position: 'relative', paddingInlineStart: 22 }}>
        {items.map((item, i) => {
          const color = railColor(item.type);
          const isLast = i === items.length - 1;
          const Icon = ICON_BY_TYPE[item.type];
          return (
            <div key={`node-${item.id}`} style={{ position: 'relative', paddingBottom: isLast ? 0 : 20 }}>
              {!isLast && (
                <span
                  style={{
                    position: 'absolute',
                    insetInlineStart: -13,
                    top: 22,
                    bottom: 0,
                    width: 2,
                    background: `${color}55`,
                  }}
                />
              )}
              <div
                style={{
                  position: 'absolute',
                  insetInlineStart: -22,
                  top: 2,
                  width: 20,
                  height: 20,
                  borderRadius: 999,
                  background: color,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: item.completed === false ? 0.4 : 1,
                }}
              >
                <Icon size={12} color="#fff" />
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#1b2321' }}>{item.label}</div>
                {item.detail && <div style={{ fontSize: 13, color: '#6b7472' }}>{item.detail}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
