'use client';

import React, { useCallback, useMemo, useRef, useState } from 'react';
import dynamicImport from 'next/dynamic';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { CheckCircle2, Loader2, ShieldCheck, AlertTriangle } from 'lucide-react';

// The signature pad uses `react-signature-canvas`, which touches `window` at
// render time. Loading it with ssr:false keeps the public page SSR-safe and
// mirrors the project pattern for browser-only components.
const SignaturePad = dynamicImport(
  () => import('@/features/user/onboarding/components/SignaturePad'),
  { ssr: false },
);

// This is a standalone, force-dynamic public page (no static generation).
export const dynamic = 'force-dynamic';

// ── Hardcoded legal consent text (exact wording — do not alter) ───────────────
const CONSENT_TITLE = 'טופס הסכמה לצילום ופרסום תמונות/סרטונים של קטין';

const CONSENT_PARAGRAPHS = [
  'אני החתום מטה, הורה/אפוטרופוס חוקי של הילד/ה, נותן בזאת את הסכמתי הבלתי מותנית לחברה וכל מי מטעמה לצלם, להסריט ולהקליט את בני/בתי במהלך התחרות והפעילות.',
  'אני מאשר לחברה לעשות שימוש בצילומים, בסרטונים ובחומרים המוקלטים, כולם או חלקם, במסגרת פרסומים שונים של החברה, לרבות: עמודי האינסטגרם, הטיקטוק והפייסבוק של החברה, אתר האינטרנט של החברה, וחומרי שיווק ויחסי ציבור דיגיטליים או מודפסים.',
  'ידוע לי כי התיעוד והפרסום נעשים ללא כל תמורה כספית, ולא תהיה לי או לבני/בתי כל טענה, דרישה או תביעה (לרבות תביעה כספית או פגיעה בפרטיות) כנגד החברה או מי מטעמה בקשר לשימוש בחומרים אלו.',
];

const CONSENT_CHECKBOX_LABEL =
  'אני מאשר/ת את כל תנאי טופס ההסכמה לצילום ופרסום המופיעים לעיל.';

// Full consent body persisted alongside the submission for an immutable record.
const CONSENT_FULL_TEXT = `${CONSENT_TITLE}\n${CONSENT_PARAGRAPHS.join('\n')}`;

const COLLECTION_NAME = 'photo_release_submissions';

interface FormState {
  studentName: string;
  school: string;
  studentClass: string;
  parentName: string;
}

type FormErrors = Partial<Record<keyof FormState | 'signature' | 'consent', string>>;

const EMPTY_FORM: FormState = {
  studentName: '',
  school: '',
  studentClass: '',
  parentName: '',
};

interface FieldConfig {
  key: keyof FormState;
  label: string;
  placeholder: string;
  inputMode?: 'text' | 'numeric';
  autoComplete?: string;
}

const FIELDS: FieldConfig[] = [
  { key: 'studentName', label: 'שם מלא של התלמיד/ה', placeholder: 'לדוגמה: דני כהן', autoComplete: 'off' },
  { key: 'school', label: 'בית ספר', placeholder: 'שם בית הספר', autoComplete: 'off' },
  { key: 'studentClass', label: 'כיתה', placeholder: 'לדוגמה: ה׳ 3', autoComplete: 'off' },
  { key: 'parentName', label: 'שם מלא של ההורה/אפוטרופוס', placeholder: 'שם ההורה החותם', autoComplete: 'off' },
];

export default function PhotoReleaseFormPage() {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isDone, setIsDone] = useState(false);

  const signatureRef = useRef<HTMLDivElement>(null);

  const handleChange = useCallback((key: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
  }, []);

  const validate = useCallback((): FormErrors => {
    const next: FormErrors = {};

    if (!form.studentName.trim()) next.studentName = 'יש להזין את שם התלמיד/ה';
    if (!form.school.trim()) next.school = 'יש להזין את שם בית הספר';
    if (!form.studentClass.trim()) next.studentClass = 'יש להזין כיתה';
    if (!form.parentName.trim()) next.parentName = 'יש להזין את שם ההורה';

    if (!signatureData) next.signature = 'יש לחתום בתיבת החתימה';
    if (!consentAccepted) next.consent = 'יש לאשר את תנאי ההסכמה';

    return next;
  }, [form, signatureData, consentAccepted]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (isSubmitting) return;

      setSubmitError(null);
      const validationErrors = validate();
      setErrors(validationErrors);

      if (Object.values(validationErrors).some(Boolean)) {
        // Scroll the signature into view if that's the blocking error.
        if (validationErrors.signature || validationErrors.consent) {
          signatureRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        return;
      }

      setIsSubmitting(true);
      try {
        await addDoc(collection(db, COLLECTION_NAME), {
          studentName: form.studentName.trim(),
          school: form.school.trim(),
          studentClass: form.studentClass.trim(),
          parentName: form.parentName.trim(),
          // Signature stored as a Base64 PNG data URL.
          signatureData,
          consentAccepted: true,
          consentText: CONSENT_FULL_TEXT,
          formType: 'photo_release',
          status: 'submitted',
          createdAt: serverTimestamp(),
          submittedAtClient: new Date().toISOString(),
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
        });

        setIsDone(true);
      } catch (err) {
        console.error('[PhotoReleaseForm] Submission failed:', err);
        setSubmitError(
          'אירעה שגיאה בשליחת הטופס. אנא בדקו את החיבור לאינטרנט ונסו שוב.',
        );
        setIsSubmitting(false);
      }
    },
    [form, signatureData, validate, isSubmitting],
  );

  const isFormReady = useMemo(
    () =>
      Object.values(form).every((v) => v.trim().length > 0) &&
      !!signatureData &&
      consentAccepted,
    [form, signatureData, consentAccepted],
  );

  // ── Success screen ──────────────────────────────────────────────────────────
  if (isDone) {
    return (
      <main
        dir="rtl"
        className="min-h-[100dvh] bg-gradient-to-b from-slate-50 via-white to-slate-50 flex items-center justify-center px-5 py-10"
        style={{ fontFamily: 'var(--font-simpler)' }}
      >
        <div className="w-full max-w-md bg-white rounded-3xl shadow-floating border border-slate-100 p-8 text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
            <CheckCircle2 size={36} className="text-emerald-500" />
          </div>
          <h1 className="text-2xl font-black text-slate-900 mb-2">האישור נשלח בהצלחה</h1>
          <p className="text-slate-500 leading-relaxed">
            תודה רבה. טופס ההסכמה לצילום נקלט במערכת. ניתן לסגור את החלון.
          </p>
        </div>
      </main>
    );
  }

  // ── Form ──────────────────────────────────────────────────────────────────
  return (
    <main
      dir="rtl"
      className="min-h-[100dvh] bg-gradient-to-b from-slate-50 via-white to-slate-50 px-4 py-8 sm:py-12"
      style={{ fontFamily: 'var(--font-simpler)' }}
    >
      <div className="mx-auto w-full max-w-2xl">
        {/* Header */}
        <header className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-out-blue/10">
            <ShieldCheck size={28} className="text-out-blue" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 leading-snug">
            {CONSENT_TITLE}
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            אנא מלאו את הפרטים, קראו את ההסכמה וחתמו בתחתית הטופס.
          </p>
        </header>

        <form onSubmit={handleSubmit} className="space-y-6" noValidate>
          {/* ── Legal consent text ── */}
          <section className="bg-white rounded-3xl shadow-card border border-slate-100 overflow-hidden">
            <div className="px-5 pt-5 pb-3 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-900">תנאי ההסכמה</h2>
            </div>
            <div className="max-h-72 overflow-y-auto px-5 py-4 space-y-3 text-sm text-slate-600 leading-relaxed text-justify">
              {CONSENT_PARAGRAPHS.map((paragraph, idx) => (
                <p key={idx}>{paragraph}</p>
              ))}
            </div>
          </section>

          {/* ── Form fields ── */}
          <section className="bg-white rounded-3xl shadow-card border border-slate-100 p-5 space-y-5">
            <h2 className="text-base font-bold text-slate-900">פרטי התלמיד/ה וההורה</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {FIELDS.map((field) => {
                const error = errors[field.key];
                return (
                  <div
                    key={field.key}
                    className={field.key === 'parentName' ? 'sm:col-span-2' : undefined}
                  >
                    <label
                      htmlFor={field.key}
                      className="block text-sm font-medium text-slate-700 mb-1.5"
                    >
                      {field.label}
                    </label>
                    <input
                      id={field.key}
                      type="text"
                      inputMode={field.inputMode}
                      autoComplete={field.autoComplete}
                      value={form[field.key]}
                      onChange={(e) => handleChange(field.key, e.target.value)}
                      placeholder={field.placeholder}
                      className={`w-full rounded-lg border bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-300 transition-colors outline-none focus:ring-2 focus:ring-out-blue/30 ${
                        error
                          ? 'border-red-300 focus:border-red-400'
                          : 'border-slate-200 focus:border-out-blue'
                      }`}
                    />
                    {error && (
                      <p className="mt-1.5 text-xs text-red-500">{error}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* ── Consent checkbox ── */}
          <section className="bg-white rounded-3xl shadow-card border border-slate-100 p-5">
            <label className="flex items-start gap-3 cursor-pointer group">
              <div className="relative flex items-center mt-0.5 flex-shrink-0">
                <input
                  type="checkbox"
                  className="peer sr-only"
                  checked={consentAccepted}
                  onChange={(e) => {
                    setConsentAccepted(e.target.checked);
                    setErrors((prev) =>
                      prev.consent ? { ...prev, consent: undefined } : prev,
                    );
                  }}
                />
                <div className="w-5 h-5 border-2 border-slate-300 rounded-md peer-checked:bg-out-blue peer-checked:border-out-blue transition-all group-hover:border-out-blue" />
                <div className="absolute inset-0 flex items-center justify-center text-white opacity-0 peer-checked:opacity-100 pointer-events-none transition-opacity">
                  <svg width="12" height="9" viewBox="0 0 12 9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 4L4 7L11 1" />
                  </svg>
                </div>
              </div>
              <span className="text-sm text-slate-700 leading-relaxed flex-1">
                {CONSENT_CHECKBOX_LABEL}
              </span>
            </label>
            {errors.consent && (
              <p className="mt-2 text-xs text-red-500 pe-8">{errors.consent}</p>
            )}
          </section>

          {/* ── Signature pad ── */}
          <section
            ref={signatureRef}
            className="bg-white rounded-3xl shadow-card border border-slate-100 p-5 space-y-3"
          >
            <div className="flex items-baseline justify-between">
              <h2 className="text-base font-bold text-slate-900">חתימת ההורה/אפוטרופוס</h2>
              <span
                className={`text-xs font-bold transition-colors ${
                  signatureData ? 'text-emerald-600' : 'text-slate-400'
                }`}
              >
                {signatureData ? '✓ נחתם' : 'ממתין לחתימה'}
              </span>
            </div>

            <SignaturePad
              onEnd={(data) => {
                setSignatureData(data);
                if (data) {
                  setErrors((prev) =>
                    prev.signature ? { ...prev, signature: undefined } : prev,
                  );
                }
              }}
            />

            {errors.signature && (
              <p className="text-xs text-red-500">{errors.signature}</p>
            )}
          </section>

          {/* ── Submit error ── */}
          {submitError && (
            <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-2xl p-4">
              <AlertTriangle size={18} className="text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700 leading-relaxed">{submitError}</p>
            </div>
          )}

          {/* ── Submit button ── */}
          <button
            type="submit"
            disabled={isSubmitting}
            className={`w-full font-bold py-4 rounded-2xl text-base flex items-center justify-center gap-2 transition-all ${
              isSubmitting
                ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                : isFormReady
                  ? 'text-white active:scale-[0.99]'
                  : 'bg-out-blue/90 text-white active:scale-[0.99]'
            }`}
            style={
              !isSubmitting && isFormReady
                ? {
                    background: 'linear-gradient(98deg, #0CF2E3 0%, #00BAF7 98%)',
                    boxShadow: '0 8px 28px rgba(0,186,247,0.4)',
                  }
                : undefined
            }
          >
            {isSubmitting ? (
              <>
                <Loader2 size={20} className="animate-spin" />
                <span>שולח אישור...</span>
              </>
            ) : (
              'שלח אישור'
            )}
          </button>

          <p className="text-center text-xs text-slate-400 pb-4">
            הפרטים והחתימה נשמרים באופן מאובטח לצורך תיעוד ההסכמה בלבד.
          </p>
        </form>
      </div>
    </main>
  );
}
