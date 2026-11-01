'use client';

/**
 * Pilot AJ6 (enable_pilot_ah_v1): while a hybrid workout composes, a sheet shaped like the
 * overview it turns into (title, totals chips, the leg rows) instead of a lone pill over a
 * dimmed map. Presentational only.
 */
import { useT } from '@/hooks/useT';
import { map } from '@/messages/ns/map';

const BLOCK = 'rounded-full bg-slate-200/80 animate-pulse';

export default function HybridComposingSkeleton() {
  const t = useT(map);
  return (
    <div className="absolute inset-0 z-[101] flex flex-col justify-end bg-black/10 pointer-events-auto" role="status" aria-live="polite">
      <div
        className="rounded-t-[28px] bg-white px-5 pt-3 shadow-[0_-8px_30px_rgba(0,0,0,0.08)]"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)' }}
      >
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-slate-200" />
        <p className="mb-3 text-[15px] font-black text-slate-800">{t('mapLayers.discover.composing')}</p>
        <div className="mb-4 flex gap-2" aria-hidden>
          <div className={`${BLOCK} h-7 w-20`} />
          <div className={`${BLOCK} h-7 w-16`} />
          <div className={`${BLOCK} h-7 w-24`} />
        </div>
        <div className="space-y-3" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="h-11 w-11 shrink-0 rounded-2xl bg-slate-200/80 animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className={`${BLOCK} h-3.5 w-2/3`} />
                <div className={`${BLOCK} h-3 w-1/3`} />
              </div>
            </div>
          ))}
        </div>
        <div className="mt-5 h-12 w-full rounded-full bg-slate-200/80 animate-pulse" aria-hidden />
      </div>
    </div>
  );
}
