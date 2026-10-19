'use client';

import { Footprints, Timer, TrendingUp, Zap, type LucideProps } from 'lucide-react';
import type { ComponentType } from 'react';
import { RUN_KIND_STYLE, type RunKind } from '../../utils/run-preview/run-kind';

const ICONS: Record<RunKind, ComponentType<LucideProps>> = {
  easy: Footprints,
  interval: Zap,
  tempo: Timer,
  long: TrendingUp,
};

export function runKindIcon(kind: RunKind): ComponentType<LucideProps> {
  return ICONS[kind];
}

/** The kind's rounded icon tile: tinted square, icon in the kind's dark shade. */
export default function RunKindTile({ kind, size = 46 }: { kind: RunKind; size?: number }) {
  const Icon = ICONS[kind];
  const style = RUN_KIND_STYLE[kind];
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center"
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.35), background: style.tint }}
    >
      <Icon size={Math.round(size * 0.5)} strokeWidth={2.3} color={style.text} />
    </span>
  );
}
