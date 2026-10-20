'use client';

/** Activity icon tile for the progress tab — the app's own run/walk/muscle glyphs, lucide footprints for steps. */
import { Footprints } from 'lucide-react';
import { MuscleIcon, RunIcon, WalkingIcon } from '@/features/content/programs/core/program-icon.util';

export type KindIconKind = 'strength' | 'run' | 'walk' | 'steps';

const TILE: Record<KindIconKind, { bg: string; fg: string }> = {
  strength: { bg: 'rgba(0,186,247,0.12)', fg: '#0284c7' },
  run: { bg: 'rgba(132,204,22,0.14)', fg: '#65a30d' },
  walk: { bg: 'rgba(245,158,11,0.14)', fg: '#b45309' },
  steps: { bg: 'rgba(245,158,11,0.14)', fg: '#b45309' },
};

export function KindGlyph({ kind, className = 'h-[18px] w-[18px]' }: { kind: KindIconKind; className?: string }) {
  if (kind === 'strength') return <MuscleIcon className={className} />;
  if (kind === 'run') return <RunIcon className={className} />;
  if (kind === 'walk') return <WalkingIcon className={className} />;
  return <Footprints className={className} strokeWidth={2.4} aria-hidden />;
}

export default function KindIcon({ kind, size = 32 }: { kind: KindIconKind; size?: number }) {
  const t = TILE[kind];
  return (
    <span
      aria-hidden
      className="inline-grid shrink-0 place-items-center rounded-[10px]"
      style={{ width: size, height: size, background: t.bg, color: t.fg }}
    >
      <KindGlyph kind={kind} />
    </span>
  );
}
