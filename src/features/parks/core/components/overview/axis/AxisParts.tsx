'use client';

/**
 * Axis parts — the building blocks of the vertical journey axis ("מהלך"),
 * moved verbatim from HybridJourneyAxis (19.10.2026) so the generic
 * OverviewLegAxis and the route + stops station card share them.
 *
 * Spine: one 6px rail per node, coloured by activity (aerobic green ·
 * strength cyan) and blended to the NEXT node's colour, so the whole axis
 * reads as ONE line (Moovit's orange bar). Transport legs are a dotted
 * connector + a small walk icon (not a node).
 */

import { createContext, useContext, type CSSProperties, type ReactNode } from 'react';
import { LocateFixed } from 'lucide-react';
import { ActivityGlyph } from '../../hybrid/activity-icons';
import { formatMinutes } from '../../hybrid/hybrid-format';
import { HYBRID_AER as AER, HYBRID_STR as STR, HYBRID_WALK as WALK } from '../../hybrid/hybrid-colors';

export const ACCENT = '#00ADEF'; // "המיקום שלך" origin / return nodes
export const AER_TINT = '#ECFDF5', AER_TEXT = '#047857';
export const STR_TINT = '#ECFEFF', STR_TEXT = '#0E7490'; // cyan tint/text (same hue as STR)

/** Home v2 (enable_home_v2) for the axis' small sub-components. false = today's look. */
export const AxisV2 = createContext(false);
export const useAxisV2 = () => useContext(AxisV2);

// v2 leg/station card — white card on the v2 surface (no hairline border).
export const V2_CARD = 'relative flex-1 min-w-0 bg-white rounded-[20px] shadow-v2-card overflow-hidden mb-3';
export const LEGACY_CARD = 'relative flex-1 min-w-0 bg-white rounded-2xl overflow-hidden mb-3';
export const LEGACY_CARD_STYLE: CSSProperties = { border: '0.5px solid #E0E9FF', boxShadow: '0 2px 12px rgba(0,0,0,.05)' };
/** Card padding shared by every leg card. */
export const CARD_PAD: CSSProperties = { padding: '11px 15px 12px 12px' };

export const fmtPace = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

/** Card shell + title styling for the current look. */
export function useAxisCardStyles() {
  const v2 = useAxisV2();
  return {
    v2,
    cardCls: v2 ? V2_CARD : LEGACY_CARD,
    cardStyle: v2 ? undefined : LEGACY_CARD_STYLE,
    titleCls: v2 ? 'text-[15px] font-black text-v2-ink' : 'text-[14px] font-black',
    titleStyle: v2 ? undefined : { color: '#111827' },
    pacePillStyle: { direction: 'ltr' as const, background: v2 ? '#f6fbfd' : '#F3F4F6', color: AER_TEXT, padding: '2px 8px' },
  };
}

export function Node({ kind, nextColor, subtype }: { kind: 'aerobic' | 'strength'; nextColor: string; subtype?: string }) {
  const color = kind === 'aerobic' ? AER : STR;
  return (
    <div className="relative flex flex-col items-center flex-shrink-0" style={{ width: 44 }}>
      {/* Continuous spine (point 5): sits BEHIND the circle and overshoots the
          inter-row gap (card mb-3 ≈ 12px); the overshoot is hidden by the next circle. */}
      <span aria-hidden style={{
        position: 'absolute', zIndex: 0, left: '50%', transform: 'translateX(-50%)',
        top: 22, bottom: -20, width: 6, borderRadius: 3,
        background: `linear-gradient(to bottom, ${color} 0%, ${color} 45%, ${nextColor} 100%)`,
      }} />
      <div className="relative rounded-full flex items-center justify-center text-white"
        style={{ zIndex: 1, width: 44, height: 44, background: color, border: '3px solid #fff', boxShadow: `0 4px 12px ${color}66` }}>
        {/* point 18: icon enlarged 20→26 (circle is 44px, room to breathe) */}
        <ActivityGlyph kind={kind} subtype={subtype} className="w-[26px] h-[26px]" />
      </div>
    </div>
  );
}

export function Rail({ kind = 'solid', from, to, top = 0, bottom = 0 }: {
  kind?: 'solid' | 'dotted'; from: string; to?: string; top?: number | string; bottom?: number | string;
}) {
  const base: CSSProperties = { position: 'absolute', zIndex: 0, left: '50%', transform: 'translateX(-50%)', top, bottom };
  if (kind === 'dotted') {
    return <span aria-hidden style={{ ...base, width: 0, borderLeft: `3px dotted ${from}`, opacity: 0.55 }} />;
  }
  const end = to ?? from;
  return <span aria-hidden style={{ ...base, width: 6, borderRadius: 3, background: `linear-gradient(to bottom, ${from} 0%, ${from} 45%, ${end} 100%)` }} />;
}

/** "המיקום שלך" — origin (first) / return (last) node: filled, accent. */
export function YourLocationRow({ variant, railBelowDotted, railAboveDotted, firstColorBelow }: {
  variant: 'origin' | 'return';
  railBelowDotted?: boolean;
  railAboveDotted?: boolean;
  firstColorBelow?: string;
}) {
  const v2 = useAxisV2();
  return (
    <div className="flex items-center gap-3" style={{ minHeight: 40 }}>
      <div className="relative flex-shrink-0 flex items-center justify-center" style={{ width: 44, alignSelf: 'stretch' }}>
        {variant === 'origin'
          ? (railBelowDotted
              ? <Rail kind="dotted" from={WALK} top="50%" bottom={0} />
              : <Rail from={ACCENT} to={firstColorBelow ?? AER} top="50%" bottom={0} />)
          : (railAboveDotted
              ? <Rail kind="dotted" from={WALK} top={0} bottom="50%" />
              : <Rail from={AER} to={ACCENT} top={0} bottom="50%" />)}
        <div className="relative rounded-full flex items-center justify-center text-white"
          style={{ zIndex: 1, width: 28, height: 28, background: ACCENT, border: '3px solid #fff', boxShadow: `0 0 0 1.5px ${ACCENT}` }}>
          <LocateFixed size={14} />
        </div>
      </div>
      <span className={v2 ? 'whitespace-nowrap text-[13px] font-extrabold text-v2-deep' : 'text-[12.5px] font-black'} style={v2 ? undefined : { color: '#0369A1' }}>המיקום שלך</span>
    </div>
  );
}

/** "תחילת המסלול" / "סיום המסלול" — thin labelled divider, rail continues through it. */
export function RouteDivider({ label, from, to }: { label: string; from: string; to: string }) {
  const v2 = useAxisV2();
  const line = v2 ? '#e6edf2' : '#E5E7EB';
  return (
    <div className="flex items-center gap-3" style={{ minHeight: 30 }}>
      <div className="relative flex-shrink-0" style={{ width: 44, alignSelf: 'stretch' }}>
        <Rail from={from} to={to} top={0} bottom={0} />
      </div>
      <div className="flex-1 flex items-center gap-2">
        <span aria-hidden style={{ flex: 1, height: 1, background: line }} />
        <span className={v2 ? 'text-[12px] font-extrabold whitespace-nowrap text-v2-muted' : 'text-[10.5px] font-extrabold whitespace-nowrap'} style={v2 ? undefined : { color: '#6B7280' }}>{label}</span>
        <span aria-hidden style={{ flex: 1, height: 1, background: line }} />
      </div>
    </div>
  );
}

/** Transport leg: dotted connector + small walk icon (no node), faded. */
export function TransportRow({ label, minutes }: { label: string; minutes: number }) {
  const v2 = useAxisV2();
  return (
    <div className="flex items-center gap-3" style={{ minHeight: 46 }}>
      <div className="relative flex-shrink-0 flex items-center justify-center" style={{ width: 44, alignSelf: 'stretch' }}>
        <Rail kind="dotted" from={WALK} top={0} bottom={0} />
        <span className="relative rounded-full flex items-center justify-center bg-white" style={{ zIndex: 1, width: 26, height: 26, color: WALK }}>
          <span className="inline-flex" style={{ opacity: 0.7 }}><ActivityGlyph kind="aerobic" subtype="walking" className="w-[17px] h-[17px]" /></span>
        </span>
      </div>
      <div className="flex items-center gap-2 flex-wrap" style={{ opacity: 0.75 }}>
        <span className={v2 ? 'whitespace-nowrap text-[13px] font-bold text-v2-ink-2' : 'text-[12.5px] font-bold'} style={v2 ? undefined : { color: '#6B7280' }}>{label}</span>
        <span className={v2 ? 'whitespace-nowrap text-[12px] font-bold text-v2-muted' : 'text-[11px] font-bold'} style={v2 ? undefined : { color: '#9CA3AF' }}>{formatMinutes(minutes * 60)}</span>
      </div>
    </div>
  );
}

export function Meta({ icon, children, tint }: { icon: ReactNode; children: ReactNode; tint?: string }) {
  const v2 = useAxisV2();
  if (v2) {
    // v2: 13px muted meta, the icon in its ACTIVITY colour (walk/run green · strength cyan).
    return <span className="inline-flex items-center gap-1 text-[13px] font-bold text-v2-muted">
      <span style={{ color: tint ?? '#64748b' }}>{icon}</span>{children}</span>;
  }
  return <span className="inline-flex items-center gap-1 text-[12px] font-bold" style={{ color: '#374151' }}>
    <span style={{ color: '#9CA3AF' }}>{icon}</span>{children}</span>;
}

/**
 * CardGroup — an ENCLOSURE for grouped rows (a superset's exercise cards, a
 * repeated run block): the grouping reads from the container, NOT a coloured
 * bar, so the axis spine stays the only vertical line. Non-grouped lists render bare.
 */
export function CardGroup({ superset, children }: { superset: boolean; children: ReactNode }) {
  const v2 = useAxisV2();
  if (!superset) return <div className="flex flex-col gap-2">{children}</div>;
  if (v2) {
    return <div className="flex flex-col gap-2 mt-2 rounded-[18px] bg-v2-surface p-2 ring-1 ring-inset ring-v2-hairline">{children}</div>;
  }
  return (
    <div className="flex flex-col gap-2 mt-2" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 14, padding: 8 }}>
      {children}
    </div>
  );
}

/** One axis row: node on the spine + the leg's card. */
export function AxisRow({ children }: { children: ReactNode }) {
  return <div className="flex gap-3 items-stretch">{children}</div>;
}
