'use client';

/**
 * The walker's pinned card on home (enable_home_v2, owner 20.10.2026) — a slide of the
 * daily carousel "האימון היומי שלך", in the same slot as today's run card, built from
 * the same pieces as HomeRunCarouselCard (the surface shell + RunWeekCardV2):
 *  - today's walk: "ההליכה של היום", its goal (time / distance · ~steps · time of day),
 *    the step ring ("ההליכה של היום תסגור את הטבעת"), "צא להליכה", and "לא לבד"
 *    (a nearby walking group) right under it;
 *  - the short walk: "הליכה קצרה להשלמת הצעדים" (missing steps, ~minutes) → "יאללה".
 * The slot is resolved by resolveHomeWalkSlot (home-walk-slot.ts). `onStart` is the
 * caller's (home gates it through the health declaration first).
 */
import { Footprints } from 'lucide-react';
import { IconTile, MiniRing } from '@/components/ui/v2';
import { useActivityStore } from '@/features/activity/store/useActivityStore';
import { plannedWalkSteps, plannedWalkTargetHe, walkStepsHint } from '@/features/schedule/walking/walkWeekView';
import { useNearbyWalkingGroup } from '@/features/schedule/walking/useNearbyWalkingGroup';
import NotAloneCard from '@/features/schedule/walking/components/NotAloneCard';
import type { HomeWalkSlot } from '@/features/home/utils/home-walk-slot';
import RunWeekCardV2 from '../widgets/run-week-v2/RunWeekCardV2';
import { useT } from '@/hooks/useT';
import { home } from '@/messages/ns/home';

const WALK_COLOR = '#f59e0b';
/** The steps tile's own text shade (IconTile tone "steps"), so label and tile match. */
const WALK_TEXT = '#00865a';
const fmt = (n: number) => n.toLocaleString('he-IL');

export interface HomeWalkCarouselCardProps {
  slot: HomeWalkSlot;
  onStart: () => void;
  /** Opens a community group's drawer on home ("לא לבד"). */
  onOpenGroup: (groupId: string) => void;
  /** Rendered on its own (carousel hidden): no fixed slide height. */
  standalone?: boolean;
}

export default function HomeWalkCarouselCard({ slot, onStart, onOpenGroup, standalone = false }: HomeWalkCarouselCardProps) {
  const t = useT(home);
  const steps = useActivityStore((s) => Number(s.today?.steps) || 0);
  const goal = useActivityStore((s) => s.resolvedStepGoal ?? (s.today?.stepsGoal || null));
  const isToday = slot.kind === 'today';
  const notAlone = useNearbyWalkingGroup(isToday);

  const plannedRun = isToday ? slot.entry.plannedRun : undefined;
  const walkSteps = isToday ? plannedWalkSteps(plannedRun) : null;
  const target = isToday ? plannedWalkTargetHe(plannedRun) : null;
  const hint = isToday ? walkStepsHint(steps, goal, walkSteps) : null;
  const pct = goal ? (steps / goal) * 100 : 0;
  const plannedPct = goal && walkSteps ? (walkSteps / goal) * 100 : 0;

  const tile = <IconTile icon={Footprints} tone="steps" size="md" />;

  return (
    <div className={`flex w-full flex-col rounded-v2-card bg-v2-surface p-3 ${standalone ? '' : 'h-full'}`} dir="rtl" data-home-walk-card={slot.kind}>
      <p className="truncate whitespace-nowrap text-[13px] font-extrabold text-v2-deep">
        {isToday ? t('walkCard.kicker.today') : t('walkCard.kicker.gap')}
      </p>
      <h3 className="whitespace-nowrap text-[19px] font-black !tracking-[-0.02em] text-v2-ink">
        {isToday ? t('walkCard.title.today') : t('walkCard.title.gap')}
      </h3>
      <div className="mt-3">
        <RunWeekCardV2
          kind="easy"
          tile={tile}
          accentText={WALK_TEXT}
          typeLabel={isToday ? t('walkCard.type.today') : t('walkCard.type.gap')}
          title={isToday ? (slot.entry.title ?? t('walkCard.defaultTitle')) : t('walkCard.gapTitle', { minutes: String(slot.minutes) })}
          state="today"
          dayLetter={null}
          onStart={onStart}
          startLabel={isToday ? t('walkCard.start.today') : t('walkCard.start.gap')}
        >
          {isToday ? (
            <>
              {(target || walkSteps || slot.entry.startTime) && (
                <p className="mt-2 truncate whitespace-nowrap text-[12.5px] font-extrabold text-v2-ink-2">
                  {[target, walkSteps ? t('walkCard.walkSteps', { steps: fmt(walkSteps) }) : null, slot.entry.startTime].filter(Boolean).join(' · ')}
                </p>
              )}
              <div className="mt-2.5 flex items-center gap-2.5 border-t border-v2-hairline pt-2.5">
                <MiniRing pct={pct} plannedPct={plannedPct} color={WALK_COLOR} size={40} stroke={5} label={goal ? t('walkCard.ringLabel', { steps: fmt(steps), goal: fmt(goal) }) : undefined}>
                  <Footprints size={14} strokeWidth={2.4} style={{ color: WALK_COLOR }} aria-hidden />
                </MiniRing>
                <span className="min-w-0 flex-1">
                  <span className="block truncate whitespace-nowrap text-[13.5px] font-black text-v2-ink">
                    {goal
                      ? t('walkCard.stepsToday.withGoal', { steps: fmt(steps), goal: fmt(goal) })
                      : t('walkCard.stepsToday.plain', { steps: fmt(steps) })}
                  </span>
                  {hint && <span className="block truncate whitespace-nowrap text-[12px] font-bold text-v2-muted">{hint}</span>}
                </span>
              </div>
            </>
          ) : (
            <p className="mt-2 truncate whitespace-nowrap text-[12.5px] font-extrabold text-v2-ink-2">
              {goal
                ? t('walkCard.missing.withGoal', { steps: fmt(slot.missingSteps), goal: fmt(goal) })
                : t('walkCard.missing.plain', { steps: fmt(slot.missingSteps) })}
            </p>
          )}
        </RunWeekCardV2>
      </div>
      {isToday && <NotAloneCard className="mt-2.5" suggestion={notAlone} onOpenGroup={onOpenGroup} />}
    </div>
  );
}
