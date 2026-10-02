'use client';

import { UserCog } from 'lucide-react';
import type { RosterPendingEntry } from '@/features/readiness/core/services/readiness-read.service';

/**
 * "ממתינים לשיוך" — shown ONLY when non-empty (locked spec). Each row
 * carries exactly two actions: link to an existing record, or open a
 * brand-new one. Deliberately not a card/table — a stacked list, same
 * shape as units/[unitId]/page.tsx's own "sub-units" section above its
 * main members table (existing panel precedent).
 */

interface PendingLinkSectionProps {
  pending: RosterPendingEntry[];
  onLinkExisting: (entry: RosterPendingEntry) => void;
  onOpenNew: (entry: RosterPendingEntry) => void;
}

export default function PendingLinkSection({ pending, onLinkExisting, onOpenNew }: PendingLinkSectionProps) {
  if (pending.length === 0) return null;

  return (
    <div className="space-y-3">
      <h2 className="text-base font-black text-gray-900 px-1 flex items-center gap-2">
        <UserCog size={18} className="text-amber-600" />
        ממתינים לשיוך ({pending.length})
      </h2>
      {pending.map((entry) => (
        <div
          key={entry.uid}
          className="flex items-center justify-between bg-white rounded-2xl shadow-sm border border-gray-100 p-4"
        >
          <span className="font-bold text-sm text-slate-800">{entry.name}</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onLinkExisting(entry)}
              className="flex items-center gap-2 bg-cyan-50 hover:bg-cyan-100 text-cyan-700 text-xs font-bold px-3 py-2 rounded-xl transition-all"
            >
              שייך לרשומה קיימת
            </button>
            <button
              onClick={() => onOpenNew(entry)}
              className="flex items-center gap-2 bg-lime-50 hover:bg-lime-100 text-lime-800 text-xs font-bold px-3 py-2 rounded-xl transition-all"
            >
              פתח רשומה חדשה
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
