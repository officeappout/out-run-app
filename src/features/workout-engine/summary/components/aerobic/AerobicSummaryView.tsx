'use client';

import React, { useState, type ReactNode } from 'react';
import { Activity, ChevronLeft, Footprints, Maximize2, Sparkles, Star, Trash2, Users, X } from 'lucide-react';
import {
  Button,
  Card,
  CardTile,
  Chip,
  IconTile,
  MetricRings,
  RepPaceTable,
  StatNumber,
  StreakDotsStrip,
  type StreakWeekBar,
  type WeekDot,
} from '@/components/ui/v2';
import { aerobicRings, repTableModel } from '../../v2-summary.mapping';
import { runTypeModel, type RunPlanInput } from '../../run-type/run-type.mapping';
import RunTypeOverview from '../run-type/RunTypeOverview';
import RunTypeSegments from '../run-type/RunTypeSegments';
import SummaryDrawerShell, { type DrawerTab } from '../../blocks/SummaryDrawerShell';
import type { SummarySnap } from '../../blocks/summary-sheet.util';
import type { GroupSummaryCtx } from '@/features/workout-engine/summary/hooks/useGroupSummaryCtx';
import type { WorkoutHistoryEntry } from '@/features/workout-engine/core/services/storage.service';
import DopamineStreakBlock from '../shared/DopamineStreakBlock';
import AerobicHeroBlock from './AerobicHeroBlock';
import AerobicStatRingsBlock from './AerobicStatRingsBlock';
import TogetherBlock from './TogetherBlock';
import ParticipantsBlock from './ParticipantsBlock';
import MomentSentence from './MomentSentence';
import PersonalRecordTag from './PersonalRecordTag';
import AerobicShareBlock from './AerobicShareBlock';
import RunLapsList from '@/features/workout-engine/players/running/components/FreeRun/RunLapsList';
import LapPaceChart from '../shared/LapPaceChart';
import { XP_REWARDS } from '@/types/contribution.types';
import { WORKOUT_DELETE_EXPANDED_ENABLED } from '@/config/feature-flags';
import DeleteWorkoutConfirmModal from '@/components/ui/DeleteWorkoutConfirmModal';

/**
 * AerobicSummaryView — the hook-free presentational half of the aerobic
 * (walk/run) post-workout summary. AerobicSummaryShell is the data container:
 * it reads the stores/Firestore and hands everything in here as props, so the
 * view can also render from fixtures (dev preview /debug/design-v2/summary).
 */
export interface AerobicSummaryViewProps {
  variant: 'group' | 'solo' | 'pair';
  activityType: 'walking' | 'running';
  workout: WorkoutHistoryEntry & { date: Date };
  currentUid: string | undefined;
  streakDays: number;
  onSave: () => void;
  onClose: () => void;
  /** XP earned this session; pill hidden when 0 or undefined */
  xpEarned?: number;
  groupCtx: GroupSummaryCtx | null;
  groupLoading: boolean;
  /** Id of the workout doc saved this session (null = nothing saved). */
  savedWorkoutId: string | null;
  /** Renders the route map (RunMapBlock in the container; a placeholder in previews). */
  renderMap: () => ReactNode;
  /** Writes the route rating (contribution + aggregate). Throws on failure. */
  submitRating: (routeQuality: number) => Promise<void>;
  /** Legacy (flag-off) delete path. */
  deleteLastWorkout: () => Promise<unknown>;
  /** Expanded (flag-on) delete path. */
  deleteWorkoutWithReversal: (workoutId: string) => Promise<unknown>;
  /** Snap the drawer opens at — 'full' (default) or 'peek' (dev preview). */
  initialSnap?: SummarySnap;
  /**
   * History (read-only) mode — /workouts/[id]/history re-opening a saved
   * walk/run. Nothing is written: the route-rating card is hidden, the
   * this-session delete (savedWorkoutId) is never shown, the "too short — not
   * saved" notice is suppressed, and the footer is a plain "סגור" → onClose.
   * Default false = the live post-finish flow, unchanged.
   */
  isReadOnly?: boolean;
  /**
   * History delete trigger — rendered only when `isReadOnly && onDelete`.
   * This view doesn't own the confirm/delete flow; tapping just calls the
   * caller's onDelete() (same contract as HybridSummary / StrengthSummaryPage).
   */
  onDelete?: () => void;
  /**
   * Transparent gap above the open drawer (live Mapbox peeks through on /map).
   * No map is mounted behind the history route, so it passes 0. Default 110.
   */
  peekHeight?: number;
  /** enable_home_v2 live flow — the "לשתף את האימון בפיד?" card (owned by the shell). */
  feedShareSlot?: ReactNode;
  /**
   * enable_home_v2 — the approved F-1f overview (three rings + streak strip,
   * no XP chip). Absent ⇒ today's summary, unchanged. `streak` is null in the
   * read-only history view (the week strip describes "now").
   */
  v2?: AerobicSummaryV2Data;
}

export interface AerobicSummaryV2Data {
  streak: { days: WeekDot[]; best: number } | null;
  weekBars?: StreakWeekBar[];
  /** Running program (already on the profile) for the program ring; null/absent ⇒ no ring. */
  plan?: RunPlanInput | null;
}

type TabId = 'overview' | 'stats' | 'segments' | 'map';

const TABS: DrawerTab[] = [
  { id: 'overview', label: 'סקירה' },
  { id: 'stats', label: 'סטטיסטיקה' },
  { id: 'segments', label: 'מקטעים' },
  { id: 'map', label: 'מפה' },
];

function formatDate(d: Date): string {
  try {
    return d.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' });
  } catch {
    return '';
  }
}

export default function AerobicSummaryView({
  variant,
  activityType,
  workout,
  currentUid,
  streakDays,
  onSave,
  onClose,
  xpEarned = 0,
  groupCtx,
  groupLoading,
  savedWorkoutId,
  renderMap,
  submitRating,
  deleteLastWorkout,
  deleteWorkoutWithReversal,
  initialSnap = 'full',
  isReadOnly = false,
  onDelete,
  peekHeight = 110,
  feedShareSlot,
  v2,
}: AerobicSummaryViewProps) {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [expandedMap, setExpandedMap] = useState(false);
  const [routeQuality, setRouteQuality] = useState(0);
  const [ratingSubmitted, setRatingSubmitted] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // WORKOUT_DELETE_EXPANDED_ENABLED-only: opens the shared DeleteWorkoutConfirmModal.
  // Kept as a separate state var from `deleteConfirm` (the flag-false inline confirm box)
  // so the flag-false path below stays byte-identical to pre-rewire behaviour.
  const [expandedDeleteModalOpen, setExpandedDeleteModalOpen] = useState(false);

  // Pair = group session with exactly 2 participants; detected once groupCtx loads
  const isPair = variant === 'group' && (groupCtx?.participantCount ?? 0) === 2;
  const effectiveVariant = isPair ? 'pair' : variant;

  const dateLabel = formatDate(workout.date);
  // v2 only: planned runs' per-rep results (optional `blockResults`; older
  // docs and free runs have none ⇒ null ⇒ today's laps UI).
  const repTable = v2 ? repTableModel(workout.blockResults) : null;
  // v2 runs: the summary differs by workout type (easy / intervals / long).
  const runModel = v2 && activityType === 'running' ? runTypeModel(workout, v2.plan) : null;
  const typedSegments =
    !!runModel && ((runModel.kind === 'intervals' && !!repTable) || (runModel.kind !== 'intervals' && !!runModel.splits));
  const distanceKm = workout.distance ?? 0;

  // ── Hero (drag zone) ──────────────────────────────────────────────────────
  // Distance is the one number that matters for a run/walk. It sits in the
  // drawer's drag zone so it stays visible when the drawer is collapsed.

  const hero = (
    <div className="flex items-end justify-between gap-3 px-4 pt-1 pb-3">
      <div className="min-w-0">
        <div className="text-[13px] font-extrabold text-v2-deep">
          {runModel ? runModel.hero.label : activityType === 'walking' ? 'הליכה' : 'ריצה'}
          <span className="font-semibold text-v2-muted"> · {dateLabel}</span>
        </div>
        {runModel?.hero.repsTitle ? (
          <div className="mt-1 whitespace-nowrap text-[40px] font-black leading-none tabular-nums !tracking-[-0.03em] text-v2-ink">
            {runModel.hero.repsTitle}
          </div>
        ) : (
          <StatNumber
            value={distanceKm}
            decimals={2}
            format={distanceKm > 0 ? undefined : () => '--'}
            unit="ק״מ"
            size="lg"
            className="mt-1"
          />
        )}
      </div>
      <div className="flex flex-col items-end gap-1.5 shrink-0">
        <IconTile icon={activityType === 'walking' ? Footprints : Activity} tone="run" size="md" />
        {/* XP chip — solo only */}
        {effectiveVariant === 'solo' && xpEarned > 0 && !v2 && (
          <Chip tone="accent" icon={<Sparkles size={13} strokeWidth={2.4} aria-hidden />}>
            {`+${xpEarned} XP`}
          </Chip>
        )}
      </div>
    </div>
  );

  // Framed route map: always shows a map (route line when coords exist; location-centered
  // Israel map when coords are empty). displayCoords substitutes a mock route in dev mode.
  const frameMapBlock = (
    <div className="relative h-full overflow-hidden rounded-v2-card shadow-v2-ring">
      {renderMap()}
      <button
        type="button"
        onClick={() => setExpandedMap(true)}
        aria-label="הגדל מפה"
        className="absolute top-2.5 left-2.5 rounded-[12px] shadow-v2-ring active:scale-[0.97] transition-transform duration-200 ease-v2"
      >
        <IconTile icon={Maximize2} tone="neutral" size="sm" className="!bg-white" />
      </button>
    </div>
  );

  // ── Overview content ──────────────────────────────────────────────────────

  const overviewContent = (
    <div className="px-4 pt-4 pb-6 space-y-3">

      {/* Hero: map for solo, avatars for group/pair */}
      {effectiveVariant === 'solo' && <div className="h-[180px]">{frameMapBlock}</div>}
      {(effectiveVariant === 'group' || effectiveVariant === 'pair') && (
        <AerobicHeroBlock
          variant={effectiveVariant}
          groupCtx={groupCtx}
          dateLabel={dateLabel}
        />
      )}

      {/* Together block — group / pair (emotional anchor) */}
      {(effectiveVariant === 'group' || effectiveVariant === 'pair') && groupCtx && !groupLoading && (
        <TogetherBlock
          collectiveDistanceKm={groupCtx.collectiveDistanceKm}
          participantCount={groupCtx.participantCount}
        />
      )}

      {/* Proximity line — pair only */}
      {effectiveVariant === 'pair' && groupCtx && (
        <div className="text-center text-[13px] font-semibold text-v2-ink-2">
          {`רצתם ${groupCtx.collectiveDistanceKm.toFixed(1)} ק״מ יחד`}
        </div>
      )}

      {/* Emotional layer */}
      <PersonalRecordTag />
      <MomentSentence />

      {v2 && runModel ? (
        <RunTypeOverview
          model={runModel}
          activityType={activityType}
          repTable={repTable}
          lapCount={workout.laps?.length ?? 0}
          onOpenSegments={() => setActiveTab('segments')}
          streakSlot={
            v2.streak ? (
              <StreakDotsStrip
                streak={streakDays}
                best={Math.max(v2.streak.best, streakDays)}
                days={v2.streak.days}
                bars={v2.weekBars}
              />
            ) : null
          }
        />
      ) : v2 ? (
        <>
          {/* v2 (F-1f): three rings, then the streak strip. */}
          <Card padding="md">
            <MetricRings rings={aerobicRings(workout)} />
          </Card>
          {v2.streak && (
            <StreakDotsStrip
              streak={streakDays}
              best={Math.max(v2.streak.best, streakDays)}
              days={v2.streak.days}
              bars={v2.weekBars}
            />
          )}
          {repTable ? (
            <button
              type="button"
              onClick={() => setActiveTab('segments')}
              className="flex w-full items-center gap-3 rounded-v2-card bg-white px-4 py-3 text-start shadow-v2-card active:scale-[0.97] transition-transform duration-150 ease-v2"
            >
              <IconTile icon={Activity} tone="run" size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14.5px] font-black text-v2-ink">קצב בכל חזרה</span>
                <span className="block truncate text-[12px] font-bold text-v2-muted">לפירוט בלשונית מקטעים</span>
              </span>
              <span className="inline-flex h-7 shrink-0 items-center whitespace-nowrap rounded-full bg-[#ecfdf5] px-3 text-[12px] font-extrabold tabular-nums text-[#047857]">
                {repTable.shortLabel ?? `${repTable.reps} חזרות`}
              </span>
              <ChevronLeft size={18} strokeWidth={2.4} className="shrink-0 text-v2-muted" aria-hidden />
            </button>
          ) : workout.laps && workout.laps.length > 0 && (
            <button
              type="button"
              onClick={() => setActiveTab('segments')}
              className="flex w-full items-center gap-3 rounded-v2-card bg-white px-4 py-3 text-start shadow-v2-card active:scale-[0.97] transition-transform duration-150 ease-v2"
            >
              <IconTile icon={activityType === 'walking' ? Footprints : Activity} tone="run" size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14.5px] font-black text-v2-ink">קצב בכל הקפה</span>
                <span className="block truncate text-[12px] font-bold text-v2-muted">לפירוט בלשונית מקטעים</span>
              </span>
              <span className="inline-flex h-7 shrink-0 items-center whitespace-nowrap rounded-full bg-v2-tint px-3 text-[12px] font-extrabold tabular-nums text-v2-deep">
                {workout.laps.length} הקפות
              </span>
              <ChevronLeft size={18} strokeWidth={2.4} className="shrink-0 text-v2-muted" aria-hidden />
            </button>
          )}
        </>
      ) : (
        <>
          {/* Streak */}
          {streakDays > 1 && <DopamineStreakBlock streakDays={streakDays} />}

          {/* Stat rings */}
          <Card padding="sm">
            <AerobicStatRingsBlock
              activityType={activityType}
              pace={workout.pace ?? 0}
              duration={workout.duration ?? 0}
              calories={workout.calories ?? 0}
            />
          </Card>
        </>
      )}

      {/* Participants compact list — group only (3+) */}
      {effectiveVariant === 'group' && groupCtx && groupCtx.participants.length > 0 && (
        <Card padding="md">
          <div className="mb-2 flex items-center gap-2">
            <IconTile icon={Users} tone="accent" size="sm" />
            <span className="text-[14px] font-extrabold text-v2-ink">משתתפים</span>
          </div>
          <ParticipantsBlock
            participants={groupCtx.participants}
            currentUid={currentUid}
            compact
            onShowAll={() => setActiveTab('stats')}
          />
        </Card>
      )}

      {/* Route Rating CTA — shown whenever there is a park or route to aggregate against */}
      {!isReadOnly && !!(workout.parkId || workout.routeId) && (
        <Card padding="md" dir="rtl">
          {ratingSubmitted ? (
            <div className="text-center text-[14px] font-extrabold text-v2-deep">
              {v2 ? 'תודה על הדירוג!' : `תודה על הדירוג! +${XP_REWARDS.review} XP`}
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <IconTile icon={Star} tone="accent" size="sm" />
                <span className="text-[14px] font-extrabold text-v2-ink">דרגו את המסלול</span>
              </div>
              <div className="my-3 flex justify-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRouteQuality(star)}
                    aria-label={`${star} כוכבים`}
                    className="p-1 active:scale-[0.97] transition-transform duration-200 ease-v2"
                  >
                    <svg
                      width="30" height="30" viewBox="0 0 24 24"
                      fill={star <= routeQuality ? '#f59e0b' : 'none'}
                      stroke={star <= routeQuality ? '#f59e0b' : '#dfe7ed'}
                      strokeWidth="2"
                      strokeLinejoin="round"
                    >
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                  </button>
                ))}
              </div>
              {routeQuality > 0 && (
                <Button
                  variant="dark"
                  size="md"
                  block
                  onClick={async () => {
                    if (!currentUid) return;
                    try {
                      await submitRating(routeQuality);
                      setRatingSubmitted(true);
                    } catch (err) {
                      console.error('[AerobicSummaryShell] Rating failed:', err);
                    }
                  }}
                >
                  שלח דירוג
                </Button>
              )}
            </>
          )}
        </Card>
      )}

      {feedShareSlot}

      {/* Share (the finish/save action is the drawer's pinned footer) */}
      <AerobicShareBlock
        distanceKm={distanceKm}
        groupCtx={groupCtx}
        wasSaved={isReadOnly || savedWorkoutId !== null}
      />

      {/* Delete workout — only shown when a workout was actually saved this session */}
      {!isReadOnly && savedWorkoutId && (
        WORKOUT_DELETE_EXPANDED_ENABLED ? (
          // ── Flag ON: shared DeleteWorkoutConfirmModal + deleteWorkoutWithReversal ──
          <div className="text-center">
            <button
              type="button"
              onClick={() => setExpandedDeleteModalOpen(true)}
              className="px-2 py-1 text-[13px] font-semibold text-v2-muted underline underline-offset-2"
            >
              בטל / מחק אימון
            </button>
          </div>
        ) : (
          // ── Flag OFF: today's exact existing inline confirm + deleteLastWorkout() ──
          !deleteConfirm ? (
            <div className="text-center">
              <button
                type="button"
                onClick={() => setDeleteConfirm(true)}
                className="px-2 py-1 text-[13px] font-semibold text-v2-muted underline underline-offset-2"
              >
                בטל / מחק אימון
              </button>
            </div>
          ) : (
            <Card padding="md" className="text-center">
              <div className="mb-1.5 text-[15px] font-extrabold text-v2-down">למחוק את האימון?</div>
              <div className="mb-3.5 text-[13px] text-v2-ink-2">
                האימון יימחק, ה-XP והרצף יוחזרו לאחור.
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="md" className="flex-1" onClick={() => setDeleteConfirm(false)}>
                  בטל
                </Button>
                <Button
                  variant="dark"
                  size="md"
                  className="flex-1 !bg-v2-down"
                  disabled={deleting}
                  onClick={async () => {
                    setDeleting(true);
                    try {
                      await deleteLastWorkout();
                    } finally {
                      setDeleting(false);
                      onClose();
                    }
                  }}
                >
                  {deleting ? 'מוחק...' : 'מחק אימון'}
                </Button>
              </div>
            </Card>
          )
        )
      )}

      {/* WORKOUT_DELETE_EXPANDED_ENABLED-only: shared confirm modal, mounted regardless
          of tab so it can be triggered from the overview tab's trigger above. */}
      {!isReadOnly && WORKOUT_DELETE_EXPANDED_ENABLED && (
        <DeleteWorkoutConfirmModal
          isOpen={expandedDeleteModalOpen}
          activityLabel={activityType === 'walking' ? 'הליכה' : 'ריצה'}
          dateLabel={dateLabel}
          xpToReverse={xpEarned}
          onCancel={() => setExpandedDeleteModalOpen(false)}
          onConfirm={async () => {
            if (!savedWorkoutId) return;
            try {
              await deleteWorkoutWithReversal(savedWorkoutId);
            } finally {
              setExpandedDeleteModalOpen(false);
              onClose();
            }
          }}
        />
      )}
    </div>
  );

  // ── Segments tab ──────────────────────────────────────────────────────────

  const segmentsContent = (
    <div className="px-4 pt-4 pb-6">
      {runModel && typedSegments ? (
        <div className="mb-3">
          <RunTypeSegments model={runModel} repTable={repTable} />
        </div>
      ) : repTable && (
        <Card padding="md" className="mb-3">
          <RepPaceTable rows={repTable.rows} band={repTable.band} summaryLabel={repTable.summaryLabel} />
        </Card>
      )}
      {runModel?.splitsFromLaps ? null : workout.laps && workout.laps.length > 0 ? (
        <>
          <LapPaceChart laps={workout.laps} />
          <div className="mt-3">
            <RunLapsList laps={workout.laps} />
          </div>
        </>
      ) : repTable || typedSegments ? null : (
        <div className="py-8 text-center text-[14px] font-semibold text-v2-muted">
          אין הקפות מוגדרות לאימון זה
        </div>
      )}
    </div>
  );

  // ── Map tab ───────────────────────────────────────────────────────────────

  const mapContent = (
    <div className="px-4 pt-4 pb-6">
      <div className="h-[360px]">{frameMapBlock}</div>
    </div>
  );

  // ── Stats tab ─────────────────────────────────────────────────────────────

  const statsContent = (
    <div className="px-4 pt-4 pb-6">
      {/* Full participants list — group only (3+) */}
      {effectiveVariant === 'group' && groupCtx && groupCtx.participants.length > 0 && (
        <div className="mb-4">
          <div className="mb-2 text-[14px] font-extrabold text-v2-ink">כל המשתתפים</div>
          <ParticipantsBlock
            participants={groupCtx.participants}
            currentUid={currentUid}
            compact={false}
          />
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <StatTile label="מרחק" value={`${distanceKm.toFixed(2)} ק״מ`} />
        <StatTile label="זמן" value={formatDuration(workout.duration ?? 0)} />
        <StatTile label="קצב ממוצע" value={formatPaceLocal(workout.pace ?? 0)} />
        <StatTile label="קלוריות" value={`${Math.round(workout.calories ?? 0)} קק״ל`} />
        {(workout.elevationGain ?? 0) > 0 && (
          <StatTile label="עלייה מצטברת" value={`${workout.elevationGain} מ׳`} />
        )}
      </div>
    </div>
  );

  const tabContent: Record<TabId, React.ReactNode> = {
    overview: overviewContent,
    segments: segmentsContent,
    map: mapContent,
    stats: statsContent,
  };

  // ── Shell render ──────────────────────────────────────────────────────────

  return (
    <>
      {/* Full-screen expanded map — z-[200], within z-index budget */}
      {expandedMap && (
        <div dir="rtl" style={{ position: 'fixed', inset: 0, zIndex: 200, background: '#000' }}>
          {renderMap()}
          <button
            type="button"
            onClick={() => setExpandedMap(false)}
            aria-label="סגור מפה"
            className="absolute right-4 rounded-[12px] shadow-v2-float active:scale-[0.97] transition-transform duration-200 ease-v2"
            style={{ top: 'calc(16px + env(safe-area-inset-top, 0px))' }}
          >
            <IconTile icon={X} tone="neutral" size="md" className="!bg-white" />
          </button>
        </div>
      )}

      {/* v2 draggable drawer — live Mapbox map shows behind (and through the
          peek when collapsed). Dragging never exits; finishing is the footer. */}
      <SummaryDrawerShell
        tabs={TABS}
        activeTab={activeTab}
        onTabChange={(id) => setActiveTab(id as TabId)}
        header={hero}
        peekHeight={peekHeight}
        initialSnap={initialSnap}
        footer={
          isReadOnly ? (
            // History: optional delete (caller-owned confirm) + close. No save.
            <div className="flex items-center gap-2.5 px-4 py-3">
              {onDelete && (
                <Button
                  variant="ghost"
                  size="lg"
                  onClick={onDelete}
                  aria-label="מחק אימון"
                  className="!px-4 !text-v2-down"
                >
                  <Trash2 size={18} strokeWidth={2.4} aria-hidden />
                </Button>
              )}
              <Button variant="primary" size="lg" onClick={onClose} className="flex-1">
                סגור
              </Button>
            </div>
          ) : (
            <div className="px-4 py-3">
              <Button variant="primary" size="lg" block onClick={onSave}>
                {savedWorkoutId !== null ? 'סיום ושמור' : 'סיום'}
              </Button>
            </div>
          )
        }
      >
        {tabContent[activeTab]}
      </SummaryDrawerShell>
    </>
  );
}

// ── Local helpers ─────────────────────────────────────────────────────────

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <CardTile className="px-3 py-3 ring-1 ring-inset ring-v2-hairline">
      <div className="text-[20px] font-black leading-none tabular-nums tracking-[-0.03em] text-v2-ink">
        {value}
      </div>
      <div className="mt-1 text-[12px] font-semibold text-v2-muted">{label}</div>
    </CardTile>
  );
}

function formatPaceLocal(minPerKm: number): string {
  if (!minPerKm || !isFinite(minPerKm) || minPerKm <= 0) return '--';
  const mins = Math.floor(minPerKm);
  const secs = Math.round((minPerKm - mins) * 60);
  return `${mins}:${secs.toString().padStart(2, '0')} ד׳/ק״מ`;
}

function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '--';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
