'use client';

import React from 'react';
import { Cloud, CloudOff, Check, Loader2, AlertCircle, Clock } from 'lucide-react';
import { DraftStatus, AutoSaveState } from '../../hooks/useAutoSaveDraft';

interface DraftStatusIndicatorProps {
  state: AutoSaveState;
  hasDraft: boolean;
  onPublish?: () => void;
  onDiscard?: () => void;
  isPublishing?: boolean;
}

/**
 * DraftStatusIndicator
 * Shows the current auto-save status and provides publish/discard actions
 */
export default function DraftStatusIndicator({
  state,
  hasDraft,
  onPublish,
  onDiscard,
  isPublishing = false,
}: DraftStatusIndicatorProps) {
  const formatTime = (date: Date | null) => {
    if (!date) return '';
    return date.toLocaleTimeString('he-IL', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm">
      {/* Status Icon & Text */}
      <div className="flex items-center gap-2">
        {state.status === 'saving' && (
          <>
            <Loader2 size={16} className="animate-spin text-cyan-500" />
            <span className="text-xs font-medium text-cyan-600" style={{ fontFamily: 'var(--font-simpler)' }}>
              שומר...
            </span>
          </>
        )}
        
        {state.status === 'saved' && (
          <>
            <Cloud size={16} className="text-green-500" />
            <span className="text-xs font-medium text-green-600" style={{ fontFamily: 'var(--font-simpler)' }}>
              נשמר בטיוטה
            </span>
            {state.lastSavedAt && (
              <span className="text-[10px] text-gray-400 flex items-center gap-1">
                <Clock size={10} />
                {formatTime(state.lastSavedAt)}
              </span>
            )}
          </>
        )}
        
        {state.status === 'error' && (
          <>
            <AlertCircle size={16} className="text-red-500" />
            <span className="text-xs font-medium text-red-600" style={{ fontFamily: 'var(--font-simpler)' }}>
              שגיאה בשמירה
            </span>
          </>
        )}
        
        {state.status === 'idle' && !hasDraft && (
          <>
            <CloudOff size={16} className="text-gray-400" />
            <span className="text-xs font-medium text-gray-500" style={{ fontFamily: 'var(--font-simpler)' }}>
              אין שינויים
            </span>
          </>
        )}
        
        {state.status === 'idle' && hasDraft && (
          <>
            <Cloud size={16} className="text-amber-500" />
            <span className="text-xs font-medium text-amber-600" style={{ fontFamily: 'var(--font-simpler)' }}>
              יש טיוטה לא מפורסמת
            </span>
          </>
        )}
      </div>

      {/* Divider */}
      {hasDraft && (onPublish || onDiscard) && (
        <div className="w-px h-4 bg-gray-200 dark:bg-slate-700" />
      )}

      {/* Actions */}
      {hasDraft && (
        <div className="flex items-center gap-2">
          {onDiscard && (
            <button
              type="button"
              onClick={onDiscard}
              disabled={isPublishing}
              className="text-[10px] font-medium text-gray-500 hover:text-red-500 transition-colors disabled:opacity-50"
              style={{ fontFamily: 'var(--font-simpler)' }}
            >
              בטל טיוטה
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * DraftBadge
 * A minimal badge showing draft status (for use in lists/headers)
 */
export function DraftBadge({ hasDraft }: { hasDraft: boolean }) {
  if (!hasDraft) return null;
  
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-bold rounded-full">
      <Cloud size={10} />
      טיוטה
    </span>
  );
}
