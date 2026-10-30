'use client';

/**
 * WorkoutPostCard: the one workout post (enable_workout_post_v1, boards PostTypes / PostCompact /
 * PostFeed). Same body on every surface, so it improves once:
 *
 *   compact  the home carousel's "done" slide: icon, title, one achievement line, 3 small rings
 *   home     "done today" header, the square (map / photo / brand night + title + 3 rings),
 *            strength's set table, the caller's buttons
 *   feed     the caller's header (author), the square, strength's set table, the caller's actions
 *
 * Presentational: data comes from post-model.ts; the caller owns taps, cheers and sharing.
 */

import React from 'react';
import { ChevronLeft } from 'lucide-react';
import { ExerciseSetsTable, type ExerciseSetsRow } from '@/components/ui/v2';
import { DoneCheck } from '@/components/ui/v2/DoneRow';
import { ActivityGlyph } from '@/features/parks/core/components/hybrid/activity-icons';
import { useT } from '@/hooks/useT';
import { community } from '@/messages/ns/community';
import { useUiDir } from '@/lib/i18n/useUiDir';
import type { PostKind, PostModel, PostRing as PostRingSpec } from './post-model';
import PostRing from './PostRing';
import PostSquare from './PostSquare';

export type PostSurface = 'compact' | 'home' | 'feed';

export interface WorkoutPostCardProps {
  model: PostModel;
  surface: PostSurface;
  /** Feed: the author row. Home: the finish time / place, next to "done today". */
  header?: React.ReactNode;
  meta?: string | null;
  /** Feed: the author's caption. */
  caption?: string | null;
  /** Buttons / actions under the card (home, feed). */
  footer?: React.ReactNode;
  /** Compact: the whole card opens the workout's summary. */
  onOpen?: () => void;
}

const TILE: Record<PostKind, { bg: string; fg: string; check: string }> = {
  strength: { bg: '#e0f7fd', fg: '#0284c7', check: '#00C9F2' },
  run: { bg: '#ecfccb', fg: '#4d7c0f', check: '#84CC16' },
  walk: { bg: '#ecfccb', fg: '#4d7c0f', check: '#84CC16' },
  combined: { bg: '#ecfccb', fg: '#4d7c0f', check: '#84CC16' },
};

function Glyph({ kind }: { kind: PostKind }) {
  return kind === 'strength' ? (
    <ActivityGlyph kind="strength" className="h-[18px] w-[18px]" />
  ) : (
    <ActivityGlyph kind="aerobic" subtype={kind === 'run' ? 'running' : 'walking'} className="h-[18px] w-[18px]" />
  );
}

export function usePostLabels() {
  const t = useT(community);
  return {
    t,
    ringLabel: (r: PostRingSpec, kind: PostKind) =>
      r.key === 'distance' && kind === 'walk' ? t('post.card.ring.distanceWalk') : t(`post.card.ring.${r.key}`),
    ringUnit: (r: PostRingSpec) =>
      r.unit !== 'none' ? t(`post.card.unit.${r.unit}`) : r.key === 'sets' ? t('post.card.unit.sets') : r.key === 'exercises' ? t('post.card.unit.exercises') : r.key === 'steps' ? t('post.card.unit.steps') : '',
    title: (m: PostModel) => m.title || t(`post.card.title.${m.kind}`),
  };
}

function exerciseRows(m: PostModel): ExerciseSetsRow[] {
  return m.exercises.map((e, i) => ({
    key: `${e.name}-${i}`,
    name: e.name,
    subtitle: '',
    tiles: Array.from({ length: Math.max(e.sets, e.setsDone, 1) }, (_, k) =>
      k < e.setsDone ? { value: e.value ? String(e.value) : '✓', tone: 'in' as const } : { value: '–', tone: 'missed' as const },
    ),
  }));
}

export default function WorkoutPostCard({ model, surface, header, meta, caption, footer, onOpen }: WorkoutPostCardProps) {
  const { direction } = useUiDir();
  const L = usePostLabels();
  const title = L.title(model);
  const rings = (size: number, dark: boolean) => (
    <div className="grid grid-cols-3 gap-1">
      {model.rings.map((r) => (
        <PostRing key={r.key} value={r.value} unit={L.ringUnit(r)} label={L.ringLabel(r, model.kind)} pct={r.pct} color={r.color} size={size} dark={dark} />
      ))}
    </div>
  );

  if (surface === 'compact') {
    const tile = TILE[model.kind];
    const body = (
      <>
        <span className="flex items-center gap-2">
          <DoneCheck color={tile.check} />
          <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[9px]" style={{ background: tile.bg, color: tile.fg }} aria-hidden>
            <Glyph kind={model.kind} />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[14.5px] font-black text-v2-ink">{title}</span>
            {(model.achievement || meta) && <span className="truncate text-[11.5px] font-bold text-v2-muted">{model.achievement || meta}</span>}
          </span>
          {onOpen && <ChevronLeft size={18} className="shrink-0 text-v2-muted rtl:rotate-0 ltr:rotate-180" aria-hidden />}
        </span>
        {model.rings.length > 0 && rings(44, false)}
      </>
    );
    const cls = 'flex w-full flex-col gap-2.5 rounded-[22px] bg-white p-3 text-start shadow-v2-card';
    return onOpen ? (
      <button type="button" dir={direction} onClick={onOpen} aria-label={L.t('post.card.openAria', { title })} className={`${cls} transition-transform duration-150 ease-v2 active:scale-[0.99]`}>
        {body}
      </button>
    ) : (
      <article dir={direction} className={cls}>
        {body}
      </article>
    );
  }

  const table = model.kind === 'strength' && model.exercises.length > 0 && (
    <div className="px-3">
      <ExerciseSetsTable hideLegend rows={exerciseRows(model)} />
    </div>
  );
  return (
    <article dir={direction} className="flex w-full flex-col gap-3 overflow-hidden rounded-[26px] bg-white shadow-v2-card">
      {surface === 'home' ? (
        <div className="flex items-center gap-2 px-4 pt-3.5">
          <DoneCheck color={TILE[model.kind].check} />
          <span className="flex-1 text-[15px] font-black text-v2-ink">{L.t('post.card.doneToday')}</span>
          {meta && <span className="truncate text-[12px] font-bold text-v2-muted">{meta}</span>}
        </div>
      ) : (
        header
      )}
      {caption && <p className="px-4 text-[14px] font-semibold leading-5 text-v2-ink">{caption}</p>}
      <PostSquare model={model} title={title} rings={rings(58, true)} hiddenEnds={L.t('post.card.hiddenEnds')} levelLabel={L.t('post.card.level')} />
      {table}
      {footer}
    </article>
  );
}
