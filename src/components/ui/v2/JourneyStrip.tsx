'use client';

/**
 * JourneyStrip — the horizontal "Moovit" sequence of a workout (RTL):
 * leg › station › leg … with chevron separators, in a white card that
 * scrolls sideways (touch-action: pan-x). Extracted (19.10.2026) from the
 * route+stops hybrid overview (HybridOverviewScreen) — whose output it
 * reproduces byte for byte in both flag states — so the run previews use
 * the same strip.
 *
 * Item kinds:
 *   aerobic   — a walk/run leg (subtype 'walking' | 'running'), solid
 *   strength  — a station (subtype = domainFocus → program icon), cyan
 *   transport — getting to/from the route: dashed + faded walk chip
 *   repeat    — a repeated run set ("6 × 400 מ׳") with a repeat glyph
 * Text = `label`, else `seconds` through the hybrid minute formatter.
 */

import { ChevronLeft, Repeat } from 'lucide-react';
import { ActivityGlyph } from '@/features/parks/core/components/hybrid/activity-icons';
import { HYBRID_AER as AER, HYBRID_STR as STR, HYBRID_WALK as WALK_LEG_COLOR } from '@/features/parks/core/components/hybrid/hybrid-colors';
import { formatMinutes } from '@/features/parks/core/components/hybrid/hybrid-format';
import type { JourneyStripItem } from './journey-strip';

export type { JourneyStripItem, JourneyItemKind } from './journey-strip';

export interface JourneyStripProps {
  items: readonly JourneyStripItem[];
  /** Home v2 look (enable_home_v2); false = the pre-v2 look, unchanged. */
  v2?: boolean;
  /**
   * 'card' (default) — the white card of the overview drawer.
   * 'inset' — v2 only: a full-width tinted well inside another card (the
   * route generator's compact card, board M-5e).
   */
  variant?: 'card' | 'inset';
}

function itemText(it: JourneyStripItem): string {
  return it.label ?? formatMinutes(it.seconds);
}

function Item({ it, v2 }: { it: JourneyStripItem; v2: boolean }) {
  if (it.kind === 'transport') {
    return (
      <span className="inline-flex items-center gap-1.5 text-[13px] font-bold whitespace-nowrap rounded-full"
        style={{ color: v2 ? '#64748b' : '#9CA3AF', border: '1px dashed #BAE6FD', padding: '2px 9px', opacity: 0.8 }}>
        <span className="inline-flex" style={{ color: WALK_LEG_COLOR }}><ActivityGlyph kind="aerobic" subtype="walking" className="w-[19px] h-[19px]" /></span>
        {itemText(it)}
      </span>
    );
  }
  if (it.kind === 'strength') {
    return (
      <span className="inline-flex items-center gap-1.5 text-[14px] font-extrabold whitespace-nowrap" style={{ color: '#0E7490' }}>
        <span className="inline-flex" style={{ color: STR }}><ActivityGlyph kind="strength" subtype={it.subtype} className="w-[23px] h-[23px]" /></span>
        {itemText(it)}
      </span>
    );
  }
  if (it.kind === 'repeat') {
    return (
      <span className="inline-flex items-center gap-1.5 text-[14px] font-extrabold whitespace-nowrap" style={{ color: v2 ? '#0e1419' : '#374151' }}>
        <span className="inline-flex items-center gap-0.5" style={{ color: AER }}>
          <ActivityGlyph kind="aerobic" subtype={it.subtype} className="w-[23px] h-[23px]" />
          <Repeat size={14} strokeWidth={2.6} aria-label="חזרות" />
        </span>
        {itemText(it)}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[14px] font-bold whitespace-nowrap" style={{ color: v2 ? '#0e1419' : '#374151' }}>
      <span className="inline-flex" style={{ color: AER }}><ActivityGlyph kind="aerobic" subtype={it.subtype} className="w-[23px] h-[23px]" /></span>
      {itemText(it)}
    </span>
  );
}

export default function JourneyStrip({ items, v2 = false, variant = 'card' }: JourneyStripProps) {
  if (v2 && variant === 'inset') {
    return (
      <div className="flex items-center gap-2 overflow-hidden whitespace-nowrap rounded-2xl bg-v2-surface ring-1 ring-inset ring-v2-hairline" style={{ padding: '8px 12px' }}>
        {items.flatMap((it, i) => [
          ...(i > 0 ? [<ChevronLeft key={`sep${i}`} size={16} style={{ color: '#dfe7ed', flexShrink: 0 }} />] : []),
          <Item key={it.key} it={it} v2 />,
        ])}
      </div>
    );
  }
  return (
    <div className="overflow-x-auto" style={{ touchAction: 'pan-x', scrollbarWidth: 'none' }}>
      <div className={v2 ? 'inline-flex items-center gap-2.5 bg-white rounded-[20px] shadow-v2-card' : 'inline-flex items-center gap-2.5 bg-white rounded-xl'}
        style={v2 ? { padding: '11px 15px' } : { border: '0.5px solid #E0E9FF', boxShadow: '0 3px 14px rgba(0,0,0,.07)', padding: '11px 15px' }}>
        {items.flatMap((it, i) => [
          ...(i > 0 ? [<ChevronLeft key={`sep${i}`} size={16} style={{ color: v2 ? '#dfe7ed' : '#CBD5E1', flexShrink: 0 }} />] : []),
          <Item key={it.key} it={it} v2={v2} />,
        ])}
      </div>
    </div>
  );
}
