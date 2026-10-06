'use client';

import { useState, useEffect, useRef } from 'react';
import { UserPlus, Mail, Loader2, X, Copy, Check, Camera, Shield } from 'lucide-react';
import { getChildrenByParent, getAllAuthorities } from '@/features/admin/services/authority.service';
import { getTenantLabels } from '@/features/admin/config/tenantLabels';
import type { InvitationRole } from '@/types/invitation.type';
import type { TenantType } from '@/types/admin-types';
import type { Authority } from '@/types/admin-types';
import SearchableSelect from '@/features/admin/components/SearchableSelect';
import { storage, auth } from '@/lib/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { isRootAdmin } from '@/config/feature-flags';
import type { AdminUser } from '@/features/admin/services/admin-management.service';

interface RoleOption {
  value: InvitationRole;
  label: string;
  requiresScope?: 'unit' | 'authority' | 'allAuthorities';
}

// SPEC-PERMISSIONS-MODEL.md §7/§8 — every option below MUST correspond to
// a role the server actually accepts — offering anything else is exactly
// the "server rejects it, must never be shown" bug this table originally
// fixed (22.09.2026 follow-up audit, commit bdcc3c6c). At THAT time,
// POST /api/admin/invitations only accepted authority_manager and
// platform_member, so tenant_owner/unit_admin were removed outright for
// military/educational rather than left to fail server-side.
//
// THIS IS NO LONGER TRUE as of 25.09.2026 (commits 35943ecb, 571cb895 —
// both land AFTER bdcc3c6c, confirmed via `git merge-base --is-ancestor`):
// the server gained real tenant_owner/unit_admin support (the
// military/school persona-unit-unification build, resolveUnitPermissionScope
// et al. — docs/audit-2026-09/00-MASTER-PLAN.md §13.25 onward) and this
// table was simply never updated to match — a genuine regression-by-
// omission, not a deliberate scoping decision, confirmed via a 26.09.2026
// investigation (docs/audit-2026-09/00-MASTER-PLAN.md §13.34) that found
// zero real tenant_owner/unit_admin invitations ever created through this
// UI in production. Restored here (§13.35): tenant_owner needs no scope
// picker (the invitee manages the WHOLE tenant, matching context.tenantId
// — see the `invData.tenantId` assignment below). unit_admin's own scope
// picker is now sourced from GET /api/units/structure (Slice D, already
// built/tested/live) instead of getChildrenByParent's authorities-based
// query, which returns the WRONG collection entirely for these verticals
// (real units live in tenants/{t}/units, never as authorities docs with
// parentAuthorityId — confirmed empirically: 0 of 48 real military_unit
// authorities in production have any authorities-children at all).
// company/youth_movement stay empty — no persona-drawer unit-hierarchy
// question exists for those verticals (unchanged from the original audit).
// 01.10.2026 (00-MASTER-PLAN.md §13.61) — military's two labels below now
// come from tenantLabels.ts's TENANT_LABELS.military.{tenantOwnerRoleLabel,
// unitAdminRoleLabel} instead of hardcoded strings — David's exact
// requested titles, through the existing label mechanism rather than a
// one-off edit here. Every other vertical's options are untouched.
const MILITARY_LABELS = getTenantLabels('military');

const ROLE_OPTIONS_BY_CONTEXT: Record<TenantType | 'platform', RoleOption[]> = {
  military: [
    { value: 'tenant_owner', label: MILITARY_LABELS.tenantOwnerRoleLabel ?? 'בעל הגוף (מפקד ראשי)' },
    { value: 'unit_admin', label: MILITARY_LABELS.unitAdminRoleLabel ?? 'מנהל יחידה (מפקד)', requiresScope: 'unit' },
  ],
  municipal: [
    { value: 'authority_manager', label: 'מנהל רשות (עיר)' },
  ],
  educational: [
    { value: 'tenant_owner', label: 'בעל הגוף (מנהל בית ספר)' },
    { value: 'unit_admin', label: 'מנהל יחידה', requiresScope: 'unit' },
  ],
  company: [],
  youth_movement: [],
  platform: [
    { value: 'authority_manager', label: 'מנהל רשות (עיר)', requiresScope: 'allAuthorities' },
    { value: 'platform_member', label: 'חבר צוות — גישה לפי סקשנים' },
    // 06.10.2026 ("chief fitness officer") — no scope picker, root-gated
    // server-side (POST /api/admin/invitations), exactly like
    // authority_manager/platform_member above. Deliberately NOT under
    // `military:` above — this role is not tied to any one brigade's
    // context.tenantId, so it doesn't belong on the per-authority team
    // page at all; granted from here instead, same as every other
    // not-tied-to-one-tenant role.
    { value: 'readiness_chief_officer', label: 'קצין כושר ראשי (כל החטיבות)' },
  ],
};

// Section definitions for platform (OUT team) invites
const SECTION_DEFS: { key: string; label: string }[] = [
  { key: 'strategy',    label: 'אסטרטגיה / מנהלים' },
  { key: 'municipal',   label: 'רשויות עירוניות' },
  { key: 'military',    label: 'מגזר צבאי' },
  { key: 'educational', label: 'חינוך' },
  { key: 'platform',    label: 'פלטפורמה / ארגונים' },
  { key: 'appCore',     label: 'אפליקציה / מוצר' },
  { key: 'running',     label: 'ריצה / OUTRUN' },
  { key: 'production',  label: 'תוכן ופרסום' },
  { key: 'brandComm',   label: 'מיתוג ותקשורת' },
  { key: 'system',      label: 'מערכת / טכני' },
];

const ALL_SECTIONS = SECTION_DEFS.map(s => s.key);

const SECTION_PRESETS: Record<string, string[]> = {
  'מנכ"ל':         ALL_SECTIONS,
  'מכירות':        ['municipal', 'military', 'educational', 'platform', 'strategy'],
  'הצלחת לקוח':   ['municipal', 'military', 'educational', 'platform'],
  'תוכן':          ['production', 'brandComm', 'appCore'],
  'מוצר':          ['appCore', 'running', 'system'],
  'מערכת':         ['system', 'appCore'],
};

const VERTICAL_OPTIONS: { value: 'military' | 'municipal' | 'educational'; label: string }[] = [
  { value: 'military', label: 'צבאי' },
  { value: 'municipal', label: 'עירוני' },
  { value: 'educational', label: 'חינוכי' },
];

export interface InviteMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  context: {
    tenantType?: TenantType;
    authorityId?: string;
    tenantId?: string;
    organizationName?: string;
  };
  callerInfo: {
    adminId: string;
    adminName: string;
    adminEmail: string;
    callerAuthorityId?: string;
  };
  onSuccess?: (result: { inviteLink: string }) => void;
  /** When set: opens in edit mode, pre-fills fields, calls onEdit instead of createInvitation */
  editTarget?: AdminUser;
  onEdit?: (updates: {
    role?: 'super_admin' | 'vertical_admin';
    managedVertical?: string | null;
    allowedSections: string[];
    photoURL?: string | null;
  }) => Promise<void>;
}

export default function InviteMemberModal({
  isOpen,
  onClose,
  context,
  callerInfo,
  onSuccess,
  editTarget,
  onEdit,
}: InviteMemberModalProps) {
  const isEditMode = !!editTarget;
  const callerCanChangeRole = isRootAdmin(callerInfo.adminEmail);
  const [email, setEmail] = useState('');
  const [selectedRole, setSelectedRole] = useState<InvitationRole | ''>('');
  const [selectedVertical, setSelectedVertical] = useState<'military' | 'municipal' | 'educational' | ''>('');
  const [selectedScopeId, setSelectedScopeId] = useState('');
  // requiresScope: 'authority' — currently unused by any real option in
  // ROLE_OPTIONS_BY_CONTEXT (kept as-is, untouched, in case a future
  // option needs it) — sourced from getChildrenByParent (authorities-
  // based children), correct for THAT use case.
  const [childEntities, setChildEntities] = useState<Authority[]>([]);
  const [loadingChildren, setLoadingChildren] = useState(false);
  // requiresScope: 'unit' — unit_admin's own scope picker (§13.35,
  // 26.09.2026). Sourced from GET /api/units/structure (Slice D, already
  // built/tested/live), NOT getChildrenByParent — the units this picker
  // needs to list live in tenants/{tenantId}/units, never as authorities
  // docs with parentAuthorityId (confirmed empirically: 0 of 48 real
  // military_unit authorities in production have any authorities-
  // children at all — see docs/audit-2026-09/00-MASTER-PLAN.md §13.34).
  // A fetch failure is surfaced via structureUnitsError, never silently
  // shown as "this tenant has no units" (same discipline as every other
  // /api/units/structure consumer this month).
  const [structureUnits, setStructureUnits] = useState<{ id: string; name: string }[]>([]);
  const [loadingStructureUnits, setLoadingStructureUnits] = useState(false);
  const [structureUnitsError, setStructureUnitsError] = useState<string | null>(null);
  // authority_manager in the 'platform' context (no pre-set context.authorityId
  // to scope children from — root picks any city directly) needs the full
  // authorities list, not getChildrenByParent's parent-scoped one.
  const [allAuthorities, setAllAuthorities] = useState<Authority[]>([]);
  const [loadingAllAuthorities, setLoadingAllAuthorities] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [resultLink, setResultLink] = useState<string | null>(null);
  const [emailSendError, setEmailSendError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Platform-only: section access + avatar + team role label
  const [allowedSections, setAllowedSections] = useState<string[]>([]);
  const [teamRole, setTeamRole] = useState('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const modeKey: TenantType | 'platform' = context.tenantType ?? 'platform';
  const roleOptions = ROLE_OPTIONS_BY_CONTEXT[modeKey];
  // §13.40 — every string derived from this is reachable ONLY when
  // requiresScope==='unit' (military/educational unit_admin), never for
  // municipal (municipal has no such scope) — safe to vary freely.
  const labels = getTenantLabels(context.tenantType);

  useEffect(() => {
    if (!isOpen) {
      setEmail('');
      setSelectedRole('');
      setSelectedVertical('');
      setSelectedScopeId('');
      setError('');
      setResultLink(null);
      setCopied(false);
      setAllowedSections([]);
      setTeamRole('');
      setAvatarFile(null);
      setAvatarPreview(null);
    } else if (editTarget) {
      setEmail(editTarget.email || '');
      const roleVal: InvitationRole | '' = editTarget.isSuperAdmin
        ? 'super_admin'
        : editTarget.isVerticalAdmin
          ? 'vertical_admin'
          : editTarget.isPlatformMember
            ? 'platform_member'
            : '';
      setSelectedRole(roleVal);
      setSelectedVertical((editTarget.managedVertical as any) || '');
      setSelectedScopeId('');
      setAllowedSections(editTarget.allowedSections || []);
      setTeamRole(editTarget.teamRole || '');
      setAvatarFile(null);
      setAvatarPreview(editTarget.photoURL || null);
      setError('');
      setResultLink(null);
      setCopied(false);
    }
  }, [isOpen, editTarget]);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    const url = URL.createObjectURL(file);
    setAvatarPreview(url);
  };

  const toggleSection = (key: string) => {
    setAllowedSections(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key],
    );
  };

  const currentRoleOption = roleOptions.find(r => r.value === selectedRole);

  useEffect(() => {
    if (currentRoleOption?.requiresScope !== 'authority') {
      setChildEntities([]);
      return;
    }
    const parentId = context.authorityId || context.tenantId;
    if (!parentId) return;

    let cancelled = false;
    setLoadingChildren(true);
    getChildrenByParent(parentId).then(children => {
      if (!cancelled) {
        setChildEntities(children);
        setLoadingChildren(false);
      }
    }).catch(() => {
      if (!cancelled) setLoadingChildren(false);
    });
    return () => { cancelled = true; };
  }, [currentRoleOption?.requiresScope, context.authorityId, context.tenantId]);

  useEffect(() => {
    if (currentRoleOption?.requiresScope !== 'unit') {
      setStructureUnits([]);
      setStructureUnitsError(null);
      return;
    }
    const tenantId = context.tenantId || context.authorityId;
    if (!tenantId) return;

    let cancelled = false;
    setLoadingStructureUnits(true);
    setStructureUnitsError(null);
    (async () => {
      try {
        const currentUser = auth.currentUser;
        if (!currentUser) throw new Error('משתמש לא מחובר. רענן את הדף ונסה שוב.');
        const idToken = await currentUser.getIdToken();
        const res = await fetch(`/api/units/structure?tenantId=${encodeURIComponent(tenantId)}`, {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(typeof body.error === 'string' ? body.error : `שגיאה בטעינת ${labels.subUnitsTitle} (${res.status})`);
        }
        if (!cancelled) {
          const units: Array<{ unitId: string; name: string }> = Array.isArray(body.units) ? body.units : [];
          setStructureUnits(units.map(u => ({ id: u.unitId, name: u.name })));
        }
      } catch (err) {
        if (!cancelled) {
          console.error('[InviteMemberModal] /api/units/structure failed:', err);
          setStructureUnits([]);
          setStructureUnitsError(err instanceof Error ? err.message : `שגיאה בטעינת רשימת ${labels.subUnitsTitle}. נסה שוב.`);
        }
      } finally {
        if (!cancelled) setLoadingStructureUnits(false);
      }
    })();
    return () => { cancelled = true; };
  }, [currentRoleOption?.requiresScope, context.tenantId, context.authorityId]);

  useEffect(() => {
    if (currentRoleOption?.requiresScope !== 'allAuthorities') {
      setAllAuthorities([]);
      return;
    }
    let cancelled = false;
    setLoadingAllAuthorities(true);
    getAllAuthorities(undefined, true).then(list => {
      if (!cancelled) {
        setAllAuthorities(list);
        setLoadingAllAuthorities(false);
      }
    }).catch(() => {
      if (!cancelled) setLoadingAllAuthorities(false);
    });
    return () => { cancelled = true; };
  }, [currentRoleOption?.requiresScope]);

  const handleSend = async () => {
    if (!email.trim() || !selectedRole) return;
    if (currentRoleOption?.requiresScope === 'allAuthorities' && !selectedScopeId) {
      setError('יש לבחור עיר עבור מנהל רשות');
      return;
    }
    // unit_admin's unitId is REQUIRED server-side (admin/invitations/
    // route.ts rejects with 400 if missing) — matches that here instead
    // of silently sending an incomplete request.
    if (selectedRole === 'unit_admin' && !selectedScopeId) {
      // §13.40 — "מנהל יחידה" here is the ROLE NAME (this session's item 1,
      // level-derived officer titles, is deferred/not yet approved — see
      // docs/audit-2026-09/00-MASTER-PLAN.md §13.41) — left as-is to match
      // the still-unchanged role-option label above. Only "what to pick"
      // varies by vertical.
      setError(`יש לבחור ${labels.subUnitSingular} עבור מנהל יחידה`);
      return;
    }
    if (selectedRole === 'vertical_admin' && !selectedVertical) {
      setError('יש לבחור ורטיקל מנוהל');
      return;
    }
    if (selectedRole === 'platform_member' && allowedSections.length === 0) {
      setError('יש לבחור לפחות סקשן אחד לחבר צוות');
      return;
    }

    setSending(true);
    setError('');

    try {
      // ── Edit mode ──────────────────────────────────────────────────────────
      if (isEditMode && onEdit) {
        const updates: Parameters<typeof onEdit>[0] = {
          allowedSections,
        };

        if (callerCanChangeRole && selectedRole) {
          updates.role = selectedRole as 'super_admin' | 'vertical_admin';
          updates.managedVertical =
            selectedRole === 'vertical_admin' ? selectedVertical || null : null;
        }

        if (avatarFile && modeKey === 'platform') {
          const ext = avatarFile.name.split('.').pop() ?? 'jpg';
          const storageRef = ref(storage, `admin-avatars/pending/${crypto.randomUUID()}.${ext}`);
          const snap = await uploadBytes(storageRef, avatarFile);
          updates.photoURL = await getDownloadURL(snap.ref);
        } else if (avatarPreview === null && editTarget?.photoURL) {
          updates.photoURL = null;
        }

        await onEdit(updates);
        onSuccess?.({ inviteLink: '' });
        return;
      }
      // ── Create mode ───────────────────────────────────────────────────────
      const invData: any = {
        email: email.trim().toLowerCase(),
        role: selectedRole,
      };

      // Upload avatar to Firebase Storage if provided
      if (avatarFile && modeKey === 'platform') {
        const ext = avatarFile.name.split('.').pop() ?? 'jpg';
        const storageRef = ref(storage, `admin-avatars/pending/${crypto.randomUUID()}.${ext}`);
        const snap = await uploadBytes(storageRef, avatarFile);
        invData.photoURL = await getDownloadURL(snap.ref);
      }

      // Include section access for platform invites
      if (modeKey === 'platform' && allowedSections.length > 0) {
        invData.allowedSections = allowedSections;
      }

      // Include team role label for platform_member invites
      if (selectedRole === 'platform_member' && teamRole.trim()) {
        invData.teamRole = teamRole.trim();
      }

      if (selectedRole === 'vertical_admin') {
        invData.managedVertical = selectedVertical;
      }

      if (selectedRole === 'authority_manager') {
        invData.authorityId = selectedScopeId || context.authorityId;
      }

      if (selectedRole === 'tenant_owner') {
        invData.tenantId = context.tenantId || context.authorityId;
        invData.authorityId = context.authorityId;
      }

      if (selectedRole === 'unit_admin') {
        invData.tenantId = context.tenantId || context.authorityId;
        invData.authorityId = context.authorityId;
        if (selectedScopeId) {
          invData.unitId = selectedScopeId;
        }
      }

      // SPEC-PERMISSIONS-MODEL.md §7/§8 — invitation creation moved
      // server-side (POST /api/admin/invitations), root-only, and only for
      // authority_manager / platform_member. A caller selecting any other
      // role here (super_admin, tenant_owner, unit_admin, vertical_admin —
      // still offered by this modal's role list for the other verticals)
      // gets a clean "Role not supported" rejection from the server; those
      // verticals aren't built yet (SPEC §10/§11). Note: avatar upload
      // (invData.photoURL) is not sent — the new endpoint only accepts the
      // fields the spec names for these two roles.
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error('Not authenticated');
      const idToken = await currentUser.getIdToken();
      const res = await fetch('/api/admin/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify(invData),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || 'שגיאה ביצירת הזמנה');
      }
      const result = await res.json();

      // Send the sign-in link straight to the invitee's email — the
      // caller here (root, or whoever opened this modal) is not the
      // invitee, so this must NOT write the invitee's email into the
      // caller's own localStorage (see sendMagicLink's skipLocalStorage
      // doc in src/lib/auth.service.ts).
      const { sendMagicLink } = await import('@/lib/auth.service');
      const sendResult = await sendMagicLink(email.trim().toLowerCase(), result.callbackUrl, { skipLocalStorage: true });
      setEmailSendError(sendResult.error);

      setResultLink(result.inviteLink);
      onSuccess?.(result);
    } catch (err: any) {
      console.error('[InviteMemberModal] Error:', err);
      setError(err.message || 'שגיאה ביצירת הזמנה');
    } finally {
      setSending(false);
    }
  };

  const handleCopy = async () => {
    if (!resultLink) return;
    try {
      await navigator.clipboard.writeText(resultLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard not available */ }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 overflow-y-auto">
      <div className="flex items-start justify-center min-h-full py-6 px-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 relative" dir="rtl">
        <button
          onClick={onClose}
          className="absolute top-4 left-4 text-gray-400 hover:text-gray-600"
        >
          <X size={20} />
        </button>

        <h3 className="text-xl font-black text-gray-900 mb-1 flex items-center gap-2">
          <UserPlus size={22} className="text-cyan-600" />
          {/* §13.40 — municipal/company/youth_movement/platform keep the
              exact original "מנהל" (David's requirement: zero change
              outside military/educational). Only those two verticals get
              the vertical-aware word, matching team/page.tsx's own invite
              button ("הזמן {managerSingular} חדש/ה"). */}
          {(() => {
            const modalManagerWord = (modeKey === 'military' || modeKey === 'educational') ? labels.managerSingular : 'מנהל';
            return isEditMode
              ? `עריכת ${modalManagerWord} — ${editTarget?.name}`
              : `הזמנת ${modalManagerWord} חדש${modeKey === 'military' ? '/ה' : ''}`;
          })()}
        </h3>

        {context.organizationName && (
          <p className="text-sm text-gray-500 mb-4">
            עבור: <span className="font-bold text-gray-700">{context.organizationName}</span>
          </p>
        )}

        {resultLink ? (
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
              <p className="text-green-700 font-bold mb-2">
                {emailSendError ? 'ההזמנה נוצרה בהצלחה!' : `נשלח מייל ל-${email}`}
              </p>
              {emailSendError && (
                <p className="text-xs text-amber-600 mb-2">שליחת המייל נכשלה — השתמש בקישור למטה כגיבוי</p>
              )}
              <p className="text-xs text-green-600 mb-3">או שלח את הקישור למוזמן ידנית:</p>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={resultLink}
                  className="flex-1 px-3 py-2 border border-green-300 rounded-lg text-xs bg-white"
                  dir="ltr"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleCopy}
                className="flex-1 py-3 rounded-xl font-bold text-sm bg-green-600 text-white hover:bg-green-700 transition-all flex items-center justify-center gap-2"
              >
                {copied ? <><Check size={16} /> הקישור הועתק!</> : <><Copy size={16} /> העתק קישור</>}
              </button>
              <button
                onClick={() => {
                  window.open(`mailto:${email}?subject=${encodeURIComponent('הזמנה לניהול OUT-RUN')}&body=${encodeURIComponent(`שלום,\n\nהוזמנת לנהל ב-OUT-RUN.\nלחץ על הקישור:\n${resultLink}`)}`, '_blank');
                }}
                className="flex-1 py-3 rounded-xl font-bold text-sm bg-blue-600 text-white hover:bg-blue-700 transition-all flex items-center justify-center gap-2"
              >
                <Mail size={16} /> שלח במייל
              </button>
            </div>
            <button
              onClick={onClose}
              className="w-full py-3 rounded-xl font-bold text-sm bg-gray-100 text-gray-700 hover:bg-gray-200 transition-all"
            >
              סגור
            </button>
          </div>
        ) : (
          <div className="space-y-4 mt-4">
            {/* Email */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1.5">כתובת אימייל</label>
              <input
                type="email"
                value={email}
                onChange={e => !isEditMode && setEmail(e.target.value)}
                placeholder="user@example.com"
                className={[
                  'w-full px-4 py-3 border-2 rounded-xl outline-none transition-all text-sm',
                  isEditMode
                    ? 'border-gray-200 bg-gray-50 text-gray-500 cursor-default'
                    : 'border-gray-200 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-200',
                ].join(' ')}
                dir="ltr"
                readOnly={isEditMode}
              />
            </div>

            {/* Role */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1.5">תפקיד</label>
              {isEditMode && !callerCanChangeRole ? (
                <div className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl bg-gray-50 text-sm text-gray-500">
                  {roleOptions.find(r => r.value === selectedRole)?.label || selectedRole || '—'}
                  <span className="block text-xs text-gray-400 mt-0.5">רק Root Admin יכול לשנות תפקיד</span>
                </div>
              ) : roleOptions.length === 0 ? (
                // military/educational/company/youth_movement — every role
                // they used to offer (tenant_owner, unit_admin) isn't
                // accepted by POST /api/admin/invitations yet (SPEC §11
                // step 3, still ⬜). No option here is better than one that
                // fails on submit.
                <div className="w-full px-4 py-3 border-2 border-dashed border-gray-200 rounded-xl bg-gray-50 text-sm text-gray-500">
                  אין תפקידים זמינים להזמנה בורטיקל הזה כרגע.
                </div>
              ) : (
                <SearchableSelect
                  options={roleOptions.map(opt => ({ id: opt.value, label: opt.label }))}
                  value={selectedRole}
                  onChange={v => { setSelectedRole(v as InvitationRole); setSelectedScopeId(''); }}
                  placeholder="בחר תפקיד..."
                />
              )}
            </div>

            {/* Vertical picker — directly below Role (they're coupled) */}
            {selectedRole === 'vertical_admin' && (
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1.5">ורטיקל מנוהל</label>
                <SearchableSelect
                  options={VERTICAL_OPTIONS.map(v => ({ id: v.value, label: v.label }))}
                  value={selectedVertical}
                  onChange={v => setSelectedVertical(v as any)}
                  placeholder="בחר ורטיקל..."
                />
                <p className="text-[11px] text-amber-600 mt-1.5 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 font-medium">
                  {selectedVertical === 'military' && 'מנהל זה יקבל גישה לכל החטיבות והיחידות הצבאיות במערכת.'}
                  {selectedVertical === 'municipal' && 'מנהל זה יקבל גישה לכל הרשויות והערים במערכת.'}
                  {selectedVertical === 'educational' && 'מנהל זה יקבל גישה לכל בתי הספר והמוסדות החינוכיים במערכת.'}
                  {!selectedVertical && 'מנהל ורטיקלי מקבל הרשאות ניהול לכל הארגונים בורטיקל הנבחר.'}
                </p>
              </div>
            )}

            {/* Platform-only: avatar upload */}
            {modeKey === 'platform' && (
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1.5">תמונת פרופיל (אופציונלי)</label>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => avatarInputRef.current?.click()}
                    className="relative w-14 h-14 rounded-full border-2 border-dashed border-gray-300 hover:border-cyan-400 transition-colors flex items-center justify-center bg-gray-50 overflow-hidden"
                  >
                    {avatarPreview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={avatarPreview} alt="avatar" className="w-full h-full object-cover" />
                    ) : (
                      <Camera size={20} className="text-gray-400" />
                    )}
                  </button>
                  <div className="text-xs text-gray-400">
                    {avatarFile ? avatarFile.name : 'לחץ להעלאת תמונה'}
                  </div>
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarChange}
                  />
                </div>
              </div>
            )}

            {/* Platform-only: team role label (for platform_member) */}
            {modeKey === 'platform' && (selectedRole === 'platform_member' || (isEditMode && editTarget?.isPlatformMember)) && (
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1.5">תפקיד בצוות (תווית)</label>
                <input
                  type="text"
                  value={teamRole}
                  onChange={e => setTeamRole(e.target.value)}
                  placeholder="לדוגמה: מנהל מכירות, תוכן, הצלחת לקוח..."
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl outline-none text-sm focus:border-cyan-500 focus:ring-2 focus:ring-cyan-200 transition-all"
                />
              </div>
            )}

            {/* Section access — platform_member only (task fix: this used to
                show for any role in the 'platform' context, including
                authority_manager, which has nothing to do with allowedSections). */}
            {modeKey === 'platform' && (selectedRole === 'platform_member' || (isEditMode && editTarget?.isPlatformMember)) && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Shield size={14} className="text-gray-400" />
                  <label className="text-sm font-bold text-gray-700">הרשאות גישה</label>
                </div>
                {/* Preset buttons */}
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {Object.entries(SECTION_PRESETS).map(([preset, sections]) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setAllowedSections(sections)}
                      className={[
                        'px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors',
                        JSON.stringify(allowedSections.slice().sort()) === JSON.stringify(sections.slice().sort())
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-700',
                      ].join(' ')}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
                {/* Section checkboxes */}
                <div className="grid grid-cols-2 gap-1.5">
                  {SECTION_DEFS.map(sec => (
                    <label
                      key={sec.key}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-100 bg-gray-50 cursor-pointer hover:bg-blue-50 hover:border-blue-200 transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={allowedSections.includes(sec.key)}
                        onChange={() => toggleSection(sec.key)}
                        className="accent-blue-600 w-3.5 h-3.5"
                      />
                      <span className="text-xs text-gray-700">{sec.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* unit_admin's scope picker (§13.35, 26.09.2026) — a specific
                unit is REQUIRED, no "whole org" default (that's what
                tenant_owner is for). Sourced from GET /api/units/structure,
                not getChildrenByParent — see this file's own header
                comment on ROLE_OPTIONS_BY_CONTEXT for why. A fetch failure
                is shown here, never silently rendered as "this tenant has
                no units". */}
            {currentRoleOption?.requiresScope === 'unit' && (
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1.5">שיוך ל{labels.subUnitSingular}</label>
                {loadingStructureUnits ? (
                  <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
                    <Loader2 size={14} className="animate-spin" /> טוען...
                  </div>
                ) : structureUnitsError ? (
                  <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2">{structureUnitsError}</p>
                ) : (
                  <SearchableSelect
                    options={structureUnits.map(u => ({ id: u.id, label: u.name }))}
                    value={selectedScopeId}
                    onChange={v => setSelectedScopeId(v)}
                    placeholder={`בחר ${labels.subUnitSingular}...`}
                  />
                )}
                {!selectedScopeId && !loadingStructureUnits && !structureUnitsError && (
                  <p className="text-[11px] text-amber-600 mt-1.5">יש לבחור {labels.subUnitSingular} כדי ליצור הזמנת מנהל יחידה.</p>
                )}
              </div>
            )}

            {/* Scope selector — authority (child of context.authorityId,
                "whole org" is a valid default). Currently unused by any
                real role option (kept for a future one) — unchanged from
                before §13.35. */}
            {currentRoleOption?.requiresScope === 'authority' && (
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1.5">שיוך לשכונה / יישוב</label>
                {loadingChildren ? (
                  <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
                    <Loader2 size={14} className="animate-spin" /> טוען...
                  </div>
                ) : (
                  <SearchableSelect
                    options={[
                      { id: '', label: context.organizationName ? `${context.organizationName} (כלל הארגון)` : 'כלל הארגון' },
                      ...childEntities.map(child => {
                        const childName = typeof child.name === 'string' ? child.name : (child.name as any)?.he || child.id;
                        return { id: child.id, label: childName };
                      }),
                    ]}
                    value={selectedScopeId}
                    onChange={v => setSelectedScopeId(v)}
                    placeholder="בחר שכונה..."
                  />
                )}
              </div>
            )}

            {/* City picker for authority_manager in the platform context —
                required, no "whole org" default (there is no org to default
                to at this level; root must pick a specific city). */}
            {currentRoleOption?.requiresScope === 'allAuthorities' && (
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1.5">עיר</label>
                {loadingAllAuthorities ? (
                  <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
                    <Loader2 size={14} className="animate-spin" /> טוען...
                  </div>
                ) : (
                  <SearchableSelect
                    options={allAuthorities.map(a => ({
                      id: a.id,
                      label: typeof a.name === 'string' ? a.name : (a.name as any)?.he || (a.name as any)?.en || a.id,
                    }))}
                    value={selectedScopeId}
                    onChange={v => setSelectedScopeId(v)}
                    placeholder="בחר עיר..."
                  />
                )}
                {!selectedScopeId && (
                  <p className="text-[11px] text-amber-600 mt-1.5">יש לבחור עיר כדי ליצור הזמנת מנהל רשות.</p>
                )}
              </div>
            )}

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2">{error}</p>
            )}

            <button
              onClick={handleSend}
              disabled={
                !email.trim() ||
                !selectedRole ||
                sending ||
                (currentRoleOption?.requiresScope === 'allAuthorities' && !selectedScopeId) ||
                (selectedRole === 'unit_admin' && !selectedScopeId)
              }
              className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 text-white py-3 rounded-xl font-bold text-sm hover:from-cyan-700 hover:to-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {sending ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  {isEditMode ? 'שומר...' : 'יוצר הזמנה...'}
                </>
              ) : (
                <>
                  <Mail size={18} />
                  {isEditMode ? 'שמור שינויים' : 'צור קישור הזמנה'}
                </>
              )}
            </button>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
