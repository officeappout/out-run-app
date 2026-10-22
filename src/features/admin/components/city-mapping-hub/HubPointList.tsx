'use client';

/**
 * HubPointList — the authority panel's lists of user contributions and of the
 * parks entered by the team (photo, type, equipment count, status). Clicking
 * an item focuses it on the map. `actions` (H3) renders approve / reject.
 * Data = the same loaded layer the map draws (no second read).
 */
import type { ReactNode } from 'react';
import type { HubLayerPayload } from '@/lib/city-mapping-hub/layer-payload';
import { CONTRIB_TYPE_LABELS, FACILITY_LABELS } from '../approval/approval-labels';
import { dateText } from './hub-display';

export interface HubPointItem {
  id: string;
  kind: string;
  properties: Record<string, unknown>;
  lngLat: [number, number];
}

export interface HubPointListProps {
  kind: 'contributions' | 'parks';
  payload: HubLayerPayload | undefined;
  loading: boolean;
  error?: string;
  selectedId: string | null;
  onFocus: (item: HubPointItem) => void;
  actions?: (item: HubPointItem) => ReactNode;
}

const s = (v: unknown) => (typeof v === 'string' && v ? v : null);
const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export function toItems(payload: HubLayerPayload | undefined): HubPointItem[] {
  return (payload?.featureCollection.features ?? []).flatMap((f) => {
    const p = (f.properties ?? {}) as Record<string, unknown>;
    const g = f.geometry as GeoJSON.Point | null;
    if (!g || g.type !== 'Point' || typeof p.id !== 'string') return [];
    return [{ id: p.id, kind: String(p.kind ?? ''), properties: p, lngLat: [g.coordinates[0], g.coordinates[1]] as [number, number] }];
  });
}

function subtitle(kind: HubPointListProps['kind'], p: Record<string, unknown>): string {
  const parts: string[] = [];
  if (kind === 'contributions') parts.push(CONTRIB_TYPE_LABELS[String(p.type)] ?? String(p.type ?? 'תרומה'));
  const fac = s(p.facilityType);
  if (fac) parts.push(FACILITY_LABELS[fac] ?? fac);
  if (n(p.equipmentCount)) parts.push(`${n(p.equipmentCount)} מתקנים`);
  if (kind === 'parks' && n(p.photoCount)) parts.push(`${n(p.photoCount)} תמונות`);
  if (s(p.issueType)) parts.push(String(p.issueType));
  if (n(p.rating)) parts.push(`${n(p.rating)}★`);
  return parts.join(' · ');
}

export default function HubPointList({ kind, payload, loading, error, selectedId, onFocus, actions }: HubPointListProps) {
  const items = toItems(payload);
  if (error) return <p role="alert" className="p-4 text-sm font-semibold text-red-700">{error}</p>;
  if (!payload && loading) return <p className="p-4 text-sm text-slate-500">טוען…</p>;
  if (!items.length) {
    return <p className="p-4 text-sm font-semibold text-slate-400">{kind === 'contributions' ? 'אין תרומות ממתינות עם רשות משויכת.' : 'אין מיקומים לרשות.'}</p>;
  }
  return (
    <ul className="flex flex-col divide-y divide-slate-100" data-testid={`hub-list-${kind}`}>
      {payload?.truncated && <li className="px-3 py-2 text-xs font-bold text-amber-800">מוצגים {items.length} מתוך {payload.total}</li>}
      {items.map((it) => {
        const p = it.properties;
        const photo = s(p.photo);
        const pending = p.status === 'pending';
        return (
          <li key={it.id} data-testid="hub-list-item" data-id={it.id} className={`flex items-start gap-3 px-3 py-2.5 ${selectedId === it.id ? 'bg-cyan-50' : ''}`}>
            <button type="button" onClick={() => onFocus(it)} className="flex min-w-0 flex-1 items-start gap-3 text-start">
              {photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photo} alt="" loading="lazy" className="h-12 w-12 shrink-0 rounded-lg bg-slate-100 object-cover" />
              ) : (
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[10px] font-bold text-slate-400">אין תמונה</span>
              )}
              <span className="min-w-0">
                <b className="block break-words text-[13px] font-extrabold">{s(p.name) ?? s(p.editSummary) ?? '(ללא שם)'}</b>
                <span className="block text-[12px] text-slate-500">{subtitle(kind, p)}</span>
                <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                  <span className={`rounded-full px-1.5 py-0.5 font-bold ${pending ? 'bg-orange-50 text-orange-700' : 'bg-emerald-50 text-emerald-700'}`}>{pending ? 'ממתין' : 'מאושר'}</span>
                  {s(p.createdAt) && <span className="text-slate-400">{dateText(s(p.createdAt))}</span>}
                </span>
              </span>
            </button>
            {actions?.(it)}
          </li>
        );
      })}
    </ul>
  );
}
