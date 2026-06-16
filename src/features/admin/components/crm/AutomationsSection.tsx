'use client';

import { Settings2 } from 'lucide-react';
import CrmAgentPanel from '@/features/admin/components/authorities/CrmAgentPanel';
import TranscriptScanPanel from '@/features/admin/components/transcripts/TranscriptScanPanel';

export default function AutomationsSection() {
  return (
    <div className="space-y-3" dir="rtl">
      {/* Section header */}
      <div className="flex items-center gap-2 px-1">
        <Settings2 size={15} className="text-gray-400" />
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">אוטומציות וסוכנים</h2>
        <div className="flex-1 h-px bg-gray-100" />
        <span className="text-xs text-gray-400">מדווח לקלי</span>
      </div>

      {/* Agent cards */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <CrmAgentPanel />
        <TranscriptScanPanel />
      </div>
    </div>
  );
}
