'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, FileText, ShieldCheck } from 'lucide-react';
import {
  TERMS_OF_USE_HE,
  PRIVACY_POLICY_HE,
  LEGAL_LAST_UPDATED_HE,
  toParagraphs,
  type LegalDoc,
  type LegalParagraphs,
} from '../legal-content';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useUserStore } from '@/features/user';
import Sheet, { SHEET_TITLE_CLASS } from '@/components/ui/v2/Sheet';
import IconButton from '@/components/ui/v2/IconButton';
import { SHEET_Z } from '@/components/ui/v2/tokens';

export type LegalDocType = 'terms' | 'privacy';

interface LegalDocModalProps {
  type: LegalDocType;
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Renders a `LegalParagraphs` value (string OR string[]) as a sequence
 * of <p> blocks. Whitespace-only entries are dropped. The wrapper inherits
 * `dir="rtl"` from the modal body, so Hebrew/mixed-direction text flows
 * correctly without per-paragraph dir overrides.
 */
function Paragraphs({
  body,
  className,
}: {
  body: LegalParagraphs;
  className?: string;
}) {
  const paragraphs = toParagraphs(body);
  if (paragraphs.length === 0) return null;
  return (
    <>
      {paragraphs.map((text, idx) => (
        <p key={idx} className={className}>
          {text}
        </p>
      ))}
    </>
  );
}

/**
 * Reusable Hebrew legal-document viewer (Compliance Phase 5.2).
 * Rendered as a swipeable native-feel bottom sheet consistent with the
 * rest of the drawer system (WorkoutPreviewDrawer, ParkDetailSheet, etc.).
 * Drag down ≥100 px or flick (velocity ≥ 500) to dismiss.
 */
export default function LegalDocModal({ type, isOpen, onClose }: LegalDocModalProps) {
  const doc: LegalDoc = type === 'terms' ? TERMS_OF_USE_HE : PRIVACY_POLICY_HE;
  const Icon = type === 'terms' ? FileText : ShieldCheck;
  // enable_home_v2: the shared <Sheet> shell only — the document text, the
  // footer button and every way to close are the same in both branches.
  const isSuperAdmin = useUserStore((st) => !!(st.profile?.core as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin);
  const v2 = useFeatureFlags(isSuperAdmin).flags.enableHomeV2;

  const content = (
    <div
      className="px-6 pt-4 pb-2 overflow-y-auto flex-1 text-start"
      dir="rtl"
      style={{ fontFamily: 'var(--font-simpler)' }}
    >
      <Paragraphs body={doc.intro} className="text-slate-600 leading-relaxed mb-4" />

      {doc.sections.map((section) => (
        <section key={section.title} className="mb-5">
          <h3 className="font-bold text-slate-900 mb-2">{section.title}</h3>
          <Paragraphs
            body={section.body}
            className="text-slate-600 leading-relaxed mb-3"
          />

          {section.subsections?.map((sub) => (
            <div key={sub.title} className="ms-4 mt-3">
              <h4 className="font-semibold text-slate-800 mb-1">{sub.title}</h4>
              <Paragraphs
                body={sub.body}
                className="text-slate-600 leading-relaxed mb-2"
              />
            </div>
          ))}
        </section>
      ))}

      <p className="text-xs text-slate-400 mt-6 mb-2">
        עדכון אחרון: {LEGAL_LAST_UPDATED_HE}
      </p>
    </div>
  );

  const footer = (
    <div
      className="px-5 pt-3 pb-5 border-t border-slate-100 flex-shrink-0"
      style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
    >
      <button
        type="button"
        onClick={onClose}
        className="w-full bg-[#5BC2F2] hover:bg-[#4AADE3] text-white font-bold py-3 rounded-xl transition-all"
        style={{ fontFamily: 'var(--font-simpler)' }}
      >
        סגור
      </button>
    </div>
  );

  if (v2) {
    return (
      <Sheet
        open={isOpen}
        onClose={onClose}
        // Backdrop z-[130] / sheet z-[131] (.cursorrules) — clears HealthConnectDisclosureModal (z-[120]).
        zIndex={SHEET_Z.legalPanel}
        backdropZIndex={SHEET_Z.legal}
        portal={false}
        keyboardAware={false}
        backdropClassName="bg-black/50"
        backdropStyle={{ backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}
        className="max-h-[90vh]"
        // The footer pads itself above the home indicator.
        safeArea={false}
        // Same gesture as before: drag the whole sheet, ≥100 px or a 500 px/s flick closes.
        dragToDismiss={{ distance: 100, velocity: 500, elastic: 0.15, handleOnly: false }}
        transition={{ type: 'spring', stiffness: 340, damping: 36, mass: 0.85 }}
        ariaLabel={doc.title}
        header={
          <div className="flex items-center justify-between gap-3 px-5 pb-3 pt-1">
            <div className="flex min-w-0 items-center gap-2">
              <Icon className="h-5 w-5 shrink-0 text-v2-deep" aria-hidden="true" />
              <h2 className={`${SHEET_TITLE_CLASS} truncate`}>{doc.title}</h2>
            </div>
            <IconButton aria-label="סגור" tone="surface" size={36} className="shrink-0" onClick={onClose}>
              <X className="h-4 w-4" />
            </IconButton>
          </div>
        }
        footer={footer}
      >
        {content}
      </Sheet>
    );
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-[130]"
            style={{ backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}
            onClick={onClose}
          />

          {/* Bottom sheet panel */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 340, damping: 36, mass: 0.85 }}
            drag="y"
            dragConstraints={{ top: 0 }}
            dragElastic={0.15}
            onDragEnd={(_, info) => {
              if (info.offset.y > 100 || info.velocity.y > 500) onClose();
            }}
            onClick={(e) => e.stopPropagation()}
            className="fixed bottom-0 left-0 right-0 z-[131] bg-white rounded-t-3xl shadow-2xl flex flex-col"
            style={{ maxHeight: '90vh' }}
            dir="rtl"
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
              <div className="w-10 h-1 rounded-full bg-slate-200" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 flex-shrink-0">
              <div className="flex items-center gap-2">
                <Icon size={22} className="text-[#5BC2F2]" />
                <h2
                  className="text-lg font-bold text-slate-900"
                  style={{ fontFamily: 'var(--font-simpler)' }}
                >
                  {doc.title}
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="סגור"
                className="p-2 hover:bg-slate-100 rounded-full transition-colors"
              >
                <X size={20} className="text-slate-600" />
              </button>
            </div>

            {/* Scrollable content */}
            {content}

            {/* Footer CTA — floats above home indicator */}
            {footer}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
