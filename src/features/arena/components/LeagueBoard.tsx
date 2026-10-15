'use client';

/**
 * Shared v2 league-board pieces (design language v2 — the marketing site's
 * league board, Social.module.css .board/.boardRows/.rank). Used by every
 * leagues-tab table: individuals (NeighborhoodLeaderboard), scopes
 * (ScopeCompetitionLeaderboard), groups (GroupLeaderboard), units
 * (UnitLeagueTable). Presentational only.
 */

import React, { type ReactNode } from 'react';
import { Crown, type LucideIcon } from 'lucide-react';
import Card from '@/components/ui/v2/Card';

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
    <Card variant="dark" padding="none" className={`rounded-v2-card-lg p-[22px] ${className}`} dir="rtl">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <div className="text-[20px] font-black leading-tight tracking-v2-tight truncate">{title}</div>
          {subtitle && <div className="text-[13px] opacity-70 mt-0.5 truncate">{subtitle}</div>}
        </div>
        {actions && <div className="flex items-center gap-1.5 shrink-0">{actions}</div>}
      </div>
      {children}
    </Card>
  );
}

/** Round dark icon button for the board header. */
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
      className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white/80 active:scale-[0.97] transition-transform ease-v2"
    >
      <Icon size={16} strokeWidth={2.4} className={spinning ? 'animate-spin' : ''} aria-hidden />
    </button>
  );
}

// ── Rank tile ────────────────────────────────────────────────────────────────

/** Ranks 2–3 get a subtle silver / bronze tint (David, 15.10.2026); #1 is the
 *  solid gold tile with the crown — the only crown on the board. */
const PODIUM_TILE: Record<2 | 3, string> = {
  2: 'bg-[#c7d2dc]/25 text-[#e4ebf1] ring-1 ring-inset ring-[#c7d2dc]/40',
  3: 'bg-[#d08a4e]/25 text-[#f3c49b] ring-1 ring-inset ring-[#d08a4e]/40',
};

export function RankTile({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <span
        className="w-[30px] h-[30px] rounded-full bg-v2-gold text-v2-on-gold flex items-center justify-center shrink-0"
        aria-label="מקום 1"
        role="img"
      >
        <Crown size={16} strokeWidth={2.4} fill="currentColor" aria-hidden />
      </span>
    );
  }
  const tint = rank === 2 || rank === 3 ? PODIUM_TILE[rank] : 'bg-white/10';
  return (
    <span className={`w-[30px] h-[30px] rounded-full flex items-center justify-center shrink-0 text-[14px] font-black tabular-nums ${tint}`}>
      {rank}
    </span>
  );
}

// ── Row ──────────────────────────────────────────────────────────────────────

const FIRST_ROW_BG = 'linear-gradient(135deg, rgba(0,186,247,.35), rgba(12,242,227,.2))';

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
        'w-full flex items-center gap-3 rounded-2xl px-4 py-3.5 text-right',
        onClick ? 'active:scale-[0.97] transition-transform ease-v2' : '',
        first ? '' : 'bg-white/[0.06]',
        isMe ? 'ring-[1.5px] ring-inset ring-v2-accent' : '',
        blurred ? 'blur-[6px] select-none pointer-events-none' : '',
      ].join(' ')}
      style={first ? { background: FIRST_ROW_BG } : undefined}
    >
      <RankTile rank={rank} />
      {leading}
      <span className="flex-1 min-w-0">
        <span className="block text-[16px] font-extrabold truncate">
          {name}
          {nameTag && <span className="text-[12px] font-bold text-v2-accent mr-1.5">{nameTag}</span>}
        </span>
        {sub && <span className="block text-[12px] font-semibold opacity-60 truncate mt-0.5">{sub}</span>}
      </span>
      <span className="shrink-0 tabular-nums whitespace-nowrap">
        <span className="text-[16px] font-black">{value}</span>
        {unit && <span className="text-[12px] font-bold opacity-70 mr-1">{unit}</span>}
      </span>
    </Tag>
  );
}

/** Skeleton row with the same geometry as BoardRow (CLS-safe). */
export function BoardRowSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-2xl px-4 py-3.5 bg-white/[0.06]">
      <span className="w-[30px] h-[30px] rounded-full bg-white/10 animate-pulse shrink-0" />
      <span className="flex-1 h-3.5 rounded bg-white/10 animate-pulse" style={{ maxWidth: '55%' }} />
      <span className="h-3.5 w-12 rounded bg-white/10 animate-pulse" />
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
    <div className="rounded-2xl bg-white/[0.06] px-5 py-7 flex flex-col items-center text-center">
      <span className="w-[42px] h-[42px] rounded-[14px] bg-white/10 flex items-center justify-center text-v2-accent">
        <Icon size={20} strokeWidth={2.4} aria-hidden />
      </span>
      <p className="text-[16px] font-black mt-3">{title}</p>
      {body && <p className="text-[13px] opacity-70 mt-1 max-w-[260px] leading-relaxed">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
