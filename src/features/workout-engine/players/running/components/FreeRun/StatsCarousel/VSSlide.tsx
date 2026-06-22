'use client';

import { Users } from 'lucide-react';

/**
 * VSSlide — placeholder for the head-to-head comparison page.
 * Wired to selectedUid in Block 6. Until then shows an empty-state prompt.
 */
export default function VSSlide() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[220px] gap-3 px-6 text-gray-400">
      <Users size={36} strokeWidth={1.5} />
      <p className="text-sm font-semibold text-center">
        בחר רץ במפה להשוואה
      </p>
    </div>
  );
}
