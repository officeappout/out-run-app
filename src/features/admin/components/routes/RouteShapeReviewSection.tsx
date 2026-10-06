'use client';

/**
 * RouteShapeReviewSection — the new block added inside ApprovalDetailModal
 * for route entities only. Shows the geometric facts (never a verdict — raw
 * numbers, per spec) and captures the ✅/❓/❌ training decision + chips.
 *
 * Deliberately separate action from the modal's own Approve/Reject (which
 * publish/reject the route for real). This writes only `shapeTrainingReview`
 * via submitShapeReviewDecision — a route can be labeled here without being
 * published or removed from the queue at all.
 */
import { useState } from 'react';
import { CheckCircle2, HelpCircle, XCircle, Loader2 } from 'lucide-react';
import { REJECTION_CHIPS, APPROVAL_CHIPS, SHAPE_TYPE_LABEL, SHAPE_TYPE_ICON } from './shape-review-chips';
import { submitShapeReviewDecision, type ShapeReviewDecision } from '@/features/admin/services/route-shape-review.service';

interface GeometryMetrics {
  closureGapM: number;
  selfOverlapPct: number;
  compactness: { polsbyPopper: number; reock: number; convexHullRatio: number } | null;
}

interface ExistingReview {
  decision: ShapeReviewDecision;
  reasonChips: string[];
  reasonFreeText: string | null;
}

export interface RouteShapeReviewSectionProps {
  routeId: string;
  shapeType: string | undefined;
  geometryMetrics: GeometryMetrics | undefined;
  existingReview: ExistingReview | null;
  suggestedReasonChips: string[] | undefined;
  admin: { adminId: string; adminName: string };
  onSubmitted?: () => void;
}

export default function RouteShapeReviewSection({
  routeId, shapeType, geometryMetrics, existingReview, suggestedReasonChips, admin, onSubmitted,
}: RouteShapeReviewSectionProps) {
  const [selectedChips, setSelectedChips] = useState<string[]>(
    existingReview?.reasonChips ?? suggestedReasonChips ?? [],
  );
  const [freeText, setFreeText] = useState(existingReview?.reasonFreeText ?? '');
  const [submitting, setSubmitting] = useState<ShapeReviewDecision | null>(null);
  const [saved, setSaved] = useState<ExistingReview | null>(existingReview);

  if (!shapeType) return null; // backfill hasn't reached this route yet — nothing to show

  const toggleChip = (chip: string) => {
    setSelectedChips((prev) => (prev.includes(chip) ? prev.filter((c) => c !== chip) : [...prev, chip]));
  };

  const handleDecision = async (decision: ShapeReviewDecision) => {
    setSubmitting(decision);
    try {
      await submitShapeReviewDecision(routeId, { decision, reasonChips: selectedChips, reasonFreeText: freeText.trim() || null }, admin);
      setSaved({ decision, reasonChips: selectedChips, reasonFreeText: freeText.trim() || null });
      onSubmitted?.();
    } catch (e) {
      console.error('[RouteShapeReviewSection] submit failed:', e);
      alert('שגיאה בשמירת ההחלטה');
    } finally {
      setSubmitting(null);
    }
  };

  const chipPool = shapeType === 'loop' || shapeType === 'linear_corridor' ? [...APPROVAL_CHIPS, ...REJECTION_CHIPS] : REJECTION_CHIPS;

  return (
    <div className="px-5 pb-5 space-y-4 border-t border-gray-100 pt-5">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold text-gray-400">סיווג צורה — סקירת אימון</h4>
        {saved && (
          <span className="text-[10px] font-bold text-gray-400">
            נשמר: {saved.decision === 'approved' ? '✅ כן' : saved.decision === 'maybe' ? '❓ אולי' : '❌ לא'}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <span className="text-lg">{SHAPE_TYPE_ICON[shapeType]}</span>
        <span className="text-sm font-bold text-gray-800">{SHAPE_TYPE_LABEL[shapeType] ?? shapeType}</span>
      </div>

      {/* Raw numbers only — no verdict, per spec. David calibrates his own thresholds. */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <div className="flex justify-between"><span className="text-gray-400">מרחק סגירה</span><span className="font-mono text-gray-800">{geometryMetrics?.closureGapM ?? '—'} מ'</span></div>
        <div className="flex justify-between"><span className="text-gray-400">חפיפה עצמית</span><span className="font-mono text-gray-800">{geometryMetrics?.selfOverlapPct ?? '—'}%</span></div>
        {shapeType === 'loop' && geometryMetrics?.compactness && (
          <>
            <div className="flex justify-between"><span className="text-gray-400">Polsby-Popper</span><span className="font-mono text-gray-800">{geometryMetrics.compactness.polsbyPopper}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Reock</span><span className="font-mono text-gray-800">{geometryMetrics.compactness.reock}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Convex Hull</span><span className="font-mono text-gray-800">{geometryMetrics.compactness.convexHullRatio}</span></div>
          </>
        )}
        {shapeType !== 'loop' && (
          <div className="col-span-2 text-gray-400 text-[11px]">קומפקטיות לא רלוונטית — {SHAPE_TYPE_LABEL[shapeType] ?? shapeType}</div>
        )}
      </div>

      {/* Chips — countable training data, not free text */}
      <div className="flex flex-wrap gap-1.5">
        {chipPool.map((chip) => {
          const isRejection = (REJECTION_CHIPS as readonly string[]).includes(chip);
          const active = selectedChips.includes(chip);
          return (
            <button
              key={chip}
              type="button"
              onClick={() => toggleChip(chip)}
              className={`text-[11px] font-bold px-2.5 py-1 rounded-full border transition-colors ${
                active
                  ? isRejection ? 'bg-red-50 border-red-300 text-red-600' : 'bg-green-50 border-green-300 text-green-600'
                  : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
              }`}
            >
              {chip}
            </button>
          );
        })}
      </div>

      <input
        type="text"
        value={freeText}
        onChange={(e) => setFreeText(e.target.value)}
        placeholder="הערה חופשית (אופציונלי)"
        className="w-full text-xs px-3 py-2 bg-gray-50 rounded-xl border border-transparent focus:border-cyan-300 focus:bg-white outline-none"
      />

      <div className="flex items-center gap-2">
        <button
          onClick={() => handleDecision('approved')}
          disabled={submitting !== null}
          className="flex-1 flex items-center justify-center gap-1.5 bg-green-50 hover:bg-green-100 text-green-700 text-xs font-bold py-2.5 rounded-xl transition-all disabled:opacity-50"
        >
          {submitting === 'approved' ? <Loader2 className="animate-spin" size={14} /> : <CheckCircle2 size={14} />} כן
        </button>
        <button
          onClick={() => handleDecision('maybe')}
          disabled={submitting !== null}
          className="flex-1 flex items-center justify-center gap-1.5 bg-yellow-50 hover:bg-yellow-100 text-yellow-700 text-xs font-bold py-2.5 rounded-xl transition-all disabled:opacity-50"
        >
          {submitting === 'maybe' ? <Loader2 className="animate-spin" size={14} /> : <HelpCircle size={14} />} אולי
        </button>
        <button
          onClick={() => handleDecision('rejected')}
          disabled={submitting !== null}
          className="flex-1 flex items-center justify-center gap-1.5 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold py-2.5 rounded-xl transition-all disabled:opacity-50"
        >
          {submitting === 'rejected' ? <Loader2 className="animate-spin" size={14} /> : <XCircle size={14} />} לא
        </button>
      </div>
    </div>
  );
}
