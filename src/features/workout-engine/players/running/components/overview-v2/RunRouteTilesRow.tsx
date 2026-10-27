'use client';

/**
 * "מסלולים מהמיקום שלך, לפי האימון" — the route tiles under the run
 * overview's header (board RP-14, enable_run_drawer_from_me_v1): loops from
 * here + a near, fitting official route (run-route-tiles.ts). The selected
 * tile is ringed; under the row, the chosen route's laps note and
 * "הצעה אחרת" (another set from the generator).
 */

import { RotateCw, Route as RouteIcon } from 'lucide-react';
import { ChoiceTile, HScroller } from '@/components/ui/v2';
import { withUnit } from '@/lib/i18n/units';
import type { RouteTile } from '../../utils/run-overview/run-route-tiles';
import { useT, type ReactTFunction } from '@/hooks/useT';
import { player, type PlayerKey } from '@/messages/ns/player';
import { common } from '@/messages/ns/common';

export interface RunRouteTilesRowProps {
  tiles: readonly RouteTile[];
  selectedId: string | null;
  onSelect: (tile: RouteTile) => void;
  /** "הצעה אחרת"; absent = no link. */
  onAnother?: () => void;
}

function whyLine(tile: RouteTile, t: ReactTFunction<PlayerKey>): string | null {
  const parts = tile.kind === 'official' ? [t('run.overview.tiles.official'), ...tile.reasons.slice(0, 1)] : [...tile.reasons.slice(0, 1)];
  if (tile.returnsHere) parts.push(t('run.overview.tiles.returnsHere'));
  return parts.length ? parts.join(' · ') : null;
}

export default function RunRouteTilesRow({ tiles, selectedId, onSelect, onAnother }: RunRouteTilesRowProps) {
  const t = useT(player);
  const tc = useT(common);
  if (!tiles.length) return null;
  const selected = tiles.find((x) => x.id === selectedId) ?? null;
  const laps = selected?.laps ?? 1;

  const meta = (tile: RouteTile) => {
    if (tile.kind === 'official' && tile.accessKm != null) {
      const d = tile.accessKm < 1 ? withUnit('m', Math.round((tile.accessKm * 1000) / 50) * 50, tc) : withUnit('km', tile.accessKm.toFixed(1), tc);
      return t('run.overview.tiles.away', { distance: d });
    }
    return t('run.overview.suggest.km', { km: tile.km.toFixed(1) });
  };

  return (
    <div data-run-route-tiles>
      <div className="px-4 text-[13px] font-extrabold text-v2-muted">{t('run.overview.tiles.title')}</div>
      <HScroller gap={2} edge={4} className="pb-1 pt-2">
        {tiles.map((tile) => (
          <ChoiceTile
            key={tile.id}
            icon={tile.kind === 'official' ? RouteIcon : RotateCw}
            meta={meta(tile)}
            title={tile.suggestion.route.name?.trim() || t('run.overview.tiles.loopFallback')}
            why={whyLine(tile, t)}
            selected={tile.id === selectedId}
            onSelect={() => onSelect(tile)}
          />
        ))}
      </HScroller>
      <div className="flex items-center gap-2 px-4 pt-1">
        <span className="min-w-0 flex-1 truncate whitespace-nowrap text-[13px] font-bold text-v2-ink-2">
          {selected ? t('run.overview.tiles.lapsNote', { laps, km: (selected.km * laps).toFixed(1) }) : null}
        </span>
        {onAnother && (
          <button type="button" onClick={onAnother}
            className="inline-flex min-h-9 shrink-0 items-center gap-1 whitespace-nowrap text-[13.5px] font-extrabold text-v2-deep transition-transform duration-150 ease-v2 active:scale-[0.97]">
            <RotateCw size={16} strokeWidth={2.4} aria-hidden />{t('run.overview.tiles.another')}
          </button>
        )}
      </div>
    </div>
  );
}
