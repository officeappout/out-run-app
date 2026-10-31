'use client';

/**
 * Combo generator forms (enable_combo_generator_v1, generator boards 1 aerobic and 2): the aerobic
 * tab (activity tiles; the goal and route stay in the map's free run drawer) and the hybrid tab's
 * two parts (aerobic + strength, each preset from the engine and marked "recommended" until
 * touched). Place + equipment and the CTA stay in the builder. No format and no order choice.
 */
import React from 'react';
import { useT } from '@/hooks/useT';
import { home, type HomeKey } from '@/messages/ns/home';
import { ActivityGlyph } from '@/features/parks/core/components/hybrid/activity-icons';
import { V2_PILL_OFF, V2_PILL_ON } from './builder-pill-styles';
import {
  COMBO_AEROBIC_KINDS, HYBRID_AEROBIC_MIN_OPTIONS, HYBRID_STRENGTH_MIN_OPTIONS,
  type ComboAerobicKind, type HybridFormState,
} from './combo-generator-model';

const TILE_ON = 'border-transparent bg-white shadow-v2-card ring-2 ring-v2-accent';
const TILE_OFF = 'border-transparent bg-white/70 shadow-v2-ring';

function AerobicTiles({ value, onChange }: { value: ComboAerobicKind; onChange: (k: ComboAerobicKind) => void }) {
  const t = useT(home);
  return (
    <div className="grid grid-cols-3 gap-2.5">
      {COMBO_AEROBIC_KINDS.map((k) => (
        <button
          key={k}
          type="button"
          aria-pressed={value === k}
          onClick={() => onChange(k)}
          className={`flex h-[72px] flex-col items-center justify-center gap-1.5 rounded-[18px] border transition-transform duration-150 ease-v2 active:scale-[0.97] ${value === k ? TILE_ON : TILE_OFF}`}
        >
          <ActivityGlyph kind="aerobic" subtype={k} className="h-6 w-6 text-v2-deep" />
          <span className="text-[14px] font-extrabold text-v2-ink">{t(`comboGen.aerobic.kind.${k}` as HomeKey)}</span>
        </button>
      ))}
    </div>
  );
}

function Pills<T extends number>({ options, value, onChange, label }: { options: readonly T[]; value: T; onChange: (v: T) => void; label: (v: T) => string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          aria-pressed={value === o}
          onClick={() => onChange(o)}
          className={`h-10 rounded-full border px-4 text-[14px] font-extrabold transition-[transform,background-color,box-shadow] duration-150 ease-v2 active:scale-[0.97] ${value === o ? V2_PILL_ON : V2_PILL_OFF}`}
        >
          {label(o)}
        </button>
      ))}
    </div>
  );
}

function PartCard({ title, minutes, recommended, children }: { title: string; minutes: number; recommended: boolean; children: React.ReactNode }) {
  const t = useT(home);
  return (
    <section className="space-y-3 rounded-[20px] bg-white/70 p-3.5 shadow-v2-ring">
      <div className="flex items-center gap-2">
        <h2 className="flex-1 text-[17px] font-black text-v2-ink">{title}</h2>
        {recommended && (
          <span className="rounded-full bg-v2-tint px-2.5 py-1 text-[12px] font-extrabold text-v2-deep">{t('comboGen.hybrid.recommended')}</span>
        )}
        <span className="text-[13px] font-extrabold text-v2-ink-2">{t('comboGen.minutes', { minutes: String(minutes) })}</span>
      </div>
      {children}
    </section>
  );
}

const AEROBIC_MIN_OPTIONS = [15, 30, 45, 60] as const;

export function ComboAerobicForm({ kind, onKind, minutes, onMinutes }: {
  kind: ComboAerobicKind;
  onKind: (k: ComboAerobicKind) => void;
  /** Pilot AH26: the length the recommended options below are built for. */
  minutes?: number;
  onMinutes?: (m: number) => void;
}) {
  const t = useT(home);
  return (
    <section className="space-y-3">
      <h2 className="text-[17px] font-black text-v2-ink">{t('comboGen.aerobic.section')}</h2>
      <AerobicTiles value={kind} onChange={onKind} />
      {minutes != null && onMinutes && (
        <Pills
          options={AEROBIC_MIN_OPTIONS}
          value={minutes as (typeof AEROBIC_MIN_OPTIONS)[number]}
          onChange={onMinutes}
          label={(m) => t('comboGen.minutes', { minutes: String(m) })}
        />
      )}
      <p className="text-[12.5px] font-bold text-v2-muted">{t('comboGen.aerobic.goalNote')}</p>
    </section>
  );
}

export function ComboHybridParts({ form, touched, onChange }: {
  form: HybridFormState;
  /** Which part the user changed (a touched part drops its "recommended" chip). */
  touched: { aerobic: boolean; strength: boolean };
  onChange: (patch: Partial<HybridFormState>, part: 'aerobic' | 'strength') => void;
}) {
  const t = useT(home);
  const minLabel = (m: number) => t('comboGen.minutes', { minutes: String(m) });
  return (
    <div className="space-y-3">
      <PartCard title={t('comboGen.hybrid.aerobicPart')} minutes={form.aerobicMin} recommended={!touched.aerobic}>
        <AerobicTiles value={form.aerobicKind} onChange={(aerobicKind) => onChange({ aerobicKind }, 'aerobic')} />
        <Pills options={HYBRID_AEROBIC_MIN_OPTIONS} value={form.aerobicMin as (typeof HYBRID_AEROBIC_MIN_OPTIONS)[number]} onChange={(aerobicMin) => onChange({ aerobicMin }, 'aerobic')} label={minLabel} />
      </PartCard>
      <PartCard title={t('comboGen.hybrid.strengthPart')} minutes={form.strengthMin} recommended={!touched.strength}>
        <Pills options={HYBRID_STRENGTH_MIN_OPTIONS} value={form.strengthMin as (typeof HYBRID_STRENGTH_MIN_OPTIONS)[number]} onChange={(strengthMin) => onChange({ strengthMin }, 'strength')} label={minLabel} />
        <Pills options={[1, 2, 3] as const} value={form.stars} onChange={(stars) => onChange({ stars }, 'strength')} label={(s) => t(`builder.intensity.${s}` as HomeKey)} />
      </PartCard>
    </div>
  );
}
