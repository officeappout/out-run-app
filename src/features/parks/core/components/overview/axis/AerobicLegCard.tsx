'use client';

/**
 * AerobicLegCard — one walk / run / ride leg on the overview axis.
 *
 * Layouts (from the route + stops axis, unchanged there):
 *   destination — Moovit-style: the title is where you go, one meta line.
 *   standard    — title + badge row, distance / time metas, pace pill,
 *                 optional loop note.
 * New (19.10.2026, board M-5b): `expandable` turns the header row into a
 * toggle (chevron beside the badge) and shows `detail` under the metas.
 */

import type { ReactNode } from 'react';
import { Clock, Ruler, Repeat, ChevronDown } from 'lucide-react';
import { ActivityGlyph } from '../../hybrid/activity-icons';
import { HYBRID_AER as AER } from '../../hybrid/hybrid-colors';
import type { AerobicLeg, AerobicMetaIcon } from '../overview-legs';
import { AER_TINT, AER_TEXT, CARD_PAD, Meta, fmtPace, useAxisCardStyles } from './AxisParts';

function metaIcon(icon: AerobicMetaIcon, activity?: string): ReactNode {
  if (icon === 'distance') return <Ruler size={14} />;
  if (icon === 'time') return <Clock size={14} />;
  return <ActivityGlyph kind="aerobic" subtype={activity} className="w-4 h-4" />;
}

export interface AerobicLegCardProps {
  leg: AerobicLeg;
  expanded?: boolean;
  onToggle?: () => void;
  /** Rendered under the metas while expanded. */
  detail?: ReactNode;
}

export default function AerobicLegCard({ leg, expanded = false, onToggle, detail }: AerobicLegCardProps) {
  const { v2, cardCls, cardStyle, titleCls, titleStyle, pacePillStyle } = useAxisCardStyles();
  const pace = leg.paceSecPerKm ?? 0;
  const metas = (
    <div className="flex items-center gap-2 flex-wrap mt-2">
      {leg.meta.map((m) => (
        <Meta key={m.key} tint={AER} icon={metaIcon(m.icon, leg.activity)}>{m.text}</Meta>
      ))}
      {pace > 0 && <span className="text-[11px] font-extrabold rounded-full" style={pacePillStyle}>{fmtPace(pace)} /ק״מ</span>}
    </div>
  );
  const badgeCls = `${v2 ? 'text-[11px]' : 'text-[10.5px]'} font-extrabold rounded-full whitespace-nowrap`;
  const badgeStyle = { padding: '3px 9px', background: AER_TINT, color: AER_TEXT };

  if (leg.layout === 'destination') {
    return (
      <div className={cardCls} style={cardStyle}>
        <div style={CARD_PAD}>
          <span className={`${titleCls} block${v2 ? ' truncate' : ''}`} style={titleStyle}>{leg.title}</span>
          {metas}
        </div>
      </div>
    );
  }

  const expandable = !!leg.expandable && !!onToggle;
  return (
    <div className={cardCls} style={cardStyle}>
      <div style={CARD_PAD}>
        {expandable ? (
          <button type="button" onClick={onToggle} aria-expanded={expanded}
            className="flex w-full items-center justify-between gap-2 text-start transition-transform duration-150 ease-v2 active:scale-[0.98]">
            <span className={`${titleCls} min-w-0 truncate whitespace-nowrap`} style={titleStyle}>{leg.title}</span>
            <span className="inline-flex shrink-0 items-center gap-1.5">
              {leg.badge && <span className={badgeCls} style={badgeStyle}>{leg.badge}</span>}
              <ChevronDown size={16} className="text-v2-muted" style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
            </span>
          </button>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <span className={titleCls} style={titleStyle}>{leg.title}</span>
            <span className={badgeCls} style={badgeStyle}>{leg.badge}</span>
          </div>
        )}
        {metas}
        {expandable && expanded && detail != null && (
          <div className="mt-2.5 border-t border-[#e6edf2] pt-2.5">{detail}</div>
        )}
        {leg.loopNote && (
          <div className="flex items-center gap-1.5 mt-2 text-[11px] font-extrabold" style={{ color: AER_TEXT }}>
            <Repeat size={15} style={{ color: AER }} /> מסלול מעגלי — חוזר לנקודת ההתחלה
          </div>
        )}
      </div>
    </div>
  );
}
