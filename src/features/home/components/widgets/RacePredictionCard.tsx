'use client';

/**
 * RacePredictionCard — home v2 "תחזית למרוץ" widget.
 *
 * Renders ONLY under home v2 (useHomeV2) — returns null otherwise, so the
 * classic home is untouched. All numbers come from the user's real
 * `running.paceProfile.basePace` through `selectRacePrediction` (see
 * utils/race-prediction.ts for the model and the visibility rules).
 *
 * Once paceProfile.qualityWorkoutsHistory holds a dated record (planned
 * quality runs feed it — pace-self-correction.service), the header says
 * "מתעדכן לפי הריצות שלך" and the 30-day trend chip can appear.
 *
 * Not tappable as a whole: the app has no running-stats screen yet
 * (/progress is the activity log, and its "ריצה" filter is a weekday
 * heuristic), so the only interaction is the "i" that explains the number.
 */

import React, { useId, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Info, TrendingDown, TrendingUp, Timer } from 'lucide-react';
import { useUserStore } from '@/features/user';
import { useHomeV2 } from '@/features/home/context/HomeV2Context';
import { seedOnboardingTrackEntry } from '@/features/user/onboarding/utils/onboarding-entry';
import {
  formatPacePerKm,
  formatRaceClock,
  formatRaceTime,
  formatTrend,
  selectRacePrediction,
} from '@/features/home/utils/race-prediction';

const RUN_ONBOARDING_HREF = '/onboarding-new/program-path?track=run';

export interface RacePredictionCardProps {
  /** enable_running_programs — gates only the empty-state CTA. */
  runningProgramsEnabled: boolean;
}

export function RacePredictionCard({ runningProgramsEnabled }: RacePredictionCardProps) {
  const v2 = useHomeV2();
  const router = useRouter();
  const profile = useUserStore((s) => s.profile);
  const [infoOpen, setInfoOpen] = useState(false);
  const infoId = useId();

  const running = profile?.running;
  const basePace = running?.paceProfile?.basePace;
  const targetDistance = running?.generatedProgramTemplate?.targetDistance;
  const history = running?.paceProfile?.qualityWorkoutsHistory;
  const isRunner = !!(running?.isUnlocked || running?.activeProgram || running?.lastWorkoutDate);

  const view = useMemo(
    () =>
      selectRacePrediction({
        basePace,
        targetDistance,
        history: history as unknown as { date?: unknown; impactOnBasePaceSeconds?: unknown }[] | undefined,
        isRunner,
        runningProgramsEnabled,
        now: new Date(),
      }),
    [basePace, targetDistance, history, isRunner, runningProgramsEnabled],
  );

  if (!v2 || view.state === 'hidden') return null;

  if (view.state === 'empty') {
    return (
      <div className="flex w-full items-center gap-3 rounded-v2-card bg-white p-4 shadow-v2-card" dir="rtl">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-v2-tint text-v2-deep">
          <Timer size={20} strokeWidth={2.4} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate whitespace-nowrap text-[15px] font-black text-v2-ink">רוצים תחזית למרוץ?</p>
          <p className="truncate whitespace-nowrap text-[12.5px] font-bold text-v2-muted">ספרו לנו על ריצה אחרונה ונחשב</p>
        </div>
        <button
          type="button"
          onClick={() => {
            seedOnboardingTrackEntry(profile, 'RUNNING');
            router.push(RUN_ONBOARDING_HREF);
          }}
          className="shrink-0 whitespace-nowrap rounded-full bg-white px-4 py-2 text-[13px] font-extrabold text-v2-deep shadow-v2-ring transition-transform duration-150 ease-v2 active:scale-[0.97]"
        >
          בואו נתחיל
        </button>
      </div>
    );
  }

  const main = formatRaceTime(view.main.seconds);
  const trend = view.trendSeconds !== null ? formatTrend(view.trendSeconds) : null;

  return (
    <div className="w-full rounded-v2-card bg-white p-4 shadow-v2-card" dir="rtl">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-baseline gap-2">
          <p className="truncate whitespace-nowrap text-[13px] font-extrabold text-v2-deep">תחזית למרוץ</p>
          {view.basedOnRuns && (
            <p className="truncate whitespace-nowrap text-[12px] font-bold text-v2-muted">מתעדכן לפי הריצות שלך</p>
          )}
        </div>
        <button
          type="button"
          aria-label="איך מחושבת התחזית"
          aria-expanded={infoOpen}
          aria-controls={infoId}
          onClick={() => setInfoOpen((o) => !o)}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-v2-surface text-v2-muted ring-1 ring-inset ring-v2-hairline transition-transform duration-150 ease-v2 active:scale-[0.97]"
        >
          <Info size={16} strokeWidth={2.4} />
        </button>
      </div>

      <div className="mt-1 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="whitespace-nowrap text-[12.5px] font-bold text-v2-muted">{view.main.label}</p>
          <p className="mt-0.5 whitespace-nowrap text-[32px] font-black leading-none tabular-nums tracking-v2-tighter text-v2-ink">
            <span dir="ltr">{main.value}</span>{' '}
            <span className="text-[14px] font-bold tracking-normal text-v2-muted">{main.unit}</span>
          </p>
        </div>
        {trend && (
          <span
            className={`mb-0.5 flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] font-extrabold ${
              trend.faster ? 'bg-v2-tint text-v2-deep' : 'bg-v2-surface text-v2-ink-2'
            }`}
          >
            {trend.faster ? <TrendingUp size={14} strokeWidth={2.4} /> : <TrendingDown size={14} strokeWidth={2.4} />}
            <span dir="ltr">{trend.clock}</span>
            <span>{trend.label} · 30 יום</span>
          </span>
        )}
      </div>

      {view.others.length > 0 && (
        <div className="mt-3 flex items-center gap-2 border-t border-v2-hairline pt-3">
          {view.others.map((o) => (
            <div key={o.km} className="flex min-w-0 flex-1 items-baseline gap-1.5 whitespace-nowrap">
              <span className="text-[12px] font-bold text-v2-muted">{o.label}</span>
              <span className="text-[14px] font-black tabular-nums text-v2-ink-2" dir="ltr">
                {formatRaceClock(o.seconds)}
              </span>
            </div>
          ))}
        </div>
      )}

      {infoOpen && (
        <p id={infoId} className="mt-3 rounded-[14px] bg-v2-surface p-3 text-[12.5px] font-bold leading-snug text-v2-ink-2">
          הערכה בלבד, לא תוצאה מובטחת. מחושבת מקצב הבסיס שלך בתוכנית הריצה (
          <span dir="ltr">{formatPacePerKm(view.basePace)}</span> דק׳ לק״מ) ומהמרחק שאליו התוכנית מכוונת. מרחקים אחרים מוערכים בנוסחת Riegel.
          {view.basedOnRuns
            ? ' קצב הבסיס מתעדכן אחרי כל 3 אימוני איכות מהתוכנית (אינטרוולים / טמפו), לפי הקצב שרצת בפועל.'
            : ' אחרי 3 אימוני איכות מהתוכנית (אינטרוולים / טמפו) התחזית תתעדכן לפי הקצב שרצת בפועל.'}
        </p>
      )}
    </div>
  );
}

export default RacePredictionCard;
