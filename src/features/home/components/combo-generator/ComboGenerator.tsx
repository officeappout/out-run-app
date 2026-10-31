'use client';

/**
 * Combo generator (vision stage 2, enable_combo_generator_v1, generator board 1): the category row on
 * top of the custom builder and the engine's 1-3 recommended cards. Strength keeps the builder's
 * own form; the other categories show the cards. A tap hands the picked request to the builder
 * (comboLaunchOf decides what opens). Home v2 skin only.
 */
import React, { useMemo } from 'react';
import { ArrowLeft, MapPin } from 'lucide-react';
import { useUserStore } from '@/features/user';
import { useT } from '@/hooks/useT';
import { home, type HomeKey } from '@/messages/ns/home';
import { buildUserProgramLevels } from '@/features/workout-engine/services/level-resolution.utils';
import { resolveToSlug } from '@/features/workout-engine/services/program-hierarchy.utils';
import { recommendCombos, type ComboContext, type ComboOption } from '@/features/workout-engine/logic/combo/combo-recommend';
import { ActivityGlyph } from '@/features/parks/core/components/hybrid/activity-icons';
import { V2_PILL_OFF, V2_PILL_ON } from './builder-pill-styles';
import {
  COMBO_CATEGORIES, comboCardModel, comboIntentOf, comboLevelsOf,
  type ComboCardPart, type ComboCategory,
} from './combo-generator-model';

export function ComboCategoryRow({ value, onChange }: { value: ComboCategory; onChange: (c: ComboCategory) => void }) {
  const t = useT(home);
  return (
    <div role="group" aria-label={t('comboGen.categories.aria')} className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
      {COMBO_CATEGORIES.map((c) => (
        <button
          key={c}
          type="button"
          aria-pressed={value === c}
          onClick={() => onChange(c)}
          className={`h-10 flex-shrink-0 rounded-full border px-4 text-[14px] font-extrabold transition-[transform,background-color,box-shadow] duration-150 ease-v2 active:scale-[0.97] ${value === c ? V2_PILL_ON : V2_PILL_OFF}`}
        >
          {t(`comboGen.cat.${c}` as HomeKey)}
        </button>
      ))}
    </div>
  );
}

function partLabelKey(p: ComboCardPart): HomeKey {
  return (p.withRun ? 'comboGen.part.amrapRun' : `comboGen.part.${p.kind}`) as HomeKey;
}

function PartGlyph({ part, className }: { part: ComboCardPart; className: string }) {
  if (part.kind === 'walk') return <ActivityGlyph kind="aerobic" subtype="walking" className={className} />;
  if (part.kind === 'run' || part.withRun) return <ActivityGlyph kind="aerobic" subtype="running" className={className} />;
  return <ActivityGlyph kind="strength" subtype={part.kind === 'core' ? 'core' : undefined} className={className} />;
}

function ComboCard({ option, main, busy, onPick }: { option: ComboOption; main: boolean; busy: boolean; onPick: (o: ComboOption) => void }) {
  const t = useT(home);
  const card = comboCardModel(option);
  const title = card.parts.map((p) => t(partLabelKey(p))).join(' + ');
  return (
    <button
      type="button"
      onClick={() => onPick(option)}
      disabled={busy}
      className={`w-full rounded-[20px] disabled:opacity-50 text-start transition-transform duration-150 ease-v2 active:scale-[0.99] ${
        main ? 'bg-white p-4 shadow-v2-card' : 'bg-white/70 p-3 shadow-v2-ring'
      }`}
    >
      <div className="flex items-center gap-2">
        <span className={`min-w-0 flex-1 font-black leading-tight text-v2-ink ${main ? 'text-[17px]' : 'text-[15px]'}`}>{title}</span>
        <span className="flex-shrink-0 rounded-full bg-v2-tint px-2.5 py-1 text-[12.5px] font-extrabold text-v2-deep">
          {t('comboGen.minutes', { minutes: String(card.totalMin) })}
        </span>
        <ArrowLeft size={16} className="flex-shrink-0 text-v2-muted ltr:rotate-180" aria-hidden />
      </div>
      {main && (
        <div className="mt-3 flex flex-wrap gap-2">
          {card.parts.map((p, i) => (
            <span key={i} className="flex items-center gap-1.5 rounded-[12px] bg-v2-surface px-2.5 py-1.5 text-[13px] font-extrabold text-v2-ink-2">
              <PartGlyph part={p} className="h-4 w-4 text-v2-deep" />
              {t(partLabelKey(p))}
              <span className="font-bold text-v2-muted">{t('comboGen.minutes', { minutes: String(p.minutes) })}</span>
            </span>
          ))}
        </div>
      )}
      <p className={`font-bold text-v2-ink-2 ${main ? 'mt-2.5 text-[13px]' : 'mt-1 text-[12.5px]'}`}>
        {t(`comboGen.reason.${card.reason}` as HomeKey)}
      </p>
      <p className="mt-1 flex items-center gap-1 text-[12px] font-bold text-v2-muted">
        <MapPin size={12} aria-hidden />
        {t(card.place === 'home' ? 'comboGen.place.home' : 'comboGen.place.park')}
      </p>
    </button>
  );
}

export interface ComboGeneratorPanelProps {
  category: ComboCategory;
  minutes: number;
  stars: number;
  location: string;
  today?: ComboContext['today'];
  /** The builder is generating the picked strength card. */
  busy?: boolean;
  onPick: (o: ComboOption) => void;
}

export function ComboGeneratorPanel({ category, minutes, stars, location, today, busy = false, onPick }: ComboGeneratorPanelProps) {
  const t = useT(home);
  const profile = useUserStore((s) => s.profile);
  const options = useMemo(() => {
    const levels = profile
      ? comboLevelsOf(buildUserProgramLevels(profile, new Set(), '[ComboGenerator]').levels, resolveToSlug)
      : {};
    return recommendCombos(comboIntentOf({ category, minutes, stars, location }), { levels, today });
  }, [profile, category, minutes, stars, location, today]);

  return (
    <div>
      <h2 className="text-[17px] font-black text-v2-ink">{t('comboGen.list.title')}</h2>
      <p className="mb-3 mt-0.5 text-[12.5px] font-bold text-v2-muted">{t('comboGen.list.sub')}</p>
      <div className="space-y-2.5">
        {options.map((o, i) => (
          <React.Fragment key={`${o.reason}-${i}`}>
            {i === 1 && <p className="text-center text-[12px] font-extrabold text-v2-muted">{t('comboGen.or')}</p>}
            <ComboCard option={o} main={i === 0} busy={busy} onPick={onPick} />
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
