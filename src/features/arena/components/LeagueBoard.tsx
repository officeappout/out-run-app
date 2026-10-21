'use client';

/**
 * Shared v2 league-board pieces (design language v2 — the marketing site's
 * league board, Social.module.css .board/.boardRows/.rank). Used by every
 * leagues-tab table: individuals (NeighborhoodLeaderboard), scopes
 * (ScopeCompetitionLeaderboard), groups (GroupLeaderboard), units
 * (UnitLeagueTable). Presentational only.
 *
 * 17.10.2026 (David, design lab #321): white board in the brand colours instead
 * of the dark one, and a podium for the top three.
 */

import React, { type ReactNode } from 'react';
import { Building2, Crown, type LucideIcon } from 'lucide-react';
import Card from '@/components/ui/v2/Card';
import { useT } from '@/hooks/useT';
import { community } from '@/messages/ns/community';

// ── Board card ───────────────────────────────────────────────────────────────

interface BoardCardProps {
  title: string;
  /** Period / scope line under the title (13px, .7 opacity). */
  subtitle?: ReactNode;
  /** Trailing header controls (info / refresh). */
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function BoardCard({ title, subtitle, actions, children, className = '' }: BoardCardProps) {
  return (
    <Card variant="light" padding="none" className={`rounded-v2-card-lg p-[18px] ${className}`} dir="rtl">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <div className="text-[19px] font-black leading-tight tracking-v2-tight truncate">{title}</div>
          {subtitle && <div className="text-[13px] font-bold text-v2-muted mt-0.5 truncate">{subtitle}</div>}
        </div>
        {actions && <div className="flex items-center gap-1.5 shrink-0">{actions}</div>}
      </div>
      {children}
    </Card>
  );
}

/** Round white icon button for the board header. */
export function BoardIconButton({
  icon: Icon,
  label,
  onClick,
  spinning = false,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  spinning?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="w-9 h-9 rounded-full bg-white shadow-v2-ring flex items-center justify-center text-v2-ink-2 active:scale-[0.97] transition-transform ease-v2"
    >
      <Icon size={16} strokeWidth={2.4} className={spinning ? 'animate-spin' : ''} aria-hidden />
    </button>
  );
}

// ── Rank tile ────────────────────────────────────────────────────────────────

/** Ranks 2–3 get a subtle silver / bronze tint (David, 15.10.2026); #1 is the
 *  solid gold tile with the crown — the only crown on the board. */
const PODIUM_TILE: Record<2 | 3, string> = {
  2: 'bg-[#eaf1f5] text-v2-ink ring-1 ring-inset ring-[#c5d2db]',
  3: 'bg-[#f7ebe0] text-[#7a4a1c] ring-1 ring-inset ring-[#e2b48d]',
};

export function RankTile({ rank }: { rank: number }) {
  const t = useT(community);
  if (rank === 1) {
    return (
      <span
        className="w-[30px] h-[30px] rounded-full bg-v2-gold text-v2-on-gold flex items-center justify-center shrink-0"
        aria-label={t('leagues.board.firstPlace')}
        role="img"
      >
        <Crown size={16} strokeWidth={2.4} fill="currentColor" aria-hidden />
      </span>
    );
  }
  const tint = rank === 2 || rank === 3 ? PODIUM_TILE[rank] : 'bg-v2-surface text-v2-ink-2 ring-1 ring-inset ring-v2-hairline';
  return (
    <span className={`w-[30px] h-[30px] rounded-full flex items-center justify-center shrink-0 text-[14px] font-black tabular-nums ${tint}`}>
      {rank}
    </span>
  );
}

// ── Row ──────────────────────────────────────────────────────────────────────

const FIRST_ROW_BG = 'linear-gradient(135deg, rgba(0,186,247,.12), rgba(12,242,227,.10))';

interface BoardRowProps {
  rank: number;
  name: string;
  /** Small inline marker after the name, e.g. "(את/ה)". */
  nameTag?: string;
  /** Secondary line under the name. */
  sub?: ReactNode;
  /** Optional leading visual between the rank and the name (unit badge). */
  leading?: ReactNode;
  value: string;
  unit?: string;
  isMe?: boolean;
  /** Use the #1 gradient — defaults to rank === 1. */
  highlight?: boolean;
  blurred?: boolean;
  onClick?: () => void;
}

export function BoardRow({
  rank,
  name,
  nameTag,
  sub,
  leading,
  value,
  unit,
  isMe = false,
  highlight,
  blurred = false,
  onClick,
}: BoardRowProps) {
  const first = highlight ?? rank === 1;
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      data-board-row={isMe ? 'me' : rank}
      className={[
        'w-full min-w-0 flex items-center gap-3 rounded-2xl px-3 py-2.5 text-right text-v2-ink',
        onClick ? 'active:scale-[0.97] transition-transform ease-v2' : '',
        first ? '' : isMe ? 'bg-v2-tint' : '',
        isMe ? 'ring-[1.5px] ring-inset ring-v2-accent/60' : '',
        blurred ? 'blur-[6px] select-none pointer-events-none' : '',
      ].join(' ')}
      style={first ? { background: FIRST_ROW_BG } : undefined}
    >
      <RankTile rank={rank} />
      {leading}
      <span className="flex-1 min-w-0">
        <span className="block text-[15px] font-extrabold truncate">
          {name}
          {nameTag && <span className="text-[12px] font-bold text-v2-accent mr-1.5">{nameTag}</span>}
        </span>
        {sub && <span className="block text-[12px] font-bold text-v2-muted truncate mt-0.5">{sub}</span>}
      </span>
      <span className="shrink-0 tabular-nums whitespace-nowrap">
        <span className="text-[16px] font-black">{value}</span>
        {unit && <span className="text-[11.5px] font-bold text-v2-muted mr-1">{unit}</span>}
      </span>
    </Tag>
  );
}

/** Skeleton row with the same geometry as BoardRow (CLS-safe). */
export function BoardRowSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-2xl px-3 py-2.5">
      <span className="w-[30px] h-[30px] rounded-full bg-v2-surface animate-pulse shrink-0" />
      <span className="flex-1 h-3.5 rounded bg-v2-surface animate-pulse" style={{ maxWidth: '55%' }} />
      <span className="h-3.5 w-12 rounded bg-v2-surface animate-pulse" />
    </div>
  );
}

// ── Empty / message state inside the board ──────────────────────────────────

export function BoardMessage({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: LucideIcon;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-v2-surface px-5 py-7 flex flex-col items-center text-center text-v2-ink">
      <span className="w-[42px] h-[42px] rounded-[14px] bg-v2-tint flex items-center justify-center text-v2-deep">
        <Icon size={20} strokeWidth={2.4} aria-hidden />
      </span>
      <p className="text-[16px] font-black mt-3">{title}</p>
      {body && <p className="text-[13px] text-v2-ink-2 mt-1 max-w-[260px] leading-relaxed">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// ── Podium (top three) ───────────────────────────────────────────────────────

export interface PodiumEntry {
  key: string;
  name: string;
  value: string;
  unit?: string;
  isMe?: boolean;
  /** Small line under the name (e.g. "214 פעילים"). */
  sub?: string;
  /** Optional avatar letter; omitted for places/units (a building tile instead). */
  initial?: string;
  onClick?: () => void;
}

const PODIUM_BLOCK = {
  1: 'bg-v2-cta text-v2-on-cta shadow-v2-cta h-[84px]',
  2: 'bg-[#eaf1f5] text-v2-ink h-[62px]',
  3: 'bg-[#f7ebe0] text-[#7a4a1c] h-[48px]',
} as const;
const PODIUM_RING = { 1: '#ffc83d', 2: '#c5d2db', 3: '#e2b48d' } as const;
const AVATAR_TINTS = ['#bae6fd', '#c7f9e9', '#fde68a', '#e9d5ff', '#fecdd3', '#d9f99d'];

/**
 * The top three on pedestals — second, first, third from the right (RTL).
 * Callers render rows from 4th place on below it. Needs exactly 3 entries.
 */
export function BoardPodium({ entries }: { entries: [PodiumEntry, PodiumEntry, PodiumEntry] }) {
  const t = useT(community);
  const order: (1 | 2 | 3)[] = [2, 1, 3];
  return (
    <ol className="grid grid-cols-3 items-end gap-2 px-1 pt-3 pb-1 text-v2-ink" aria-label={t('leagues.board.podium')} dir="rtl">
      {order.map((rank) => {
        const e = entries[rank - 1];
        const size = rank === 1 ? 52 : 42;
        const Tag = e.onClick ? 'button' : 'div';
        return (
          <li key={e.key} className="min-w-0">
            <Tag
              {...(e.onClick ? { type: 'button' as const, onClick: e.onClick } : {})}
              className="flex w-full min-w-0 flex-col items-center text-center"
            >
              <span className="relative mb-1.5">
                {rank === 1 && (
                  <Crown
                    size={18}
                    strokeWidth={2.4}
                    fill="currentColor"
                    className="absolute -top-[18px] left-1/2 -translate-x-1/2 text-v2-gold"
                    aria-hidden
                  />
                )}
                <span
                  className="grid place-items-center rounded-full font-black text-v2-ink"
                  style={{
                    width: size,
                    height: size,
                    fontSize: size * 0.38,
                    background: e.initial ? AVATAR_TINTS[e.initial.charCodeAt(0) % AVATAR_TINTS.length] : '#eef8fc',
                    boxShadow: `0 0 0 3px ${PODIUM_RING[rank]}`,
                  }}
                >
                  {e.initial ?? <Building2 size={size * 0.42} strokeWidth={2.4} className="text-v2-deep" aria-hidden />}
                </span>
              </span>
              <span className="max-w-full truncate text-[13px] font-extrabold">{e.name}</span>
              {e.isMe ? (
                <span className="mb-1 rounded-full bg-v2-ink px-2 py-0.5 text-[10px] font-extrabold text-white">{t('leagues.board.mine')}</span>
              ) : (
                <span className="mb-1 max-w-full truncate text-[11px] font-bold text-v2-muted">{e.sub ?? '\u00a0'}</span>
              )}
              <span className={`flex w-full flex-col items-center justify-start rounded-t-[16px] pt-2 ${PODIUM_BLOCK[rank]}`}>
                <span className="text-[18px] font-black leading-none">{rank}</span>
                <span className="mt-1 max-w-full truncate px-1 whitespace-nowrap text-[12.5px] font-black tabular-nums">
                  {e.value} {e.unit && <small className="text-[10px] font-bold opacity-70">{e.unit}</small>}
                </span>
              </span>
            </Tag>
          </li>
        );
      })}
    </ol>
  );
}

// ── Two-option toggle (e.g. average / total) ─────────────────────────────────

export function BoardToggle<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div
      className="grid rounded-full bg-v2-surface p-1 ring-1 ring-inset ring-v2-hairline"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      role="radiogroup"
      aria-label={label}
      dir="rtl"
    >
      {options.map((o) => {
        const on = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.id)}
            className={`h-9 rounded-full whitespace-nowrap text-[13px] font-extrabold transition-colors duration-200 ease-v2 ${
              on ? 'bg-white text-v2-ink shadow-v2-ring' : 'text-v2-muted'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
