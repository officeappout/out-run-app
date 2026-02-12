'use client';

import React, { useState, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, ShieldCheck, Zap, X, FileText, Loader2 } from 'lucide-react';
import { HEALTH_QUESTIONS, LEGAL_TEXT } from '../data/health-questions';
import { useOnboardingStore } from '../store/useOnboardingStore';
import SignaturePad from './SignaturePad';
import { generateHealthDeclarationPdf } from '../services/pdf-service';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { doc, updateDoc } from 'firebase/firestore';
import { storage, db, auth } from '@/lib/firebase';

interface HealthDeclarationStepProps {
  title?: string;
    description?: string;
  /** New onboarding flow callback */
  onContinue?: (value: boolean) => void;
  /** Legacy onboarding-dynamic callback (backward compat) */
  onComplete?: () => void;
}

export default function HealthDeclarationStep({
    title,
    description,
    onContinue,
  onComplete,
}: HealthDeclarationStepProps) {
  // ── User data from sessionStorage ──
  const userName = typeof window !== 'undefined'
    ? sessionStorage.getItem('onboarding_personal_name') || ''
    : '';
  const gender = typeof window !== 'undefined'
    ? (sessionStorage.getItem('onboarding_personal_gender') || 'male') as 'male' | 'female'
    : 'male' as const;
  const isFemale = gender === 'female';

  // ── Store ──
  const updateData = useOnboardingStore((state) => state.updateData);

  // ── State ──
  const [answers, setAnswers] = useState<Record<string, boolean>>({});
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [answeredQuestions, setAnsweredQuestions] = useState<Set<string>>(new Set());
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [usedFastTrack, setUsedFastTrack] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const signatureRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // ── Derived state ──
  const allAnswered = useMemo(
    () => HEALTH_QUESTIONS.every(q => answeredQuestions.has(q.id)),
    [answeredQuestions]
  );

  const hasMedicalIssue = useMemo(
    () => Object.values(answers).some(val => val === true),
    [answers]
  );

  const canSubmit = allAnswered && !!signatureData && termsAccepted && !hasMedicalIssue;

  // ── Handlers ──
  const handleAnswer = useCallback((id: string, answerIsYes: boolean) => {
    setAnswers(prev => ({ ...prev, [id]: answerIsYes }));
    setAnsweredQuestions(prev => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });

    // Auto-scroll to signature pad after answering the last question
    const lastQuestionId = HEALTH_QUESTIONS[HEALTH_QUESTIONS.length - 1].id;
    if (id === lastQuestionId) {
      setTimeout(() => {
        signatureRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }, 200);
    }
  }, []);

  const handleFastTrack = useCallback(() => {
    // Set all answers to false (No)
    const allNoAnswers = HEALTH_QUESTIONS.reduce((acc, q) => ({
      ...acc,
      [q.id]: false,
    }), {} as Record<string, boolean>);
    setAnswers(allNoAnswers);

    // Mark all questions as answered
    const allIds = new Set(HEALTH_QUESTIONS.map(q => q.id));
    setAnsweredQuestions(allIds);

    // Set fast-track flag
    setUsedFastTrack(true);

    // Smooth scroll to signature section
    setTimeout(() => {
      signatureRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }, 300);
  }, []);

  const handleSignatureEnd = useCallback((data: string | null) => {
    setSignatureData(data);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!canSubmit || !signatureData || isSubmitting) return;

    setIsSubmitting(true);

    try {
      // ── 1. Generate the signed PDF ──
      let pdfDownloadUrl: string | null = null;

      try {
        const pdfBytes = await generateHealthDeclarationPdf(userName, signatureData);

        // ── 2. Upload to Firebase Storage ──
        const userId = auth.currentUser?.uid;
        if (userId) {
          const timestamp = Date.now();
          const storagePath = `health-declarations/${userId}/health-declaration-${timestamp}.pdf`;
          const storageRef = ref(storage, storagePath);
          const pdfBlob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
          const snapshot = await uploadBytes(storageRef, pdfBlob, {
            contentType: 'application/pdf',
            customMetadata: {
              userName,
              generatedAt: new Date().toISOString(),
            },
          });
          pdfDownloadUrl = await getDownloadURL(snapshot.ref);

          // ── 3. Save download URL to Firestore user document ──
          const userDocRef = doc(db, 'users', userId);
          await updateDoc(userDocRef, {
            healthDeclarationPdfUrl: pdfDownloadUrl,
            updatedAt: new Date(),
          });
        }
      } catch (pdfError) {
        // PDF generation/upload failure should NOT block onboarding flow.
        // Log the error but continue with the rest of the submission.
        console.error('[HealthDeclaration] PDF generation/upload failed:', pdfError);
      }

      // ── 4. Persist to onboarding store with all metadata ──
      updateData({
        healthDeclarationAccepted: true,
        healthTermsAccepted: termsAccepted,
        healthAnswers: answers,
        healthSignature: signatureData,
        healthUsedFastTrack: usedFastTrack,
        healthTimestamp: new Date().toISOString(),
        healthUserName: userName,
        healthGender: gender,
        termsVersion: '1.0', // Track which version of T&C was signed
        ...(pdfDownloadUrl ? { healthDeclarationPdfUrl: pdfDownloadUrl } : {}),
      } as any);

      // ── 5. Trigger next step ──
      if (onContinue) {
        onContinue(true);
      }
      if (onComplete) {
        onComplete();
      }
    } catch (error) {
      console.error('[HealthDeclaration] Submission error:', error);
      // Allow retry
      setIsSubmitting(false);
    }
  }, [canSubmit, signatureData, isSubmitting, updateData, answers, termsAccepted, usedFastTrack, userName, gender, onContinue, onComplete]);

  return (
    <div className="flex flex-col h-full w-full" dir="rtl">
      {/* ── Scrollable content ── */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-4 pb-36 scroll-smooth">
        {/* Header */}
        <div className="mb-6 pt-2" style={{ fontFamily: 'var(--font-simpler)' }}>
          <h1 className="text-xl font-bold leading-relaxed mb-1.5">
            {userName ? (
              <>
                <span className="text-slate-900">{userName}</span>
                <span className="text-slate-900">, </span>
                <span style={{ color: '#5BC2F2' }}>
                  {isFemale
                    ? 'רגע לפני שיוצאים לדרך — חשוב לנו לוודא שאנחנו שומרות עלייך ב-100%.'
                    : 'רגע לפני שיוצאים לדרך — חשוב לנו לוודא שאנחנו שומרים עליך ב-100%.'
                  }
                </span>
              </>
            ) : (
              <span className="text-slate-900">{title || 'הצהרת בריאות'}</span>
            )}
          </h1>
          <p className="text-sm text-slate-500 leading-relaxed">
            נשאר לנו רק לעבור על שאלון הבריאות הקצר ולחתום למטה.
          </p>
        </div>

        {/* Info banner */}
        <div
          className="bg-sky-50/60 border border-sky-100 rounded-2xl p-4 mb-6"
          style={{ fontFamily: 'var(--font-simpler)' }}
        >
          <div className="flex items-start gap-3">
            <ShieldCheck size={20} className="text-[#5BC2F2] flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-slate-600 leading-relaxed">
                כל המידע שתמלא נשמר באופן פרטי ומאובטח, ומשמש רק לצורך התאמת התוכנית עבורך.
              </p>
              <p className="text-sm text-slate-800 font-semibold mt-1">
                אם התשובה לאחת השאלות תצביע על בעיה רפואית, מומלץ להתייעץ עם רופא.
              </p>
            </div>
          </div>
        </div>

        {/* ── Fast-Track Card ── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mb-6"
        >
          <div
            className="bg-gradient-to-br from-sky-50 to-white border-2 border-sky-200 rounded-2xl p-5 space-y-3"
            style={{ fontFamily: 'var(--font-simpler)' }}
          >
            <button
              onClick={handleFastTrack}
              disabled={allAnswered && !usedFastTrack}
              className="w-full bg-[#5BC2F2] hover:bg-[#4AADE3] disabled:bg-slate-200 disabled:cursor-not-allowed text-white font-bold py-3.5 rounded-xl shadow-md transition-all active:scale-[0.98] flex items-center justify-center gap-2"
            >
              <Zap size={20} className="flex-shrink-0" />
              <span>
                {isFemale
                  ? 'אני מצהירה שכל התשובות הן "לא"'
                  : 'אני מצהיר שכל התשובות הן "לא"'
                }
              </span>
            </button>

            {/* Orange disclaimer */}
            <div className="flex items-start gap-2 bg-orange-50/60 border border-orange-200/50 rounded-xl p-3">
              <AlertTriangle size={16} className="text-orange-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-orange-700 leading-relaxed">
                <span className="font-bold">שימו לב:</span> לחיצה על כפתור זה מצהירה שאתם בריאים ולא סובלים מאף אחת מהבעיות הרפואיות המפורטות בשאלון. אם יש לכם ספק, אנא ענו על כל שאלה בנפרד.
              </p>
            </div>
          </div>
        </motion.div>

        {/* Questions */}
        <div className="space-y-6">
          {HEALTH_QUESTIONS.map((q, idx) => {
            const isAnswered = answeredQuestions.has(q.id);
            const isYes = answers[q.id] === true;
            const isNo = answers[q.id] === false && isAnswered;
            const isAutoFilled = usedFastTrack && isNo;

    return (
              <motion.div
                key={q.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: usedFastTrack ? idx * 0.03 : idx * 0.03, duration: 0.25 }}
                className="space-y-2.5"
              >
                <p
                  className="text-slate-800 font-medium leading-relaxed text-sm"
                  style={{ fontFamily: 'var(--font-simpler)' }}
                >
                  {q.text}
                </p>

                <div className="flex gap-3">
                  {/* "לא" (No) button — Brand Blue when selected */}
                  <button
                    onClick={() => handleAnswer(q.id, false)}
                    className={`flex-1 py-2.5 rounded-full border-2 transition-all font-bold text-sm relative
                      ${isNo
                        ? `bg-[#5BC2F2]/10 border-[#5BC2F2] text-[#5BC2F2] ring-1 ring-[#5BC2F2]/30 ${isAutoFilled ? 'bg-[#5BC2F2]/5' : ''}`
                        : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'
                      }`}
                    style={{ fontFamily: 'var(--font-simpler)' }}
                  >
                    לא
                    {isAutoFilled && (
                      <span className="absolute -top-1 -right-1 w-2 h-2 bg-sky-400 rounded-full" title="Fast-Track" />
                    )}
                  </button>

                  {/* "כן" (Yes) button — Soft red when selected */}
                  <button
                    onClick={() => handleAnswer(q.id, true)}
                    className={`flex-1 py-2.5 rounded-full border-2 transition-all font-bold text-sm
                      ${isYes
                        ? 'bg-red-50 border-red-400 text-red-500 ring-1 ring-red-400/30'
                        : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'
                      }`}
                    style={{ fontFamily: 'var(--font-simpler)' }}
                  >
                    כן
                  </button>
                </div>

                {/* Inline medical warning when "כן" is selected */}
                <AnimatePresence>
                  {isYes && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="flex items-start gap-2 bg-amber-50 border border-amber-200/60 rounded-xl p-3 mt-1">
                        <AlertTriangle size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
                        <p
                          className="text-xs text-amber-700 leading-relaxed"
                          style={{ fontFamily: 'var(--font-simpler)' }}
                        >
                          {isFemale
                            ? 'שימי לב: עקב תשובתך, מומלץ להתייעץ עם רופא לפני תחילת פעילות גופנית.'
                            : 'שים לב: עקב תשובתך, מומלץ להתייעץ עם רופא לפני תחילת פעילות גופנית.'
                          }
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>

        {/* ── Signature Section ── */}
        <div ref={signatureRef} className="mt-8 pt-6 border-t border-slate-100">
          <div
            className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4"
            style={{ fontFamily: 'var(--font-simpler)' }}
          >
            <div className="space-y-2">
              <h3 className="font-bold text-slate-900 text-base">חתימה על הצהרת בריאות</h3>
              <p className="text-xs text-slate-500 leading-relaxed text-justify">
                {LEGAL_TEXT}
                </p>
            </div>

            {/* Signature Canvas */}
            <SignaturePad onEnd={handleSignatureEnd} />

            {/* Terms & Privacy Checkbox */}
            <div className="pt-2 border-t border-slate-100">
              <label className="flex items-start gap-3 cursor-pointer group">
                <div className="relative flex items-center mt-0.5">
                        <input
                            type="checkbox"
                            className="peer sr-only"
                    checked={termsAccepted}
                    onChange={(e) => setTermsAccepted(e.target.checked)}
                        />
                  <div className="w-5 h-5 border-2 border-slate-300 rounded-md peer-checked:bg-[#5BC2F2] peer-checked:border-[#5BC2F2] transition-all group-hover:border-[#5BC2F2]"></div>
                        <div className="absolute inset-0 flex items-center justify-center text-white opacity-0 peer-checked:opacity-100 pointer-events-none transition-opacity">
                    <svg width="12" height="9" viewBox="0 0 12 9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 4L4 7L11 1" />
                            </svg>
                        </div>
                    </div>
                <p className="text-sm text-slate-700 leading-relaxed flex-1">
                  קראתי ואני מסכים/ה ל
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      setShowTermsModal(true);
                    }}
                    className="text-[#5BC2F2] underline hover:text-[#4AADE3] mx-1 font-medium"
                    type="button"
                  >
                    תנאי השימוש
                  </button>
                  ול
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      setShowPrivacyModal(true);
                    }}
                    className="text-[#5BC2F2] underline hover:text-[#4AADE3] mx-1 font-medium"
                    type="button"
                  >
                    מדיניות הפרטיות
                  </button>
                </p>
                </label>
            </div>

            {/* Signature status indicator */}
            <div
              className={`text-xs text-center transition-colors font-bold ${
                signatureData ? 'text-emerald-600' : 'text-slate-400'
              }`}
            >
              {signatureData ? '✓ החתימה התקבלה' : 'יש לחתום בתיבה למעלה'}
            </div>
          </div>
        </div>

        {/* Bottom spacer for fixed button */}
        <div className="h-8" />
      </div>

      {/* ── Fixed bottom CTA ── */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-sm border-t border-slate-100 px-4 py-4 z-30">
        {/* Medical blocking warning */}
        <AnimatePresence>
          {hasMedicalIssue && allAnswered && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="mb-3"
            >
              <div className="flex items-start gap-2.5 bg-red-50 border-2 border-red-300 rounded-xl p-4 shadow-sm">
                <AlertTriangle size={20} className="text-red-500 flex-shrink-0 mt-0.5" />
                <p
                  className="text-sm text-red-700 leading-relaxed font-semibold"
                  style={{ fontFamily: 'var(--font-simpler)' }}
                >
                  {isFemale
                    ? 'עקב תשובותייך, לא ניתן להמשיך בתהליך ההרשמה. מומלץ להתייעץ עם רופא ומאמן מקצועי לפני תחילת פעילות גופנית.'
                    : 'עקב תשובותיך, לא ניתן להמשיך בתהליך ההרשמה. מומלץ להתייעץ עם רופא ומאמן מקצועי לפני תחילת פעילות גופנית.'
                  }
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.button
          onClick={handleSubmit}
          disabled={!canSubmit || isSubmitting}
          animate={canSubmit && !isSubmitting ? { scale: [1, 1.01, 1] } : {}}
          transition={canSubmit && !isSubmitting ? { repeat: Infinity, duration: 1.5, ease: 'easeInOut' } : {}}
          className={`w-full font-bold py-4 rounded-2xl shadow-lg transition-all text-base flex items-center justify-center gap-2
            ${canSubmit && !isSubmitting
              ? 'bg-[#4FB4F7] text-white shadow-[#4FB4F7]/30 hover:bg-[#3DA5E8] active:scale-[0.98]'
              : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
            }`}
          style={{ fontFamily: 'var(--font-simpler)' }}
        >
          {isSubmitting ? (
            <>
              <Loader2 size={20} className="animate-spin" />
              <span>מכין מסמך חתום...</span>
            </>
          ) : hasMedicalIssue ? (
            'לא ניתן להמשיך'
          ) : (
            'אישור והמשך'
          )}
        </motion.button>

        {/* Progress hint */}
        {!allAnswered && !hasMedicalIssue && (
          <p
            className="text-center text-xs text-slate-400 mt-2"
            style={{ fontFamily: 'var(--font-simpler)' }}
          >
            {`${answeredQuestions.size}/${HEALTH_QUESTIONS.length} שאלות נענו`}
          </p>
        )}
        {allAnswered && !signatureData && !hasMedicalIssue && (
          <p
            className="text-center text-xs text-amber-500 mt-2 font-medium"
            style={{ fontFamily: 'var(--font-simpler)' }}
          >
            נא לחתום בתיבת החתימה למעלה כדי להמשיך
          </p>
        )}
        {allAnswered && signatureData && !termsAccepted && !hasMedicalIssue && (
          <p
            className="text-center text-xs text-amber-500 mt-2 font-medium"
            style={{ fontFamily: 'var(--font-simpler)' }}
          >
            נא לאשר את תנאי השימוש ומדיניות הפרטיות
          </p>
        )}
      </div>

      {/* ── Terms of Use Modal ── */}
      <AnimatePresence>
        {showTermsModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowTermsModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col"
              dir="rtl"
            >
              <div className="flex items-center justify-between p-5 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <FileText size={24} className="text-[#5BC2F2]" />
                  <h2 className="text-xl font-bold text-slate-900" style={{ fontFamily: 'var(--font-simpler)' }}>
                    תנאי השימוש
                  </h2>
                </div>
                <button
                  onClick={() => setShowTermsModal(false)}
                  className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                >
                  <X size={20} className="text-slate-600" />
                </button>
              </div>
              <div className="p-6 overflow-y-auto flex-1" style={{ fontFamily: 'var(--font-simpler)' }}>
                <p className="text-slate-600 leading-relaxed mb-4">
                  ברוכים הבאים ל-OUT. השימוש באפליקציה מהווה הסכמה לתנאי השימוש המפורטים להלן.
                </p>
                <h3 className="font-bold text-slate-900 mb-2">1. כללי</h3>
                <p className="text-slate-600 leading-relaxed mb-4">
                  אפליקציית OUT מספקת תוכניות אימון מותאמות אישית לכושר גופני. השימוש באפליקציה הוא באחריותך הבלעדית.
                </p>
                <h3 className="font-bold text-slate-900 mb-2">2. הצהרת בריאות</h3>
                <p className="text-slate-600 leading-relaxed mb-4">
                  אתה מצהיר כי מילאת את שאלון הבריאות בכנות ומוכן לקחת אחריות מלאה על מצב הבריאות שלך לפני תחילת הפעילות.
                </p>
                <h3 className="font-bold text-slate-900 mb-2">3. אחריות</h3>
                <p className="text-slate-600 leading-relaxed mb-4">
                  OUT אינה אחראית לכל נזק גופני או רכושי שייגרם במהלך השימוש בשירות. מומלץ להתייעץ עם רופא לפני תחילת כל תוכנית אימונים.
                </p>
                <p className="text-xs text-slate-400 mt-6">
                  עדכון אחרון: פברואר 2026
                </p>
              </div>
              <div className="p-4 border-t border-slate-100">
                <button
                  onClick={() => setShowTermsModal(false)}
                  className="w-full bg-[#5BC2F2] hover:bg-[#4AADE3] text-white font-bold py-3 rounded-xl transition-all"
                  style={{ fontFamily: 'var(--font-simpler)' }}
                >
                  סגור
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Privacy Policy Modal ── */}
      <AnimatePresence>
        {showPrivacyModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowPrivacyModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col"
              dir="rtl"
            >
              <div className="flex items-center justify-between p-5 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <ShieldCheck size={24} className="text-[#5BC2F2]" />
                  <h2 className="text-xl font-bold text-slate-900" style={{ fontFamily: 'var(--font-simpler)' }}>
                    מדיניות הפרטיות
                  </h2>
                </div>
                <button
                  onClick={() => setShowPrivacyModal(false)}
                  className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                >
                  <X size={20} className="text-slate-600" />
                </button>
              </div>
              <div className="p-6 overflow-y-auto flex-1" style={{ fontFamily: 'var(--font-simpler)' }}>
                <p className="text-slate-600 leading-relaxed mb-4">
                  ב-OUT אנו מתחייבים להגן על הפרטיות שלך. מדיניות זו מפרטת כיצד אנו אוספים, משתמשים ומגנים על המידע האישי שלך.
                </p>
                <h3 className="font-bold text-slate-900 mb-2">1. איסוף מידע</h3>
                <p className="text-slate-600 leading-relaxed mb-4">
                  אנו אוספים מידע בסיסי כגון שם, גיל, היסטוריית אימונים ותשובות לשאלון הבריאות. המידע נשמר באופן מאובטח בשרתי Firebase.
                </p>
                <h3 className="font-bold text-slate-900 mb-2">2. שימוש במידע</h3>
                <p className="text-slate-600 leading-relaxed mb-4">
                  המידע משמש אך ורק להתאמה אישית של תוכניות האימון ושיפור השירות. לא נשתף את המידע עם צדדים שלישיים ללא הסכמתך.
                </p>
                <h3 className="font-bold text-slate-900 mb-2">3. אבטחת מידע</h3>
                <p className="text-slate-600 leading-relaxed mb-4">
                  אנו משתמשים בהצפנה ובפרוטוקולי אבטחה מתקדמים כדי להגן על המידע האישי שלך. יש לך זכות לגשת, לתקן או למחוק את המידע שלך בכל עת.
                </p>
                <p className="text-xs text-slate-400 mt-6">
                  עדכון אחרון: פברואר 2026
                </p>
              </div>
              <div className="p-4 border-t border-slate-100">
                <button
                  onClick={() => setShowPrivacyModal(false)}
                  className="w-full bg-[#5BC2F2] hover:bg-[#4AADE3] text-white font-bold py-3 rounded-xl transition-all"
                  style={{ fontFamily: 'var(--font-simpler)' }}
                >
                  סגור
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
        </div>
    );
}
