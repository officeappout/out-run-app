'use client';

import React from 'react';
import { useT } from '@/hooks/useT';
import { community } from '@/messages/ns/community';
import { CATEGORIES } from './wizard-constants';
import { FieldLabel } from './FieldLabel';
import { WizardV2, V2C } from './wizard-v2';
import type { UpdateForm, WizardForm } from './wizard-types';

// ── Step 1: Basics ────────────────────────────────────────────────────────────

export function StepBasics({
  form,
  updateForm,
}: {
  form: WizardForm;
  updateForm: UpdateForm;
}) {
  const v2 = React.useContext(WizardV2);
  const t = useT(community);
  return (
    <div className="space-y-5 pt-4">
      <div>
        <FieldLabel>{t('createGroup.basics.nameLabel')}</FieldLabel>
        <input
          type="text"
          value={form.name}
          onChange={(e) => updateForm('name', e.target.value)}
          placeholder={t('createGroup.basics.namePlaceholder', { groupType: form.groupType ?? '' })}
          maxLength={60}
          className={v2 ? V2C.input : 'w-full px-4 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-400'}
        />
        <p className={v2 ? V2C.counter : 'text-[10px] text-gray-400 mt-1 text-left'}>{form.name.length}/60</p>
      </div>

      <div>
        <FieldLabel>{form.hasMeetups === false ? t('createGroup.basics.categoryOptional') : t('createGroup.basics.category')}</FieldLabel>
        {v2 ? (
          <div className="grid grid-cols-3 gap-2">
            {CATEGORIES.map((cat) => {
              const on = form.category === cat.value;
              return (
                <button
                  key={cat.value}
                  type="button"
                  aria-pressed={on}
                  onClick={() => updateForm('category', cat.value)}
                  className={`h-11 truncate whitespace-nowrap rounded-full px-3 text-[14px] font-extrabold ${V2C.press} ${on ? V2C.chipOn : V2C.chipOff}`}
                >
                  {t(cat.labelKey)}
                </button>
              );
            })}
          </div>
        ) : (
        <div className="grid grid-cols-3 gap-2">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              type="button"
              onClick={() => updateForm('category', cat.value)}
              className={`flex flex-col items-center gap-1 py-3 rounded-xl border-2 transition-all ${
                form.category === cat.value
                  ? 'border-cyan-500 bg-cyan-50'
                  : 'border-gray-100 bg-gray-50 hover:border-gray-200'
              }`}
            >
              <span className="text-2xl">{cat.emoji}</span>
              <span className="text-[11px] font-bold text-gray-700">{t(cat.labelKey)}</span>
            </button>
          ))}
        </div>
        )}
      </div>

      <div>
        <FieldLabel>{t('createGroup.basics.descriptionLabel')}</FieldLabel>
        <textarea
          value={form.description}
          onChange={(e) => updateForm('description', e.target.value)}
          placeholder={t('createGroup.basics.descriptionPlaceholder')}
          rows={3}
          maxLength={300}
          className={v2 ? V2C.textarea : 'w-full px-4 py-3 rounded-xl border border-gray-200 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-400 resize-none leading-relaxed'}
        />
        <p className={v2 ? V2C.counter : 'text-[10px] text-gray-400 mt-1 text-left'}>{form.description.length}/300</p>
      </div>

    </div>
  );
}
