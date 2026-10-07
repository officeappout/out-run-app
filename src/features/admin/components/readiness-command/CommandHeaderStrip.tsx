'use client';

export interface CommandHeaderStripProps {
  /** The real, human name only — null whenever there isn't one (no core.name at all, or it's indistinguishable from the email-prefix fallback). The caller resolves this, never this component — see the page's own "ברוך שובך" logic. */
  userName: string | null;
  userRoleLabel: string;
  screenName: string;
  screenDescription: string;
}

/**
 * 07.10.2026 (David) — new dark header strip for the military panel's
 * Command screen. Org-logo slot is a plain empty bordered square,
 * DELIBERATELY not UnitIconBadge (which always renders something — a
 * real image or its hash-colored fallback) — David: "אל תמלא באייקון
 * גנרי... הסמל יועלה על ידי דוד." No parent organization/group entity
 * exists above the 49 brigades to attach a real logoUrl to (confirmed,
 * reported, not built this round) — this slot has nothing to wire to
 * yet and must look visibly empty, not "filled with a placeholder."
 *
 * Palette: navy background + amber tagline, scoped to THIS component
 * only — READINESS_COLORS (pass/fail/not-tested/not-performed) are
 * untouched everywhere, per David's explicit "לא מתחלפים."
 */
export default function CommandHeaderStrip({ userName, userRoleLabel, screenName, screenDescription }: CommandHeaderStripProps) {
  return (
    <div className="rounded-2xl px-5 py-4 flex items-center justify-between gap-4 flex-wrap" style={{ backgroundColor: '#0F1B2D' }}>
      <div className="flex items-center gap-3 min-w-0">
        {/* Org logo slot — empty until David uploads one; no entity exists yet to wire an upload to. */}
        <div className="w-11 h-11 rounded-xl border-2 border-dashed border-white/25 flex-shrink-0" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-sm font-bold text-white truncate">
            {userName ? `ברוך שובך, ${userName}` : userRoleLabel}
          </p>
          {userName && <p className="text-xs text-white/60 truncate">{userRoleLabel}</p>}
        </div>
      </div>

      <p className="text-sm font-bold whitespace-nowrap" style={{ color: '#F59E0B' }}>הגוף שלך — הנשק שלך</p>

      <div className="text-right flex-shrink-0">
        <p className="text-sm font-bold text-white">{screenName}</p>
        <p className="text-xs text-white/60 hidden sm:block">{screenDescription}</p>
      </div>
    </div>
  );
}
