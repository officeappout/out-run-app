'use client';

/**
 * A FUTURE day in home's week strip (enable_home_v2, owner 20.10.2026): what is planned
 * for that day — preview only. No "start now" CTA, no post-workout / generic "today"
 * suggestions (those only make sense today). Built from the shared v2 pieces
 * (Card, SectionHeader, WeekSessionPiece, IconTile); the plan is usePlannedDay → day-plan.ts.
 */
import { Dumbbell, Footprints, Moon, Users } from 'lucide-react';
import { Card, IconTile, SectionHeader, WeekSessionPiece } from '@/components/ui/v2';
import { RunIcon } from '@/features/content/programs/core/program-icon.util';
import type { PlannedDay, PlannedDayItem } from '../../utils/day-plan';

const HE_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

/** "מתוכנן ליום חמישי · 22.10" */
export function plannedForTitle(dateISO: string): string {
  const d = new Date(`${dateISO}T00:00:00`);
  return `מתוכנן ליום ${HE_DAYS[d.getDay()]} · ${d.getDate()}.${d.getMonth() + 1}`;
}

function RunTile() {
  // Cardio colour (#84cc16, text #65a30d) — same tile size as IconTile md.
  return (
    <span aria-hidden className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-[#84cc16]/10 text-[#65a30d]">
      <RunIcon className="h-5 w-5" />
    </span>
  );
}

function tileOf(item: PlannedDayItem) {
  switch (item.kind) {
    case 'walk':
      return <IconTile icon={Footprints} tone="steps" size="md" />;
    case 'run':
      return <RunTile />;
    case 'group':
      return <IconTile icon={Users} tone="neutral" size="md" />;
    default:
      return <IconTile icon={Dumbbell} tone="accent" size="md" />;
  }
}

export interface PlannedDayPreviewProps {
  dateISO: string;
  plan: PlannedDay | null;
}

export default function PlannedDayPreview({ dateISO, plan }: PlannedDayPreviewProps) {
  return (
    <div className="mx-auto mb-4 w-full max-w-[358px] px-4" dir="rtl" data-planned-day-preview={dateISO}>
      <Card padding="md">
        <SectionHeader as="h3" size={17} title={plannedForTitle(dateISO)} />
        <div className="mt-3 flex flex-col gap-2">
          {!plan ? (
            <div className="h-[52px] animate-pulse rounded-[14px] bg-v2-surface" />
          ) : plan.items.length > 0 ? (
            plan.items.map((item, i) => (
              <WeekSessionPiece
                key={`${item.kind}-${i}`}
                icon={tileOf(item)}
                title={item.title}
                subtitle={item.subtitle}
                tag={item.completed ? { label: 'בוצע', tone: 'new' } : null}
              />
            ))
          ) : (
            <WeekSessionPiece
              icon={<IconTile icon={Moon} tone="neutral" size="md" />}
              title={plan.isRestDay ? 'יום מנוחה' : 'אין אימון מתוכנן'}
              subtitle={plan.isRestDay ? 'התאוששות ומוביליטי — הגוף בונה את עצמו' : 'אפשר להוסיף אימון מהלו״ז'}
            />
          )}
        </div>
        <p className="mt-3 whitespace-nowrap text-[12px] font-bold text-v2-muted">
          האימון ייפתח ביום עצמו
        </p>
      </Card>
    </div>
  );
}
