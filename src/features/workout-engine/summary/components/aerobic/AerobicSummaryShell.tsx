'use client';

import React, { useState } from 'react';
import { useGroupSummaryCtx } from '@/features/workout-engine/summary/hooks/useGroupSummaryCtx';
import type { WorkoutHistoryEntry } from '@/features/workout-engine/core/services/storage.service';
import DopamineStreakBlock from '../shared/DopamineStreakBlock';
import AerobicHeroBlock from './AerobicHeroBlock';
import AerobicStatRingsBlock from './AerobicStatRingsBlock';
import TogetherBlock from './TogetherBlock';
import ParticipantsBlock from './ParticipantsBlock';
import MomentSentence from './MomentSentence';
import PersonalRecordTag from './PersonalRecordTag';
import AerobicShareBlock from './AerobicShareBlock';
import RunMapBlock from '../running/RunMapBlock';
import RunLapsList from '@/features/workout-engine/players/running/components/FreeRun/RunLapsList';
import LapPaceChart from '../shared/LapPaceChart';
import { createContribution } from '@/features/parks/core/services/contribution.service';
import { XP_REWARDS } from '@/types/contribution.types';
import { useRunningPlayer } from '@/features/workout-engine/players/running/store/useRunningPlayer';
import { WORKOUT_DELETE_EXPANDED_ENABLED } from '@/config/feature-flags';
import DeleteWorkoutConfirmModal from '@/components/ui/DeleteWorkoutConfirmModal';
import { deleteWorkoutWithReversal } from '@/lib/workoutDeletion';

interface Props {
  variant: 'group' | 'solo' | 'pair';
  activityType: 'walking' | 'running';
  workout: WorkoutHistoryEntry & { date: Date };
  currentUid: string | undefined;
  streakDays: number;
  onSave: () => void;
  onClose: () => void;
  /** XP earned this session; pill hidden when 0 or undefined */
  xpEarned?: number;
}

type TabId = 'overview' | 'stats' | 'segments' | 'map';

const TABS: { id: TabId; label: string }[] = [
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

export default function AerobicSummaryShell({
  variant,
  activityType,
  workout,
  currentUid,
  streakDays,
  onSave,
  onClose,
  xpEarned = 0,
}: Props) {
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

  const savedWorkoutId = useRunningPlayer((s) => s.savedWorkoutId);

  const { ctx: groupCtx, loading: groupLoading } = useGroupSummaryCtx(
    workout.groupId,
    workout.attendanceId,
    currentUid,
  );

  // Pair = group session with exactly 2 participants; detected once groupCtx loads
  const isPair = variant === 'group' && (groupCtx?.participantCount ?? 0) === 2;
  const effectiveVariant = isPair ? 'pair' : variant;

  const routeCoords = Array.isArray(workout.routePath)
    ? (workout.routePath as [number, number][]).filter(
        (c): c is [number, number] => Array.isArray(c) && c.length === 2,
      )
    : [];

  // Dev-only: inject a Yarkon Park loop so the map+line can be visually tested locally
  // without real GPS movement. Tree-shaken from production builds.
  const displayCoords: [number, number][] =
    process.env.NODE_ENV === 'development' && routeCoords.length < 2
      ? [
          [34.7906, 32.1019],
          [34.7920, 32.1031],
          [34.7938, 32.1045],
          [34.7955, 32.1038],
          [34.7963, 32.1022],
          [34.7950, 32.1010],
          [34.7930, 32.1000],
          [34.7908, 32.1008],
        ]
      : routeCoords;

  const dateLabel = formatDate(workout.date);
  const distanceKm = workout.distance ?? 0;

  // ── Shared sub-blocks ─────────────────────────────────────────────────────

  const distanceHero = (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: 6,
        marginBottom: 4,
        marginTop: effectiveVariant !== 'group' ? 8 : 0,
      }}
    >
      <span style={{ fontSize: 42, fontWeight: 500, color: '#0F6E56', lineHeight: 1 }}>
        {distanceKm > 0 ? distanceKm.toFixed(2) : '--'}
      </span>
      <span style={{ fontSize: 15, color: '#5b6664' }}>ק״מ</span>
      <span style={{ fontSize: 13, color: '#9aa3a1', marginRight: 'auto' }}>{dateLabel}</span>
    </div>
  );

  // Framed route map: always shows a map (route line when coords exist; location-centered
  // Israel map when coords are empty). displayCoords substitutes a mock route in dev mode.
  const frameMapBlock = (
    <div style={{ position: 'relative', borderRadius: 14, overflow: 'hidden', height: '100%' }}>
      <RunMapBlock routeCoords={displayCoords} />
      <button
        onClick={() => setExpandedMap(true)}
        aria-label="הגדל מפה"
        style={{
          position: 'absolute', top: 10, left: 10,
          background: 'rgba(255,255,255,0.9)', border: 'none', cursor: 'pointer',
          borderRadius: 20, padding: '4px 8px', fontSize: 14, lineHeight: 1,
          boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
        }}
      >
        ⛶
      </button>
    </div>
  );

  // ── Overview content ──────────────────────────────────────────────────────

  const overviewContent = (
    <div style={{ padding: '0 14px 80px' }}>

      {/* Hero: map for solo, avatars for group/pair */}
      {effectiveVariant === 'solo' && (
        <div style={{ height: 180, marginBottom: 10 }}>
          {frameMapBlock}
        </div>
      )}
      {(effectiveVariant === 'group' || effectiveVariant === 'pair') && (
        <div style={{ marginBottom: 12 }}>
          <AerobicHeroBlock
            variant={effectiveVariant}
            groupCtx={groupCtx}
            dateLabel={dateLabel}
          />
        </div>
      )}

      {distanceHero}

      {/* XP Pill — solo only */}
      {effectiveVariant === 'solo' && xpEarned > 0 && (
        <div
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            background: '#E1F5EE', borderRadius: 20, padding: '4px 12px',
            fontSize: 13, color: '#0F6E56', fontWeight: 500, marginBottom: 8,
          }}
        >
          ✦ +{xpEarned} XP
        </div>
      )}

      {/* Together block — group / pair (emotional anchor) */}
      {(effectiveVariant === 'group' || effectiveVariant === 'pair') && groupCtx && !groupLoading && (
        <div style={{ marginBottom: 10 }}>
          <TogetherBlock
            collectiveDistanceKm={groupCtx.collectiveDistanceKm}
            participantCount={groupCtx.participantCount}
          />
        </div>
      )}

      {/* Proximity line — pair only */}
      {effectiveVariant === 'pair' && groupCtx && (
        <div style={{ fontSize: 13, color: '#5b6664', marginBottom: 10, textAlign: 'center' }}>
          {`רצתם ${groupCtx.collectiveDistanceKm.toFixed(1)} ק״מ יחד 🏃`}
        </div>
      )}

      {/* Emotional layer */}
      <PersonalRecordTag />
      <MomentSentence />

      {/* Streak */}
      {streakDays > 1 && (
        <div style={{ marginBottom: 10 }}>
          <DopamineStreakBlock streakDays={streakDays} />
        </div>
      )}

      {/* Stat rings */}
      <AerobicStatRingsBlock
        activityType={activityType}
        pace={workout.pace ?? 0}
        duration={workout.duration ?? 0}
        calories={workout.calories ?? 0}
      />

      {/* Participants compact list — group only (3+) */}
      {effectiveVariant === 'group' && groupCtx && groupCtx.participants.length > 0 && (
        <div
          style={{
            marginTop: 14,
            background: '#f3f5f4',
            borderRadius: 12,
            padding: '8px 12px',
          }}
        >
          <div style={{ fontSize: 11, color: '#9aa3a1', marginBottom: 6 }}>משתתפים</div>
          <ParticipantsBlock
            participants={groupCtx.participants}
            currentUid={currentUid}
            compact
            onShowAll={() => setActiveTab('stats')}
          />
        </div>
      )}

      {/* Route Rating CTA — shown whenever there is a park or route to aggregate against */}
      {!!(workout.parkId || workout.routeId) && (
        <div
          style={{
            background: '#EFF8FF', borderRadius: 16,
            padding: '16px 14px', marginTop: 10, marginBottom: 10,
          }}
          dir="rtl"
        >
          {ratingSubmitted ? (
            <div style={{ textAlign: 'center', color: '#0F6E56', fontSize: 13, fontWeight: 600 }}>
              {`תודה על הדירוג! +${XP_REWARDS.review} XP`}
            </div>
          ) : (
            <>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#1b2220', marginBottom: 10 }}>
                דרגו את המסלול
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 4, marginBottom: 10 }}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    onClick={() => setRouteQuality(star)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}
                  >
                    <svg
                      width="28" height="28" viewBox="0 0 24 24"
                      fill={star <= routeQuality ? '#E0A33E' : 'none'}
                      stroke={star <= routeQuality ? '#E0A33E' : '#d1d5db'}
                      strokeWidth="2"
                    >
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                  </button>
                ))}
              </div>
              {routeQuality > 0 && (
                <button
                  onClick={async () => {
                    if (!currentUid) return;
                    try {
                      const loc = routeCoords.length > 0
                        ? { lat: routeCoords[0][0], lng: routeCoords[0][1] }
                        : { lat: 0, lng: 0 };
                      await createContribution({
                        userId: currentUid,
                        type: 'review',
                        status: 'pending',
                        location: loc,
                        routeQuality,
                      });
                      // Write cumulative aggregate to the entity doc so the recommendation
                      // engine can rank by average quality (ratingSum / ratingCount).
                      // official/generated routes → official_routes/{routeId}
                      // free runs in a park       → parks/{parkId}
                      const { routeId, parkId } = workout;
                      const [collection, entityId] = routeId
                        ? ['official_routes', routeId]
                        : parkId
                          ? ['parks', parkId]
                          : [null, null];
                      if (collection && entityId) {
                        try {
                          const { doc, updateDoc, increment } = await import('firebase/firestore');
                          const { db } = await import('@/lib/firebase');
                          await updateDoc(doc(db, collection, entityId), {
                            ratingSum: increment(routeQuality),
                            ratingCount: increment(1),
                          });
                        } catch (ratingErr) {
                          // Non-fatal — contribution already saved
                          console.warn('[AerobicSummaryShell] Rating aggregate write failed:', ratingErr);
                        }
                      }
                      setRatingSubmitted(true);
                    } catch (err) {
                      console.error('[AerobicSummaryShell] Rating failed:', err);
                    }
                  }}
                  style={{
                    width: '100%', padding: '10px 0', borderRadius: 12,
                    background: '#1D9E75', color: '#fff', fontSize: 13,
                    fontWeight: 600, border: 'none', cursor: 'pointer',
                  }}
                >
                  שלח דירוג ⭐
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* Share / Save */}
      <AerobicShareBlock
        distanceKm={distanceKm}
        groupCtx={groupCtx}
        onSave={onSave}
        onClose={onClose}
        wasSaved={savedWorkoutId !== null}
      />

      {/* Delete workout — only shown when a workout was actually saved this session */}
      {savedWorkoutId && (
        WORKOUT_DELETE_EXPANDED_ENABLED ? (
          // ── Flag ON: shared DeleteWorkoutConfirmModal + deleteWorkoutWithReversal ──
          <div style={{ textAlign: 'center', paddingBottom: 12 }}>
            <button
              onClick={() => setExpandedDeleteModalOpen(true)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 13, color: '#9aa3a1', textDecoration: 'underline', padding: '4px 8px',
              }}
            >
              בטל / מחק אימון
            </button>
          </div>
        ) : (
          // ── Flag OFF: today's exact existing inline confirm + deleteLastWorkout() ──
          !deleteConfirm ? (
            <div style={{ textAlign: 'center', paddingBottom: 12 }}>
              <button
                onClick={() => setDeleteConfirm(true)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 13, color: '#9aa3a1', textDecoration: 'underline', padding: '4px 8px',
                }}
              >
                בטל / מחק אימון
              </button>
            </div>
          ) : (
            <div
              style={{
                background: '#FEF2F2', borderRadius: 14, padding: '14px 16px',
                marginBottom: 12, textAlign: 'center',
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 600, color: '#B91C1C', marginBottom: 10 }}>
                למחוק את האימון?
              </div>
              <div style={{ fontSize: 12, color: '#5b6664', marginBottom: 14 }}>
                האימון יימחק, ה-XP והרצף יוחזרו לאחור.
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setDeleteConfirm(false)}
                  style={{
                    flex: 1, padding: '10px 0', borderRadius: 12, fontSize: 13,
                    fontWeight: 600, cursor: 'pointer', border: 'none',
                    background: '#fff', color: '#5b6664',
                    boxShadow: '0 0 0 0.5px #e8ebea',
                  }}
                >
                  בטל
                </button>
                <button
                  disabled={deleting}
                  onClick={async () => {
                    setDeleting(true);
                    try {
                      await useRunningPlayer.getState().deleteLastWorkout();
                    } finally {
                      setDeleting(false);
                      onClose();
                    }
                  }}
                  style={{
                    flex: 1, padding: '10px 0', borderRadius: 12, fontSize: 13,
                    fontWeight: 600, cursor: deleting ? 'wait' : 'pointer', border: 'none',
                    background: '#B91C1C', color: '#fff', opacity: deleting ? 0.7 : 1,
                  }}
                >
                  {deleting ? 'מוחק...' : 'מחק אימון'}
                </button>
              </div>
            </div>
          )
        )
      )}

      {/* WORKOUT_DELETE_EXPANDED_ENABLED-only: shared confirm modal, mounted regardless
          of tab so it can be triggered from the overview tab's trigger above. */}
      {WORKOUT_DELETE_EXPANDED_ENABLED && (
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
    <div style={{ padding: '12px 14px 80px' }}>
      {workout.laps && workout.laps.length > 0 ? (
        <>
          <LapPaceChart laps={workout.laps} />
          <div style={{ marginTop: 12 }}>
            <RunLapsList laps={workout.laps} />
          </div>
        </>
      ) : (
        <div style={{ textAlign: 'center', color: '#9aa3a1', fontSize: 14, padding: '32px 0' }}>
          אין הקפות מוגדרות לאימון זה
        </div>
      )}
    </div>
  );

  // ── Map tab ───────────────────────────────────────────────────────────────

  const mapContent = (
    <div style={{ margin: '12px 14px', paddingBottom: 80 }}>
      <div style={{ height: 360 }}>
        {frameMapBlock}
      </div>
    </div>
  );

  // ── Stats tab ─────────────────────────────────────────────────────────────

  const statsContent = (
    <div style={{ padding: '12px 14px 80px' }}>
      {/* Full participants list — group only (3+) */}
      {effectiveVariant === 'group' && groupCtx && groupCtx.participants.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 12, color: '#9aa3a1', marginBottom: 8 }}>כל המשתתפים</div>
          <ParticipantsBlock
            participants={groupCtx.participants}
            currentUid={currentUid}
            compact={false}
          />
        </div>
      )}
      <div style={{ background: '#f3f5f4', borderRadius: 12, padding: '8px 12px' }}>
        <StatRow label="מרחק" value={`${distanceKm.toFixed(2)} ק״מ`} />
        <StatRow label="זמן" value={formatDuration(workout.duration ?? 0)} />
        <StatRow label="קצב ממוצע" value={formatPaceLocal(workout.pace ?? 0)} />
        <StatRow label="קלוריות" value={`${Math.round(workout.calories ?? 0)} קק״ל`} />
        {(workout.elevationGain ?? 0) > 0 && (
          <StatRow label="עלייה מצטברת" value={`${workout.elevationGain} מ׳`} />
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
    <div
      dir="rtl"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
        background: 'transparent',
        fontFamily: 'var(--font-simpler, system-ui, sans-serif)',
      }}
    >
      {/* Full-screen expanded map — z-[200], within z-index budget */}
      {expandedMap && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: '#000' }}>
          <RunMapBlock routeCoords={displayCoords} />
          <button
            onClick={() => setExpandedMap(false)}
            aria-label="סגור מפה"
            style={{
              position: 'absolute',
              top: 'calc(16px + env(safe-area-inset-top, 0px))',
              right: 16,
              background: 'rgba(255,255,255,0.9)',
              border: 'none',
              cursor: 'pointer',
              borderRadius: 20,
              padding: '6px 12px',
              fontSize: 16,
              fontWeight: 700,
              boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Transparent peek — live Mapbox map shows behind */}
      <div style={{ flex: '0 0 110px', background: 'transparent' }} />

      {/* White card */}
      <div
        style={{
          flex: 1,
          background: '#ffffff',
          borderRadius: '22px 22px 0 0',
          boxShadow: '0 -8px 24px rgba(0,0,0,0.18)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Drag handle */}
        <div
          style={{
            width: 38,
            height: 4,
            borderRadius: 999,
            background: '#d3d8d6',
            margin: '10px auto 6px',
            flexShrink: 0,
          }}
        />

        {/* Tab row */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-around',
            alignItems: 'center',
            padding: '0 4px',
            borderBottom: '0.5px solid #e8ebea',
            flexShrink: 0,
          }}
        >
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '0 4px 10px',
                fontSize: 12,
                fontWeight: activeTab === tab.id ? 500 : 400,
                color: activeTab === tab.id ? '#1D9E75' : '#9aa3a1',
                borderBottom: activeTab === tab.id ? '2px solid #1D9E75' : '2px solid transparent',
                lineHeight: '32px',
                transition: 'color 150ms',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
          {tabContent[activeTab]}
        </div>
      </div>
    </div>
  );
}

// ── Local helpers ─────────────────────────────────────────────────────────

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        padding: '8px 0',
        borderBottom: '0.5px solid #e8ebea',
        fontSize: 13,
      }}
    >
      <span style={{ color: '#5b6664' }}>{label}</span>
      <span style={{ color: '#1b2220', fontWeight: 500 }}>{value}</span>
    </div>
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
