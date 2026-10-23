'use client';

import { useEffect } from 'react';
import { useT } from '@/hooks/useT';
import { together } from '@/messages/ns/together';
import { useTogetherLocale } from '../hooks/useTogetherLocale';
import { localizeParams } from '../core/localize';
import { hapticTap } from '@/lib/haptics';
import { eventCopy, type TogetherEvent } from '../core/cheers';

const SHOW_MS = 3200;

/** One-shot toasts: "כיף מדני", "דני: סבב הושלם!". Shows the newest, acks each after a moment. */
export default function TogetherToasts({ events, onAck }: { events: TogetherEvent[]; onAck: (ids: string[]) => void }) {
  const t = useT(together);
  const { dir, locale } = useTogetherLocale();
  const shown = events.slice(-2);
  const key = shown.map((e) => e.id).join(',');
  useEffect(() => {
    if (!shown.length) return;
    if (shown.some((e) => e.type === 'cheer')) hapticTap('selection');
    const id = setTimeout(() => onAck(shown.map((e) => e.id)), SHOW_MS);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (!shown.length) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-24 z-[70] flex flex-col items-center gap-2 px-4" dir={dir} role="status" aria-live="polite">
      {shown.map((e) => {
        const c = eventCopy(e);
        return <div key={e.id} className="rounded-full bg-black/75 px-4 py-2 text-[13px] font-bold text-white shadow-lg">{t(c.key, localizeParams(c.params, locale))}</div>;
      })}
    </div>
  );
}
