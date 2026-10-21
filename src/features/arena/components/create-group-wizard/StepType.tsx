'use client';

import React from 'react';
import { useT } from '@/hooks/useT';
import { community } from '@/messages/ns/community';
import { Users as UsersIcon } from 'lucide-react';
import type { CommunityGroupType } from '@/types/community.types';
import { DEFAULT_PRIVATE_TYPES, GROUP_TYPES, GROUP_TYPE_ICON } from './wizard-constants';
import { WizardV2 } from './wizard-v2';
import type { UpdateForm, WizardForm } from './wizard-types';

// ── Step 0: Type ─────────────────────────────────────────────────────────────

export function StepType({
  form,
  updateForm,
}: {
  form: WizardForm;
  updateForm: UpdateForm;
}) {
  const handleTypeChange = (value: CommunityGroupType) => {
    updateForm('groupType', value);
    // Always-private types (+ military, default-only — see DEFAULT_PRIVATE_TYPES's own comment) start isPublic=false
    updateForm('isPublic', DEFAULT_PRIVATE_TYPES.has(value) ? false : true);
  };
  const v2 = React.useContext(WizardV2);
  const t = useT(community);

  if (v2) {
    return (
      <div className="space-y-4 pt-4">
        <p className="text-[14px] font-bold leading-relaxed text-v2-ink-2">{t('createGroup.type.question')}</p>
        <div className="grid grid-cols-2 gap-2.5">
          {GROUP_TYPES.map((gt) => {
            const Icon = GROUP_TYPE_ICON[gt.value] ?? UsersIcon;
            const on = form.groupType === gt.value;
            return (
              <button
                key={gt.value}
                type="button"
                onClick={() => handleTypeChange(gt.value)}
                aria-pressed={on}
                className={`flex items-center gap-3 rounded-[20px] p-3 text-start transition-[transform,box-shadow] duration-150 ease-v2 active:scale-[0.98] ${
                  on ? 'bg-white shadow-v2-card ring-2 ring-v2-accent' : 'bg-white shadow-v2-ring'
                }`}
              >
                <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-[14px] ${on ? 'bg-v2-cta text-v2-on-cta' : 'bg-v2-tint text-v2-deep'}`}>
                  <Icon size={20} strokeWidth={2.4} aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block whitespace-nowrap text-[15px] font-black text-v2-ink">{t(gt.labelKey)}</span>
                  <span className="block text-[12px] font-bold leading-snug text-v2-muted">{t(gt.subKey)}</span>
                </span>
              </button>
            );
          })}
        </div>
        {DEFAULT_PRIVATE_TYPES.has(form.groupType) && (
          <p className="text-[12.5px] font-bold text-v2-deep">{t('createGroup.type.privateDefault')}</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4 pt-4">
      <p className="text-xs text-gray-500 leading-relaxed">{/* i18n-allow-hebrew: legacy v1 (enable_home_v2 on) */}בחר את סוג הקהילה שתרצה ליצור</p>
      <div className="grid grid-cols-2 gap-3">
        {GROUP_TYPES.map((gt) => (
          <button
            key={gt.value}
            type="button"
            onClick={() => handleTypeChange(gt.value)}
            className={`flex flex-col items-center gap-1.5 py-4 px-2 rounded-2xl border-2 transition-all active:scale-95 ${
              form.groupType === gt.value
                ? 'border-cyan-500 bg-cyan-50'
                : 'border-gray-100 bg-gray-50 hover:border-gray-200'
            }`}
          >
            <span className="text-2xl">{gt.emoji}</span>
            <span className="text-xs font-black text-gray-800 text-center leading-tight">{t(gt.labelKey)}</span>
            <span className="text-[9px] text-gray-400 text-center leading-tight">{t(gt.subKey)}</span>
          </button>
        ))}
      </div>
      {DEFAULT_PRIVATE_TYPES.has(form.groupType) && (
        <p className="text-[11px] text-cyan-600 font-semibold text-right flex items-center gap-1 justify-end">
          {/* i18n-allow-hebrew: legacy v1 (enable_home_v2 on) */}🔒 ברירת-מחדל פרטי — ניתן לשנות בשלב הפרטיות
        </p>
      )}
    </div>
  );
}
