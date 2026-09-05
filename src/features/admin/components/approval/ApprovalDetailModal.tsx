'use client';

/**
 * ApprovalDetailModal — the single "verify before approve" surface for the
 * Approval Center. Click a queue row → this drawer opens, fetches the full
 * document, renders its real geometry on a read-only map (ApprovalPreviewMap)
 * plus name / city / entity-specific info, and exposes the same approve/reject
 * actions as the list.
 *
 * Reuses the established admin drawer pattern (backdrop z-[80] + right panel
 * z-[81], slide-in-from-right) — same shell as ParkDetailDrawer.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  X, Loader2, MapPin, Route as RouteIcon, Mountain, Users, ShieldCheck, Building2, AlertTriangle, Landmark, Edit,
} from 'lucide-react';
import type { ModerationEntityType } from '@/features/admin/services/moderation.service';
import dynamicImport from 'next/dynamic';
import type { PreviewGeometry } from './ApprovalPreviewMap';
import { normalizeStoredRoutePath } from '@/features/parks/core/utils/routePath';
import {
  CLIMB_TYPE_LABELS, CONTRIB_TYPE_LABELS, FACILITY_LABELS, ACTIVITY_LABELS,
  AMENITY_CATEGORY_LABELS, COURT_SPORT_LABELS, formatDistance, isRealStreetName,
} from './approval-labels';
import { getGymEquipment } from '@/features/content/equipment/gym/core/gym-equipment.service';
import type { GymEquipment } from '@/features/content/equipment/gym/core/gym-equipment.types';
import EquipmentCard from '@/features/parks/client/components/equipment-detail/EquipmentCard';

// Map is client-only (react-map-gl) — load lazily so the drawer shell renders instantly.
const ApprovalPreviewMap = dynamicImport(() => import('./ApprovalPreviewMap'), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-gray-100 animate-pulse" />,
});

const COLLECTION: Record<ModerationEntityType, string> = {
  park: 'parks',
  route: 'official_routes',
  climb: 'climb_segments',
  contribution: 'user_contributions',
  amenity: 'osm_amenities',
  pending_unit: 'pending_units',
};

const ENTITY_META: Record<ModerationEntityType, { label: string; icon: typeof MapPin; color: string; bg: string }> = {
  park: { label: 'מיקום', icon: MapPin, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  route: { label: 'מסלול', icon: RouteIcon, color: 'text-cyan-600', bg: 'bg-cyan-50' },
  climb: { label: 'עלייה', icon: Mountain, color: 'text-orange-600', bg: 'bg-orange-50' },
  contribution: { label: 'תרומת משתמש', icon: Users, color: 'text-purple-600', bg: 'bg-purple-50' },
  amenity: { label: 'נקודת עניין', icon: Landmark, color: 'text-teal-600', bg: 'bg-teal-50' },
  pending_unit: { label: 'יחידה ממתינה', icon: Building2, color: 'text-indigo-600', bg: 'bg-indigo-50' },
};

export interface ApprovalDetailItem {
  entityType: ModerationEntityType;
  id: string;
  title: string;
}

interface ApprovalDetailModalProps {
  item: ApprovalDetailItem | null;
  isSuperAdmin: boolean;
  processingId: string | null;
  onApprove: (entityType: ModerationEntityType, id: string) => void;
  onReject: (entityType: ModerationEntityType, id: string) => void;
  onClose: () => void;
}

// NaN is typeof 'number' — so coordinate guards MUST use Number.isFinite, not typeof.
const isFiniteNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Geometry build result:
 *   'ok'      — valid, renderable geometry
 *   'none'    — the entity legitimately has no map geometry (e.g. a review/report)
 *   'invalid' — coordinates were present but corrupt (NaN / non-finite) — a DATA
 *               problem the reviewer should NOT approve blindly. Logged with the id.
 */
type GeometryResult =
  | { status: 'ok'; geometry: PreviewGeometry }
  | { status: 'none' }
  | { status: 'invalid' };

// Build the read-only map geometry from a raw doc, per entity type. Logs and flags
// corrupt coordinates instead of forwarding NaN to a <Marker> (which throws).
function buildGeometry(entityType: ModerationEntityType, id: string, x: any): GeometryResult {
  if (!x) return { status: 'none' };
  const warn = (detail: unknown) => {
    console.warn(`[ApprovalCenter] corrupt geometry — ${entityType} ${id}:`, detail);
    return { status: 'invalid' as const };
  };

  switch (entityType) {
    case 'park':
    case 'contribution': {
      const loc = x.location || x.coordinates || null;
      const lat = loc?.lat ?? x.lat;
      const lng = loc?.lng ?? x.lng;
      // A contribution with no coords at all is legitimately map-less; a park is not.
      if (lat == null && lng == null) return { status: entityType === 'contribution' ? 'none' : 'invalid' };
      if (!isFiniteNum(lat) || !isFiniteNum(lng)) return warn({ lat, lng });
      return { status: 'ok', geometry: { kind: 'point', lat, lng } };
    }
    case 'amenity': {
      const lat = x.location?.lat;
      const lng = x.location?.lng;
      if (!isFiniteNum(lat) || !isFiniteNum(lng)) return warn({ lat, lng });
      return { status: 'ok', geometry: { kind: 'point', lat, lng } };
    }
    case 'route': {
      // Reuse the SAME normaliser the app/inventory uses — official_routes.path is
      // stored as {lng,lat} objects, so a raw read must go through this or it
      // false-positives as corrupt. Only genuinely broken geometry hits `warn`.
      const path = normalizeStoredRoutePath(x.path);
      const rawLen = Array.isArray(x.path) ? x.path.length : 0;
      if (path.length < rawLen) console.warn(`[ApprovalCenter] route ${id}: dropped ${rawLen - path.length} non-finite path point(s)`);
      if (path.length < 2) return warn({ rawLen, validLen: path.length });
      return { status: 'ok', geometry: { kind: 'route', path } };
    }
    case 'climb': {
      const c = x.center, b = x.bbox;
      if (!c && !b) return { status: 'invalid' };
      if (!isFiniteNum(c?.lat) || !isFiniteNum(c?.lng)
        || !isFiniteNum(b?.minLat) || !isFiniteNum(b?.maxLat)
        || !isFiniteNum(b?.minLng) || !isFiniteNum(b?.maxLng)) return warn({ center: c, bbox: b });
      // Steep sub-line (stored as [lng,lat]); reuse the route normaliser. Absent on
      // pre-backfill docs → line omitted, preview falls back to the bbox rectangle.
      const line = normalizeStoredRoutePath(x.geometry);
      return { status: 'ok', geometry: { kind: 'climb', center: c, bbox: b, line: line.length >= 2 ? line : undefined } };
    }
    case 'pending_unit':
      // No map geometry — a unit submission is a name + parent chain, nothing spatial.
      return { status: 'none' };
  }
}

// Entity-specific info rows (label → value), skipping empty values.
function infoRows(entityType: ModerationEntityType, x: any): Array<[string, string]> {
  if (!x) return [];
  const rows: Array<[string, string | undefined]> = [];
  switch (entityType) {
    case 'park':
      rows.push(
        ['סוג מתקן', FACILITY_LABELS[x.facilityType] || x.facilityType],
        ['עיר', x.city],
        ['תיאור', x.description],
      );
      break;
    case 'route':
      rows.push(
        ['מרחק', formatDistance(x.distance)],
        ['פעילות', ACTIVITY_LABELS[x.activityType] || x.activityType],
        ['רמת קושי', x.difficulty],
        ['עיר', x.city],
        ['נקודות מסלול', Array.isArray(x.path) ? String(x.path.length) : undefined],
        ['עלייה מצטברת', x.elevationGain != null ? `${x.elevationGain} מ׳` : undefined],
        ['שיפוע מקסימלי', x.maxGrade != null ? `${x.maxGrade}%` : undefined],
        ['עליות בסביבה', Array.isArray(x.terrainFeatures) && x.terrainFeatures.length > 0 ? `${x.terrainFeatures.length}` : undefined],
      );
      break;
    case 'climb':
      rows.push(
        ['סוג עלייה', CLIMB_TYPE_LABELS[x.climbType] || x.climbType],
        ['אורך', typeof x.lengthM === 'number' ? `${x.lengthM} מ׳` : undefined],
        ['שיפוע ממוצע', x.avgGrade != null ? `${x.avgGrade}%` : undefined],
        ['שיפוע מקסימלי', x.maxGrade != null ? `${x.maxGrade}%` : undefined],
        ['כיוון', x.dir],
        ['רחוב', isRealStreetName(x.wayName) ? x.wayName : undefined],
        ['מדרגות', x.stepCount != null ? String(x.stepCount) : undefined],
        ['עיר', x.city],
      );
      break;
    case 'contribution':
      rows.push(
        ['סוג תרומה', CONTRIB_TYPE_LABELS[x.type] || x.type],
        ['פארק', x.parkName],
        ['סוג מתקן', x.facilityType ? FACILITY_LABELS[x.facilityType] || x.facilityType : undefined],
        ['הערה', x.note || x.description],
      );
      break;
    case 'amenity':
      rows.push(
        ['סוג מתקן', AMENITY_CATEGORY_LABELS[x.category] || x.category],
        ['ענף ספורט', x.sport ? (COURT_SPORT_LABELS[x.sport] || x.sport) : undefined],
        ['עיר', x.city],
        ['שם', x.name || undefined],
        // Visible even outside the dedicated suppressed sub-view — a reviewer
        // opening any rejected amenity's detail should see why immediately.
        ['הוסתר אוטומטית', x.suppressedDuplicateOfParkId ? `כפילות אפשרית של פארק ${x.suppressedDuplicateOfParkId}` : undefined],
      );
      break;
    case 'pending_unit': {
      const levelLabel: Record<string, string> = { brigade: 'חטיבה', battalion: 'גדוד', company: 'פלוגה' };
      rows.push(
        ['רמה', levelLabel[x.level] || x.level],
        ['תחת', Array.isArray(x.parentUnitPath) && x.parentUnitPath.length > 0 ? x.parentUnitPath.join(' / ') : (x.orgId ? undefined : 'חטיבה חדשה')],
        ['מזהה מחושב', x.computedUnitId],
        ['הוגש ע״י', x.submittedBy],
      );
      break;
    }
  }
  return rows.filter((r): r is [string, string] => typeof r[1] === 'string' && r[1].trim().length > 0);
}

export default function ApprovalDetailModal({
  item, isSuperAdmin, processingId, onApprove, onReject, onClose,
}: ApprovalDetailModalProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    if (!item) { setData(null); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const snap = await getDoc(doc(db, COLLECTION[item.entityType], item.id));
        if (!cancelled) setData(snap.exists() ? snap.data() : null);
      } catch (err) {
        console.error('[ApprovalDetailModal] load failed:', err);
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [item]);

  // G4: resolve the user-proposed equipment (contribution only) into full docs
  // for a read-only preview, so the reviewer sees what was suggested.
  const [equip, setEquip] = useState<Array<{ eq: GymEquipment; brandName: string }>>([]);
  useEffect(() => {
    const list: Array<{ equipmentId: string; brandName?: string }> =
      item?.entityType === 'contribution' && Array.isArray(data?.gymEquipment) ? data.gymEquipment : [];
    if (list.length === 0) { setEquip([]); return; }
    let cancelled = false;
    Promise.all(
      list.map((g) =>
        getGymEquipment(g.equipmentId)
          .then((eq) => (eq ? { eq, brandName: g.brandName || '' } : null))
          .catch(() => null),
      ),
    ).then((items) => {
      if (!cancelled) setEquip(items.filter(Boolean) as Array<{ eq: GymEquipment; brandName: string }>);
    });
    return () => { cancelled = true; };
  }, [data, item]);

  if (!item) return null;

  const meta = ENTITY_META[item.entityType];
  const geo = buildGeometry(item.entityType, item.id, data);
  const rows = infoRows(item.entityType, data);
  const isProcessing = processingId === item.id;

  return (
    <>
      <div className="fixed inset-0 z-[80] bg-black/40 backdrop-blur-sm transition-opacity" onClick={onClose} />

      <div className="fixed top-0 bottom-0 right-0 z-[81] w-full max-w-md bg-white shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-300" dir="rtl">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div className={`w-10 h-10 rounded-xl ${meta.bg} flex items-center justify-center ${meta.color} flex-shrink-0`}>
            <meta.icon size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-black text-gray-900 text-base truncate">{item.title}</p>
            <p className="text-xs text-gray-400">{meta.label} · ממתין לאישור</p>
          </div>
          {item.entityType === 'route' && (
            // Canonical route editor door (route-editor-scoping-spec.md "one editor, many
            // doors") — visible to authority managers too, not gated behind isSuperAdmin like
            // Approve/Reject below: the target editor's own gate already allows superAdmin OR
            // authorityManager, so this button just matches that, not the stricter approve gate.
            <button
              onClick={() => router.push(`/admin/authority/routes/${item.id}/edit`)}
              className="w-9 h-9 rounded-full bg-cyan-50 text-cyan-600 flex items-center justify-center hover:bg-cyan-100 transition-colors flex-shrink-0"
              title="ערוך מסלול"
            >
              <Edit size={16} />
            </button>
          )}
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center hover:bg-gray-200 transition-colors flex-shrink-0">
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-cyan-500" />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {/* Map preview */}
            <div className="h-64 w-full bg-gray-100 flex-shrink-0">
              {geo.status === 'ok' ? (
                <ApprovalPreviewMap key={item.id} geometry={geo.geometry} />
              ) : geo.status === 'invalid' ? (
                <div className="h-full w-full flex flex-col items-center justify-center gap-2 text-red-500 bg-red-50/50">
                  <AlertTriangle size={32} />
                  <p className="text-sm font-black">מיקום לא תקין — דאטה פגומה</p>
                  <p className="text-xs text-red-400 px-6 text-center">הקואורדינטות חסרות או פגומות (NaN). לא מומלץ לאשר פריט זה.</p>
                </div>
              ) : (
                <div className="h-full w-full flex flex-col items-center justify-center gap-2 text-gray-400">
                  <MapPin size={32} />
                  <p className="text-xs font-bold">אין נתוני מיקום להצגה</p>
                </div>
              )}
            </div>

            {/* Info rows */}
            <div className="p-5 space-y-3">
              {data == null ? (
                <p className="text-sm text-gray-400 text-center py-6">הפריט לא נמצא או נמחק</p>
              ) : rows.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">אין פרטים נוספים</p>
              ) : (
                rows.map(([label, value]) => (
                  <div key={label} className="flex items-start justify-between gap-4 text-sm">
                    <span className="text-gray-400 font-bold flex-shrink-0">{label}</span>
                    <span className="text-gray-900 text-right">{value}</span>
                  </div>
                ))
              )}
            </div>

            {/* G4: read-only preview of user-proposed equipment (contribution only). */}
            {equip.length > 0 && (
              <div className="px-5 pb-5">
                <h4 className="text-xs font-bold text-gray-400 mb-2">מתקנים שהוצעו ({equip.length})</h4>
                <div className="grid grid-cols-2 gap-2">
                  {equip.map(({ eq, brandName }) => (
                    <EquipmentCard key={eq.id} equipment={eq} brandName={brandName} rightSlot="none" />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        {isSuperAdmin && (
          <div className="flex items-center gap-3 px-5 py-4 border-t border-gray-100 flex-shrink-0">
            <button
              onClick={() => onApprove(item.entityType, item.id)}
              disabled={isProcessing}
              className="flex-1 flex items-center justify-center gap-2 bg-green-500 hover:bg-green-600 text-white text-sm font-bold py-3 rounded-2xl transition-all disabled:opacity-60 shadow-sm"
            >
              {isProcessing ? <Loader2 className="animate-spin" size={16} /> : <ShieldCheck size={16} />}
              {isProcessing ? 'מעבד...' : 'אשר'}
            </button>
            <button
              onClick={() => onReject(item.entityType, item.id)}
              disabled={isProcessing}
              className="flex items-center justify-center gap-2 bg-white border border-red-200 text-red-600 hover:bg-red-50 text-sm font-bold px-6 py-3 rounded-2xl transition-all disabled:opacity-60"
            >
              <X size={16} /> דחה
            </button>
          </div>
        )}

        {!isSuperAdmin && (
          <div className="flex items-center gap-2 px-5 py-4 border-t border-gray-100 text-xs text-gray-400 flex-shrink-0">
            <Building2 size={14} /> אישור מתבצע ע״י מנהל ראשי
          </div>
        )}
      </div>
    </>
  );
}
