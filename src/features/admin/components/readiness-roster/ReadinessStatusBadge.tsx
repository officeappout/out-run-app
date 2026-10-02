/**
 * Readiness status badge — the 3 colors here are David's exact,
 * colorblind-verified values (02.10.2026), not the panel's generic
 * green/amber/red palette: do not substitute Tailwind's built-in
 * green-700/red-700/etc, they are different hex values and would undo
 * the verification. A word label is ALWAYS shown alongside the color —
 * never color alone.
 *
 * 'not_performed' (medical exemption / no-show / other — point 11 of the
 * locked spec) has no dedicated color in David's 3-color spec. Design
 * call, not a silent assumption: displayed identically to
 * 'not_yet_tested' (grey, "טרם נבדק") since neither represents a valid
 * current pass/fail determination — flagged in the completion report for
 * David to override if he wants a 4th visual state later.
 */
import type { ReadinessCurrentStatus } from '@/features/readiness/core/services/readiness-write.service';

const STATUS_CONFIG: Record<'pass' | 'fail' | 'neutral', { color: string; label: string }> = {
  pass: { color: '#0E5A42', label: 'כשיר' },
  fail: { color: '#D9541F', label: 'לא כשיר' },
  neutral: { color: '#9A9C98', label: 'טרם נבדק' },
};

function resolveVisual(status: ReadinessCurrentStatus | null) {
  if (status === 'pass') return STATUS_CONFIG.pass;
  if (status === 'fail') return STATUS_CONFIG.fail;
  return STATUS_CONFIG.neutral; // null | 'not_yet_tested' | 'not_performed'
}

export default function ReadinessStatusBadge({ status }: { status: ReadinessCurrentStatus | null }) {
  const cfg = resolveVisual(status);
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2 py-0.5 rounded-full"
      style={{ backgroundColor: `${cfg.color}1A`, color: cfg.color }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: cfg.color }} />
      {cfg.label}
    </span>
  );
}
