'use client';

/**
 * Home · walking day (enable_home_v2, owner 20.10.2026; board wr/WR-4) — shown near the
 * top for a walker (a planned walk in the coming week):
 *   • today's walk ("הליכה מהירה · היום", its goal + ~steps) → "צא להליכה" = the free
 *     walk with that goal (startWalkEntry);
 *   • the step ring: today's steps + what the walk adds ("ההליכה של היום תסגור את הטבעת");
 *   • no walk today and steps missing → "הליכה קצרה להשלמת הצעדים" (a timed free walk);
 *   • "לא לבד": a nearby walking group, when there is one (read-only link).
 * Renders nothing when there is nothing to say. The caller wraps it in an error boundary.
 */
import { useRouter } from 'next/navigation';
import { Footprints } from 'lucide-react';
import { Button, IconTile, MiniRing } from '@/components/ui/v2';
import { useActivityStore } from '@/features/activity/store/useActivityStore';
import type { UserScheduleEntry } from '@/features/user/scheduling/types/schedule.types';
import {
  plannedWalkSteps,
  plannedWalkTargetHe,
  startShortWalk,
  startWalkEntry,
  stepGapWalk,
  walkStepsHint,
} from '@/features/schedule/walking';
import { useNearbyWalkingGroup } from '@/features/schedule/walking/useNearbyWalkingGroup';
import NotAloneCard from '@/features/schedule/walking/components/NotAloneCard';

const WALK_COLOR = '#f59e0b';
const fmt = (n: number) => n.toLocaleString('he-IL');

export interface HomeWalkTodayProps {
  today: UserScheduleEntry | null;
  /** A walk was already logged today (today's workout docs). */
  walkedToday: boolean;
  /** Opens a community group's drawer on home. */
  onOpenGroup: (groupId: string) => void;
}

export default function HomeWalkToday({ today, walkedToday, onOpenGroup }: HomeWalkTodayProps) {
  const router = useRouter();
  const push = (href: string) => router.push(href);
  const steps = useActivityStore((s) => Number(s.today?.steps) || 0);
  const goal = useActivityStore((s) => s.resolvedStepGoal ?? (s.today?.stepsGoal || null));

  const walkPending = !!today && !today.completed && !walkedToday;
  const walkSteps = walkPending ? plannedWalkSteps(today?.plannedRun) : null;
  const gap = !walkPending ? stepGapWalk(steps, goal) : null;
  const notAlone = useNearbyWalkingGroup(walkPending);

  if (!walkPending && !gap) return null;

  const pct = goal ? (steps / goal) * 100 : 0;
  const plannedPct = goal && walkSteps ? (walkSteps / goal) * 100 : 0;
  const hint = walkStepsHint(steps, goal, walkSteps);
  const target = walkPending ? plannedWalkTargetHe(today?.plannedRun) : null;

  return (
    <section dir="rtl" className="flex flex-col gap-2.5 font-simpler text-v2-ink" data-home-walk-today>
      {walkPending && (
        <p className="whitespace-nowrap px-1 text-[13px] font-extrabold text-v2-deep">יום הליכה — האימון וטבעת הצעדים יחד</p>
      )}

      <div className="rounded-v2-card bg-white p-3.5 shadow-v2-card">
        {walkPending && today && (
          <div className="flex items-center gap-3">
            <IconTile icon={Footprints} tone="steps" />
            <span className="min-w-0 flex-1">
              <span className="block truncate whitespace-nowrap text-[16px] font-black">{today.title ?? 'הליכה מהירה'} · היום</span>
              <span className="block truncate whitespace-nowrap text-[12.5px] font-bold text-v2-muted">
                {[target, walkSteps ? `~${fmt(walkSteps)} צעדים` : null, today.startTime].filter(Boolean).join(' · ')}
              </span>
            </span>
            <Button variant="cta" size="md" className="shrink-0 whitespace-nowrap" onClick={() => startWalkEntry(today, push)}>
              צא להליכה
            </Button>
          </div>
        )}

        <div className={`flex items-center gap-3 ${walkPending ? 'mt-3 border-t border-v2-hairline pt-3' : ''}`}>
          <MiniRing pct={pct} plannedPct={plannedPct} color={WALK_COLOR} size={52} label={goal ? `${fmt(steps)} מתוך ${fmt(goal)} צעדים` : undefined}>
            <Footprints size={18} strokeWidth={2.2} style={{ color: WALK_COLOR }} aria-hidden />
          </MiniRing>
          <span className="min-w-0 flex-1">
            <span className="block truncate whitespace-nowrap text-[14.5px] font-black">
              צעדים היום {fmt(steps)}{goal ? ` מתוך ${fmt(goal)}` : ''}
            </span>
            {hint && <span className="block truncate whitespace-nowrap text-[12.5px] font-bold text-v2-muted">{hint}</span>}
            {gap && (
              <span className="block truncate whitespace-nowrap text-[12.5px] font-bold text-v2-muted">
                הליכה קצרה להשלמת הצעדים · חסרים {fmt(gap.missingSteps)} · ~{gap.minutes} דק׳
              </span>
            )}
          </span>
          {gap && (
            <Button variant="ghost" size="sm" className="shrink-0 whitespace-nowrap" onClick={() => startShortWalk(gap.minutes, push)}>
              יאללה
            </Button>
          )}
        </div>
      </div>

      <NotAloneCard suggestion={notAlone} onOpenGroup={onOpenGroup} />
    </section>
  );
}
