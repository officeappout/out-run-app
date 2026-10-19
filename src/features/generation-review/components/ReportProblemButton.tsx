'use client';
/**
 * Small "דווח על בעיה" link for overview drawers / summaries. Shown to super admins always and to
 * everyone while enable_generation_review is on (useFeatureFlags: superAdminValue true). Off →
 * renders nothing (and the sheet code is never loaded).
 */
import { useState } from 'react';
import dynamicImport from 'next/dynamic';
import { Flag } from 'lucide-react';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import type { GenerationType } from '@/lib/generation-review/types';

const ReportProblemSheet = dynamicImport(() => import('./ReportProblemSheet'), { ssr: false });

/** `wrapperClassName`: the layout wrapper — rendered only when the button is (off = no DOM at all). */
export default function ReportProblemButton({ types, className = '', wrapperClassName = 'flex justify-center py-3' }: { types: GenerationType[]; className?: string; wrapperClassName?: string }) {
  const isSuperAdmin = useUserStore((s) => s.profile?.core?.isSuperAdmin === true);
  const { flags } = useFeatureFlags(isSuperAdmin);
  const [open, setOpen] = useState(false);
  if (!flags.enableGenerationReview) return null;
  return (
    <div className={wrapperClassName}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className={`inline-flex items-center gap-1 text-xs text-slate-400 underline-offset-2 hover:underline ${className}`}
      >
        <Flag size={12} aria-hidden />
        דווח על בעיה
      </button>
      {open && <ReportProblemSheet open={open} onClose={() => setOpen(false)} types={types} />}
    </div>
  );
}
