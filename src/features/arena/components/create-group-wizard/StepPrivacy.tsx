'use client';

import React from 'react';
import { Globe, Lock } from 'lucide-react';
import { DEFAULT_PRIVATE_TYPES } from './wizard-constants';
import { FieldLabel } from './FieldLabel';
import { WizardV2, V2C } from './wizard-v2';
import type { UpdateForm, WizardForm } from './wizard-types';

// ── Step 4: Privacy & Rules ───────────────────────────────────────────────────

export function StepPrivacy({
  form,
  updateForm,
}: {
  form: WizardForm;
  updateForm: UpdateForm;
}) {
  // DEFAULT_PRIVATE_TYPES (not ALWAYS_PRIVATE_TYPES) — code review, 07.09.2026:
  // this badge stayed silent for military when editing an existing military
  // group here, even though it did start isPublic=false. Cosmetic-only —
  // the toggle's actual value was always correct — but worth matching the
  // same set the type-picker step already uses for consistency.
  const isPrivateByDefault = DEFAULT_PRIVATE_TYPES.has(form.groupType);
  const v2 = React.useContext(WizardV2);

  return (
    <div className="space-y-5 pt-4">
      {/* Public / Private toggle — shown for ALL types; private-by-default types start private */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <FieldLabel>פרטיות</FieldLabel>
          {isPrivateByDefault && (
            <span className={v2 ? 'mb-2 inline-flex h-6 items-center whitespace-nowrap rounded-full bg-v2-tint px-2 text-[11.5px] font-extrabold text-v2-deep' : 'text-[10px] text-cyan-600 font-semibold bg-cyan-50 px-1.5 py-0.5 rounded-md'}>
              ברירת-מחדל פרטי
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[
            { value: true,  icon: <Globe className="w-5 h-5" />, label: 'ציבורי', sub: 'כולם יכולים להצטרף' },
            { value: false, icon: <Lock className="w-5 h-5" />,  label: 'פרטי',   sub: 'הצטרפות בקוד הזמנה' },
          ].map((opt) => (
            <button
              key={String(opt.value)}
              type="button"
              onClick={() => {
                updateForm('isPublic', opt.value);
                if (opt.value) updateForm('allowJoinRequests', false);
              }}
              aria-pressed={v2 ? form.isPublic === opt.value : undefined}
              className={
                v2
                  ? `flex flex-col items-start gap-2 rounded-[20px] p-3.5 text-start ${V2C.press} ${form.isPublic === opt.value ? V2C.cardOn : V2C.cardOff}`
                  : `flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all ${
                form.isPublic === opt.value
                  ? 'border-cyan-500 bg-cyan-50'
                  : 'border-gray-100 bg-gray-50'
              }`}
            >
              <span
                className={
                  v2
                    ? `grid h-10 w-10 place-items-center rounded-[14px] ${form.isPublic === opt.value ? 'bg-v2-cta text-v2-on-cta' : 'bg-v2-tint text-v2-deep'}`
                    : form.isPublic === opt.value ? 'text-cyan-500' : 'text-gray-400'
                }
              >
                {opt.icon}
              </span>
              <span className={v2 ? 'whitespace-nowrap text-[15px] font-black text-v2-ink' : 'text-sm font-black text-gray-800'}>{opt.label}</span>
              <span className={v2 ? 'text-[12px] font-bold leading-snug text-v2-muted' : 'text-[10px] text-gray-500 text-center leading-tight'}>{opt.sub}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Join requests — available when group is private */}
      {!form.isPublic && (
        <div>
          <FieldLabel>אפשר לבקש להצטרף?</FieldLabel>
          <div className="grid grid-cols-2 gap-3">
            {([
              { value: true,  label: 'כן', sub: 'אנשים יכולים לשלוח בקשה' },
              { value: false, label: 'לא', sub: 'הצטרפות בקוד הזמנה בלבד' },
            ] as const).map((opt) => (
              <button
                key={String(opt.value)}
                type="button"
                onClick={() => updateForm('allowJoinRequests', opt.value)}
                aria-pressed={v2 ? form.allowJoinRequests === opt.value : undefined}
                className={
                  v2
                    ? `flex flex-col items-start gap-0.5 rounded-[18px] p-3 text-start ${V2C.press} ${form.allowJoinRequests === opt.value ? V2C.chipOn : V2C.chipOff}`
                    : `flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all ${
                  form.allowJoinRequests === opt.value
                    ? 'border-cyan-500 bg-cyan-50'
                    : 'border-gray-100 bg-gray-50 hover:border-gray-200'
                }`}
              >
                <span className={v2 ? 'whitespace-nowrap text-[15px] font-black' : 'text-sm font-black text-gray-800'}>{opt.label}</span>
                <span className={v2 ? 'text-[12px] font-bold leading-snug text-v2-muted' : 'text-[9px] text-gray-400 text-center leading-tight'}>{opt.sub}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Rules */}
      <div>
        <FieldLabel>כללי הקהילה (אופציונלי)</FieldLabel>
        <textarea
          value={form.rules}
          onChange={(e) => updateForm('rules', e.target.value)}
          placeholder={'לדוגמה:\n• נא להגיע עם מים\n• כבוד הדדי\n• מוזמן לשתף חברים'}
          rows={5}
          maxLength={500}
          className={v2 ? V2C.textarea : 'w-full px-4 py-3 rounded-xl border border-gray-200 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-400 resize-none leading-relaxed'}
        />
        <p className={v2 ? V2C.counter : 'text-[10px] text-gray-400 mt-1 text-left'}>{form.rules.length}/500</p>
      </div>
    </div>
  );
}
