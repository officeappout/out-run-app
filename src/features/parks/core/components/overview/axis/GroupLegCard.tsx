'use client';

/**
 * GroupLegCard — a repeated block on the overview axis (owner, 19.10.2026):
 * ONE card, never one card per rep. Header = title ("העיקר") + the repeat
 * badge ("6×"); body = one repetition's rows inside the same enclosure the
 * route + stops drawer uses for supersets (CardGroup). Each row: tone pill +
 * text + pace in brand blue (F-1b "מבנה האימון" row style).
 *
 * Run overview (board M-6a): a leg with `color` gets the filled work-colour
 * badge ("6 ×" + "חזרות"), distance / time metas and wider row bars. Legs
 * without it render exactly as before.
 */

import { Clock, Repeat, Ruler } from 'lucide-react';
import type { GroupLeg, GroupRowTone } from '../overview-legs';
import { AER_TINT, AER_TEXT, CARD_PAD, CardGroup, Meta, useAxisCardStyles } from './AxisParts';

/** Run-player zone colours: warm-up green, reps red, recovery grey (board M-5c). */
export const GROUP_TONE_COLOR: Record<GroupRowTone, string> = {
  warmup: '#10B981',
  work: '#EF4444',
  recovery: '#94A3B8',
  cooldown: '#10B981',
};

export default function GroupLegCard({ leg }: { leg: GroupLeg }) {
  const { v2, cardCls, cardStyle, titleCls, titleStyle } = useAxisCardStyles();
  if (leg.color) return <RunGroupLegCard leg={leg} color={leg.color} />;
  return (
    <div className={cardCls} style={cardStyle}>
      <div style={CARD_PAD}>
        <div className="flex items-center justify-between gap-2">
          <span className={`${titleCls} min-w-0 truncate whitespace-nowrap`} style={titleStyle}>{leg.title}</span>
          {leg.repeat != null && leg.repeat > 1 && (
            <span dir="ltr" className={`${v2 ? 'text-[11px]' : 'text-[10.5px]'} font-extrabold rounded-full whitespace-nowrap`}
              style={{ padding: '3px 9px', background: AER_TINT, color: AER_TEXT }}>
              {`${leg.repeat}×`}
            </span>
          )}
        </div>
        <CardGroup superset>
          {leg.rows.map((row) => (
            <div key={row.key} className="flex items-center gap-2 px-1" style={{ minHeight: 26 }}>
              <span aria-hidden className="shrink-0 rounded-full" style={{ width: 4, height: 18, background: GROUP_TONE_COLOR[row.tone] }} />
              <span className={v2 ? 'min-w-0 flex-1 truncate whitespace-nowrap text-[13px] font-extrabold text-v2-ink' : 'min-w-0 flex-1 truncate whitespace-nowrap text-[12.5px] font-bold'}
                style={v2 ? undefined : { color: '#111827' }}>
                {row.label}
              </span>
              {row.paceText && (
                <span dir="ltr" className={v2 ? 'shrink-0 whitespace-nowrap text-[12px] font-extrabold text-v2-deep' : 'shrink-0 whitespace-nowrap text-[11.5px] font-bold'}
                  style={v2 ? undefined : { color: '#0284c7' }}>
                  {row.paceText}
                </span>
              )}
            </div>
          ))}
        </CardGroup>
      </div>
    </div>
  );
}

/** Board M-6a group card (v2 run overview). */
function RunGroupLegCard({ leg, color }: { leg: GroupLeg; color: string }) {
  const { cardCls, cardStyle, titleCls, titleStyle } = useAxisCardStyles();
  return (
    <div className={cardCls} style={cardStyle}>
      <div style={CARD_PAD}>
        <div className="flex items-center justify-between gap-2">
          <span className={`${titleCls} min-w-0 truncate whitespace-nowrap`} style={titleStyle}>{leg.title}</span>
          {leg.repeat != null && leg.repeat > 1 && (
            <span className="inline-flex shrink-0 items-center gap-1.5">
              <span className="inline-flex h-[26px] items-center gap-1 whitespace-nowrap rounded-[10px] px-2.5 text-[14px] font-black text-white"
                style={{ background: color }}>
                <Repeat size={13} strokeWidth={2.6} aria-hidden />
                <span dir="ltr">{`${leg.repeat} ×`}</span>
              </span>
              <span className="whitespace-nowrap text-[12.5px] font-extrabold text-v2-ink-2">חזרות</span>
            </span>
          )}
        </div>
        {leg.meta && leg.meta.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {leg.meta.map((m) => (
              <Meta key={m.key} tint={color} icon={m.icon === 'distance' ? <Ruler size={14} /> : <Clock size={14} />}>{m.text}</Meta>
            ))}
          </div>
        )}
        <div className="mt-2 rounded-[18px] bg-v2-surface px-2.5 py-1 ring-1 ring-inset ring-v2-hairline">
          {leg.rows.map((row) => (
            <div key={row.key} className="flex items-center gap-2.5 px-0.5 py-[5px]">
              <span aria-hidden className="shrink-0 rounded-full" style={{ width: 8, height: 26, background: row.color ?? GROUP_TONE_COLOR[row.tone] }} />
              <span className="min-w-0 flex-1 truncate whitespace-nowrap text-[13.5px] font-extrabold text-v2-ink">{row.label}</span>
              {row.paceText && (
                <span dir="ltr" className="shrink-0 whitespace-nowrap text-[12.5px] font-black text-v2-deep">{row.paceText}</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
