'use client';

import React from 'react';
import { useT } from '@/hooks/useT';
import { community } from '@/messages/ns/community';
import { Check, Trophy, Users as UsersIcon } from 'lucide-react';
import { WizardV2, V2C } from './wizard-v2';
import type { UpdateForm, WizardForm } from './wizard-types';

// ── Step 2: Mode ─────────────────────────────────────────────────────────────

export function StepMode({
  form,
  updateForm,
}: {
  form: WizardForm;
  updateForm: UpdateForm;
}) {
  const t = useT(community);
  const options: { value: boolean; emoji: string; label: string; sub: string }[] = [
    {
      value: true,
      emoji: '🏃',
      label: t('createGroup.mode.together.label'),
      sub: t('createGroup.mode.together.sub'),
    },
    {
      value: false,
      emoji: '🏆',
      label: t('createGroup.mode.ownPace.label'),
      sub: t('createGroup.mode.ownPace.sub'),
    },
  ];

  const v2 = React.useContext(WizardV2);
  if (v2) {
    return (
      <div className="space-y-4 pt-4">
        <p className="text-[14px] font-bold leading-relaxed text-v2-ink-2">{t('createGroup.mode.question')}</p>
        <div className="flex flex-col gap-2.5">
          {options.map((opt) => {
            const on = form.hasMeetups === opt.value;
            const Icon = opt.value ? UsersIcon : Trophy;
            return (
              <button
                key={String(opt.value)}
                type="button"
                aria-pressed={on}
                onClick={() => updateForm('hasMeetups', opt.value)}
                className={`flex items-center gap-3 rounded-[20px] p-3.5 text-start ${V2C.press} ${on ? V2C.cardOn : V2C.cardOff}`}
              >
                <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-[14px] ${on ? 'bg-v2-cta text-v2-on-cta' : 'bg-v2-tint text-v2-deep'}`}>
                  <Icon size={20} strokeWidth={2.4} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block whitespace-nowrap text-[15px] font-black text-v2-ink">{opt.label}</span>
                  <span className="block text-[12.5px] font-bold leading-snug text-v2-muted">{opt.sub}</span>
                </span>
                {on && <Check size={18} strokeWidth={2.8} className="shrink-0 text-v2-deep" aria-hidden />}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 pt-4">
      <p className="text-xs text-gray-500 leading-relaxed">
        {t('createGroup.mode.question')}
      </p>
      <div className="flex flex-col gap-3">
        {options.map((opt) => (
          <button
            key={String(opt.value)}
            type="button"
            onClick={() => updateForm('hasMeetups', opt.value)}
            className={`flex items-start gap-4 p-4 rounded-2xl border-2 transition-all active:scale-[0.98] text-right ${
              form.hasMeetups === opt.value
                ? 'border-cyan-500 bg-cyan-50'
                : 'border-gray-100 bg-gray-50 hover:border-gray-200'
            }`}
          >
            <span className="text-3xl flex-shrink-0 mt-0.5">{opt.emoji}</span>
            <div className="flex flex-col gap-0.5">
              <span className={`text-sm font-black ${form.hasMeetups === opt.value ? 'text-cyan-700' : 'text-gray-800'}`}>
                {opt.label}
              </span>
              <span className="text-[11px] text-gray-500 leading-relaxed">{opt.sub}</span>
            </div>
            {form.hasMeetups === opt.value && (
              <Check className="w-4 h-4 text-cyan-500 flex-shrink-0 mt-1 mr-auto" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
