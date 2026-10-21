'use client';

/**
 * GroupLeagueStatsBoard — a user-created group's own league this period
 * (home v2, 18.10.2026): the group's points, how many came from steps, its
 * km, and each member's points with their steps points and km next to them.
 *
 * Reads the server aggregates (league_scope_stats, granularity 'group') via
 * /api/leagues/group-board — every workout, step (3 points per 1,000) and km
 * already counts toward each group in the user's social.groupIds. The
 * feed-based individual board below it is unchanged. Members only: for
 * anyone else (or on any failure) the card renders nothing.
 *
 * km are for fun — they never change the points or the official order;
 * "ק״מ" only re-sorts this card's list.
 */

import { useEffect, useState } from 'react';
import { Footprints, MapPin, RefreshCw, Trophy, Zap } from 'lucide-react';
import { BoardCard, BoardIconButton, BoardMessage, BoardRow, BoardRowSkeleton, BoardToggle } from './LeagueBoard';
import { formatKm } from './league-board-logic';
import { useT } from '@/hooks/useT';
import { community } from '@/messages/ns/community';
import { getGroupLeagueBoard, type LeaderboardTimeWindow } from '@/features/arena/services/ranking.service';
import type { GroupBoard, GroupBoardMember } from '@/features/arena/services/league-scope-keys';

type Metric = 'points' | 'km';
const TOP_ROWS = 10;

export default function GroupLeagueStatsBoard({ groupId, timeWindow }: { groupId: string; timeWindow: LeaderboardTimeWindow }) {
  // The aggregates are weekly / monthly — a daily selection shows the week.
  const win = timeWindow === 'monthly' ? 'monthly' : 'weekly';
  const [board, setBoard] = useState<GroupBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = () => {
    let alive = true;
    setLoading(true);
    getGroupLeagueBoard({ groupId, timeWindow: win }).then((b) => {
      if (!alive) return;
      setBoard(b);
      setFailed(!b);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  };

  useEffect(load, [groupId, win]); // eslint-disable-line react-hooks/exhaustive-deps

  if (failed) return null;
  return <GroupLeagueStatsBoardView board={board} loading={loading} timeWindow={win} onRefresh={() => void load()} />;
}

// ── Presentational view — split out so it renders with fixture data ──────────

export function GroupLeagueStatsBoardView({
  board,
  loading,
  timeWindow,
  onRefresh,
}: {
  board: GroupBoard | null;
  loading: boolean;
  timeWindow: 'weekly' | 'monthly';
  onRefresh: () => void;
}) {
  const [metric, setMetric] = useState<Metric>('points');
  const [expanded, setExpanded] = useState(false);
  const t = useT(community);
  const km = metric === 'km';

  const members: (GroupBoardMember & { rank: number })[] = (board?.members ?? [])
    .map((m, i) => ({ m, i }))
    .filter(({ m }) => (km ? m.km > 0 : m.points > 0))
    .sort((a, b) => (km ? b.m.km - a.m.km : b.m.points - a.m.points) || a.i - b.i)
    .map(({ m }, i) => ({ ...m, rank: i + 1 }));
  const shown = expanded ? members : members.slice(0, TOP_ROWS);

  const tiles = board
    ? [
        { id: 'points', icon: Zap, color: 'text-v2-deep', value: board.totals.points.toLocaleString('he-IL'), label: t('leagues.group.tile.points') },
        { id: 'steps', icon: Footprints, color: 'text-[#f59e0b]', value: board.totals.stepsPoints.toLocaleString('he-IL'), label: t('leagues.group.tile.steps') },
        { id: 'km', icon: MapPin, color: 'text-[#f59e0b]', value: formatKm(board.totals.km), label: t('leagues.group.tile.km') },
      ]
    : [];

  const sub = (m: GroupBoardMember) =>
    km
      ? t('leagues.group.sub.points', { points: m.points.toLocaleString('he-IL') })
      : [
          m.stepsPoints > 0 ? t('leagues.group.sub.steps', { points: m.stepsPoints.toLocaleString('he-IL') }) : null,
          m.km > 0 ? t('leagues.group.sub.km', { km: formatKm(m.km) }) : null,
        ]
          .filter(Boolean)
          .join(' · ') || undefined;

  return (
    <BoardCard
      title={t('leagues.group.title', { window: timeWindow })}
      subtitle={t('leagues.group.subtitle')}
      actions={<BoardIconButton icon={RefreshCw} label={t('leagues.group.refresh')} onClick={onRefresh} spinning={loading} />}
    >
      {loading && !board ? (
        <div className="grid grid-cols-1 gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <BoardRowSkeleton key={i} />
          ))}
        </div>
      ) : !board || board.members.length === 0 ? (
        <BoardMessage
          icon={Trophy}
          title={t('leagues.group.empty.title', { window: timeWindow })}
          body={t('leagues.group.empty.body')}
        />
      ) : (
        <>
          <div className="mb-3 grid grid-cols-3 gap-2">
            {tiles.map((tile) => (
              <div key={tile.id} className="min-w-0 rounded-[16px] bg-v2-surface px-2.5 py-2 ring-1 ring-inset ring-v2-hairline">
                <tile.icon size={16} strokeWidth={2.6} className={tile.color} aria-hidden />
                <div className="mt-1 truncate text-[18px] font-black leading-tight tabular-nums text-v2-ink">{tile.value}</div>
                <div className="truncate whitespace-nowrap text-[12px] font-bold text-v2-muted">{tile.label}</div>
              </div>
            ))}
          </div>
          <div className="mb-2">
            <BoardToggle
              label={t('leagues.group.sortLabel')}
              value={metric}
              onChange={setMetric}
              options={[
                { id: 'points', label: t('leagues.group.sort.points') },
                { id: 'km', label: t('leagues.group.sort.km') },
              ]}
            />
          </div>
          {members.length === 0 ? (
            <BoardMessage icon={MapPin} title={t('leagues.group.noKm.title', { window: timeWindow })} body={t('leagues.group.noKm.body')} />
          ) : (
            <div className="mt-1 grid grid-cols-1 gap-1">
              {shown.map((m) => (
                <BoardRow
                  key={m.uid}
                  rank={m.rank}
                  name={m.name}
                  nameTag={m.isMe ? t('leagues.group.me') : undefined}
                  isMe={m.isMe}
                  sub={sub(m)}
                  value={km ? formatKm(m.km) : m.points.toLocaleString('he-IL')}
                  unit={km ? t('leagues.group.unit.km') : t('leagues.group.unit.points')}
                />
              ))}
            </div>
          )}
          {members.length > TOP_ROWS && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-2 flex h-10 w-full items-center justify-center whitespace-nowrap rounded-full bg-white text-[14px] font-extrabold text-v2-ink-2 shadow-v2-ring transition-transform duration-150 ease-v2 active:scale-[0.97]"
            >
              {expanded ? t('leagues.group.showLess') : t('leagues.group.showAll', { count: String(members.length) })}
            </button>
          )}
          <p className="mt-3 text-[12px] font-bold leading-snug text-v2-muted">
            {km
              ? t('leagues.group.note.km')
              : t('leagues.group.note.points')}
          </p>
        </>
      )}
    </BoardCard>
  );
}
