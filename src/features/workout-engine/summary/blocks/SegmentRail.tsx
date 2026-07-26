'use client';

import { Activity, Dumbbell, Footprints, ChevronLeft, type LucideIcon } from 'lucide-react';
import { type SegmentRailType, railColor } from './segment-rail.util';

export interface SegmentRailItem {
  id: string;
  type: SegmentRailType;
  label: string;
  /** Short plan/result detail, e.g. "2.00 ק״מ · 06:30" or "3 סטים". */
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
  /** Tap a segment to open its deep-dive sheet. Chevron shown only when set (sheets = fast-follow). */
  onSelect?: (item: SegmentRailItem) => void;
}

/**
 * Session rail (design spec v0.9 §2, Moovit style): a vertical rail with one
 * node per segment coloured by type (turquoise aerobic / amber strength / brown
 * stairs) and a gray pill per segment ("label · detail") with a chevron toward
 * its deep-dive. Presentational only — the page maps SessionSegmentRecord[] into
 * SegmentRailItem[].
 */
export default function SegmentRail({ items, onSelect }: SegmentRailProps) {
  if (!items.length) return null;

  return (
    <div dir="rtl" style={{ fontFamily: 'var(--font-simpler)' }}>
      {items.map((item, i) => {
        const color = railColor(item.type);
        const isLast = i === items.length - 1;
        const Icon = ICON_BY_TYPE[item.type];
        const dim = item.completed === false;
        return (
          <div key={item.id} style={{ display: 'flex', gap: 9 }}>
            {/* Rail node column — RTL: the line runs on the right edge */}
            <div style={{ position: 'relative', width: 26, flexShrink: 0 }}>
              <div
                style={
                  isLast
                    ? { position: 'absolute', insetInlineEnd: 11, top: 0, height: 12, width: 3, background: color }
                    : { position: 'absolute', insetInlineEnd: 11, top: 0, bottom: 0, width: 3, background: color }
                }
              />
              <div
                style={{
                  position: 'absolute',
                  insetInlineEnd: 3,
                  top: 4,
                  width: 20,
                  height: 20,
                  borderRadius: 999,
                  background: color,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: dim ? 0.5 : 1,
                }}
              >
                <Icon size={11} color="#fff" />
              </div>
            </div>
            {/* Pill */}
            <div style={{ flex: 1, padding: '2px 0 9px' }}>
              <button
                type="button"
                onClick={onSelect ? () => onSelect(item) : undefined}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: '#f3f5f4',
                  borderRadius: 9,
                  padding: '7px 11px',
                  border: 'none',
                  cursor: onSelect ? 'pointer' : 'default',
                  textAlign: 'start',
                }}
              >
                <span style={{ fontSize: 12, color: '#1b2220' }}>
                  {item.label}
                  {item.detail ? ` · ${item.detail}` : ''}
                </span>
                {onSelect && <ChevronLeft size={13} color={color} />}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
