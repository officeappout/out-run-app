'use client';

/**
 * Profile v2 · "השיאים שלך" (board P-3): a "שברת שיא" banner for a record set
 * in the last 7 days, then one tile per REAL record (missing ones are
 * hidden). Records start at the first workout saved under enable_home_v2
 * (forward-only, no backfill).
 */
import { Flame, Trophy, CalendarDays } from 'lucide-react';
import { Card } from '@/components/ui/v2';
import { MuscleIcon, RunIcon, WalkingIcon } from '@/features/content/programs/core/program-icon.util';
import { useProfileRecords } from '../../hooks/useProfileRecords';
import { dateLabel, type RecordIcon } from './record-tiles';

const TONE: Record<RecordIcon, { bg: string; fg: string }> = {
  strength: { bg: 'rgba(0,186,247,0.12)', fg: '#0284c7' },
  run: { bg: 'rgba(132,204,22,0.14)', fg: '#65a30d' },
  walk: { bg: 'rgba(245,158,11,0.14)', fg: '#b45309' },
  streak: { bg: 'rgba(245,158,11,0.14)', fg: '#b45309' },
  month: { bg: '#eef8fc', fg: '#0284c7' },
};

function Glyph({ icon }: { icon: RecordIcon }) {
  const c = 'h-[18px] w-[18px]';
  if (icon === 'strength') return <MuscleIcon className={c} />;
  if (icon === 'run') return <RunIcon className={c} />;
  if (icon === 'walk') return <WalkingIcon className={c} />;
  if (icon === 'streak') return <Flame className={c} aria-hidden />;
  return <CalendarDays className={c} aria-hidden />;
}

export default function PersonalRecordsCard({ active }: { active: boolean }) {
  const { tiles, loading } = useProfileRecords(active);
  const fresh = tiles.filter((t) => t.isNew).sort((a, b) => (b.at ?? 0) - (a.at ?? 0))[0];

  return (
    <section id="records" className="scroll-mt-20">
      <h3 className="mb-3 text-[15px] font-black text-v2-ink">השיאים שלך</h3>
      {fresh && (
        <div className="mb-3 flex items-center gap-3 rounded-v2-card bg-v2-tint p-3.5 ring-1 ring-inset ring-v2-accent/40">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-v2-gold text-v2-on-gold" aria-hidden>
            <Trophy className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="whitespace-nowrap text-[15px] font-black text-v2-ink">שברת שיא השבוע</p>
            <p className="truncate whitespace-nowrap text-[12.5px] font-bold text-v2-deep">
              {fresh.label} · {fresh.value}
              {fresh.unit ? ` ${fresh.unit}` : ''}
            </p>
          </div>
        </div>
      )}
      {tiles.length === 0 ? (
        !loading && (
          <Card padding="none" className="px-4 py-5 text-center">
            <p className="text-[13.5px] font-bold text-v2-ink-2">השיאים שלך יתחילו להופיע מהאימון הבא.</p>
          </Card>
        )
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {tiles.map((t) => (
            <Card key={t.key} padding="none" className="p-3.5">
              <div className="flex items-center justify-between">
                <span className="grid h-8 w-8 place-items-center rounded-[10px]" style={{ background: TONE[t.icon].bg, color: TONE[t.icon].fg }}>
                  <Glyph icon={t.icon} />
                </span>
                {t.isNew && (
                  <span className="whitespace-nowrap rounded-full bg-v2-gold px-2 py-0.5 text-[11px] font-extrabold text-v2-on-gold">שיא חדש</span>
                )}
              </div>
              <p className="mt-2 flex items-baseline gap-1">
                <span className="text-[24px] font-black leading-none tabular-nums text-v2-ink">{t.value}</span>
                {t.unit && <span className="text-[12.5px] font-bold text-v2-muted">{t.unit}</span>}
              </p>
              <p className="mt-1 truncate whitespace-nowrap text-[12.5px] font-extrabold text-v2-ink-2">{t.label}</p>
              {t.at != null && <p className="whitespace-nowrap text-[11.5px] font-bold text-v2-muted">{dateLabel(t.at)}</p>}
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
