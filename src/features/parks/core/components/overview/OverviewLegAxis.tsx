'use client';

/**
 * OverviewLegAxis — the vertical journey ("מהלך") of the ONE overview drawer:
 *
 *   המיקום שלך › [transport there] › תחילת המסלול › …legs… ›
 *   סיום המסלול › [transport back] › המיקום שלך
 *
 * Renders a list of OverviewLeg (overview-legs.ts). Aerobic legs and groups
 * render generically; stations are rendered by the consumer (`renderStation`,
 * e.g. the route + stops HybridStationCard) next to the generic node. Aerobic
 * legs marked `expandable` open a details panel from `renderLegDetail`.
 */

import { useState, type ReactNode } from 'react';
import { HYBRID_AER as AER } from '../hybrid/hybrid-colors';
import { legColor, routeLegs, transportMinutes, type AerobicLeg, type OverviewLeg, type StationLeg } from './overview-legs';
import { ACCENT, AxisRow, AxisV2, Node, RouteDivider, TransportRow, YourLocationRow } from './axis/AxisParts';
import AerobicLegCard from './axis/AerobicLegCard';
import GroupLegCard from './axis/GroupLegCard';

export interface OverviewLegAxisProps {
  legs: readonly OverviewLeg[];
  /** Home v2 look (enable_home_v2); false = today's axis. */
  v2?: boolean;
  /** Rendered above the origin row (e.g. the route's single questionnaire line). */
  top?: ReactNode;
  /** The station's card (the node is drawn by the axis). */
  renderStation?: (leg: StationLeg) => ReactNode;
  /** Details panel of an expandable aerobic leg. */
  renderLegDetail?: (leg: AerobicLeg) => ReactNode;
  /** Replaces the "המיקום שלך" origin row (run overview: the chosen-route card, board M-6f). */
  origin?: ReactNode;
  /** A muted line under the origin row ("יוצאים מכאן · ה-GPS מודד את הדרך", board M-6a). */
  originNote?: string;
  /** Divider labels; default "תחילת המסלול" / "סיום המסלול". */
  startLabel?: string;
  endLabel?: string;
  /** Rendered just above the end divider (e.g. "על לולאת הירקון — 1.5 סיבובים"). */
  beforeEnd?: ReactNode;
  /** The closing "המיקום שלך" row (default true; a free run ends where the GPS stops). */
  showReturn?: boolean;
}

export default function OverviewLegAxis({
  legs, v2 = false, top, renderStation, renderLegDetail,
  origin, originNote, startLabel = 'תחילת המסלול', endLabel = 'סיום המסלול', beforeEnd, showReturn = true,
}: OverviewLegAxisProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const toggle = (key: string) => setExpanded((m) => ({ ...m, [key]: !m[key] }));
  const walkThere = transportMinutes(legs, 'there');
  const walkBack = transportMinutes(legs, 'back');
  const there = legs.find((l) => l.kind === 'transport' && l.phase === 'there');
  const back = legs.find((l) => l.kind === 'transport' && l.phase === 'back');
  const onRoute = routeLegs(legs);
  const firstSegColor = legColor(onRoute[0]);

  return (
    <AxisV2.Provider value={v2}>
    <div dir="rtl">
      {top}

      {origin ?? <YourLocationRow variant="origin" railBelowDotted={walkThere > 0} firstColorBelow={AER} />}
      {originNote && (
        <div className="-mt-2 mb-1 whitespace-nowrap pr-14 text-[12px] font-bold text-v2-muted">{originNote}</div>
      )}
      {walkThere > 0 && <TransportRow label={there!.kind === 'transport' ? there!.label : ''} minutes={walkThere} />}
      <RouteDivider label={startLabel} from={AER} to={firstSegColor} />

      {onRoute.map((leg, i) => {
        const last = i === onRoute.length - 1;
        // Spine colour continues to the NEXT node (the "סיום המסלול" divider on the last leg).
        const nextColor = last ? AER : legColor(onRoute[i + 1]);
        if (leg.kind === 'station') {
          return (
            <AxisRow key={leg.key}>
              <Node kind="strength" nextColor={nextColor} subtype={leg.subtype} />
              {renderStation?.(leg)}
            </AxisRow>
          );
        }
        if (leg.kind === 'group') {
          return (
            <AxisRow key={leg.key}>
              <Node kind="aerobic" nextColor={nextColor} subtype={leg.activity} />
              <GroupLegCard leg={leg} />
            </AxisRow>
          );
        }
        return (
          <AxisRow key={leg.key}>
            <Node kind="aerobic" nextColor={nextColor} subtype={leg.activity} />
            <AerobicLegCard
              leg={leg}
              expanded={!!expanded[leg.key]}
              onToggle={leg.expandable ? () => toggle(leg.key) : undefined}
              detail={leg.expandable && expanded[leg.key] ? renderLegDetail?.(leg) : undefined}
            />
          </AxisRow>
        );
      })}

      {beforeEnd}
      <RouteDivider label={endLabel} from={AER} to={walkBack > 0 || !showReturn ? AER : ACCENT} />
      {walkBack > 0 && <TransportRow label={back!.kind === 'transport' ? back!.label : ''} minutes={walkBack} />}
      {showReturn && <YourLocationRow variant="return" railAboveDotted={walkBack > 0} />}
    </div>
    </AxisV2.Provider>
  );
}
