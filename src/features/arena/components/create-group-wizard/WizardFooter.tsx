'use client';

import React from 'react';
import { Check, ChevronLeft, ChevronRight, Loader2, MapPin } from 'lucide-react';
import { ALWAYS_PRIVATE_TYPES } from './wizard-constants';
import { t } from './wizard-logic';
import type { WizardForm } from './wizard-types';

/** Back / next / create buttons + the "pick a location" hint. */
export function WizardFooter({
  v2,
  step,
  outreachMode,
  form,
  submitting,
  isEditMode,
  myGender,
  canAdvance,
  handleBack,
  handleNext,
  handleCreate,
}: {
  v2: boolean;
  step: number;
  outreachMode: 'outreach' | null;
  form: WizardForm;
  submitting: boolean;
  isEditMode: boolean;
  myGender: string | null | undefined;
  canAdvance: () => boolean;
  handleBack: () => void;
  handleNext: () => void;
  handleCreate: () => void;
}) {
  return (
    <div
      className={`flex-shrink-0 px-5 pt-4 pb-4 border-t ${v2 ? 'border-v2-hairline' : 'border-gray-100'}`}
      style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
    >
      <div className="flex items-center gap-3" dir="rtl">
        {/* Back */}
        <button
          onClick={handleBack}
          aria-label="חזרה"
          className={v2 ? 'grid h-12 w-12 flex-shrink-0 place-items-center rounded-full bg-white shadow-v2-ring transition-transform active:scale-90' : 'w-11 h-11 rounded-xl bg-gray-100 flex items-center justify-center active:scale-90 transition-transform flex-shrink-0'}
        >
          <ChevronRight className={v2 ? 'h-5 w-5 text-v2-ink' : 'w-5 h-5 text-gray-600'} />
        </button>

        {(outreachMode || step < 5) ? (
          <button
            onClick={handleNext}
            disabled={!outreachMode && !canAdvance()}
            className={
              v2
                ? 'flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-v2-cta text-[16px] font-extrabold text-v2-on-cta shadow-v2-cta transition-transform active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40'
                : 'flex-1 h-11 rounded-xl bg-gray-900 text-white text-sm font-black flex items-center justify-center gap-2 transition-all active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed'
            }
          >
            {outreachMode ? 'המשך ליצירה' : 'המשך'}
            <ChevronLeft className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={handleCreate}
            disabled={submitting || form.name.trim().length < 2}
            className={
              v2
                ? 'flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-v2-cta text-[16px] font-extrabold text-v2-on-cta shadow-v2-cta transition-transform active:scale-[0.97] disabled:opacity-50'
                : 'flex-1 h-11 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-sm font-black flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/30 transition-all active:scale-[0.97] disabled:opacity-50'
            }
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Check className="w-4 h-4" />
                {isEditMode
                  ? t('שמור שינויים', 'שמרי שינויים', myGender)
                  : t('צור קהילה', 'צורי קהילה', myGender)}
              </>
            )}
          </button>
        )}
      </div>

      {/* Location hint — visible only on step 3 (StepWhenWhere) when no location is set */}
      {step === 3 && form.hasMeetups === true && !form.locationSelected && !ALWAYS_PRIVATE_TYPES.has(form.groupType) && (
        <p className={v2 ? 'mt-2.5 flex items-center justify-center gap-1 whitespace-nowrap text-[12px] font-bold text-[#b45309]' : 'text-[11px] text-center text-amber-500 font-semibold mt-2.5 flex items-center justify-center gap-1'}>
          <MapPin className="w-3 h-3" />
          יש לבחור מיקום כדי להמשיך
        </p>
      )}
    </div>
  );
}
