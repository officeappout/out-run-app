'use client';

/**
 * One domain card of the hub's main page (PG-2 "by domain"): a ring with its %
 * on the inline-start side, the domain title, up to three lines, a chevron.
 * The whole card is one button → the domain's page. Presentational only.
 */
import type { ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';
import MiniRing from '@/components/ui/v2/MiniRing';
import { formatNumber } from '@/lib/i18n/core/fmt';
import type { Locale } from '@/lib/i18n/locales';
import { HUB_COLORS, type HubKind } from '../hub-colors';
import HubKindIcon from './HubKindIcon';

export interface DomainCardProps {
  kind: HubKind;
  title: string;
  /** 0–100; null = no ring (no plan / no goal), the icon takes its place. */
  pct: number | null;
  ringLabel?: string;
  lines: ReactNode[];
  /** A small accent line under the others (forecast trend, "+3% since last workout"). */
  accent?: ReactNode;
  onOpen: () => void;
  ariaLabel: string;
  locale: Locale;
}

export default function DomainCard({ kind, title, pct, ringLabel, lines, accent, onOpen, ariaLabel, locale }: DomainCardProps) {
  const tone = HUB_COLORS[kind];
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={ariaLabel}
      data-hub-card={kind}
      className="flex w-full items-center gap-3.5 rounded-v2-card bg-white p-4 text-start shadow-v2-card transition-transform duration-150 ease-v2 active:scale-[0.97]"
    >
      {pct == null ? (
        <span className="grid h-[68px] w-[68px] shrink-0 place-items-center">
          <HubKindIcon kind={kind} size={44} />
        </span>
      ) : (
        <MiniRing pct={pct} color={tone.fill} size={68} stroke={8} label={ringLabel}>
          <span className="relative text-[17px] font-black tabular-nums text-v2-ink" dir="ltr">
            {formatNumber(Math.round(pct), locale)}
            <span className="text-[11px] font-extrabold">%</span>
          </span>
        </MiniRing>
      )}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: tone.fill }} />
          <span className="truncate whitespace-nowrap text-[15.5px] font-black text-v2-ink">{title}</span>
        </span>
        {lines.map((line, i) => (
          <span key={i} className={`block truncate whitespace-nowrap text-[12.5px] tabular-nums ${i === 0 ? 'mt-0.5 font-extrabold text-v2-ink-2' : 'font-bold text-v2-muted'}`}>
            {line}
          </span>
        ))}
        {accent && (
          <span className="mt-0.5 block truncate whitespace-nowrap text-[12px] font-extrabold" style={{ color: tone.text }}>
            {accent}
          </span>
        )}
      </span>
      <ChevronLeft className="h-4 w-4 shrink-0 text-v2-muted rtl:rotate-0 ltr:rotate-180" aria-hidden />
    </button>
  );
}
