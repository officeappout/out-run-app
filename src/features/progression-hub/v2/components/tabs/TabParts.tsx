'use client';

/** Building blocks shared by the four activity tabs (P-2a–d). */
import type { ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';
import { Card, DeltaBadge } from '@/components/ui/v2';
import StatCell from '../StatCell';
import KindIcon, { type KindIconKind } from '../KindIcon';

export interface TabStat {
  key: string;
  value: string;
  unit?: string;
  label: string;
}

/** "ריצה · אוקטובר" + delta + a hero number and 3 small ones. */
export function TabHeaderCard({
  kind,
  title,
  subtitle,
  current,
  previous,
  hero,
  stats,
}: {
  kind: KindIconKind;
  title: string;
  subtitle: string;
  current?: number;
  previous?: number | null;
  hero: TabStat;
  stats: TabStat[];
}) {
  return (
    <Card padding="none" className="p-4">
      <div className="flex items-start gap-2.5">
        <KindIcon kind={kind} size={36} />
        <div className="min-w-0 flex-1">
          <p className="truncate whitespace-nowrap text-[15px] font-black text-v2-ink">{title}</p>
          <p className="truncate whitespace-nowrap text-[12px] font-bold text-v2-muted">{subtitle}</p>
        </div>
        {current != null && previous != null && previous > 0 && <DeltaBadge current={current} previous={previous} />}
      </div>
      <StatCell className="mt-3" value={hero.value} unit={hero.unit} label={hero.label} />
      {stats.length > 0 && (
        <div className="mt-3 grid grid-cols-3 gap-2 border-t border-v2-hairline pt-3">
          {stats.map((s) => (
            <StatCell key={s.key} size="md" value={s.value} unit={s.unit} label={s.label} />
          ))}
        </div>
      )}
    </Card>
  );
}

export function ChartCard({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <Card padding="none" className="px-4 py-3.5">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="whitespace-nowrap text-[15px] font-black text-v2-ink">{title}</h3>
        {hint && <span className="truncate whitespace-nowrap text-[12px] font-extrabold text-v2-muted">{hint}</span>}
      </div>
      {children}
    </Card>
  );
}

export interface RecentRow {
  key: string;
  title: string;
  meta: string;
  onClick?: () => void;
}

export function RecentRows({ title, kind, rows }: { title: string; kind: KindIconKind; rows: RecentRow[] }) {
  if (rows.length === 0) return null;
  return (
    <section>
      <h3 className="mb-2 whitespace-nowrap text-[15px] font-black text-v2-ink">{title}</h3>
      <div className="space-y-2">
        {rows.map((r) => (
          <button
            key={r.key}
            type="button"
            onClick={r.onClick}
            className="flex w-full items-center gap-3 rounded-[20px] bg-white p-3 text-right shadow-v2-ring transition-transform duration-150 ease-v2 active:scale-[0.97]"
          >
            <KindIcon kind={kind} size={36} />
            <div className="min-w-0 flex-1">
              <p className="truncate whitespace-nowrap text-[14.5px] font-extrabold text-v2-ink">{r.title}</p>
              <p className="truncate whitespace-nowrap text-[12px] font-bold text-v2-muted">{r.meta}</p>
            </div>
            <ChevronLeft className="h-4 w-4 shrink-0 text-v2-muted" aria-hidden />
          </button>
        ))}
      </div>
    </section>
  );
}

export function TabSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true">
      <div className="h-[170px] animate-pulse rounded-v2-card bg-white shadow-v2-ring" />
      <div className="h-[200px] animate-pulse rounded-v2-card bg-white shadow-v2-ring" />
    </div>
  );
}

/** No emoji — an icon tile and one line. */
export function TabEmpty({ kind, text }: { kind: KindIconKind; text: string }) {
  return (
    <Card padding="none" className="flex flex-col items-center gap-2.5 px-5 py-7 text-center">
      <KindIcon kind={kind} size={44} />
      <p className="text-[14px] font-bold text-v2-ink-2">{text}</p>
    </Card>
  );
}
