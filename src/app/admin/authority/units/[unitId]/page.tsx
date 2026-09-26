'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc, setDoc, collection, query, where, getDocs, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, getStorage } from 'firebase/storage';
import { checkUserRole } from '@/features/admin/services/auth.service';
import { getAuthoritiesByManager, getAuthority } from '@/features/admin/services/authority.service';
import { authorityTypeToTenantType, getTenantLabels, VERTICAL_THEMES } from '@/features/admin/config/tenantLabels';
import { syncTenantUnitCount } from '@/features/admin/services/unit-count-sync.service';
import { createAccessCode, createBatchAccessCodes, getAccessCodesByTenant, type AccessCode as AccessCodeType } from '@/features/admin/services/access-code-admin.service';
import UnitIconBadge from '@/components/ui/UnitIconBadge';
import {
  Loader2, ArrowRight, Users, Dumbbell,
  Building2, ChevronLeft, Search,
  ChevronDown, Clock, User,
  KeyRound, Copy, Check, Plus, X, Download, Package,
  Shield, GraduationCap, Upload,
} from 'lucide-react';

// Same Storage instance pattern as src/app/admin/authorities/[id]/page.tsx's
// city-logo upload (07.09.2026 — reused verbatim, not a second upload path).
const storage = getStorage();

// ── Types ────────────────────────────────────────────────────────────

interface UnitMember {
  uid: string;
  name: string;
  unitPath: string[];
  globalXP: number;
  /** Slice C (25.09.2026, §13.27) — from /api/units/members' MemberEntry.
   *  null for military-declaration-free rows (non-military tenants) or
   *  anyone who predates the field. Drives the "מוצהרים" vs "חיילים"
   *  label below — see membersLabel's own comment. */
  unitMembershipSource: string | null;
}

interface SubUnit {
  id: string;
  name: string;
  memberCount: number;
  unitPath: string[];
  /** 07.09.2026 — was never fetched, so every sub-unit row rendered with a
   *  hardcoded generic icon even though this same page's own header already
   *  shows the current unit's real one (tenants/{orgId}/units/{id}.iconUrl,
   *  same field the header reads). */
  iconUrl: string | null;
}

// ── Page ─────────────────────────────────────────────────────────────

export default function UnitDrilldownPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const rawUnitId = params?.unitId as string;
  const unitId = rawUnitId;
  const urlTenantType = searchParams?.get('type') as 'municipal' | 'educational' | 'military' | null;
  const urlOrgId = searchParams?.get('org') as string | null;

  const [loading, setLoading] = useState(true);
  // Slice C (25.09.2026, §13.27) — the military-members fetch now goes
  // through /api/units/members (an authenticated HTTP call, unlike the
  // rest of this page's still-client-SDK reads), which can fail in ways
  // a bare console.error would hide entirely (David, explicit: no silent
  // blank screen). Retryable — see the error-state render below.
  const [membersLoadError, setMembersLoadError] = useState<string | null>(null);
  // Slice D (25.09.2026, §13.28) — the unit's own name/path/icon + its
  // sub-units now go through /api/units/structure (replaces the direct
  // client-SDK tenants/{t}/units/{u} doc read + parentUnitId query, both
  // gated by firestore.rules' hasTenant() — a custom-claim check never
  // actually set for any real user, so this read silently failed for
  // every real officer before this slice). David's explicit requirement:
  // a failure here must never look like "this unit has no sub-units" —
  // see the render below, and note subUnits.length===0 alone no longer
  // gates the Sub-Units section's visibility.
  const [structureLoadError, setStructureLoadError] = useState<string | null>(null);
  const [unitName, setUnitName] = useState<string>('');
  const [unitPath, setUnitPath] = useState<string[]>([]);
  const [subUnits, setSubUnits] = useState<SubUnit[]>([]);
  const [members, setMembers] = useState<UnitMember[]>([]);
  // Slice F (26.09.2026, §13.31) — per-member 7-day workout aggregate,
  // via GET /api/units/roster-workout-summary (keyed by uid). Replaces
  // the "לפרטים" placeholder Slice E left in the table after removing
  // the roster's own broken client-SDK workouts query. A fetch failure
  // is shown via rosterSummaryLoadError, never silently rendered as
  // "0 אימונים" for every row (David, explicit requirement) — see the
  // render below and rosterSummaryByUid's own lookup.
  const [rosterSummaryByUid, setRosterSummaryByUid] = useState<Record<string, { workoutsLast7Days: number; lastWorkoutDateThisWeek: string | null }>>({});
  const [rosterSummaryLoadError, setRosterSummaryLoadError] = useState<string | null>(null);
  const [tenantType, setTenantType] = useState<string>('municipal');
  const [searchTerm, setSearchTerm] = useState('');
  const [showAllMembers, setShowAllMembers] = useState(false);
  const [selectedMember, setSelectedMember] = useState<UnitMember | null>(null);
  const [memberWorkouts, setMemberWorkouts] = useState<any[]>([]);
  const [loadingWorkouts, setLoadingWorkouts] = useState(false);
  // Slice E (25.09.2026, §13.29) — a failed /api/units/member-workouts
  // fetch is shown here, never swallowed into "אין היסטוריית אימונים"
  // (David, explicit: a fetch failure must never impersonate a genuine
  // empty history). Distinct from loadingWorkouts/memberWorkouts — see
  // loadMemberWorkouts' own comment and the render below.
  const [workoutsLoadError, setWorkoutsLoadError] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState<string>('');
  const [showCodePanel, setShowCodePanel] = useState(false);
  const [codeMaxUses, setCodeMaxUses] = useState(50);
  const [codeExpiryDays, setCodeExpiryDays] = useState(30);
  const [codeLabel, setCodeLabel] = useState('');
  const [generatingCode, setGeneratingCode] = useState(false);
  const [generatedCodes, setGeneratedCodes] = useState<AccessCodeType[]>([]);
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);
  const [adminUid, setAdminUid] = useState<string>('');
  const [batchCount, setBatchCount] = useState(10);
  const [generatingBatch, setGeneratingBatch] = useState(false);
  // Slice C (25.09.2026, §13.27) — bumped by the error banner's "נסה שוב"
  // button to re-run the whole load effect below (matches how this page
  // already reloads everything on unitId change — no separate partial-
  // reload code path needed).
  const [retrySeq, setRetrySeq] = useState(0);
  const [showAddSubUnit, setShowAddSubUnit] = useState(false);
  const [newSubUnitName, setNewSubUnitName] = useState('');
  const [creatingSubUnit, setCreatingSubUnit] = useState(false);
  // Unit icon (military only, tenants/{orgId}/units/{unitId}.iconUrl) —
  // 07.09.2026, same field the icon-manifest import already writes.
  const [iconUrl, setIconUrl] = useState<string | null>(null);
  const [uploadingIcon, setUploadingIcon] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  useEffect(() => {
    if (!unitId) return;

    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { setLoading(false); return; }
      setAdminUid(user.uid);

      try {
        const auths = await getAuthoritiesByManager(user.uid);
        const authority = auths[0];
        if (urlOrgId) setTenantId(urlOrgId);
        else if (authority) setTenantId(authority.id);

        const activeTenantId = urlOrgId || authority?.id;

        // Local variable, not just the tenantType state — this same async
        // function needs the resolved value below (member-loading branch)
        // before React re-renders with the state update.
        let resolvedTenantType = 'municipal';
        if (activeTenantId) {
          try {
            const orgDoc = await getAuthority(activeTenantId);
            if (orgDoc) {
              resolvedTenantType = authorityTypeToTenantType(orgDoc);
            } else if (authority) {
              resolvedTenantType = authorityTypeToTenantType(authority);
            }
          } catch {
            if (authority) resolvedTenantType = authorityTypeToTenantType(authority);
          }
        } else if (authority) {
          resolvedTenantType = authorityTypeToTenantType(authority);
        }
        setTenantType(resolvedTenantType);

        // Safety net for old links/bookmarks that predate the units/page.tsx
        // fix routing municipal rows straight to neighborhoods/[id]. This
        // page's data model (tenants/{orgId}/units, core.unitId) doesn't
        // apply to municipal neighborhoods at all — they live in
        // `authorities` via parentAuthorityId, which neighborhoods/[id]
        // already handles correctly. Bail out before running any of the
        // queries below against the wrong collection/field.
        if (resolvedTenantType === 'municipal') {
          router.replace(`/admin/authority/neighborhoods/${unitId}`);
          return;
        }

        let resolvedUnitName = decodeURIComponent(rawUnitId);
        let resolvedUnitPath: string[] = [];

        // GET /api/units/structure (Slice D, §13.28) — one authenticated
        // call returns the unit itself PLUS its direct children, replacing
        // both the single-doc read above and the parentUnitId query below.
        // A fetch failure is shown via structureLoadError, never swallowed
        // into a name/path/icon that silently stays at its fallback and a
        // sub-units list that silently stays empty.
        setStructureLoadError(null);
        let structureUnits: Array<{
          unitId: string;
          name: string;
          unitPath: string[];
          parentUnitId: string | null;
          iconUrl: string | null;
          memberCount: number;
        }> = [];
        if (activeTenantId) {
          try {
            const token = await auth.currentUser?.getIdToken();
            if (!token) throw new Error('משתמש לא מחובר. רענן את הדף ונסה שוב.');
            const res = await fetch(
              `/api/units/structure?tenantId=${encodeURIComponent(activeTenantId)}&unitId=${encodeURIComponent(unitId)}`,
              { headers: { Authorization: `Bearer ${token}` } },
            );
            const body = await res.json().catch(() => ({}));
            if (!res.ok) {
              throw new Error(typeof body.error === 'string' ? body.error : `שגיאה בטעינת פרטי היחידה (${res.status})`);
            }
            structureUnits = Array.isArray(body.units) ? body.units : [];
          } catch (fetchErr) {
            console.error('[UnitDrilldown] /api/units/structure failed:', fetchErr);
            setStructureLoadError(
              fetchErr instanceof Error ? fetchErr.message : 'שגיאה בטעינת פרטי היחידה. נסה שוב.',
            );
          }
        }

        const ownEntry = structureUnits.find((u) => u.unitId === unitId);
        if (ownEntry) {
          resolvedUnitName = ownEntry.name;
          resolvedUnitPath = ownEntry.unitPath;
          setIconUrl(ownEntry.iconUrl);
        }

        setUnitName(resolvedUnitName);
        setUnitPath(resolvedUnitPath);

        // Military: sub-unit memberCount + the member roster below are
        // driven by POST /api/units/members (Slice C, 25.09.2026, §13.27)
        // — an authenticated, Admin-SDK-backed endpoint using
        // resolveUnitPermissionScope, replacing the prior direct client-SDK
        // read of military_declarations. That collection's firestore.rules
        // (`allow read: if isOwner(uid) || isAdmin()`) never recognized
        // tenant_owner/unit_admin at all — only root/super_admin's
        // isAdmin() bypass ever saw real data; a genuine unit officer's
        // read was silently rejected. Municipal/educational are
        // unaffected — untouched, still their own core.unitId-based path
        // below. A fetch failure here is shown, never swallowed (David,
        // explicit) — see membersLoadError's render below.
        setMembersLoadError(null);
        let apiUnitsBlocks: Array<{
          unitId: string;
          approvedMembers: Array<{ uid: string; name: string; unitMembershipSource: string | null }>;
        }> = [];
        if (resolvedTenantType === 'military' && activeTenantId) {
          try {
            const token = await auth.currentUser?.getIdToken();
            if (!token) throw new Error('משתמש לא מחובר. רענן את הדף ונסה שוב.');
            const res = await fetch(`/api/units/members?tenantId=${encodeURIComponent(activeTenantId)}`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) {
              throw new Error(typeof body.error === 'string' ? body.error : `שגיאה בטעינת חברי היחידה (${res.status})`);
            }
            apiUnitsBlocks = Array.isArray(body.units) ? body.units : [];
          } catch (fetchErr) {
            console.error('[UnitDrilldown] /api/units/members failed:', fetchErr);
            setMembersLoadError(
              fetchErr instanceof Error ? fetchErr.message : 'שגיאה בטעינת חברי היחידה. נסה שוב.',
            );
          }
        }
        const declaredCountsByUnit: Record<string, number> = {};
        apiUnitsBlocks.forEach((u) => { declaredCountsByUnit[u.unitId] = u.approvedMembers.length; });

        // Sub-units = every /api/units/structure result other than the
        // unit itself (its direct children — see that endpoint's own
        // doc comment). Military keeps sourcing memberCount from
        // declaredCountsByUnit (self-declared/approved roster counts,
        // unaffected by this slice); other tenant types fall back to the
        // structure endpoint's own memberCount passthrough field.
        const childEntries = structureUnits.filter((u) => u.unitId !== unitId);
        setSubUnits(childEntries.map((u) => ({
          id: u.unitId,
          name: u.name,
          memberCount: resolvedTenantType === 'military' ? (declaredCountsByUnit[u.unitId] ?? 0) : (u.memberCount ?? 0),
          unitPath: u.unitPath,
          iconUrl: u.iconUrl,
        })));

        // Member list: military sources uid/name/unitMembershipSource from
        // the API response above (already scoped+authorized — no separate
        // per-uid discovery query needed). Non-military tenants keep their
        // existing core.unitId query, untouched.
        const thisUnitBlock = apiUnitsBlocks.find((u) => u.unitId === unitId);
        const memberSources: Array<{ uid: string; name: string; unitMembershipSource: string | null }> =
          resolvedTenantType === 'military'
            ? (thisUnitBlock?.approvedMembers ?? []).map((m) => ({
                uid: m.uid,
                name: m.name,
                unitMembershipSource: m.unitMembershipSource,
              }))
            : (await getDocs(query(collection(db, 'users'), where('core.unitId', '==', unitId)))).docs.map((d) => ({
                uid: d.id,
                name: (d.data()?.core?.name as string | undefined) ?? 'ללא שם',
                unitMembershipSource: null,
              }));

        const membersList: UnitMember[] = [];
        for (const { uid, name, unitMembershipSource } of memberSources) {
          // unitPath/globalXP still need the user's own doc — unaffected
          // by the military_declarations fix (this read was never the
          // broken one for THIS purpose). Guarded anyway: a failure here
          // must degrade this one row, not abort the whole roster.
          // KNOWN, SEPARATE gap (Slice E, 25.09.2026, §13.29 — flagged, not
          // fixed, out of this slice's literal scope): users/{uid}'s own
          // rule (isOwner(uid)||isRootAdmin()||isAdmin(), no tenant_owner/
          // unit_admin branch) independently rejects this read for a real
          // officer too — same class of bug as the workouts read this
          // slice DOES fix below, different collection.
          let memberUnitPath: string[] = [];
          let globalXP = 0;
          try {
            const userSnap = await getDoc(doc(db, 'users', uid));
            const userData = userSnap.data() ?? {};
            const core = (userData.core ?? {}) as Record<string, any>;
            const progression = (userData.progression ?? {}) as Record<string, any>;
            memberUnitPath = core.unitPath ?? [];
            globalXP = typeof progression.globalXP === 'number' ? progression.globalXP : 0;
          } catch (userErr) {
            console.warn('[UnitDrilldown] per-member users/{uid} read failed, showing partial row:', uid, userErr);
          }

          // Slice E (25.09.2026, §13.29) — this row used to also carry
          // workoutCount/lastWorkoutDate, eagerly computed here via a
          // direct client-SDK read of the `workouts` collection (limit 5,
          // per uid, for EVERY member in the roster). That was the LAST
          // client-SDK read of `workouts` anywhere on this page, and it
          // was independently broken for a real officer (workouts/{docId}'s
          // rule has no unit_admin/tenant_owner branch at all — root/admin/
          // owner-only). Removed entirely rather than routed through
          // GET /api/units/member-workouts, because that endpoint is a
          // single-uid lookup by design (Task 4 Stage 4's own GPS-leak
          // fix) — calling it once per roster row here would mean N
          // network calls on every page load for a unit with N members.
          // Per-member workout stats now live ONLY in the "Soldier Detail
          // Sheet" below (loadMemberWorkouts, already wired to this same
          // endpoint since 24.09.2026), fetched once, on demand, when an
          // officer clicks into a specific member — not eagerly for the
          // whole roster. This is a visible change: the member table no
          // longer shows an "אימונים"/"פעילות אחרונה" column at a glance.
          membersList.push({
            uid,
            name,
            unitPath: memberUnitPath,
            globalXP,
            unitMembershipSource,
          });
        }

        setMembers(membersList);

        // Slice F (26.09.2026, §13.31) — restores the roster table's
        // "אימונים"/"פעילות אחרונה" columns via the new aggregate
        // endpoint, replacing the "לפרטים" placeholder Slice E left when
        // it removed the roster's own broken per-member client-SDK
        // workouts query. Applies to every tenant type reaching this
        // page (not just military), same as [unitId]/page.tsx's other
        // server-routed reads.
        setRosterSummaryLoadError(null);
        if (activeTenantId) {
          try {
            const token = await auth.currentUser?.getIdToken();
            if (!token) throw new Error('משתמש לא מחובר. רענן את הדף ונסה שוב.');
            const res = await fetch(
              `/api/units/roster-workout-summary?tenantId=${encodeURIComponent(activeTenantId)}&unitId=${encodeURIComponent(unitId)}`,
              { headers: { Authorization: `Bearer ${token}` } },
            );
            const body = await res.json().catch(() => ({}));
            if (!res.ok) {
              throw new Error(typeof body.error === 'string' ? body.error : `שגיאה בטעינת נתוני האימונים (${res.status})`);
            }
            const summaries: Array<{ uid: string; workoutsLast7Days: number; lastWorkoutDateThisWeek: string | null }> =
              Array.isArray(body.summaries) ? body.summaries : [];
            const byUid: Record<string, { workoutsLast7Days: number; lastWorkoutDateThisWeek: string | null }> = {};
            summaries.forEach((s) => { byUid[s.uid] = { workoutsLast7Days: s.workoutsLast7Days, lastWorkoutDateThisWeek: s.lastWorkoutDateThisWeek }; });
            setRosterSummaryByUid(byUid);
          } catch (fetchErr) {
            console.error('[UnitDrilldown] /api/units/roster-workout-summary failed:', fetchErr);
            setRosterSummaryByUid({});
            setRosterSummaryLoadError(
              fetchErr instanceof Error ? fetchErr.message : 'שגיאה בטעינת נתוני האימונים. נסה שוב.',
            );
          }
        }

        if (activeTenantId) {
          try {
            const allCodes = await getAccessCodesByTenant(activeTenantId);
            const unitCodes = allCodes.filter(c => c.unitId === unitId);
            setGeneratedCodes(unitCodes);
          } catch { /* ignore */ }
        }
      } catch (err) {
        console.error('[UnitDrilldown] load error:', err);
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, [unitId, retrySeq]);

  const labels = getTenantLabels(tenantType as any);
  const isSchoolContext = tenantType === 'educational';
  // "מוצהרים", not labels.membersTitle ("חיילים") — this roster is
  // self-declared (military_declarations), not verified (David, 05.09.2026,
  // same fix as the units list page's #18). Access-code copy elsewhere on
  // this page correctly keeps "חיילים" — a code produces a verified member,
  // not a declarant, so that wording is accurate as-is.
  const membersLabel = tenantType === 'military' ? 'מוצהרים' : labels.membersTitle;

  // tenantType is resolved via authorityTypeToTenantType(orgDoc) above, which
  // now checks tenantType/vertical before falling back to the type string —
  // it correctly returns all 5 verticals, not just military/educational.
  // Passing it straight through (previously collapsed to 'municipal' for
  // anything else, mislabeling company/youth_movement orgs — same class of
  // bug fixed in /admin/access-codes on 01.09.2026).
  const KNOWN_TENANT_TYPES = ['municipal', 'educational', 'military', 'company', 'youth_movement'] as const;
  const resolvedTenantType = KNOWN_TENANT_TYPES.includes(tenantType as any)
    ? (tenantType as 'municipal' | 'educational' | 'military' | 'company' | 'youth_movement')
    : null;

  const handleGenerateCode = async () => {
    if (!tenantId || !unitId || !resolvedTenantType) return; // unclassified org — refuse to guess
    setGeneratingCode(true);
    try {
      console.log('[UnitDrilldown] Generating code with tenantType:', resolvedTenantType, '(raw:', tenantType, ')');
      const newCode = await createAccessCode({
        tenantId,
        unitId,
        unitPath,
        tenantType: resolvedTenantType,
        maxUses: codeMaxUses,
        expiresInDays: codeExpiryDays,
        label: codeLabel || `${unitName} — קוד גישה`,
        adminUid,
      });
      setGeneratedCodes(prev => [newCode, ...prev]);
      setCodeLabel('');
    } catch (err) {
      console.error('Error generating code:', err);
    } finally {
      setGeneratingCode(false);
    }
  };

  const handleGenerateBatch = async () => {
    if (!tenantId || !unitId || batchCount < 1 || !resolvedTenantType) return; // unclassified org — refuse to guess
    setGeneratingBatch(true);
    try {
      console.log('[UnitDrilldown] Generating batch with tenantType:', resolvedTenantType, '(raw:', tenantType, ')');
      const newCodes = await createBatchAccessCodes({
        tenantId,
        unitId,
        unitPath,
        tenantType: resolvedTenantType,
        maxUses: 1,
        expiresInDays: codeExpiryDays,
        label: codeLabel || `${unitName} — חבילה`,
        adminUid,
      }, batchCount);
      setGeneratedCodes(prev => [...newCodes, ...prev]);
      setCodeLabel('');
    } catch (err) {
      console.error('Error generating batch:', err);
    } finally {
      setGeneratingBatch(false);
    }
  };

  const handleExportCodes = () => {
    const lines = ['קוד,סטטוס,משתמש,שימושים,תיאור'];
    generatedCodes.forEach(c => {
      const status = c.usageCount > 0 ? 'נוצל' : 'זמין';
      const user = c.lastUsedByDisplayName || (c.usageCount > 0 ? 'לא ידוע' : '—');
      lines.push(`${c.code},${status},${user},${c.usageCount}/${c.maxUses},${c.label ?? ''}`);
    });
    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `access-codes-${unitId}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyCode = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCodeId(id);
    setTimeout(() => setCopiedCodeId(null), 2000);
  };

  const filteredMembers = useMemo(() => {
    let list = members;
    if (searchTerm.trim()) {
      const q = searchTerm.trim().toLowerCase();
      list = list.filter(m => m.name.toLowerCase().includes(q));
    }
    if (!showAllMembers && list.length > 20) return list.slice(0, 20);
    return list;
  }, [members, searchTerm, showAllMembers]);

  // 24.09.2026 — routed through a server endpoint (GET /api/units/member-
  // workouts) instead of a direct client-SDK Firestore read. The old query
  // pulled the FULL workout document — including `routePath`, a raw GPS
  // coordinate array — into the browser for a named individual, and the
  // render below showed a per-workout "GPS" badge. That's the exact
  // individual-level geographic detail forbidden for this screen. The
  // server route never reads `routePath` at all (Admin-SDK `.select()`
  // field projection — the client SDK this page used has no equivalent),
  // so this isn't a display-layer hide, the data never crosses the wire.
  // Slice E (25.09.2026, §13.29) — this call itself was already correct;
  // what this slice added is (a) a visible workoutsLoadError instead of a
  // silent empty-array fallback on failure, and (b) this is now the ONLY
  // place on the page workout stats come from at all — the roster's own
  // eager per-row workouts query (a separate, direct client-SDK read) was
  // removed entirely, closing the last client-SDK `workouts` read on this
  // screen. See membersList.push's own comment for the removal.
  const loadMemberWorkouts = async (member: UnitMember) => {
    setSelectedMember(member);
    setLoadingWorkouts(true);
    // Slice E (25.09.2026, §13.29) — a failure here must be visible, not
    // silently swallowed into an empty memberWorkouts[] that renders
    // identically to "this soldier genuinely has no workouts" (David,
    // explicit requirement). Cleared on every new attempt so a retry
    // (re-clicking the same member) can recover.
    setWorkoutsLoadError(null);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error('משתמש לא מחובר. רענן את הדף ונסה שוב.');
      const idToken = await currentUser.getIdToken();
      const res = await fetch(`/api/units/member-workouts?uid=${encodeURIComponent(member.uid)}`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof body.error === 'string' ? body.error : `שגיאה בטעינת היסטוריית האימונים (${res.status})`);
      }
      setMemberWorkouts(Array.isArray(body.workouts) ? body.workouts : []);
    } catch (fetchErr) {
      console.error('[UnitDrilldown] /api/units/member-workouts failed:', fetchErr);
      setMemberWorkouts([]);
      setWorkoutsLoadError(
        fetchErr instanceof Error ? fetchErr.message : 'שגיאה בטעינת היסטוריית האימונים. נסה שוב.',
      );
    } finally {
      setLoadingWorkouts(false);
    }
  };

  const theme = VERTICAL_THEMES[(tenantType as 'municipal' | 'military' | 'educational')] ?? VERTICAL_THEMES.municipal;

  const currentDepth = unitPath.length;
  const nextHierarchyLabel = labels.hierarchyLabels[currentDepth + 1] ?? labels.subUnitSingular;

  // Slice E (25.09.2026, §13.29) — the Soldier Detail Sheet's header stats
  // (count + most recent date) are derived from memberWorkouts itself
  // (already fetched via /api/units/member-workouts) rather than from a
  // separate eager per-row field. GET /api/units/member-workouts caps at
  // 20 (its own design, unrelated to this slice) — "20+" is honest about
  // that cap rather than implying it's a lifetime total.
  const mostRecentWorkoutDateStr = typeof memberWorkouts[0]?.completedAtMs === 'number'
    ? new Date(memberWorkouts[0].completedAtMs).toLocaleDateString('he-IL', { day: 'numeric', month: 'short', year: 'numeric' })
    : null;
  const workoutCountLabel = memberWorkouts.length >= 20 ? '20+' : String(memberWorkouts.length);

  const handleCreateSubUnit = async () => {
    if (!newSubUnitName.trim() || !tenantId) return;
    setCreatingSubUnit(true);
    try {
      const trimmedName = newSubUnitName.trim();
      const slug = trimmedName.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
      const suffix = Math.random().toString(36).substring(2, 6);
      const subId = slug ? `${slug}_${suffix}` : `unit_${suffix}`;

      const parentPath = unitPath.length > 0 ? unitPath : [unitName];
      const childPath = [...parentPath, trimmedName];

      console.log('[UnitDrilldown] Creating sub-unit:', { subId, name: trimmedName, parentUnitId: unitId, childPath, tenantType: resolvedTenantType });

      await setDoc(doc(db, 'tenants', tenantId, 'units', subId), {
        name: trimmedName,
        parentUnitId: unitId,
        unitPath: childPath,
        memberCount: 0,
        createdAt: serverTimestamp(),
      });
      setSubUnits(prev => [...prev, { id: subId, name: trimmedName, memberCount: 0, unitPath: childPath, iconUrl: null }]);
      setNewSubUnitName('');
      setShowAddSubUnit(false);
      if (tenantId) syncTenantUnitCount(tenantId).catch(() => {});
    } catch (err) {
      console.error('[UnitDrilldown] Error creating sub-unit:', err);
    } finally {
      setCreatingSubUnit(false);
    }
  };

  // Icon upload/replace — same Storage-upload mechanics as authorities/[id]
  // page's handleLogoUpload (path template, uploadBytesResumable,
  // getDownloadURL), one deliberate difference: this page has no form/save
  // step to defer to (every other write here, e.g. handleCreateSubUnit
  // above, persists immediately) — so the Firestore write happens right
  // after the upload resolves, not stashed in local state pending a submit
  // that doesn't exist on this page (07.09.2026).
  const handleIconUpload = async (file: File) => {
    if (!tenantId || !unitId) return;
    try {
      setUploadingIcon(true);
      setUploadProgress(0);

      const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
      const path = `units/icons/${Date.now()}-${safeName}`;
      const storageRef = ref(storage, path);
      const uploadTask = uploadBytesResumable(storageRef, file);

      uploadTask.on(
        'state_changed',
        (snapshot) => {
          setUploadProgress(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100));
        },
        (error) => {
          console.error('[UnitDrilldown] Error uploading icon:', error);
          alert('שגיאה בהעלאת הסמל');
          setUploadingIcon(false);
        },
        async () => {
          try {
            const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
            await setDoc(doc(db, 'tenants', tenantId, 'units', unitId), {
              iconUrl: downloadUrl,
              updatedAt: serverTimestamp(),
            }, { merge: true });
            setIconUrl(downloadUrl);
          } catch (err) {
            console.error('[UnitDrilldown] Error saving icon:', err);
            alert('שגיאה בשמירת הסמל');
          } finally {
            setUploadingIcon(false);
            setUploadProgress(0);
          }
        },
      );
    } catch (error) {
      console.error('[UnitDrilldown] Error uploading icon:', error);
      alert('שגיאה בהעלאת הסמל');
      setUploadingIcon(false);
    }
  };

  // Revert to the automatic fallback badge, not an empty square — clearing
  // iconUrl is enough, UnitIconBadge already falls back on null by design.
  // Doesn't delete the old Storage object, matching handleLogoUpload's own
  // replace/remove behavior exactly (neither cleans up orphaned objects).
  const handleIconRemove = async () => {
    if (!tenantId || !unitId) return;
    try {
      await setDoc(doc(db, 'tenants', tenantId, 'units', unitId), {
        iconUrl: null,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      setIconUrl(null);
    } catch (err) {
      console.error('[UnitDrilldown] Error removing icon:', err);
      alert('שגיאה בהסרת הסמל');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div dir="rtl" className="space-y-6 pb-12 max-w-5xl mx-auto">
      {/* ═══ Breadcrumbs (uses hierarchyLabels for educational/military context) ═══ */}
      <nav className="flex items-center gap-1.5 text-sm text-slate-500 flex-wrap">
        <Link href={`/admin/authority/units${urlTenantType ? `?type=${urlTenantType}` : ''}`} className="hover:text-cyan-600 font-bold">
          {labels.subUnitsTitle}
        </Link>
        {unitPath.map((segment, i) => {
          const hierarchyLabel = labels.hierarchyLabels[i + 1] ?? '';
          const isLast = i === unitPath.length - 1;
          return (
            <span key={i} className="flex items-center gap-1.5">
              <ChevronLeft size={12} />
              <span className={isLast ? 'text-slate-800 font-black' : 'font-bold'}>
                {hierarchyLabel ? `${hierarchyLabel}: ` : ''}{segment}
              </span>
            </span>
          );
        })}
        {unitPath.length === 0 && (
          <>
            <ChevronLeft size={12} />
            <span className="text-slate-800 font-black">{unitName}</span>
          </>
        )}
      </nav>

      {/* Slice D (25.09.2026, §13.28) — a failed /api/units/structure
          fetch is shown here, never swallowed into a header that just
          keeps its fallback name and a Sub-Units section that looks
          identical to "this unit genuinely has none" (David, explicit
          requirement — a real 0 and a failure-0 must never look the
          same). */}
      {structureLoadError && (
        <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 flex items-center justify-between gap-3">
          <p className="text-sm text-red-700 font-semibold">{structureLoadError}</p>
          <button
            onClick={() => setRetrySeq((s) => s + 1)}
            className="text-xs font-bold text-red-700 bg-white border border-red-200 rounded-lg px-3 py-1.5 hover:bg-red-100 transition-colors flex-shrink-0"
          >
            נסה שוב
          </button>
        </div>
      )}

      {/* ═══ Header ═══ */}
      <div className={`flex items-center justify-between bg-white rounded-2xl shadow-sm border-l-4 border border-gray-100 p-6 ${theme.headerBorder}`}>
        <div className="flex items-center gap-4">
          {tenantType === 'military' ? (
            // Real icon (or its hash-colored fallback) + inline
            // upload/replace/remove — the fix for 102 battalions with no
            // icon, and every unit created through the add-unit mechanism
            // since (07.09.2026). Same UnitIconBadge component the units
            // list, HierarchySearchStep, and UnitLeagueTable all already use.
            <div className="relative flex-shrink-0">
              <UnitIconBadge unitId={unitId} iconUrl={iconUrl} name={unitName} size={56} />
              {iconUrl && !uploadingIcon && (
                <button
                  type="button"
                  onClick={handleIconRemove}
                  className="absolute -top-1 -left-1 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                  title="הסר סמל"
                >
                  <X size={10} />
                </button>
              )}
              <label
                className="absolute -bottom-1 -left-1 p-1.5 bg-white border border-gray-200 rounded-full cursor-pointer hover:bg-gray-50 transition-colors shadow-sm"
                title={iconUrl ? 'החלף סמל' : 'העלה סמל'}
              >
                <Upload size={11} className="text-gray-600" />
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleIconUpload(file);
                  }}
                  disabled={uploadingIcon}
                />
              </label>
              {uploadingIcon && (
                <div className="absolute inset-0 rounded-full bg-white/85 flex items-center justify-center">
                  <Loader2 size={18} className="animate-spin text-gray-500" />
                </div>
              )}
            </div>
          ) : (
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${theme.accentBg}`}>
              {tenantType === 'educational'
                ? <GraduationCap size={28} className={theme.accentText} />
                : <Building2 size={28} className={theme.accentText} />
              }
            </div>
          )}
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black text-gray-900">{unitName}</h1>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${theme.badgeBg} ${theme.badgeText}`}>
                {labels.orgTypeLabel}
              </span>
            </div>
            <p className="text-sm text-gray-500">
              {members.length} {membersLabel} · {subUnits.length} {labels.subUnitsTitle}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAddSubUnit(true)}
            className={`flex items-center gap-2 text-white text-sm font-bold px-4 py-2.5 rounded-xl transition-all ${
              tenantType === 'military' ? 'bg-lime-700 hover:bg-lime-800'
              : tenantType === 'educational' ? 'bg-orange-600 hover:bg-orange-700'
              : 'bg-blue-700 hover:bg-blue-800'
            }`}
          >
            <Plus size={14} />
            הוסף {nextHierarchyLabel}
          </button>
          <button
            onClick={() => setShowCodePanel(prev => !prev)}
            className="flex items-center gap-2 bg-cyan-50 hover:bg-cyan-100 text-cyan-700 text-sm font-bold px-4 py-2.5 rounded-xl transition-all"
          >
            <KeyRound size={14} />
            קודי גישה
          </button>
          <Link
            href={`/admin/authority/units${urlTenantType ? `?type=${urlTenantType}` : ''}`}
            className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold px-4 py-2.5 rounded-xl transition-all"
          >
            <ArrowRight size={14} />
            חזור
          </Link>
        </div>
      </div>

      {/* ═══ Add Sub-Unit Form ═══ */}
      {showAddSubUnit && (
        <div className={`bg-white rounded-2xl shadow-sm border-l-4 border border-gray-100 p-5 ${theme.headerBorder}`}>
          <h3 className="text-sm font-black text-gray-900 mb-3 flex items-center gap-2">
            <Plus size={16} className={theme.accentText} />
            הוסף {nextHierarchyLabel} תחת {unitName}
          </h3>
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={newSubUnitName}
              onChange={e => setNewSubUnitName(e.target.value)}
              placeholder={`שם ה${nextHierarchyLabel}`}
              className="flex-1 px-4 py-2.5 rounded-xl border-2 border-gray-200 text-sm focus:border-cyan-500 focus:ring-2 focus:ring-cyan-200 outline-none"
            />
            <button
              onClick={handleCreateSubUnit}
              disabled={!newSubUnitName.trim() || creatingSubUnit}
              className={`flex items-center gap-2 text-white text-sm font-bold px-5 py-2.5 rounded-xl transition-all disabled:opacity-50 ${
                tenantType === 'military' ? 'bg-lime-700 hover:bg-lime-800'
                : tenantType === 'educational' ? 'bg-orange-600 hover:bg-orange-700'
                : 'bg-blue-700 hover:bg-blue-800'
              }`}
            >
              {creatingSubUnit ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              צור
            </button>
            <button onClick={() => { setShowAddSubUnit(false); setNewSubUnitName(''); }} className="text-slate-400 hover:text-slate-600">
              <X size={18} />
            </button>
          </div>
        </div>
      )}

      {/* ═══ Access Code Generator ═══ */}
      {showCodePanel && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 bg-cyan-50 rounded-xl flex items-center justify-center">
                <KeyRound size={18} className="text-cyan-600" />
              </div>
              <div>
                <h2 className="text-base font-black text-gray-900">קודי גישה — {unitName}</h2>
                <p className="text-xs text-slate-500">קודים עבור {labels.membersTitle} להצטרפות ישירה ליחידה זו</p>
              </div>
            </div>
            {generatedCodes.length > 0 && (
              <button
                onClick={handleExportCodes}
                className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold px-4 py-2 rounded-xl transition-all"
              >
                <Download size={14} />
                ייצוא רשימה
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 rounded-xl p-4">
            <input
              type="text"
              value={codeLabel}
              onChange={e => setCodeLabel(e.target.value)}
              placeholder="תיאור (אופציונלי)"
              className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-cyan-300 focus:border-transparent"
            />
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-500 whitespace-nowrap">מקסימום שימושים:</label>
              <input
                type="number"
                min={1}
                value={codeMaxUses}
                onChange={e => setCodeMaxUses(Number(e.target.value))}
                className="w-20 px-2 py-2 rounded-lg border border-slate-200 text-sm text-center focus:ring-2 focus:ring-cyan-300"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-500 whitespace-nowrap">תוקף (ימים):</label>
              <input
                type="number"
                min={1}
                value={codeExpiryDays}
                onChange={e => setCodeExpiryDays(Number(e.target.value))}
                className="w-20 px-2 py-2 rounded-lg border border-slate-200 text-sm text-center focus:ring-2 focus:ring-cyan-300"
              />
            </div>
          </div>

          {!resolvedTenantType && (
            <p className="text-xs font-bold text-red-500 mb-2">
              לא ניתן להפיק קוד — לארגון הזה סיווג לא מזוהה (type/tenantType/vertical). תקנו את מסמך ה-tenant קודם.
            </p>
          )}
          <div className="flex items-center gap-3">
            <button
              onClick={handleGenerateCode}
              disabled={generatingCode || !resolvedTenantType}
              className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-bold px-5 py-2.5 rounded-xl transition-all disabled:opacity-50"
            >
              {generatingCode ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              הפק קוד בודד
            </button>

            <div className="flex items-center gap-2 bg-violet-50 rounded-xl px-3 py-1.5 border border-violet-200">
              <input
                type="number"
                min={2}
                max={100}
                value={batchCount}
                onChange={e => setBatchCount(Math.max(2, Math.min(100, Number(e.target.value))))}
                className="w-14 px-1 py-1 rounded-lg border border-violet-200 text-sm text-center bg-white focus:ring-2 focus:ring-violet-300"
              />
              <button
                onClick={handleGenerateBatch}
                disabled={generatingBatch || !resolvedTenantType}
                className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold px-4 py-2 rounded-xl transition-all disabled:opacity-50"
              >
                {generatingBatch ? <Loader2 size={14} className="animate-spin" /> : <Package size={14} />}
                הפק חבילת קודים (חד-פעמיים)
              </button>
            </div>
          </div>

          {generatedCodes.length > 0 && (
            <div className="bg-slate-50 rounded-xl overflow-hidden">
              <table className="w-full text-sm" dir="rtl">
                <thead>
                  <tr className="text-[11px] text-slate-400 font-bold border-b border-slate-200">
                    <th className="text-right py-2 px-3">קוד</th>
                    <th className="text-right py-2 px-3">שימושים</th>
                    <th className="text-right py-2 px-3">סטטוס / משתמש</th>
                    <th className="text-right py-2 px-3">תיאור</th>
                    <th className="text-right py-2 px-3 w-16"></th>
                  </tr>
                </thead>
                <tbody>
                  {generatedCodes.map(c => {
                    const isUsed = c.usageCount > 0;
                    return (
                      <tr key={c.id} className="border-b border-slate-100 last:border-b-0">
                        <td className="py-2.5 px-3">
                          <code dir="ltr" className="text-sm font-black text-slate-800 tracking-wider">{c.code}</code>
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="text-xs font-bold">{c.usageCount}/{c.maxUses}</span>
                        </td>
                        <td className="py-2.5 px-3">
                          {isUsed ? (
                            <span className="text-xs font-bold text-violet-600 flex items-center gap-1">
                              <User size={11} />
                              {c.lastUsedByDisplayName || 'משתמש'}
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                              זמין
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-xs text-slate-500">{c.label ?? '—'}</td>
                        <td className="py-2.5 px-3">
                          <button
                            onClick={() => copyCode(c.code, c.id)}
                            className="flex items-center gap-1 text-xs font-bold text-cyan-600 hover:text-cyan-800 transition-colors"
                          >
                            {copiedCodeId === c.id ? <Check size={12} /> : <Copy size={12} />}
                            {copiedCodeId === c.id ? 'הועתק' : 'העתק'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ═══ Sub-Units ═══ */}
      {/* Slice D (25.09.2026, §13.28) — a genuinely-empty list (no error)
          still renders nothing here, same as before. A structure-fetch
          failure is NOT re-signaled by this section at all — it's
          already shown unconditionally by the banner right below the
          breadcrumbs above (covers both this list and the unit's own
          name/path/icon, one failure, one message, not two). */}
      {subUnits.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-base font-black text-gray-900 px-1">{labels.subUnitsTitle}</h2>
          {subUnits.map(sub => (
            <Link
              key={sub.id}
              href={`/admin/authority/units/${sub.id}?type=${tenantType}&org=${tenantId}`}
              className="flex items-center justify-between bg-white rounded-2xl shadow-sm border border-gray-100 p-4 hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                {tenantType === 'military' ? (
                  // 07.09.2026 — this page's own header already shows the
                  // CURRENT unit's real icon; its sub-units below rendered
                  // with a hardcoded generic Shield instead of their own
                  // iconUrl — same inconsistency already fixed on the
                  // parent units list page, now fixed here too.
                  <UnitIconBadge unitId={sub.id} iconUrl={sub.iconUrl} name={sub.name} size={36} />
                ) : (
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                    tenantType === 'educational' ? 'bg-orange-50' : 'bg-slate-100'
                  }`}>
                    {tenantType === 'educational'
                      ? <GraduationCap size={16} className="text-orange-600" />
                      : <Building2 size={16} className="text-slate-600" />
                    }
                  </div>
                )}
                <p className="font-bold text-slate-800">{sub.name}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold text-cyan-600">{sub.memberCount}</span>
                <ChevronLeft size={16} className="text-slate-300" />
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* ═══ Members Table ═══ */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-cyan-50 rounded-xl flex items-center justify-center">
              <Users size={18} className="text-cyan-600" />
            </div>
            <h2 className="text-base font-black text-gray-900">
              {membersLabel} ({members.length})
            </h2>
          </div>
        </div>

        {/* Slice C (25.09.2026, §13.27) — a failed /api/units/members
            fetch is shown here, never swallowed into a silently-empty
            list (David, explicit requirement). An empty list WITH this
            banner reads very differently than an empty list alone. */}
        {membersLoadError && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200 flex items-center justify-between gap-3">
            <p className="text-sm text-red-700 font-semibold">{membersLoadError}</p>
            <button
              onClick={() => setRetrySeq((s) => s + 1)}
              className="text-xs font-bold text-red-700 bg-white border border-red-200 rounded-lg px-3 py-1.5 hover:bg-red-100 transition-colors flex-shrink-0"
            >
              נסה שוב
            </button>
          </div>
        )}

        <div className="relative mb-3">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder={`חפש ${labels.memberSingular}...`}
            className="w-full pr-9 pl-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300 focus:border-transparent"
          />
        </div>

        {filteredMembers.length === 0 ? (
          <div className="text-center py-8 text-slate-400">
            <Users className="w-8 h-8 mx-auto mb-2 text-slate-200" />
            <p className="text-sm font-bold">{searchTerm ? 'לא נמצאו תוצאות' : `אין ${membersLabel}`}</p>
          </div>
        ) : (
          <>
            <div className="bg-slate-50 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] text-slate-400 font-bold border-b border-slate-200">
                    <th className="text-right py-2 px-3 w-8">#</th>
                    <th className="text-right py-2 px-3">שם</th>
                    {isSchoolContext && <th className="text-right py-2 px-3">XP</th>}
                    {/* Slice F (26.09.2026, §13.31) — restored via
                        /api/units/roster-workout-summary, replacing the
                        "לפרטים" placeholder Slice E left after removing
                        the roster's own broken per-member client-SDK
                        workouts query. "7 ימים" in the header is load-
                        bearing, not decoration — this is a rolling weekly
                        count, never a lifetime total (see this endpoint's
                        own header comment for why streaks/lastActivityDate
                        was tried and rejected as a "last ever" source). */}
                    <th className="text-right py-2 px-3">אימונים (7 ימים)</th>
                    <th className="text-right py-2 px-3">פעילות אחרונה</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Slice F (26.09.2026, §13.31) — a roster-summary fetch
                      failure is shown here, once, above the table, never
                      silently rendered as "0 אימונים" on every row (David,
                      explicit requirement — see rosterSummaryLoadError's
                      own state comment). */}
                  {rosterSummaryLoadError && (
                    <tr>
                      <td colSpan={isSchoolContext ? 5 : 4} className="px-3 py-2">
                        <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 flex items-center justify-between gap-3">
                          <p className="text-sm text-red-700 font-semibold">{rosterSummaryLoadError}</p>
                          <button
                            onClick={() => setRetrySeq((s) => s + 1)}
                            className="text-xs font-bold text-red-700 bg-white border border-red-200 rounded-lg px-3 py-1.5 hover:bg-red-100 transition-colors flex-shrink-0"
                          >
                            נסה שוב
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                  {filteredMembers.map((m, i) => {
                    const summary = rosterSummaryByUid[m.uid];
                    const lastActiveStr = summary?.lastWorkoutDateThisWeek
                      ? new Date(summary.lastWorkoutDateThisWeek).toLocaleDateString('he-IL', { day: 'numeric', month: 'short' })
                      : null;
                    return (
                    <tr
                      key={m.uid}
                      onClick={() => loadMemberWorkouts(m)}
                      className="border-b border-slate-100 last:border-b-0 hover:bg-cyan-50/50 transition-colors cursor-pointer"
                    >
                      <td className="py-2.5 px-3 text-[11px] text-slate-400">{i + 1}</td>
                      <td className="py-2.5 px-3">
                        <span className="font-bold text-slate-800 flex items-center gap-1.5">
                          <User size={12} className="text-slate-400" />
                          {m.name}
                          {/* Slice C (25.09.2026, §13.27) — per-row now
                              that the source is per-member, not just a
                              section-wide approximation: a unit can mix
                              self-declared and code-verified members
                              (both write the same core.tenantId/unitId
                              pair) once self-declaration also populates
                              those fields. */}
                          {m.unitMembershipSource === 'self_declared' && (
                            <span className="text-[9px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">
                              מוצהר
                            </span>
                          )}
                        </span>
                      </td>
                      {isSchoolContext && (
                        <td className="py-2.5 px-3">
                          <span className="text-xs font-black text-amber-600">{m.globalXP.toLocaleString()}</span>
                        </td>
                      )}
                      <td className="py-2.5 px-3">
                        {rosterSummaryLoadError ? (
                          <span className="text-xs font-bold text-red-400">—</span>
                        ) : (
                          <span className="text-xs font-bold text-cyan-600">{summary?.workoutsLast7Days ?? 0}</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-[11px] text-slate-500">
                        {rosterSummaryLoadError ? (
                          <span className="text-red-400">—</span>
                        ) : (
                          lastActiveStr ?? '—'
                        )}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {members.length > 20 && !showAllMembers && !searchTerm && (
              <button
                onClick={() => setShowAllMembers(true)}
                className="mt-3 text-xs font-bold text-cyan-600 hover:text-cyan-800 flex items-center gap-1"
              >
                <ChevronDown size={12} />
                הצג את כל {members.length} ה{membersLabel}
              </button>
            )}
          </>
        )}
      </div>

      {/* ═══ Soldier Detail Sheet ═══ */}
      {selectedMember && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-cyan-50 rounded-2xl flex items-center justify-center">
                <User size={22} className="text-cyan-600" />
              </div>
              <div>
                <h2 className="text-lg font-black text-gray-900">{selectedMember.name}</h2>
                <p className="text-xs text-slate-500">
                  {loadingWorkouts ? (
                    'טוען נתוני אימונים...'
                  ) : workoutsLoadError ? (
                    <span className="text-red-600 font-bold">שגיאה בטעינת נתוני אימונים</span>
                  ) : (
                    <>{workoutCountLabel} אימונים אחרונים · פעילות אחרונה: {mostRecentWorkoutDateStr ?? '—'}</>
                  )}
                  {isSchoolContext && ` · ${selectedMember.globalXP.toLocaleString()} XP`}
                </p>
              </div>
            </div>
            <button
              onClick={() => setSelectedMember(null)}
              className="text-xs font-bold text-slate-400 hover:text-slate-600"
            >
              סגור
            </button>
          </div>

          {loadingWorkouts ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            </div>
          ) : workoutsLoadError ? (
            // Slice E (25.09.2026, §13.29) — a fetch failure is shown here,
            // never falling through to the "אין היסטוריית אימונים" branch
            // below (David, explicit: failure must never impersonate a
            // genuine empty history).
            <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 flex items-center justify-between gap-3">
              <p className="text-sm text-red-700 font-semibold">{workoutsLoadError}</p>
              <button
                onClick={() => loadMemberWorkouts(selectedMember)}
                className="text-xs font-bold text-red-700 bg-white border border-red-200 rounded-lg px-3 py-1.5 hover:bg-red-100 transition-colors flex-shrink-0"
              >
                נסה שוב
              </button>
            </div>
          ) : memberWorkouts.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-6">אין היסטוריית אימונים</p>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto scrollbar-thin">
              {memberWorkouts.map((w: any) => {
                const completedAt = typeof w.completedAtMs === 'number' ? new Date(w.completedAtMs) : null;
                const dateStr = completedAt
                  ? completedAt.toLocaleDateString('he-IL', { day: 'numeric', month: 'short', year: 'numeric' })
                  : '—';

                return (
                  <div key={w.id} className="bg-slate-50 rounded-xl p-4 flex items-center gap-4">
                    <div className="w-9 h-9 bg-violet-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Dumbbell size={16} className="text-violet-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-800 truncate">
                        {/* §13.30 (26.09.2026) — workoutTitle/type never
                            existed on any real workout doc; the endpoint's
                            corrected response carries workoutType only
                            (the real field, verified against production).
                            Same fallback shape as before, corrected field
                            name — not a new translation layer. */}
                        {w.workoutType ?? 'אימון'}
                      </p>
                      <div className="flex items-center gap-3 mt-0.5 text-[11px] text-slate-500">
                        <span className="flex items-center gap-0.5">
                          <Clock size={10} />
                          {dateStr}
                        </span>
                        {w.durationMinutes && (
                          <span>{Math.round(w.durationMinutes)} דק׳</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
