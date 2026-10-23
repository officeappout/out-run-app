'use client';

/** WideKeyHints — the keyboard shortcuts of the wide player, as a quiet row under the panel. */

import React from 'react';
import { useT } from '@/hooks/useT';
import { player } from '@/messages/ns/player';

const HINTS = ['wide.keys.primary', 'wide.keys.next', 'wide.keys.back', 'wide.keys.minimize'] as const;

export default function WideKeyHints() {
  const t = useT(player);
  return (
    <ul aria-label={t('wide.keys.label')} data-wide-keys="" className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-[13px] font-bold text-v2-muted">
      {HINTS.map((k) => (
        <li key={k} className="whitespace-nowrap">{t(k)}</li>
      ))}
    </ul>
  );
}
