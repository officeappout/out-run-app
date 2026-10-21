'use client';

import React from 'react';
import { useT } from '@/hooks/useT';
import { community } from '@/messages/ns/community';
import { Camera } from 'lucide-react';
import { CATEGORIES } from './wizard-constants';
import { FieldLabel } from './FieldLabel';
import { summaryLocationLabel } from './wizard-logic';
import { WizardV2, V2C } from './wizard-v2';
import type { WizardForm } from './wizard-types';

// ── Step 5: Finalize ──────────────────────────────────────────────────────────

export function StepFinalize({
  form,
  fileInputRef,
  onImagePick,
  submitError,
}: {
  form: WizardForm;
  fileInputRef: React.RefObject<HTMLInputElement>;
  onImagePick: (e: React.ChangeEvent<HTMLInputElement>) => void;
  submitError: string | null;
}) {
  const v2 = React.useContext(WizardV2);
  const t = useT(community);
  const category = CATEGORIES.find((c) => c.value === form.category);
  return (
    <div className="space-y-5 pt-4">
      <div>
        <FieldLabel>{t('createGroup.finalize.imageLabel')}</FieldLabel>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className={
            v2
              ? `flex h-44 w-full items-center justify-center overflow-hidden rounded-[20px] ${V2C.press} ${form.imagePreviewUrl ? 'shadow-v2-ring' : 'bg-v2-surface ring-1 ring-inset ring-v2-hairline'}`
              : `w-full h-44 rounded-2xl border-2 border-dashed overflow-hidden flex items-center justify-center transition-all active:scale-[0.98] ${
            form.imagePreviewUrl ? 'border-transparent' : 'border-gray-200 hover:border-cyan-300 bg-gray-50'
          }`}
        >
          {form.imagePreviewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={form.imagePreviewUrl}
              alt={t('createGroup.finalize.imageAlt')}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className={`flex flex-col items-center gap-2 ${v2 ? 'text-v2-deep' : 'text-gray-400'}`}>
              <Camera className="w-8 h-8" />
              <span className={v2 ? 'whitespace-nowrap text-[13px] font-extrabold' : 'text-xs font-bold'}>{t('createGroup.finalize.imageCta')}</span>
            </div>
          )}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onImagePick}
        />
      </div>

      {/* Summary */}
      <div className={v2 ? 'space-y-2.5 rounded-[20px] bg-white p-4 shadow-v2-ring' : 'bg-gray-50 rounded-2xl p-4 space-y-2 border border-gray-100'}>
        <p className={v2 ? 'mb-3 text-[15px] font-black text-v2-ink' : 'text-xs font-bold text-gray-500 mb-3'}>{t('createGroup.finalize.summaryTitle')}</p>
        <SummaryRow label={t('createGroup.finalize.summary.name')} value={form.name || '—'} />
        <SummaryRow label={t('createGroup.finalize.summary.category')} value={category ? t(category.labelKey) : '—'} />
        <SummaryRow
          label={t('createGroup.finalize.summary.location')}
          value={summaryLocationLabel(t, form.address)}
        />
        <SummaryRow
          label={t('createGroup.finalize.summary.meetings')}
          value={
            form.scheduleSlots.length
              ? t('createGroup.finalize.summary.meetingsCount', { count: String(form.scheduleSlots.length) })
              : t('createGroup.finalize.summary.meetingsNone')
          }
        />
        <SummaryRow
          label={t('createGroup.finalize.summary.privacy')}
          value={form.isPublic ? t('createGroup.finalize.summary.public') : t('createGroup.finalize.summary.private')}
        />
      </div>

      {submitError && (
        <div className={v2 ? 'rounded-[16px] bg-[#fef2f2] px-4 py-3 text-center text-[14px] font-bold text-[#b91c1c] ring-1 ring-inset ring-[#fecaca]' : 'px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm font-semibold text-center'}>
          {submitError}
        </div>
      )}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  const v2 = React.useContext(WizardV2);
  if (v2) {
    return (
      <div className="flex items-center justify-between gap-3 text-[14px]">
        <span className="shrink-0 whitespace-nowrap font-bold text-v2-muted">{label}</span>
        <span className="min-w-0 truncate font-extrabold text-v2-ink">{value}</span>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-gray-500 font-semibold">{label}</span>
      <span className="text-gray-800 font-bold">{value}</span>
    </div>
  );
}
