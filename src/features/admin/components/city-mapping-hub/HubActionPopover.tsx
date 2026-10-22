'use client';

/**
 * HubActionPopover — the focused map item with אשר / דחה (§3.4). Anchored in
 * a corner of the map box (absolute, after the canvas in DOM order — no
 * z-index value). Reject asks for a reason: a chip or free text (same
 * REJECTION_CHIPS as shape review for routes). Approved items are read-only.
 */
import { useState } from 'react';
import Link from 'next/link';
import { Check, Loader2, X } from 'lucide-react';
import { REJECTION_CHIPS } from '../routes/shape-review-chips';
import { AMENITY_CATEGORY_LABELS, CONTRIB_TYPE_LABELS, FACILITY_LABELS } from '../approval/approval-labels';
import type { HubPointItem } from './HubPointList';

const GENERIC_CHIPS = ['כפול', 'לא קיים במציאות', 'מיקום שגוי', 'תמונה לא מתאימה', 'לא ברשות'] as const;
const KIND_LABEL: Record<string, string> = { route: 'מסלול', park: 'מיקום', amenity: 'מתקן', contribution: 'תרומת משתמש' };

export interface HubActionPopoverProps {
  item: HubPointItem;
  busy: boolean;
  /** null = this viewer can't moderate (no admin identity). */
  canModerate: boolean;
  onApprove: () => void;
  onReject: (reason: string) => void;
  onClose: () => void;
}

const s = (v: unknown) => (typeof v === 'string' && v ? v : null);

function details(it: HubPointItem): string {
  const p = it.properties;
  const out: string[] = [];
  if (it.kind === 'route') {
    if (typeof p.distanceKm === 'number') out.push(`${p.distanceKm.toFixed(1)} ק״מ`);
    if (s(p.origin)) out.push(`מקור: ${p.origin}`);
  }
  if (it.kind === 'amenity' && s(p.category)) out.push(AMENITY_CATEGORY_LABELS[String(p.category)] ?? String(p.category));
  if (it.kind === 'contribution' && s(p.type)) out.push(CONTRIB_TYPE_LABELS[String(p.type)] ?? String(p.type));
  if (s(p.facilityType)) out.push(FACILITY_LABELS[String(p.facilityType)] ?? String(p.facilityType));
  if (typeof p.equipmentCount === 'number' && p.equipmentCount > 0) out.push(`${p.equipmentCount} מתקנים`);
  if (s(p.editSummary)) out.push(String(p.editSummary));
  return out.join(' · ');
}

export default function HubActionPopover({ item, busy, canModerate, onApprove, onReject, onClose }: HubActionPopoverProps) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const pending = item.properties.status === 'pending';
  const chips = item.kind === 'route' ? REJECTION_CHIPS : GENERIC_CHIPS;
  const photo = s(item.properties.photo);
  return (
    <div role="dialog" aria-label={`פעולה על ${KIND_LABEL[item.kind] ?? 'פריט'}`} data-testid="hub-popover" dir="rtl"
      className="absolute left-3 top-12 w-[min(340px,calc(100%-24px))] rounded-2xl border border-slate-200 bg-white p-3 text-[13px] shadow-xl">
      <div className="flex items-start gap-2">
        {photo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="" className="h-14 w-14 shrink-0 rounded-lg bg-slate-100 object-cover" />
        )}
        <div className="min-w-0 flex-1">
          <span className="text-[11px] font-bold text-slate-400">{KIND_LABEL[item.kind] ?? item.kind}</span>
          <h4 className="break-words text-sm font-black">{s(item.properties.name) ?? '(ללא שם)'}</h4>
          <p className="text-slate-500">{details(item)}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="סגור" className="rounded p-1 text-slate-400 hover:text-slate-700"><X className="h-4 w-4" /></button>
      </div>

      {!pending && <p className="mt-2 rounded-lg bg-emerald-50 px-2 py-1 font-bold text-emerald-700">מאושר</p>}
      {pending && !canModerate && <p className="mt-2 text-xs text-slate-500">אין זהות מנהל — אי אפשר לאשר מכאן.</p>}

      {pending && canModerate && !rejecting && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={onApprove} data-testid="hub-approve"
            className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-1.5 font-bold text-white hover:bg-emerald-700 disabled:opacity-60">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} אשר
          </button>
          <button type="button" disabled={busy} onClick={() => setRejecting(true)} data-testid="hub-reject"
            className="rounded-xl border border-red-200 bg-white px-3 py-1.5 font-bold text-red-700 hover:bg-red-50 disabled:opacity-60">
            דחה
          </button>
          <Link href="/admin/approval-center" className="rounded-xl border border-slate-200 px-3 py-1.5 font-bold text-slate-600 hover:bg-slate-50">מרכז האישורים</Link>
        </div>
      )}

      {pending && canModerate && rejecting && (
        <div className="mt-3 flex flex-col gap-2">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="סיבת דחייה">
            {chips.map((c) => (
              <button key={c} type="button" aria-pressed={reason === c} onClick={() => setReason(c)}
                className={`rounded-full border px-2 py-0.5 text-[12px] font-bold ${reason === c ? 'border-red-300 bg-red-50 text-red-700' : 'border-slate-200 text-slate-600'}`}>{c}</button>
            ))}
          </div>
          <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="או סיבה חופשית…" aria-label="סיבת דחייה"
            className="rounded-lg border border-slate-200 px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-red-200" />
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={() => onReject(reason.trim())} data-testid="hub-reject-confirm"
              className="inline-flex items-center gap-1 rounded-xl bg-red-600 px-3 py-1.5 font-bold text-white hover:bg-red-700 disabled:opacity-60">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} דחה סופית
            </button>
            <button type="button" onClick={() => setRejecting(false)} className="rounded-xl border border-slate-200 px-3 py-1.5 font-bold text-slate-600">ביטול</button>
          </div>
        </div>
      )}
    </div>
  );
}
