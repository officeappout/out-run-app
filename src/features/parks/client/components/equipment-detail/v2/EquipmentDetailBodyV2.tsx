'use client';

/**
 * The equipment drawer's body in the exercise page's design
 * (enable_place_workouts_v1; MasterExerciseView v2): full-bleed media hero,
 * a 24px title, the key-fact tiles, programs as pills, the machine's
 * exercises by level (only when it has levels / variations), the muscles
 * strip, numbered cues, description, tips, and — outside a park — the brand
 * pills. Every section is omitted when its data is missing. Render-only:
 * EquipmentDetailDrawer loads the doc and resolves media, cues and tips.
 */

import type { ReactNode } from 'react';
import { BarChart3, Dumbbell } from 'lucide-react';
import type { EquipmentBrand, GymEquipment } from '@/features/content/equipment/gym/core/gym-equipment.types';
import { MUSCLE_ICON_PATHS, MUSCLE_FALLBACK_ICON } from '@/lib/muscle-icons.const';
import { getMuscleGroupLabel } from '@/features/workout-engine/shared/utils/gear-mapping.utils';
import {
  DETAIL_SECTION_FONT as FONT, DETAIL_V2_H3 as H3, V2FactTile, V2MuscleStrip, V2Step,
} from '@/features/content/exercises/client/components/detail-v2/DetailV2Parts';
import { useT } from '@/hooks/useT';
import { map } from '@/messages/ns/map';
import EquipmentHeroV2 from './EquipmentHeroV2';
import EquipmentMyLevels, { type ParkWorkoutAction } from './EquipmentMyLevels';
import { equipmentLevelSpan, equipmentProgramChips } from './equipment-facts';
import { useEquipmentLevels } from './useEquipmentLevels';

export interface EquipmentDetailBodyV2Props {
  equipment: GymEquipment;
  name: string;
  activeBrand: EquipmentBrand | null;
  activeBrandIndex: number;
  onBrandChange: (index: number) => void;
  pinnedToPark: boolean;
  videoUrl: string | undefined;
  imageUrl: string | undefined;
  cues: readonly string[];
  cuesSource: string;
  tips: readonly string[];
  programs: readonly { id: string; name?: unknown }[];
  /** Camera scan boards: "אימון בפארק הזה" when the park is known. */
  parkWorkout?: ParkWorkoutAction;
}

const PILL = 'flex h-[30px] flex-shrink-0 items-center gap-2 whitespace-nowrap rounded-full bg-white px-3 text-[12.5px] font-bold text-v2-ink-2 shadow-v2-ring';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-6">
      <h3 className={`${H3} mb-3`} style={FONT}>{title}</h3>
      {children}
    </section>
  );
}

export default function EquipmentDetailBodyV2({
  equipment, name, activeBrand, activeBrandIndex, onBrandChange, pinnedToPark, videoUrl, imageUrl, cues, cuesSource, tips, programs, parkWorkout,
}: EquipmentDetailBodyV2Props) {
  const t = useT(map);
  const locale = (t as { locale?: string }).locale ?? 'he';
  const levels = useEquipmentLevels(equipment.id, locale, true);
  const primary = equipment.primaryMuscle ?? equipment.muscleGroups?.[0];
  const secondary = equipment.secondaryMuscles ?? equipment.muscleGroups?.slice(1) ?? [];
  const span = equipmentLevelSpan(equipment);
  const chips = equipmentProgramChips(equipment, programs, locale);
  const showBrands = !pinnedToPark && (equipment.brands?.length ?? 0) > 1;

  const facts: { key: string; icon: ReactNode; label: string; value: string }[] = [];
  if (primary) {
    facts.push({
      key: 'muscle',
      // eslint-disable-next-line @next/next/no-img-element
      icon: <img src={MUSCLE_ICON_PATHS[primary] ?? MUSCLE_FALLBACK_ICON} alt="" className="h-5 w-5 object-contain" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />,
      label: t('equipment.v2.facts.muscle'),
      value: getMuscleGroupLabel(primary),
    });
  }
  if (span) {
    facts.push({
      key: 'level',
      icon: <BarChart3 size={16} strokeWidth={2.5} />,
      label: t('equipment.v2.facts.level'),
      value: span.from === span.to
        ? t('equipment.v2.facts.levelValue', { level: String(span.from) })
        : t('equipment.v2.facts.levelRange', { from: String(span.from), to: String(span.to) }),
    });
  }
  if (equipment.isFunctional) {
    facts.push({ key: 'type', icon: <Dumbbell size={16} strokeWidth={2.5} />, label: t('equipment.v2.facts.type'), value: t('equipment.functional') });
  }

  return (
    <div className="bg-v2-surface" data-equipment-v2>
      <EquipmentHeroV2 name={name} videoUrl={videoUrl} imageUrl={imageUrl} videoTitle={t('equipment.videoTitle', { name })} />
      <div className="px-4 pb-6 pt-5">
        <div className="mb-4">
          <h2 className="text-start text-[24px] font-black leading-tight !tracking-[-0.02em] text-v2-ink" style={FONT}>{name}</h2>
          {!pinnedToPark && activeBrand?.brandName && (
            <p className="mt-1 text-[13px] font-bold text-v2-muted" style={FONT}>
              {t.rich('equipment.brandLine', { name: activeBrand.brandName, brand: (c: ReactNode) => <span className="font-extrabold text-v2-ink-2">{c}</span> })}
            </p>
          )}
        </div>

        {facts.length > 0 && (
          <div className="mb-6 grid gap-2" style={{ gridTemplateColumns: `repeat(${facts.length}, minmax(0, 1fr))` }}>
            {facts.map((f) => <V2FactTile key={f.key} icon={f.icon} label={f.label} value={f.value} />)}
          </div>
        )}

        {chips.length > 0 && (
          <Section title={t('equipment.v2.programs')}>
            <div className="-mx-4 flex flex-row gap-2 overflow-x-auto px-4 pb-1 no-scrollbar">
              {chips.map((c) => (
                <span key={c.programId} className={PILL} style={FONT}>
                  {c.level != null ? t('equipment.v2.programChip', { label: c.label, level: String(c.level) }) : c.label}
                </span>
              ))}
            </div>
          </Section>
        )}

        <EquipmentMyLevels equipmentName={name} movementPattern={equipment.movementPattern} levels={levels} parkWorkout={parkWorkout} />

        {(primary || secondary.length > 0) && (
          <Section title={t('equipment.v2.muscles')}>
            <V2MuscleStrip
              primary={primary}
              secondary={secondary}
              primaryLabel={t('equipment.v2.musclePrimary')}
              secondaryLabel={t('equipment.v2.muscleSecondary')}
            />
          </Section>
        )}

        {cues.length > 0 && (
          <Section title={t('equipment.section.cues')}>
            <ol className="space-y-3 rounded-v2-card bg-white p-4 shadow-v2-card">
              {cues.map((cue, i) => <V2Step key={`${cue}_${i}`} n={i + 1}>{cue}</V2Step>)}
            </ol>
          </Section>
        )}

        {cuesSource === 'doc' && equipment.description && (
          <Section title={t('equipment.section.description')}>
            <p className="whitespace-pre-line text-[14.5px] leading-relaxed text-v2-ink-2" style={FONT}>{equipment.description}</p>
          </Section>
        )}

        {tips.length > 0 && (
          <Section title={t('equipment.section.tips')}>
            <ul className="space-y-2.5">
              {tips.map((tip, i) => (
                <li key={`${tip}_${i}`} className="flex items-start gap-2.5">
                  <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-v2-accent" />
                  <span className="flex-1 text-[14.5px] leading-relaxed text-v2-ink-2" style={FONT}>{tip}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {showBrands && (
          <Section title={t('equipment.section.brands')}>
            <div className="flex flex-wrap gap-2">
              {equipment.brands.map((b, i) => (
                <button
                  key={`${b.brandName}_${i}`}
                  type="button"
                  onClick={() => onBrandChange(i)}
                  aria-pressed={i === activeBrandIndex}
                  className={i === activeBrandIndex ? `${PILL} !bg-v2-tint !text-v2-deep ring-1 ring-inset ring-v2-accent/40` : PILL}
                >
                  {b.brandName || t('equipment.brandFallback', { n: String(i + 1) })}
                </button>
              ))}
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}
