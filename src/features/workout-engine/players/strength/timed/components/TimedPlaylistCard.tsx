'use client';

/**
 * TimedPlaylistCard — a timed block in the classic session list (enable_home_v2):
 * one card, status line, one row per item (target before / total after).
 */
import React from 'react';
import { Check } from 'lucide-react';
import { ExerciseThumb } from '@/components/ui/v2';
import type { TimedPlaylistModel } from '../logic/timed-playlist';

export default function TimedPlaylistCard({ model }: { model: TimedPlaylistModel }) {
  const active = model.status === 'active';
  return (
    <div
      dir="rtl"
      className={`rounded-[20px] bg-white p-3 ${active ? 'ring-2 ring-v2-accent shadow-v2-card' : 'shadow-v2-ring'}`}
      style={{ fontFamily: 'var(--font-simpler)' }}
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="whitespace-nowrap text-[15px] font-black text-v2-ink">{model.title}</span>
        <span
          className={`truncate whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12px] font-extrabold ${
            model.status === 'upcoming' ? 'bg-v2-surface text-v2-muted' : 'bg-v2-tint text-v2-deep ring-1 ring-inset ring-v2-accent/40'
          }`}
        >
          {model.line}
        </span>
      </div>
      <ul className="space-y-1.5">
        {model.rows.map((r) => (
          <li key={r.key} className={`flex items-center gap-2.5 ${model.status === 'upcoming' ? 'opacity-80' : ''}`}>
            <div className="overflow-hidden rounded-[10px]">
              <ExerciseThumb imageUrl={r.imageUrl} size={36} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate whitespace-nowrap text-[14px] font-extrabold text-v2-ink">{r.name}</div>
              <div className="truncate whitespace-nowrap text-[12.5px] font-bold tabular-nums text-v2-muted">{r.detail}</div>
            </div>
            {r.done && <Check size={16} strokeWidth={3} className="shrink-0 text-v2-accent" aria-hidden />}
          </li>
        ))}
      </ul>
    </div>
  );
}
