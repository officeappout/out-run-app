/**
 * Readiness status badge — the 3 colors here are David's exact,
 * colorblind-verified values (02.10.2026), not the panel's generic
 * green/amber/red palette: do not substitute Tailwind's built-in
 * green-700/red-700/etc, they are different hex values and would undo
 * the verification. A word label is ALWAYS shown alongside the color —
 * never color alone.
 *
 * 'not_performed' (medical exemption / no-show / other — point 11 of the
 * locked spec) shares "טרם נבדק"'s grey (#9A9C98 — David confirmed same
 * color, 02.10.2026) but is a DIFFERENT label ("לא ביצע") with its
 * reason shown alongside — David, verbatim: "איחוד שלהם גורם לקצין
 * לרדוף אחרי מי שכבר קיבל פטור." Never collapse the two into one label.
 */
import type { ReadinessCurrentStatus, NotPerformedReason } from '@/features/readiness/core/services/readiness-write.service';

const REASON_LABEL: Record<NotPerformedReason, string> = {
  medical_exemption: 'פטור רפואי',
  no_show: 'לא הופיע',
  other: 'אחר',
};

const STATUS_CONFIG: Record<'pass' | 'fail' | 'not_performed' | 'not_yet_tested', { color: string; label: string }> = {
  pass: { color: '#0E5A42', label: 'כשיר' },
  fail: { color: '#D9541F', label: 'לא כשיר' },
  not_performed: { color: '#9A9C98', label: 'לא ביצע' },
  not_yet_tested: { color: '#9A9C98', label: 'טרם נבדק' },
};

function resolveVisual(status: ReadinessCurrentStatus | null) {
  if (status === 'pass') return STATUS_CONFIG.pass;
  if (status === 'fail') return STATUS_CONFIG.fail;
  if (status === 'not_performed') return STATUS_CONFIG.not_performed;
  return STATUS_CONFIG.not_yet_tested; // null | 'not_yet_tested'
}

interface ReadinessStatusBadgeProps {
  status: ReadinessCurrentStatus | null;
  /** Required reading when status === 'not_performed' — the reason IS the information. */
  notPerformedReason?: NotPerformedReason | null;
}

export default function ReadinessStatusBadge({ status, notPerformedReason }: ReadinessStatusBadgeProps) {
  const cfg = resolveVisual(status);
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2 py-0.5 rounded-full"
      style={{ backgroundColor: `${cfg.color}1A`, color: cfg.color }}
    >
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: cfg.color }} />
      {cfg.label}
      {status === 'not_performed' && notPerformedReason && (
        <span className="opacity-80">({REASON_LABEL[notPerformedReason]})</span>
      )}
    </span>
  );
}
