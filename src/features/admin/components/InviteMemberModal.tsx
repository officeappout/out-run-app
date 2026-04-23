'use client';

import { useState, useEffect } from 'react';
import { UserPlus, Mail, Loader2, X, Copy, Check } from 'lucide-react';
import { createInvitation } from '@/features/admin/services/invitation.service';
import { getChildrenByParent } from '@/features/admin/services/authority.service';
import type { InvitationRole } from '@/types/invitation.type';
import type { TenantType } from '@/types/admin-types';
import type { Authority } from '@/types/admin-types';
import SearchableSelect from '@/features/admin/components/SearchableSelect';

interface RoleOption {
  value: InvitationRole;
  label: string;
  requiresScope?: 'unit' | 'authority';
}

const ROLE_OPTIONS_BY_CONTEXT: Record<TenantType | 'platform', RoleOption[]> = {
  military: [
    { value: 'tenant_owner', label: 'בעל ארגון (חטיבה מלאה)' },
    { value: 'unit_admin', label: 'מפקד יחידה (גדוד/פלוגה)', requiresScope: 'unit' },
  ],
  municipal: [
    { value: 'authority_manager', label: 'מנהל רשות (עיר)' },
    { value: 'unit_admin', label: 'רכז שכונתי', requiresScope: 'authority' },
  ],
  educational: [
    { value: 'tenant_owner', label: 'בעל ארגון (בית ספר)' },
    { value: 'unit_admin', label: 'רכז כיתה/שכבה', requiresScope: 'unit' },
  ],
  platform: [
    { value: 'super_admin', label: 'מנהל-על (Super Admin)' },
    { value: 'vertical_admin', label: 'מנהל ורטיקלי — כל הארגונים בורטיקל' },
  ],
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
}

export default function InviteMemberModal({
  isOpen,
  onClose,
  context,
  callerInfo,
  onSuccess,
}: InviteMemberModalProps) {
  const [email, setEmail] = useState('');
  const [selectedRole, setSelectedRole] = useState<InvitationRole | ''>('');
  const [selectedVertical, setSelectedVertical] = useState<'military' | 'municipal' | 'educational' | ''>('');
  const [selectedScopeId, setSelectedScopeId] = useState('');
  const [childEntities, setChildEntities] = useState<Authority[]>([]);
  const [loadingChildren, setLoadingChildren] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [resultLink, setResultLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const modeKey: TenantType | 'platform' = context.tenantType ?? 'platform';
  const roleOptions = ROLE_OPTIONS_BY_CONTEXT[modeKey];

  useEffect(() => {
    if (!isOpen) {
      setEmail('');
      setSelectedRole('');
      setSelectedVertical('');
      setSelectedScopeId('');
      setError('');
      setResultLink(null);
      setCopied(false);
    }
  }, [isOpen]);

  const currentRoleOption = roleOptions.find(r => r.value === selectedRole);

  useEffect(() => {
    if (!currentRoleOption?.requiresScope) {
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

  const handleSend = async () => {
    if (!email.trim() || !selectedRole) return;
    if (selectedRole === 'vertical_admin' && !selectedVertical) {
      setError('יש לבחור ורטיקל מנוהל');
      return;
    }

    setSending(true);
    setError('');

    try {
      const invData: any = {
        email: email.trim().toLowerCase(),
        role: selectedRole,
      };

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

      const result = await createInvitation(
        invData,
        {
          adminId: callerInfo.adminId,
          adminName: callerInfo.adminName,
          adminEmail: callerInfo.adminEmail,
        },
        { callerAuthorityId: callerInfo.callerAuthorityId },
      );

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
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 relative" dir="rtl">
        <button
          onClick={onClose}
          className="absolute top-4 left-4 text-gray-400 hover:text-gray-600"
        >
          <X size={20} />
        </button>

        <h3 className="text-xl font-black text-gray-900 mb-1 flex items-center gap-2">
          <UserPlus size={22} className="text-cyan-600" />
          הזמנת מנהל חדש
        </h3>

        {context.organizationName && (
          <p className="text-sm text-gray-500 mb-4">
            עבור: <span className="font-bold text-gray-700">{context.organizationName}</span>
          </p>
        )}

        {resultLink ? (
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
              <p className="text-green-700 font-bold mb-2">ההזמנה נוצרה בהצלחה!</p>
              <p className="text-xs text-green-600 mb-3">שלח את הקישור למוזמן:</p>
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
                onChange={e => setEmail(e.target.value)}
                placeholder="user@example.com"
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-cyan-500 focus:ring-2 focus:ring-cyan-200 outline-none transition-all text-sm"
                dir="ltr"
              />
            </div>

            {/* Role */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1.5">תפקיד</label>
              <SearchableSelect
                options={roleOptions.map(opt => ({ id: opt.value, label: opt.label }))}
                value={selectedRole}
                onChange={v => { setSelectedRole(v as InvitationRole); setSelectedScopeId(''); }}
                placeholder="בחר תפקיד..."
              />
            </div>

            {/* Vertical picker (only for vertical_admin) */}
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

            {/* Scope selector (unit / authority child) */}
            {currentRoleOption?.requiresScope && (
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1.5">
                  {currentRoleOption.requiresScope === 'unit' ? 'שיוך ליחידה' : 'שיוך לשכונה / יישוב'}
                </label>
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
                    placeholder="בחר יחידה..."
                  />
                )}
              </div>
            )}

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2">{error}</p>
            )}

            <button
              onClick={handleSend}
              disabled={!email.trim() || !selectedRole || sending}
              className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 text-white py-3 rounded-xl font-bold text-sm hover:from-cyan-700 hover:to-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {sending ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  יוצר הזמנה...
                </>
              ) : (
                <>
                  <Mail size={18} />
                  שלח הזמנה
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
