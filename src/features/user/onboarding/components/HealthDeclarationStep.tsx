'use client';

import React, { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, ShieldCheck, Zap, X, Loader2, Info } from 'lucide-react';
import { HEALTH_QUESTIONS, LEGAL_TEXT } from '../data/health-questions';
import { useOnboardingStore } from '../store/useOnboardingStore';
import { markHealthDeclarationAcceptedLocally } from '../services/health-declaration-local';
// pdf-service is NOT statically imported here — see the preload useEffect below.
// Keeping it out of the static import graph prevents pdf-lib (~600 KB) from being
// bundled into this page's initial JS chunk, eliminating the main-thread freeze
// that occurred when the browser first evaluated the chunk during navigation.
import { auth } from '@/lib/firebase';
import {
  submitHealthDeclaration, signatureFits, SIGNATURE_WIDTHS,
} from '../services/health-declaration-record';
import LegalDocModal from '@/features/legal/components/LegalDocModal';
import { useOnboardingV2 } from '../hooks/useOnboardingV2';
import { useJitIdentityV1 } from '../hooks/useJitIdentityV1';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { resolveSignerIdentity } from '../utils/health-signer-identity';
import { LEGAL_VERSION } from '@/features/legal/legal-content';
import { useT } from '@/hooks/useT';
import { onboarding } from '@/messages/ns/onboarding';
import { genderArg } from '@/lib/i18n/core/i18n-core';

interface HealthDeclarationStepProps {
  title?: string;
    description?: string;
  /** New onboarding flow callback */
  onContinue?: (value: boolean) => void;
}

/**
 * Compact the signature for storage in the declaration record: redraw the pad canvas at
 * ~2× the PDF signature box width (canvas→canvas draw is synchronous, no image decode), falling
 * back to 1× if ever needed to stay under MAX_SIGNATURE_CHARS. The full-DPR original is ~3–9×
 * larger and buys nothing in a 260pt-wide PDF box.
 */
function compactSignature(source: HTMLCanvasElement | null, fallback: string): string {
  if (!source || !source.width || !source.height) return fallback;
  for (const width of SIGNATURE_WIDTHS) {
    try {
      const scale = Math.min(1, width / source.width);
      const out = document.createElement('canvas');
      out.width = Math.max(1, Math.round(source.width * scale));
      out.height = Math.max(1, Math.round(source.height * scale));
      const ctx = out.getContext('2d');
      if (!ctx) break;
      ctx.drawImage(source, 0, 0, out.width, out.height);
      const url = out.toDataURL('image/png');
      if (signatureFits(url)) return url;
    } catch {
      break;
    }
  }
  return fallback;
}

export default function HealthDeclarationStep({
    title,
    description,
  onContinue,
}: HealthDeclarationStepProps) {
  // enable_home_v2 — restyle only. Every legal/medical string below is
  // untouched; v2 swaps classes (legacy classes kept verbatim in the else arm).
  const v2 = useOnboardingV2();

  // ── User data: sessionStorage (legacy); enable_jit_identity_v1 → the profile
  // store first (the JIT identity step saves it), sessionStorage as fallback ──
  const useProfileIdentity = useJitIdentityV1();
  const profileCore = useUserStore((st) => st.profile?.core);
  const { userName, gender } = resolveSignerIdentity({
    useProfile: useProfileIdentity,
    profileCore,
    sessionName: typeof window !== 'undefined' ? sessionStorage.getItem('onboarding_personal_name') : null,
    sessionGender: typeof window !== 'undefined' ? sessionStorage.getItem('onboarding_personal_gender') : null,
  });
  const t = useT(onboarding);
  // The signer's gender — anything but 'female' read the masculine copy (explicit: not always the profile's).
  const copyGender = genderArg(gender);

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
      .then(() => {
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


  // 15.10.2026 hang fix: NOTHING here waits on the network. The signature record is written to
  // users/{uid}/private/legal (queued locally by Firestore's persistent cache — not awaited), the
  // flow continues immediately, and the signed PDF is built from that record in the background
  // (health-declaration-record.ts — with timeouts, 'failed' status, and a once-per-session
  // self-heal that regenerates a missing PDF). Same handler for onboarding, the JIT pop-up and
  // the setup wizard.
  const handleSubmit = useCallback(() => {
    if (!canSubmit || !signatureData || isSubmitting) return;

    setIsSubmitting(true);

    try {
      const signedAt = new Date().toISOString();
      submitHealthDeclaration(
        auth.currentUser?.uid,
        {
          answers,
          signature: compactSignature(canvasRef.current, signatureData),
          signerName: userName,
          signedAt,
          termsVersion: LEGAL_VERSION,
          usedFastTrack,
        },
        () => {
          // ── Mirror into the in-memory profile FIRST ──
          // The JIT gate (home / map) and /onboarding-new/health read
          // useUserStore.profile; without this they asked again in the same
          // session (the debounced sync below only reaches Firestore).
          markHealthDeclarationAcceptedLocally();

          // ── Persist to onboarding store with all metadata ──
          // (healthDeclarationPdfUrl is written to private/legal by the background job itself.)
          updateData({
            healthDeclarationAccepted: true,
            healthTermsAccepted: termsAccepted,
            healthAnswers: answers,
            healthSignature: signatureData,
            healthUsedFastTrack: usedFastTrack,
            healthTimestamp: signedAt,
            healthUserName: userName,
            healthGender: gender,
            termsVersion: LEGAL_VERSION,
          } as any);

          // ── Trigger next step ──
          if (onContinue) {
            onContinue(true);
          }
        },
      );
    } catch (error) {
      console.error('[HealthDeclaration] Submission error:', error);
      // Allow retry
      setIsSubmitting(false);
    }
  }, [canSubmit, signatureData, isSubmitting, updateData, answers, termsAccepted, usedFastTrack, userName, gender, onContinue]);

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
    <div className={v2 ? 'flex flex-col h-full w-full flex-1 min-h-0 bg-v2-surface' : 'flex flex-col h-full w-full min-h-[100dvh] bg-gradient-to-b from-slate-50 via-white to-slate-50'} dir="rtl">
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
              className={v2 ? 'relative flex-1 min-w-0 bg-white rounded-[20px] p-4 shadow-v2-ring' : 'relative flex-1 min-w-0 bg-white border border-slate-200 rounded-2xl p-4 shadow-sm'}
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
                    ? { right: '-9px', borderLeft: `9px solid ${v2 ? '#e6edf2' : '#e2e8f0'}` }
                    : { left:  '-9px', borderRight: `9px solid ${v2 ? '#e6edf2' : '#e2e8f0'}` }),
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
                <h1
                  className={v2 ? 'font-black leading-snug mb-1.5 text-v2-ink !tracking-[-0.01em]' : 'font-bold leading-snug mb-1.5'}
                  style={v2 ? { fontSize: '17px' } : { fontSize: '17px', color: '#000000' }}
                >
                  {(() => {
                    const sentence = t('health.intro.sentence', { gender: copyGender });
                    const words = userName
                      ? [t('health.intro.name', { name: userName }), ...sentence.split(' ')]
                      : [(title || t('health.title'))];
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

                <p className={v2 ? 'text-[12.5px] font-bold text-v2-muted leading-relaxed' : 'text-xs text-slate-500 leading-relaxed'}>
                  {t('health.intro.sub').split(' ').map((word, i) => (
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
            className={v2
              ? 'flex items-center gap-1.5 whitespace-nowrap text-v2-deep text-[13px] font-extrabold active:scale-[0.97] transition-transform duration-150 ease-v2'
              : 'flex items-center gap-1.5 text-[#5BC2F2] text-sm font-medium hover:text-[#4AADE3] transition-colors'}
          >
            <Info size={15} className="flex-shrink-0" />
            <span>{t('health.privacyInfo')}</span>
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
            className={v2 ? 'rounded-v2-card bg-white shadow-v2-card p-4 space-y-3' : 'bg-gradient-to-br from-sky-50 to-white border-2 border-sky-200 rounded-2xl p-5 space-y-3'}
            style={{ fontFamily: 'var(--font-simpler)' }}
          >
            <button
              onClick={handleFastTrack}
              disabled={allAnswered && !usedFastTrack}
              className={v2
                ? 'w-full h-12 rounded-full bg-v2-tint text-v2-deep ring-1 ring-inset ring-v2-accent/40 text-[14px] font-extrabold whitespace-nowrap flex items-center justify-center gap-2 px-4 active:scale-[0.97] transition-transform duration-150 ease-v2 disabled:bg-v2-hairline disabled:text-v2-muted disabled:ring-0 disabled:cursor-not-allowed'
                : 'w-full bg-brand-cta hover:brightness-105 disabled:bg-none disabled:bg-slate-200 disabled:cursor-not-allowed text-on-brand font-bold py-3.5 rounded-xl shadow-md transition-all active:scale-[0.98] flex items-center justify-center gap-2'}
            >
              <Zap size={v2 ? 18 : 20} className="flex-shrink-0" />
              <span>
                {t('health.fastTrack.cta', { gender: copyGender })}
              </span>
            </button>

            {/* Orange disclaimer */}
            <div className={v2 ? 'flex items-start gap-2 bg-v2-amber/10 rounded-2xl p-3' : 'flex items-start gap-2 bg-orange-50/60 border border-orange-200/50 rounded-xl p-3'}>
              <AlertTriangle size={16} className={v2 ? 'text-v2-amber flex-shrink-0 mt-0.5' : 'text-orange-600 flex-shrink-0 mt-0.5'} />
              <p className={v2 ? 'text-[12.5px] font-semibold text-[#92400e] leading-relaxed' : 'text-xs text-orange-700 leading-relaxed'}>
                {t.rich('health.fastTrack.note', { b: (chunks: React.ReactNode) => <span className="font-bold">{chunks}</span> })}
              </p>
            </div>
          </div>
        </motion.div>

        {/* Questions */}
        <div className={v2 ? 'space-y-3' : 'space-y-6'}>
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
                className={v2 ? 'rounded-[20px] bg-white shadow-v2-ring p-4 space-y-3' : 'space-y-2.5'}
              >
                <p
                  className={v2 ? 'text-v2-ink font-bold leading-relaxed text-[14.5px]' : 'text-slate-800 font-medium leading-relaxed text-sm'}
                  style={{ fontFamily: 'var(--font-simpler)' }}
                >
                  {q.text}
                </p>

                <div className={v2 ? 'flex gap-2' : 'flex gap-3'}>
                  {/* "לא" (No) button — Brand Blue when selected */}
                  <button
                    onClick={() => handleAnswer(q.id, false)}
                    className={v2
                      ? `flex-1 h-11 rounded-full whitespace-nowrap text-[14px] font-extrabold relative transition-transform duration-150 ease-v2 active:scale-[0.97] ${isNo
                        ? 'bg-v2-tint text-v2-deep ring-1 ring-inset ring-v2-accent/40'
                        : 'bg-white text-v2-ink-2 shadow-v2-ring'}`
                      : `flex-1 py-2.5 rounded-full border-2 transition-all font-bold text-sm relative
                      ${isNo
                        ? `bg-[#5BC2F2]/10 border-[#5BC2F2] text-[#5BC2F2] ring-1 ring-[#5BC2F2]/30 ${isAutoFilled ? 'bg-[#5BC2F2]/5' : ''}`
                        : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'
                      }`}
                    style={{ fontFamily: 'var(--font-simpler)' }}
                  >
                    {t('health.answer.no')}
                    {isAutoFilled && (
                      <span className={v2 ? 'absolute top-1 right-2 w-2 h-2 bg-v2-accent rounded-full' : 'absolute -top-1 -right-1 w-2 h-2 bg-sky-400 rounded-full'} title="Fast-Track" />
                    )}
                  </button>

                  {/* "כן" (Yes) button — Soft red when selected */}
                  <button
                    onClick={() => handleAnswer(q.id, true)}
                    className={v2
                      ? `flex-1 h-11 rounded-full whitespace-nowrap text-[14px] font-extrabold transition-transform duration-150 ease-v2 active:scale-[0.97] ${isYes
                        ? 'bg-[#fdecec] text-[#b4232a] ring-1 ring-inset ring-v2-down/40'
                        : 'bg-white text-v2-ink-2 shadow-v2-ring'}`
                      : `flex-1 py-2.5 rounded-full border-2 transition-all font-bold text-sm
                      ${isYes
                        ? 'bg-red-50 border-red-400 text-red-500 ring-1 ring-red-400/30'
                        : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'
                      }`}
                    style={{ fontFamily: 'var(--font-simpler)' }}
                  >
                    {t('health.answer.yes')}
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
                      <div className={v2 ? 'flex items-start gap-2 bg-v2-amber/10 rounded-2xl p-3 mt-1' : 'flex items-start gap-2 bg-amber-50 border border-amber-200/60 rounded-xl p-3 mt-1'}>
                        <AlertTriangle size={16} className={v2 ? 'text-v2-amber flex-shrink-0 mt-0.5' : 'text-amber-500 flex-shrink-0 mt-0.5'} />
                        <p
                          className={v2 ? 'text-[12.5px] font-semibold text-[#92400e] leading-relaxed' : 'text-xs text-amber-700 leading-relaxed'}
                          style={{ fontFamily: 'var(--font-simpler)' }}
                        >
                          {t('health.answer.yesWarning', { gender: copyGender })}
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
        <div ref={signatureRef} className={v2 ? 'mt-6 rounded-v2-card bg-white shadow-v2-card p-4 space-y-4' : 'mt-8 pt-6 border-t border-slate-100 space-y-4'} style={{ fontFamily: 'var(--font-simpler)' }}>

          {/* Title + gender-responsive subtitle */}
          <div className="space-y-1" dir="rtl">
            <h3 className={v2 ? 'font-black text-v2-ink text-[17px] !tracking-[-0.02em]' : 'font-black text-slate-900 text-lg'}>{t('health.signature.title')}</h3>
            <p className={v2 ? 'text-[14px] text-v2-ink-2 leading-relaxed' : 'text-sm text-slate-500 leading-relaxed'}>
              {t('health.signature.subtitle', { gender: copyGender })}
            </p>
          </div>

          {/* Scrollable legal declaration text */}
          <div
            className={v2
              ? 'max-h-40 overflow-y-auto bg-v2-surface p-4 rounded-2xl ring-1 ring-inset ring-v2-hairline text-[14px] text-v2-ink-2 leading-relaxed'
              : 'max-h-40 overflow-y-auto bg-slate-50 p-4 rounded-2xl border border-slate-100 text-sm text-slate-600 leading-relaxed'}
            dir="rtl"
          >
            {LEGAL_TEXT}
          </div>

          {/* ── Native HTML5 Canvas Signature Pad ── */}
          {/* dir="ltr" so the canvas coordinate system is left-to-right regardless of page direction */}
          <div dir="ltr" className={v2 ? 'w-full h-44 bg-v2-surface border-2 border-dashed border-v2-accent/30 rounded-[20px] relative' : 'w-full h-44 bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl relative'}>
            <canvas
              ref={canvasRef}
              className={v2 ? 'w-full h-full rounded-[18px] cursor-crosshair touch-none select-none' : 'w-full h-full rounded-2xl cursor-crosshair touch-none select-none'}
              onMouseDown={(e) => { e.preventDefault(); startDrawing(getMousePos(e)); }}
              onMouseMove={(e) => { e.preventDefault(); continueDrawing(getMousePos(e)); }}
              onMouseUp={finishDrawing}
              onMouseLeave={finishDrawing}
            />
            {/* Placeholder hint — hidden once the user starts drawing */}
            {!hasSigned && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none" dir="rtl">
                <span className={v2 ? 'text-v2-muted text-[14px] font-bold' : 'text-slate-300 text-sm'}>{t('health.signature.placeholder')}</span>
              </div>
            )}
            {/* Clear button — bottom-right corner */}
            <button
              type="button"
              onClick={clearCanvas}
              className={v2
                ? 'absolute bottom-2.5 right-3 whitespace-nowrap text-[12px] font-extrabold text-v2-deep'
                : 'absolute bottom-2.5 right-3 text-xs text-slate-400 hover:text-slate-600 transition-colors font-medium'}
            >
              {t('health.signature.clear')}
            </button>
          </div>

          {/* Signature status pill */}
          <div className={v2
            ? `text-[12.5px] text-center font-bold transition-colors ${signatureData ? 'text-v2-up' : 'text-v2-muted'}`
            : `text-xs text-center font-bold transition-colors ${signatureData ? 'text-emerald-600' : 'text-slate-400'}`}>
            {signatureData ? t('health.signature.received') : t('health.signature.missing')}
          </div>

          {/* ── Confirmation Checkbox — disabled until the user has signed ── */}
          <div
            className={v2
              ? `pt-1 transition-opacity duration-300 ${hasSigned ? 'opacity-100' : 'opacity-35 pointer-events-none'}`
              : `pt-3 border-t border-slate-100 transition-opacity duration-300 ${hasSigned ? 'opacity-100' : 'opacity-35 pointer-events-none'}`}
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
                <div className={v2
                  ? 'w-[22px] h-[22px] border-2 border-v2-pill-border bg-white rounded-md peer-checked:bg-v2-accent peer-checked:border-v2-accent transition-colors'
                  : 'w-5 h-5 border-2 border-slate-300 rounded-md peer-checked:bg-[#5BC2F2] peer-checked:border-[#5BC2F2] transition-all group-hover:border-[#5BC2F2]'} />
                <div className={v2
                  ? 'absolute inset-0 flex items-center justify-center text-white opacity-0 peer-checked:opacity-100 pointer-events-none transition-opacity'
                  : 'absolute inset-0 flex items-center justify-center text-on-brand opacity-0 peer-checked:opacity-100 pointer-events-none transition-opacity'}>
                  <svg width="12" height="9" viewBox="0 0 12 9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 4L4 7L11 1" />
                  </svg>
                </div>
              </div>
              <p className={v2 ? 'text-[14px] text-v2-ink leading-relaxed flex-1' : 'text-sm text-slate-700 leading-relaxed flex-1'} dir="rtl">
                {t.rich('health.terms', {
                  gender: copyGender,
                  terms: (chunks: React.ReactNode) => (
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); setShowTermsModal(true); }}
                      className={v2 ? 'text-v2-deep underline underline-offset-2 mx-1 font-extrabold' : 'text-[#5BC2F2] underline hover:text-[#4AADE3] mx-1 font-medium'}
                    >
                      {chunks}
                    </button>
                  ),
                  privacy: (chunks: React.ReactNode) => (
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); setShowPrivacyModal(true); }}
                      className={v2 ? 'text-v2-deep underline underline-offset-2 mx-1 font-extrabold' : 'text-[#5BC2F2] underline hover:text-[#4AADE3] mx-1 font-medium'}
                    >
                      {chunks}
                    </button>
                  ),
                })}
              </p>
            </label>
          </div>
        </div>

        {/* Bottom spacer for fixed button */}
        <div className="h-8" />
        </motion.div>{/* end Phase 3 wrapper */}
      </div>

      {/* ── Fixed bottom CTA ── */}
      <div
        className={v2
          ? 'fixed bottom-0 left-0 right-0 bg-v2-surface/90 backdrop-blur-xl px-4 pt-3 z-30'
          : 'fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-sm border-t border-slate-100 px-4 pt-4 z-30'}
        style={{ paddingBottom: v2 ? 'max(env(safe-area-inset-bottom, 0px), 12px)' : 'max(env(safe-area-inset-bottom, 0px), 16px)' }}
      >
        {/* Medical blocking warning */}
        <AnimatePresence>
          {hasMedicalIssue && allAnswered && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="mb-3"
            >
              <div className={v2 ? 'flex items-start gap-2.5 bg-[#fdecec] rounded-2xl p-4 ring-1 ring-inset ring-v2-down/30' : 'flex items-start gap-2.5 bg-red-50 border-2 border-red-300 rounded-xl p-4 shadow-sm'}>
                <AlertTriangle size={20} className={v2 ? 'text-v2-down flex-shrink-0 mt-0.5' : 'text-red-500 flex-shrink-0 mt-0.5'} />
                <p
                  className={v2 ? 'text-[14px] text-[#b4232a] leading-relaxed font-bold' : 'text-sm text-red-700 leading-relaxed font-semibold'}
                  style={{ fontFamily: 'var(--font-simpler)' }}
                >
                  {t('health.blocked', { gender: copyGender })}
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
          className={v2
            ? `w-full h-[52px] rounded-full text-[16px] font-extrabold whitespace-nowrap flex items-center justify-center gap-2 transition-transform duration-150 ease-v2 ${canSubmit && !isSubmitting
              ? 'bg-v2-cta text-v2-on-cta shadow-v2-cta active:scale-[0.97]'
              : 'bg-v2-hairline text-v2-muted cursor-not-allowed'}`
            : `w-full font-bold py-4 rounded-2xl transition-all text-base flex items-center justify-center gap-2
            ${canSubmit && !isSubmitting
              ? 'text-white active:scale-[0.98]'
              : 'bg-slate-200 text-slate-400 cursor-not-allowed'
            }`}
          style={{
            fontFamily: 'var(--font-simpler)',
            ...(!v2 && canSubmit && !isSubmitting ? {
              background: 'linear-gradient(98deg, #0CF2E3 0%, #00BAF7 98%)',
              boxShadow: '0 8px 28px rgba(0,186,247,0.4), 0 3px 10px rgba(139,92,246,0.18)',
            } : {}),
          }}
        >
          {isSubmitting ? (
            <>
              <Loader2 size={20} className="animate-spin" />
              <span>{t('health.submitting')}</span>
            </>
          ) : hasMedicalIssue ? (
            t('health.cta.blocked')
          ) : (
            t('health.cta.submit')
          )}
        </motion.button>

        {/* Progress hint */}
        {!allAnswered && !hasMedicalIssue && (
          <p
            className={v2 ? 'text-center text-[12px] font-bold text-v2-muted mt-2' : 'text-center text-xs text-slate-400 mt-2'}
            style={{ fontFamily: 'var(--font-simpler)' }}
          >
            {t('health.progress', { answered: String(answeredQuestions.size), total: String(HEALTH_QUESTIONS.length) })}
          </p>
        )}
        {allAnswered && !signatureData && !hasMedicalIssue && (
          <p
            className={v2 ? 'text-center text-[12px] text-[#b45309] mt-2 font-bold' : 'text-center text-xs text-amber-500 mt-2 font-medium'}
            style={{ fontFamily: 'var(--font-simpler)' }}
          >
            {t('health.hint.sign')}
          </p>
        )}
        {allAnswered && signatureData && !termsAccepted && !hasMedicalIssue && (
          <p
            className={v2 ? 'text-center text-[12px] text-[#b45309] mt-2 font-bold' : 'text-center text-xs text-amber-500 mt-2 font-medium'}
            style={{ fontFamily: 'var(--font-simpler)' }}
          >
            {t('health.hint.terms')}
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
            className={v2
              ? 'fixed inset-0 bg-[#0e1419]/40 backdrop-blur-sm z-50 flex items-end justify-center px-3 pt-4'
              : 'fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end justify-center p-4 pb-6'}
            style={v2 ? { paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 12px)' } : undefined}
            onClick={() => setShowSafetyInfoModal(false)}
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
              onClick={(e) => e.stopPropagation()}
              className={v2 ? 'bg-white rounded-[28px] shadow-v2-sheet w-full max-w-lg overflow-hidden' : 'bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden'}
              dir="rtl"
            >
              <div className={v2 ? 'flex items-center justify-between px-5 pt-5 pb-2' : 'flex items-center justify-between px-5 py-4 border-b border-slate-100'}>
                <div className="flex items-center gap-2">
                  <ShieldCheck size={20} className={v2 ? 'text-v2-deep flex-shrink-0' : 'text-[#5BC2F2] flex-shrink-0'} />
                  <h2 className={v2 ? 'text-[20px] font-black !tracking-[-0.02em] text-v2-ink whitespace-nowrap' : 'text-base font-bold text-slate-900'} style={{ fontFamily: 'var(--font-simpler)' }}>
                    {t('health.safety.title')}
                  </h2>
                </div>
                <button
                  onClick={() => setShowSafetyInfoModal(false)}
                  className={v2
                    ? 'grid h-9 w-9 place-items-center rounded-full bg-v2-surface ring-1 ring-inset ring-v2-hairline active:scale-[0.97] transition-transform duration-150 ease-v2'
                    : 'p-2 hover:bg-slate-100 rounded-full transition-colors'}
                >
                  <X size={18} className={v2 ? 'text-v2-ink' : 'text-slate-600'} />
                </button>
              </div>
              <div className="px-5 py-4 space-y-3" style={{ fontFamily: 'var(--font-simpler)' }}>
                <p className={v2 ? 'text-[14px] text-v2-ink-2 leading-relaxed' : 'text-sm text-slate-600 leading-relaxed'}>
                  {t('health.safety.private')}
                </p>
                <p className={v2 ? 'text-[14px] text-v2-ink font-bold leading-relaxed' : 'text-sm text-slate-800 font-semibold leading-relaxed'}>
                  {t('health.safety.medical')}
                </p>
              </div>
              <div className="px-5 pb-5">
                <button
                  onClick={() => setShowSafetyInfoModal(false)}
                  className={v2
                    ? 'w-full h-12 rounded-full bg-v2-cta text-[16px] font-extrabold text-v2-on-cta shadow-v2-cta whitespace-nowrap active:scale-[0.97] transition-transform duration-150 ease-v2'
                    : 'w-full bg-brand-cta hover:brightness-105 text-on-brand font-bold py-3 rounded-xl transition-all text-sm'}
                  style={{ fontFamily: 'var(--font-simpler)' }}
                >
                  {t('health.safety.ok')}
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
