'use client';

/**
 * "סיורים באפליקציה" — every app tour (name + one line), one tap replays it
 * (tour-replay.ts: the real screen, or the help preview for in-workout tours). Shared by the
 * help hub and the search Help tab; both only render it under ai_coach_round4.
 */
import React from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, PlayCircle } from 'lucide-react';
import { TOUR_CATALOG } from '@/features/user/onboarding/services/tour-catalog';
import { requestTourReplay } from '@/features/user/onboarding/services/tour-replay';

export default function TourList({ title, headingId = 'help-tours' }: { title: string; headingId?: string }) {
  const router = useRouter();
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <h2 id={headingId} className="m-0 text-[13px] font-black text-v2-muted">{title}</h2>
      <ul className="overflow-hidden rounded-2xl bg-white shadow-[0_0_0_1px_rgba(14,27,42,0.06)]">
        {TOUR_CATALOG.map((t) => (
          <li key={t.id} className="border-b border-gray-100 last:border-b-0">
            <button
              type="button"
              data-tour-id={t.id}
              onClick={() => router.push(requestTourReplay(t.id, 0))}
              className="flex w-full items-center gap-3 px-3.5 py-3 text-start active:bg-gray-50"
            >
              <PlayCircle className="h-5 w-5 shrink-0 text-v2-deep" aria-hidden />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-[14.5px] font-black text-v2-ink">{t.name}</span>
                <span className="text-[12px] font-semibold leading-snug text-v2-muted">{t.line}</span>
              </span>
              <ChevronLeft className="h-4 w-4 shrink-0 text-gray-300" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
