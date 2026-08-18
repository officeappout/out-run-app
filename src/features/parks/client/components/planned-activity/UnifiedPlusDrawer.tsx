'use client';

/**
 * UnifiedPlusDrawer — the single "+" entry drawer, replacing the map's old
 * fan-out ActionSpeedDial per the north-star doc's own model ("מגירה
 * מאוחדת אחת עם אופציות מסודרות" — one unified drawer with organized
 * options, not more FAB buttons). Same drawer opens from both the map "+"
 * and the home "+" (Phase 1 revision, social-activities build plan).
 *
 * Organizes the map's 2 pre-existing actions (add location / quick report)
 * alongside the 2 new ones (go train / create group) into labeled sections
 * rather than presenting all 4 as undifferentiated buttons.
 */

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Footprints, Users, MapPin, Zap, ChevronLeft } from 'lucide-react';

interface UnifiedPlusDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onGoTrain: () => void;
  onCreateGroup: () => void;
  onAddLocation: () => void;
  onReport: () => void;
}

interface Row {
  icon: React.ReactNode;
  label: string;
  sublabel: string;
  onSelect: () => void;
}

export default function UnifiedPlusDrawer({
  isOpen,
  onClose,
  onGoTrain,
  onCreateGroup,
  onAddLocation,
  onReport,
}: UnifiedPlusDrawerProps) {
  const select = (fn: () => void) => () => { onClose(); fn(); };

  const activityRows: Row[] = [
    {
      icon: <Footprints size={18} className="text-white" />,
      label: 'יוצא להתאמן',
      sublabel: 'שתף שאתה יוצא לאימון — ריצה, הליכה או כוח',
      onSelect: select(onGoTrain),
    },
    {
      icon: <Users size={18} className="text-white" />,
      label: 'פתח קבוצה/ליגה',
      sublabel: 'התחל קהילה או ליגה חדשה',
      onSelect: select(onCreateGroup),
    },
  ];

  const contributeRows: Row[] = [
    {
      icon: <MapPin size={18} className="text-white" />,
      label: 'הוסף מיקום',
      sublabel: 'פארק, גינת כושר או נקודת עניין חדשה',
      onSelect: select(onAddLocation),
    },
    {
      icon: <Zap size={18} className="text-white" />,
      label: 'דיווח מהיר',
      sublabel: 'ציוד פגום, תאורה, ניקיון ועוד',
      onSelect: select(onReport),
    },
  ];

  const renderRow = (row: Row, color: string) => (
    <button
      key={row.label}
      onClick={row.onSelect}
      className="w-full flex items-center gap-3 px-3 py-3 rounded-2xl bg-gray-50 hover:bg-gray-100 active:scale-[0.99] transition-all text-right"
    >
      <div
        className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center"
        style={{ backgroundColor: color }}
      >
        {row.icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold text-gray-900">{row.label}</div>
        <div className="text-[11px] text-gray-500 leading-tight mt-0.5">{row.sublabel}</div>
      </div>
      <ChevronLeft size={16} className="text-gray-300 flex-shrink-0" />
    </button>
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          // z-[100]: matches this drawer's live siblings (ContributionWizard,
          // QuickReportSheet, PlannedActivityComposeSheet — see .cursorrules
          // z-index budget "Full-screen overlays").
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 340, damping: 34 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-white rounded-t-3xl shadow-2xl overflow-hidden"
            style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
            dir="rtl"
          >
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-gray-200" />
            </div>

            <div className="flex items-center justify-between px-5 pb-2">
              <h3 className="text-base font-black text-gray-900">מה תרצה לעשות?</h3>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg bg-gray-100 text-gray-400 hover:bg-gray-200 active:scale-90 transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-5 pb-4 space-y-4">
              <div className="space-y-2">
                <div className="text-[11px] font-bold text-gray-400 px-1">פעילות</div>
                <div className="space-y-1.5">
                  {activityRows.map((row) => renderRow(row, '#00C9F2'))}
                </div>
              </div>
              <div className="space-y-2">
                <div className="text-[11px] font-bold text-gray-400 px-1">תרומה למפה</div>
                <div className="space-y-1.5">
                  {renderRow(contributeRows[0], '#10B981')}
                  {renderRow(contributeRows[1], '#F59E0B')}
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
