'use client';

/**
 * The drawer's levels block with the camera-scan upgrade (enable_equipment_scan_v1, ScanEquip
 * board). Flag off: the plain "תרגילים לפי רמה" strip, as before. Flag on:
 *   - a level in the machine's program → "תרגילים ברמה שלך": open up to it, "שלך" on the highest
 *     open one, higher levels locked;
 *   - no level yet → "מתאים להתחלה": easiest first, no marks, a row to the strength quiz;
 *   - a known park → "אימון בפארק הזה" (the park's own start, built from all its equipment).
 *     No single-machine workout: one machine is not enough for a workout (owner 31.10).
 */
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ClipboardList, Play } from 'lucide-react';
import { useT } from '@/hooks/useT';
import { map } from '@/messages/ns/map';
import { useEquipmentScanV1 } from '@/hooks/useEquipmentScanV1';
import { useProgressionStore } from '@/features/user/progression/store/useProgressionStore';
import { pickText } from '@/lib/i18n/core/i18n-core';
import EquipmentLevelsSection from './EquipmentLevelsSection';
import { mainProgramOf, personalLevelItems, quizDomainFor, type EquipmentLevelItem } from './equipment-levels';

export interface ParkWorkoutAction {
  parkName: string;
  onStart: () => void;
}

export interface EquipmentMyLevelsProps {
  equipmentName: string;
  movementPattern?: string | null;
  levels: readonly EquipmentLevelItem[];
  parkWorkout?: ParkWorkoutAction;
}

function useProgramName(programId: string | null, locale: string): string | null {
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    if (!programId) return;
    let alive = true;
    import('@/features/workout-engine/services/program-hierarchy.utils')
      .then(({ getCachedPrograms }) => getCachedPrograms())
      .then((list) => {
        const p = list.find((x) => x.id === programId);
        if (alive) setName(p?.name ? pickText(p.name as never, locale).trim() || null : null);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [programId, locale]);
  return programId ? name : null;
}

export default function EquipmentMyLevels({ equipmentName, movementPattern, levels, parkWorkout }: EquipmentMyLevelsProps) {
  const t = useT(map);
  const locale = (t as { locale?: string }).locale ?? 'he';
  const scanOn = useEquipmentScanV1();
  const programId = useMemo(() => mainProgramOf(levels), [levels]);
  const userLevel = useProgressionStore((s) => {
    const entry = programId ? s.domainProgress?.[programId] : undefined;
    return typeof entry?.level === 'number' ? entry.level : null;
  });
  const programName = useProgramName(scanOn ? programId : null, locale);
  const levelValue = (level: number) => t('equipment.v2.facts.levelValue', { level: String(level) });

  if (!scanOn) {
    return <EquipmentLevelsSection title={t('equipment.v2.levels.title')} items={levels} levelLabel={levelValue} />;
  }

  const personal = personalLevelItems(levels, userLevel);
  const workout = parkWorkout ? (
    <div className="mt-3">
      <button
        type="button"
        onClick={parkWorkout.onStart}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-gradient-to-br from-v2-accent to-[#0cf2e3] text-[15.5px] font-extrabold text-[#04222b] shadow-v2-cta active:scale-[0.98]"
      >
        <Play size={18} strokeWidth={2.6} aria-hidden />
        {t('equipment.v2.parkWorkout.cta')}
      </button>
      <p className="mt-1.5 text-center text-[12px] font-bold text-v2-muted">
        {t('equipment.v2.parkWorkout.hint', { park: parkWorkout.parkName, machine: equipmentName })}
      </p>
    </div>
  ) : null;

  if (personal) {
    const top = personal.find((i) => i.state === 'current')?.level ?? userLevel ?? 0;
    return (
      <>
        <EquipmentLevelsSection
          title={t('equipment.v2.levels.mine.title')}
          note={programName
            ? t('equipment.v2.levels.mine.note', { level: String(top), program: programName })
            : t('equipment.v2.levels.mine.noteNoProgram', { level: String(top) })}
          items={personal}
          levelLabel={(level, state) => (state === 'current' ? t('equipment.v2.levels.mine.yours', { level: String(level) }) : levelValue(level))}
        />
        {workout && <div className="-mt-3 mb-6">{workout}</div>}
      </>
    );
  }

  return (
    <>
      <EquipmentLevelsSection
        title={t('equipment.v2.levels.start.title')}
        note={t('equipment.v2.levels.start.note')}
        items={levels}
        levelLabel={levelValue}
        footer={<StrengthQuizRow domain={quizDomainFor(programId, movementPattern)} label={t('equipment.v2.levels.start.quiz')} />}
      />
      {workout && <div className="-mt-3 mb-6">{workout}</div>}
    </>
  );
}

/** The beginner state's row to the strength quiz (its own component: useRouter only mounts here). */
function StrengthQuizRow({ domain, label }: { domain: 'push' | 'pull' | 'legs' | 'core'; label: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => import('@/features/user/onboarding/services/mini-domain-assessment').then(({ startMiniDomainAssessment }) =>
        startMiniDomainAssessment(router, domain))}
      className="mt-3 flex w-full items-center gap-2 rounded-[14px] bg-v2-tint px-3 py-2.5 text-start text-[12.5px] font-extrabold text-v2-deep"
    >
      <ClipboardList size={16} strokeWidth={2.4} aria-hidden />
      <span className="flex-1">{label}</span>
      <ChevronLeft size={16} strokeWidth={2.4} aria-hidden className="ltr:rotate-180" />
    </button>
  );
}
