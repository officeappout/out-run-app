'use client';

/**
 * Next-workout tag (owner 30.10.2026): one short orange line explaining why this exercise's
 * target / sets / variation changed. Used by the preview list and the strength player.
 */
import React from 'react';
import { ArrowDown, ArrowUp, Plus, Rocket } from 'lucide-react';
import { useT } from '@/hooks/useT';
import { player } from '@/messages/ns/player';
import type { AdaptiveNote } from '@/features/workout-engine/logic/adaptive/adaptive-note';
import { adaptiveNoteLine } from '../../utils/adaptive-note-line';

const ICON: Record<AdaptiveNote['kind'], typeof ArrowUp> = {
  up: ArrowUp,
  jump_top: Rocket,
  harder_variation: Rocket,
  extra_set: Plus,
  down: ArrowDown,
  easier_variation: ArrowDown,
};

export default function AdaptiveNoteTag({ note, className = '' }: { note: AdaptiveNote; className?: string }) {
  const t = useT(player);
  const Icon = ICON[note.kind];
  return (
    <p
      className={`flex items-center gap-1 text-[11px] font-bold leading-tight text-orange-600 ${className}`}
      style={{ fontFamily: 'var(--font-simpler)' }}
    >
      <Icon size={11} strokeWidth={2.5} aria-hidden className="shrink-0" />
      <span className="min-w-0">{adaptiveNoteLine(t, note)}</span>
    </p>
  );
}
