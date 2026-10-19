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
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useUserStore } from '@/features/user';
import { APP_CONFIG_LINKS } from '@/lib/config/app-urls';
import { CalendarPlus, UserPlus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Sheet from '@/components/ui/v2/Sheet';
import { SHEET_Z } from '@/components/ui/v2/tokens';
import { X, Footprints, Users, MapPin, Zap, ChevronLeft } from 'lucide-react';

interface UnifiedPlusDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onGoTrain: () => void;
  onCreateGroup: () => void;
  onAddLocation: () => void;
  onReport: () => void;
  /** v2: "add a workout to the schedule" (home passes it; the map doesn't). */
  onAddWorkout?: () => void;
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
  onAddWorkout,
}: UnifiedPlusDrawerProps) {
  const select = (fn: () => void) => () => { onClose(); fn(); };
  const isSuperAdmin = useUserStore((st) => !!(st.profile?.core as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin);
  // v2 look (enable_home_v2) — the drawer opens from home and the map.
  const v2 = useFeatureFlags(isSuperAdmin).flags.enableHomeV2;
  const uid = useUserStore((st) => st.profile?.id ?? null);
  const invite = () => {
    if (!uid) return;
    const text = `בוא/י להתאמן איתי ב-OUT 💪 ${APP_CONFIG_LINKS.GENERAL_INVITE_ONELINK}?ref=${uid}`;
    if (navigator.share) navigator.share({ text }).catch(() => {});
    else if (navigator.clipboard) void navigator.clipboard.writeText(text);
  };

  // Clean icon treatment (chrome polish): no colored circle behind a white
  // glyph, AND — per the unify-all-icon-colors round — no more per-icon
  // rainbow either. Every icon is now the same flat neutral (text-gray-700),
  // matching Settings' rows/profile rows; no background box either way.
  const activityRows: Row[] = [
    {
      icon: <Footprints size={18} className="text-gray-700" />,
      label: 'יוצא להתאמן',
      sublabel: 'שתף שאתה יוצא לאימון — ריצה, הליכה או כוח',
      onSelect: select(onGoTrain),
    },
    {
      icon: <Users size={18} className="text-gray-700" />,
      label: 'פתח קבוצה/ליגה',
      sublabel: 'התחל קהילה או ליגה חדשה',
      onSelect: select(onCreateGroup),
    },
  ];

  const contributeRows: Row[] = [
    {
      icon: <MapPin size={18} className="text-gray-700" />,
      label: 'הוסף מיקום',
      sublabel: 'פארק, גינת כושר או נקודת עניין חדשה',
      onSelect: select(onAddLocation),
    },
    {
      icon: <Zap size={18} className="text-gray-700" />,
      label: 'דיווח מהיר',
      sublabel: 'ציוד פגום, תאורה, ניקיון ועוד',
      onSelect: select(onReport),
    },
  ];

  const renderV2Row = (row: Row) => (
    <button
      key={row.label}
      onClick={row.onSelect}
      className="flex w-full items-center gap-3 rounded-[20px] bg-white p-3 text-right shadow-v2-ring transition-transform duration-150 ease-v2 active:scale-[0.98]"
    >
      <span className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-[14px] bg-v2-tint text-v2-deep [&_svg]:!text-v2-deep">
        {row.icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15.5px] font-black text-v2-ink">{row.label}</span>
        <span className="block truncate text-[12.5px] font-bold text-v2-muted">{row.sublabel}</span>
      </span>
      <ChevronLeft size={17} strokeWidth={2.6} className="flex-shrink-0 text-v2-muted" />
    </button>
  );

  const renderRow = (row: Row) => (
    <button
      key={row.label}
      onClick={row.onSelect}
      className="w-full flex items-center gap-3 px-3 py-3 rounded-2xl bg-gray-50 hover:bg-gray-100 active:scale-[0.99] transition-all text-right"
    >
      <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center">
        {row.icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold text-gray-900">{row.label}</div>
        <div className="text-[11px] text-gray-500 leading-tight mt-0.5">{row.sublabel}</div>
      </div>
      <ChevronLeft size={16} className="text-gray-300 flex-shrink-0" />
    </button>
  );

  if (v2) {
    return (
      <Sheet
        open={isOpen}
        onClose={onClose}
        layout="nested"
        scroll="none"
        // z-[100]: matches this drawer's live siblings (ContributionWizard,
        // QuickReportSheet, PlannedActivityComposeSheet — .cursorrules "Full-screen overlays").
        zIndex={SHEET_Z.overlay}
        portal={false}
        keyboardAware={false}
        backdropStyle={{ backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}
        title="מה תרצה לעשות?"
      >
        <div className="space-y-4 px-5 pb-4">
          {[
            {
              title: 'פעילות',
              rows: [
                ...(onAddWorkout
                  ? [{ icon: <CalendarPlus size={18} />, label: 'הוספת אימון ללו״ז', sublabel: 'מתי, כמה זמן ואיזה סוג', onSelect: select(onAddWorkout) }]
                  : []),
                activityRows[0],
              ],
            },
            {
              title: 'חברתי',
              rows: [
                { icon: <UserPlus size={18} />, label: 'הזמנת חבר', sublabel: '+50 נק׳ לשכונה ולעיר שלך כשהוא מצטרף', onSelect: select(invite) },
                activityRows[1],
              ],
            },
          ].map((g) => (
            <div key={g.title} className="space-y-2">
              <div className="px-1 text-[13px] font-extrabold text-v2-deep">{g.title}</div>
              <div className="space-y-2">{g.rows.map((row) => renderV2Row(row))}</div>
            </div>
          ))}
          <div className="space-y-2">
            <div className="px-1 text-[13px] font-extrabold text-v2-deep">תרומה למפה</div>
            <div className="grid grid-cols-2 gap-2">
              {contributeRows.map((row) => (
                <button
                  key={row.label}
                  onClick={row.onSelect}
                  className="flex h-12 items-center justify-center gap-2 rounded-full bg-white text-[14px] font-extrabold text-v2-ink shadow-v2-ring transition-transform duration-150 ease-v2 active:scale-[0.97] [&_svg]:!text-v2-deep"
                >
                  {row.icon}
                  {row.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Sheet>
    );
  }

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
          style={{ backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}
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
                aria-label="סגירה"
                className="p-1.5 rounded-lg bg-gray-100 text-gray-400 hover:bg-gray-200 active:scale-90 transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-5 pb-4 space-y-4">
              <div className="space-y-2">
                <div className="text-[11px] font-bold text-gray-400 px-1">פעילות</div>
                <div className="space-y-1.5">
                  {activityRows.map((row) => renderRow(row))}
                </div>
              </div>
              <div className="space-y-2">
                <div className="text-[11px] font-bold text-gray-400 px-1">תרומה למפה</div>
                <div className="space-y-1.5">
                  {renderRow(contributeRows[0])}
                  {renderRow(contributeRows[1])}
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
