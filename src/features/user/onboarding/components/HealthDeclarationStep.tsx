'use client';

import React, { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, ShieldCheck, Zap, X, Loader2, Info } from 'lucide-react';
import { HEALTH_QUESTIONS, LEGAL_TEXT } from '../data/health-questions';
import { useOnboardingStore } from '../store/useOnboardingStore';
// pdf-service is NOT statically imported here — see the preload useEffect below.
// Keeping it out of the static import graph prevents pdf-lib (~600 KB) from being
// bundled into this page's initial JS chunk, eliminating the main-thread freeze
// that occurred when the browser first evaluated the chunk during navigation.
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { doc, updateDoc } from 'firebase/firestore';
import { storage, db, auth } from '@/lib/firebase';
import LegalDocModal from '@/features/legal/components/LegalDocModal';
import { LEGAL_VERSION } from '@/features/legal/legal-content';

interface HealthDeclarationStepProps {
  title?: string;
    description?: string;
  /** New onboarding flow callback */
  onContinue?: (value: boolean) => void;
  /** Legacy onboarding-dynamic callback (backward compat) */
  onComplete?: () => void;
}

// Module-level cache so the preloaded `generateHealthDeclarationPdf` function
// survives across re-renders. We store the resolved function directly rather
// than the module promise so `handleSubmit` can call it synchronously once
// the background import has completed.
let _cachedGeneratePdf: ((name: string, sig: string) => Promise<Uint8Array>) | null = null;

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

  // ── Direction (i18n-ready — swap for a prop/context in a future i18n pass) ──
  // true  → Lemur on RIGHT, bubble on LEFT, tail points right.
  // false → Lemur on LEFT,  bubble on RIGHT, tail points left, lemur flipped.
  const isRTL = true;

  // ── Store ──
  const updateData = useOnboardingStore((state) => state.updateData);

  // ── Background preload of pdf-lib ────────────────────────────────────────
  // Triggered once on mount so the browser fetches and evaluates the pdf-lib
  // bundle (~600 KB) during the time the user is reading and answering the
  // health questionnaire. By the time they click submit the module is already
  // parsed and cached — zero JS evaluation cost on button press.
  useEffect(() => {
    import('../services/pdf-service')
      .then((mod) => {
        _cachedGeneratePdf = mod.generateHealthDeclarationPdf;
        console.log('[HealthDeclaration] pdf-service preloaded in background.');
      })
      .catch((err) => {
        // Non-fatal: handleSubmit will attempt another dynamic import as fallback.
        console.warn('[HealthDeclaration] Background preload of pdf-service failed:', err);
      });
  }, []);

  // ── Canvas: DPR sizing + non-passive touch listeners ──────────────────────
  // Touch listeners MUST be registered via addEventListener({ passive: false })
  // so that e.preventDefault() can lock the viewport during signing.
  // React's synthetic onTouch* handlers are passive by default and cannot call
  // preventDefault — this native approach avoids that browser warning entirely.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // DPR-aware sizing — rerun whenever the element is resized
    const init = () => {
      const dpr  = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      if (!rect.width) return;
      canvas.width  = rect.width  * dpr;
      canvas.height = rect.height * dpr;
      const ctx = canvas.getContext('2d');
      if (ctx) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.scale(dpr, dpr); }
    };
    const ro = new ResizeObserver(init);
    ro.observe(canvas);

    // Helpers scoped to this effect — refs are stable so no stale-closure risk
    const getTPos = (e: TouchEvent) => {
      const rect  = canvas.getBoundingClientRect();
      const touch = e.touches[0];
      return touch ? { x: touch.clientX - rect.left, y: touch.clientY - rect.top } : null;
    };
    const drawSegment = (from: { x: number; y: number }, to: { x: number; y: number }) => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.beginPath();
      ctx.lineWidth   = 3;
      ctx.lineCap     = 'round';
      ctx.lineJoin    = 'round';
      ctx.strokeStyle = '#0f172a';
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x,   to.y);
      ctx.stroke();
    };

    const handleTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      const pos = getTPos(e);
      if (!pos) return;
      isDrawingRef.current = true;
      lastPosRef.current   = pos;
      setHasSigned(true);
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 1.5, 0, Math.PI * 2);
        ctx.fillStyle = '#0f172a';
        ctx.fill();
      }
    };
    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      if (!isDrawingRef.current || !lastPosRef.current) return;
      const pos = getTPos(e);
      if (!pos) return;
      drawSegment(lastPosRef.current, pos);
      lastPosRef.current = pos;
    };
    const handleTouchEnd = (e: TouchEvent) => {
      e.preventDefault();
      if (!isDrawingRef.current) return;
      isDrawingRef.current = false;
      lastPosRef.current   = null;
      setSignatureData(canvas.toDataURL('image/png'));
    };

    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove',  handleTouchMove,  { passive: false });
    canvas.addEventListener('touchend',   handleTouchEnd,   { passive: false });

    return () => {
      ro.disconnect();
      canvas.removeEventListener('touchstart', handleTouchStart);
      canvas.removeEventListener('touchmove',  handleTouchMove);
      canvas.removeEventListener('touchend',   handleTouchEnd);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── State ──
  const [answers, setAnswers] = useState<Record<string, boolean>>({});
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [answeredQuestions, setAnsweredQuestions] = useState<Set<string>>(new Set());
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [usedFastTrack, setUsedFastTrack] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [showSafetyInfoModal, setShowSafetyInfoModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasSigned,    setHasSigned]    = useState(false);

  const signatureRef       = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const canvasRef          = useRef<HTMLCanvasElement>(null);
  const isDrawingRef       = useRef(false);
  const lastPosRef         = useRef<{ x: number; y: number } | null>(null);

  // ── Derived state ──
  const allAnswered = useMemo(
    () => HEALTH_QUESTIONS.every(q => answeredQuestions.has(q.id)),
    [answeredQuestions]
  );

  const hasMedicalIssue = useMemo(
    () => Object.values(answers).some(val => val === true),
    [answers]
  );

  const canSubmit = allAnswered && hasSigned && !!signatureData && termsAccepted && !hasMedicalIssue;

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


  const handleSubmit = useCallback(async () => {
    if (!canSubmit || !signatureData || isSubmitting) return;

    setIsSubmitting(true);

    try {
      // ── 1. Generate the signed PDF ──
      let pdfDownloadUrl: string | null = null;

      try {
        // Use the module-level cached function from the background preload.
        // If the user clicks before the preload finishes (rare — they must fill
        // all questions, sign, and tick the checkbox first), fall back to a fresh
        // dynamic import which will resolve immediately from the browser cache.
        const generatePdf = _cachedGeneratePdf
          ?? (await import('../services/pdf-service')).generateHealthDeclarationPdf;

        const pdfBytes = await generatePdf(userName, signatureData);

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
        termsVersion: LEGAL_VERSION,
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

  // ── Native canvas drawing helpers ──────────────────────────────────────────
  function getMousePos(e: React.MouseEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }
  function applyStroke(from: { x: number; y: number }, to: { x: number; y: number }) {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.beginPath();
    ctx.lineWidth   = 3;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
    ctx.strokeStyle = '#0f172a';
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x,   to.y);
    ctx.stroke();
  }

  function startDrawing(pos: { x: number; y: number }) {
    isDrawingRef.current = true;
    lastPosRef.current   = pos;
    setHasSigned(true);
    // Paint a tiny dot so a single tap is visible
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) {
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 1.5, 0, Math.PI * 2);
      ctx.fillStyle = '#0f172a';
      ctx.fill();
    }
  }

  function continueDrawing(pos: { x: number; y: number }) {
    if (!isDrawingRef.current || !lastPosRef.current) return;
    applyStroke(lastPosRef.current, pos);
    lastPosRef.current = pos;
  }

  function finishDrawing() {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    lastPosRef.current   = null;
    const canvas = canvasRef.current;
    if (canvas) setSignatureData(canvas.toDataURL('image/png'));
  }

  function clearCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const ctx  = canvas.getContext('2d');
    ctx?.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    setSignatureData(null);
    setHasSigned(false);
  }

  return (
    <div className="flex flex-col h-full w-full min-h-[100dvh] bg-gradient-to-b from-slate-50 via-white to-slate-50" dir="rtl">
      {/* ── Scrollable content ── */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-4 pb-36 scroll-smooth">
        {/* ── PHASE 1 + 2: Header — Lemur pops in → Bubble pops in → Words mist in ── */}
        <div className="mb-5 pt-2" style={{ fontFamily: 'var(--font-simpler)' }}>
          {/*
            DOM order is always [Lemur, Bubble].
            RTL (isRTL=true):  dir="rtl" reverses flex → Lemur=RIGHT, Bubble=LEFT. Tail points right.
            LTR (isRTL=false): normal flex-row       → Lemur=LEFT,  Bubble=RIGHT. Tail points left. Lemur flipped.
          */}
          <div className={`flex items-center gap-4${isRTL ? '' : ''}`} dir={isRTL ? 'rtl' : 'ltr'}>

            {/* ── Phase 1a: Doctor Lemur pops in ── */}
            <motion.div
              style={{ flexShrink: 0 }}
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, ease: [0.34, 1.56, 0.64, 1] }} // spring-like overshoot
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/assets/lemur/lemur-doctor.png"
                alt=""
                aria-hidden="true"
                style={{
                  height: '110px',
                  width: 'auto',
                  maxWidth: '90px',
                  objectFit: 'contain',
                  // In LTR the lemur naturally faces away from the bubble — flip him to face it
                  transform: isRTL ? undefined : 'scaleX(-1)',
                }}
              />
            </motion.div>

            {/* ── Phase 1b: Speech Bubble pops in simultaneously ── */}
            <motion.div
              className="relative flex-1 min-w-0 bg-white border border-slate-200 rounded-2xl p-4 shadow-sm"
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.28, ease: 'easeOut' }}
            >
              {/*
                Bubble tail — direction-aware.
                RTL: tail on the END (right) side, pointing toward the lemur on the right.
                     borderLeft creates a right-pointing triangle; positioned at right:-9px.
                LTR: tail on the START (left) side, pointing toward the lemur on the left.
                     borderRight creates a left-pointing triangle; positioned at left:-9px.
              */}
              {/* Tail — border layer */}
              <span
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  ...(isRTL
                    ? { right: '-9px', borderLeft: '9px solid #e2e8f0' }
                    : { left:  '-9px', borderRight: '9px solid #e2e8f0' }),
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: 0,
                  height: 0,
                  borderTop: '9px solid transparent',
                  borderBottom: '9px solid transparent',
                }}
              />
              {/* Tail — white fill layer */}
              <span
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  ...(isRTL
                    ? { right: '-7px', borderLeft: '8px solid white' }
                    : { left:  '-7px', borderRight: '8px solid white' }),
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: 0,
                  height: 0,
                  borderTop: '8px solid transparent',
                  borderBottom: '8px solid transparent',
                }}
              />

              {/*
                Phase 2 — Word-by-word "mist clearing" animation.
                Spaces are static text nodes (never animated) → zero layout shift.
                delayChildren: 0.2 lets Phase 1 finish before words appear.
              */}
              <motion.div
                dir={isRTL ? 'rtl' : 'ltr'}
                variants={{
                  hidden: {},
                  show: { transition: { delayChildren: 0.2, staggerChildren: 0.055 } },
                }}
                initial="hidden"
                animate="show"
              >
                <h1 className="font-bold leading-snug mb-1.5" style={{ fontSize: '17px', color: '#000000' }}>
                  {(() => {
                    const sentence = isFemale
                      ? 'רגע לפני שיוצאים לדרך, חשוב לנו לוודא שאנחנו שומרות עלייך ב100%.'
                      : 'רגע לפני שיוצאים לדרך, חשוב לנו לוודא שאנחנו שומרים עליך ב100%.';
                    const words = userName
                      ? [`${userName},`, ...sentence.split(' ')]
                      : [(title || 'הצהרת בריאות')];
                    return words.map((word, i) => (
                      <React.Fragment key={i}>
                        <motion.span
                          variants={{
                            hidden: { opacity: 0, y: 5, filter: 'blur(4px)' },
                            show:   { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.4, ease: 'easeOut' } },
                          }}
                          style={{ display: 'inline-block' }}
                        >
                          {word}
                        </motion.span>
                        {' '}
                      </React.Fragment>
                    ));
                  })()}
                </h1>

                <p className="text-xs text-slate-500 leading-relaxed">
                  {'נשאר לנו רק לעבור על שאלון הבריאות הקצר ולחתום למטה.'.split(' ').map((word, i) => (
                    <React.Fragment key={i}>
                      <motion.span
                        variants={{
                          hidden: { opacity: 0, y: 5, filter: 'blur(4px)' },
                          show:   { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.4, ease: 'easeOut' } },
                        }}
                        style={{ display: 'inline-block' }}
                      >
                        {word}
                      </motion.span>
                      {' '}
                    </React.Fragment>
                  ))}
                </p>
              </motion.div>
            </motion.div>
          </div>
        </div>

        {/* ── PHASE 3: Bottom form — fades in after text animation is mostly done (~2.2s) ── */}
        {/* overflow: visible ensures no clipping; scroll container handles the growth */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 2.2, duration: 0.6, ease: 'easeOut' }}
        >

        {/* Privacy info trigger — replaces the old shield banner */}
        <div className="mb-5">
          <button
            type="button"
            onClick={() => setShowSafetyInfoModal(true)}
            className="flex items-center gap-1.5 text-[#5BC2F2] text-sm font-medium hover:text-[#4AADE3] transition-colors"
          >
            <Info size={15} className="flex-shrink-0" />
            <span>מידע על פרטיות ובטיחות</span>
          </button>
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
        <div ref={signatureRef} className="mt-8 pt-6 border-t border-slate-100 space-y-4" style={{ fontFamily: 'var(--font-simpler)' }}>

          {/* Title + gender-responsive subtitle */}
          <div className="space-y-1" dir="rtl">
            <h3 className="font-black text-slate-900 text-lg">הצהרת בריאות ואישור תוכנית 📋</h3>
            <p className="text-sm text-slate-500 leading-relaxed">
              {isFemale
                ? 'אנא קראי ואשרי את הצהרת הבריאות כדי שנוכל להנפיק את התוכנית'
                : 'אנא קרא ואשר את הצהרת הבריאות כדי שנוכל להנפיק את התוכנית'}
            </p>
          </div>

          {/* Scrollable legal declaration text */}
          <div
            className="max-h-40 overflow-y-auto bg-slate-50 p-4 rounded-2xl border border-slate-100 text-sm text-slate-600 leading-relaxed"
            dir="rtl"
          >
            {LEGAL_TEXT}
          </div>

          {/* ── Native HTML5 Canvas Signature Pad ── */}
          {/* dir="ltr" so the canvas coordinate system is left-to-right regardless of page direction */}
          <div dir="ltr" className="w-full h-44 bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl relative">
            <canvas
              ref={canvasRef}
              className="w-full h-full rounded-2xl cursor-crosshair touch-none select-none"
              onMouseDown={(e) => { e.preventDefault(); startDrawing(getMousePos(e)); }}
              onMouseMove={(e) => { e.preventDefault(); continueDrawing(getMousePos(e)); }}
              onMouseUp={finishDrawing}
              onMouseLeave={finishDrawing}
            />
            {/* Placeholder hint — hidden once the user starts drawing */}
            {!hasSigned && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none" dir="rtl">
                <span className="text-slate-300 text-sm">חתום/י כאן עם האצבע</span>
              </div>
            )}
            {/* Clear button — bottom-right corner */}
            <button
              type="button"
              onClick={clearCanvas}
              className="absolute bottom-2.5 right-3 text-xs text-slate-400 hover:text-slate-600 transition-colors font-medium"
            >
              ניקוי חתימה
            </button>
          </div>

          {/* Signature status pill */}
          <div className={`text-xs text-center font-bold transition-colors ${signatureData ? 'text-emerald-600' : 'text-slate-400'}`}>
            {signatureData ? '✓ החתימה התקבלה' : 'יש לחתום בתיבה למעלה'}
          </div>

          {/* ── Confirmation Checkbox — disabled until the user has signed ── */}
          <div
            className={`pt-3 border-t border-slate-100 transition-opacity duration-300 ${hasSigned ? 'opacity-100' : 'opacity-35 pointer-events-none'}`}
          >
            <label className="flex items-start gap-3 cursor-pointer group">
              <div className="relative flex items-center mt-0.5 flex-shrink-0">
                <input
                  type="checkbox"
                  className="peer sr-only"
                  checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
                  disabled={!hasSigned}
                />
                <div className="w-5 h-5 border-2 border-slate-300 rounded-md peer-checked:bg-[#5BC2F2] peer-checked:border-[#5BC2F2] transition-all group-hover:border-[#5BC2F2]" />
                <div className="absolute inset-0 flex items-center justify-center text-white opacity-0 peer-checked:opacity-100 pointer-events-none transition-opacity">
                  <svg width="12" height="9" viewBox="0 0 12 9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 4L4 7L11 1" />
                  </svg>
                </div>
              </div>
              <p className="text-sm text-slate-700 leading-relaxed flex-1" dir="rtl">
                {isFemale ? 'אני מצהירה' : 'אני מצהיר'} כי כל הנתונים נכונים {isFemale ? 'ומסכימה' : 'ומסכים'} ל
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); setShowTermsModal(true); }}
                  className="text-[#5BC2F2] underline hover:text-[#4AADE3] mx-1 font-medium"
                >
                  תנאי השימוש
                </button>
                ול
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); setShowPrivacyModal(true); }}
                  className="text-[#5BC2F2] underline hover:text-[#4AADE3] mx-1 font-medium"
                >
                  מדיניות הפרטיות
                </button>
              </p>
            </label>
          </div>
        </div>

        {/* Bottom spacer for fixed button */}
        <div className="h-8" />
        </motion.div>{/* end Phase 3 wrapper */}
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
          className={`w-full font-bold py-4 rounded-2xl transition-all text-base flex items-center justify-center gap-2
            ${canSubmit && !isSubmitting
              ? 'text-white active:scale-[0.98]'
              : 'bg-slate-200 text-slate-400 cursor-not-allowed'
            }`}
          style={{
            fontFamily: 'var(--font-simpler)',
            ...(canSubmit && !isSubmitting ? {
              background: 'linear-gradient(98deg, #0CF2E3 0%, #00BAF7 98%)',
              boxShadow: '0 8px 28px rgba(0,186,247,0.4), 0 3px 10px rgba(139,92,246,0.18)',
            } : {}),
          }}
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

      {/* ── Safety & Privacy Info Modal ── */}
      <AnimatePresence>
        {showSafetyInfoModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end justify-center p-4 pb-6"
            onClick={() => setShowSafetyInfoModal(false)}
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
              dir="rtl"
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <ShieldCheck size={20} className="text-[#5BC2F2] flex-shrink-0" />
                  <h2 className="text-base font-bold text-slate-900" style={{ fontFamily: 'var(--font-simpler)' }}>
                    פרטיות ובטיחות
                  </h2>
                </div>
                <button
                  onClick={() => setShowSafetyInfoModal(false)}
                  className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                >
                  <X size={18} className="text-slate-600" />
                </button>
              </div>
              <div className="px-5 py-4 space-y-3" style={{ fontFamily: 'var(--font-simpler)' }}>
                <p className="text-sm text-slate-600 leading-relaxed">
                  כל המידע שתמלא נשמר באופן פרטי ומאובטח, ומשמש רק לצורך התאמת התוכנית האישית עבורך.
                </p>
                <p className="text-sm text-slate-800 font-semibold leading-relaxed">
                  אם התשובה לאחת השאלות תצביע על בעיה רפואית, מומלץ להתייעץ עם רופא לפני תחילת פעילות גופנית.
                </p>
              </div>
              <div className="px-5 pb-5">
                <button
                  onClick={() => setShowSafetyInfoModal(false)}
                  className="w-full bg-[#5BC2F2] hover:bg-[#4AADE3] text-white font-bold py-3 rounded-xl transition-all text-sm"
                  style={{ fontFamily: 'var(--font-simpler)' }}
                >
                  הבנתי
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Terms of Use & Privacy Policy modals (shared component) ── */}
      <LegalDocModal
        type="terms"
        isOpen={showTermsModal}
        onClose={() => setShowTermsModal(false)}
      />
      <LegalDocModal
        type="privacy"
        isOpen={showPrivacyModal}
        onClose={() => setShowPrivacyModal(false)}
      />
        </div>
    );
}
