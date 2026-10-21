'use client';

import { Loader2, UserPlus, Lock } from 'lucide-react';
import AccessCodeGate from '@/components/ui/AccessCodeGate';
import type { AccessCodeResult } from '@/features/user/onboarding/services/access-code.service';
import type { CommunityGroup } from '@/types/community.types';
import { useT } from '@/hooks/useT';
import { community } from '@/messages/ns/community';

interface GroupJoinSectionProps {
  v2: boolean;
  group: CommunityGroup;
  codeUnlocked: boolean;
  onAccessCodeSuccess: (result: AccessCodeResult) => void;
  inviteCodeMode: boolean;
  onEnterInviteMode: () => void;
  inviteInput: string;
  onInviteInputChange: (value: string) => void;
  inviteError: boolean;
  inviteSubmitting: boolean;
  onInviteSubmit: () => void;
  onInviteCancel: () => void;
  joining: boolean | undefined;
  onJoin: () => void;
}

/**
 * Join (pre-join) — three cases: tenant-locked (access-code gate) / private
 * (invite code) / public (join directly; demoted to an outline style when a
 * registrationLink — the real enrollment — is shown above, 07.09.2026).
 */
export default function GroupJoinSection({
  v2,
  group,
  codeUnlocked,
  onAccessCodeSuccess,
  inviteCodeMode,
  onEnterInviteMode,
  inviteInput,
  onInviteInputChange,
  inviteError,
  inviteSubmitting,
  onInviteSubmit,
  onInviteCancel,
  joining,
  onJoin,
}: GroupJoinSectionProps) {
  const t = useT(community);
  return group.isLocked && !codeUnlocked ? (
    /* Case 1: tenant / unit access-code gate */
    <AccessCodeGate
      orgName={group.name}
      groupType={group.groupType}
      tenantType={group.requiredAccessCodeType}
      contactPhone={null}
      hideSkip
      compact
      onSuccess={onAccessCodeSuccess}
    />
  ) : !group.isPublic ? (
    /* Case 2: private group — invite code required */
    <div className="space-y-3" dir="rtl">
      {!inviteCodeMode ? (
        <button
          onClick={onEnterInviteMode}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-black bg-gray-900 text-white shadow-lg transition-all active:scale-[0.97]"
        >
          <Lock className="w-4 h-4" />
          {t('group.join.enterCode')}
        </button>
      ) : (
        <div className="space-y-2.5">
          <p className="text-xs text-gray-500 text-center font-semibold">
            {t('group.join.privateHint')}
          </p>
          <div className="flex gap-2">
            <input
              dir="ltr"
              type="text"
              value={inviteInput}
              onChange={(e) => onInviteInputChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void onInviteSubmit();
              }}
              maxLength={6}
              placeholder="XXXXXX"
              autoFocus // eslint-disable-line jsx-a11y/no-autofocus -- appears right after the user taps "הזן קוד הצטרפות"
              aria-label={t('group.join.codeLabel')}
              className={`flex-1 text-center text-lg font-mono font-black tracking-widest border-2 rounded-2xl px-3 py-3 focus:outline-none transition-colors ${
                inviteError
                  ? 'border-red-400 bg-red-50 text-red-600'
                  : 'border-gray-200 focus:border-cyan-400'
              }`}
            />
            <button
              disabled={inviteSubmitting || !inviteInput.trim()}
              onClick={() => void onInviteSubmit()}
              className="px-4 py-3 rounded-2xl bg-gray-900 text-white text-sm font-black disabled:opacity-40 transition-all active:scale-95 flex-shrink-0"
            >
              {inviteSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : t('group.join.submit')}
            </button>
          </div>
          {inviteError && (
            <p role="alert" className="text-sm text-red-500 font-bold text-center">
              {t('group.join.wrongCode')}
            </p>
          )}
          <button
            onClick={onInviteCancel}
            className="w-full text-xs text-gray-400 font-semibold py-1 hover:text-gray-600 transition-colors"
          >
            {t('group.join.cancel')}
          </button>
        </div>
      )}
    </div>
  ) : (
    /* Case 3: public group — join directly (in-app chat/roster). */
    <button
      disabled={joining}
      onClick={() => { if (!joining) onJoin(); }}
      className={`w-full flex items-center justify-center gap-2 rounded-2xl transition-all active:scale-[0.97] disabled:opacity-50 ${
        group.registrationLink
          ? 'py-2.5 text-xs font-bold border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'
          : v2
            ? '!rounded-full py-3.5 text-[15.5px] font-extrabold bg-v2-cta text-v2-on-cta shadow-v2-cta'
            : 'py-3.5 text-sm font-black bg-gray-900 dark:bg-white text-white dark:text-gray-900 shadow-lg'
      }`}
    >
      {joining ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <>
          <UserPlus className="w-4 h-4" />
          {t('group.join.join')}
        </>
      )}
    </button>
  );
}
