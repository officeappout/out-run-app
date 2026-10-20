/**
 * LegacyDemoToolDisabled — what the old in-browser demo seeders render now
 * (owner, 20.10.2026): /admin/demo-seed, /admin/seed-sderot,
 * /admin/seed-military-school. The seeders wrote mock users / workouts /
 * feed_posts straight into production from the browser. They are switched
 * off, not deleted: nothing here reads or removes data that already exists.
 */
import { Ban } from 'lucide-react';
import { LEGACY_DEMO_TOOL_DISABLED_MESSAGE } from './legacy-demo';

export default function LegacyDemoToolDisabled({ toolName }: { toolName: string }) {
  return (
    <div className="mx-auto max-w-xl p-8" dir="rtl">
      <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-5">
        <Ban className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden />
        <div>
          <h1 className="text-lg font-black text-amber-900">{LEGACY_DEMO_TOOL_DISABLED_MESSAGE}</h1>
          <p className="mt-1 text-sm font-medium text-amber-800">
            {toolName} כבר לא זמין. נתונים שנוצרו בעבר לא נמחקו.
          </p>
        </div>
      </div>
    </div>
  );
}
