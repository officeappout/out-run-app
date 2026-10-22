/**
 * audit-input — what a tool call's input looks like inside the admin_ai_audit row. Pure.
 * get_user_lookup's query is an email / person name: never stored raw (email masked exactly
 * as the tool masks it, a name reduced to initials; a uid-shaped value is not personal data).
 */
const UID_SHAPE = /^[A-Za-z0-9_-]{20,128}$/;

export function maskQueryForAudit(query: string): string {
  const q = query.trim();
  const at = q.lastIndexOf('@');
  if (at >= 1) return `${q[0]}***${q.slice(at)}`;
  if (UID_SHAPE.test(q)) return q;
  const initials = q.split(/\s+/).filter(Boolean).map((w) => `${Array.from(w)[0]}.`);
  return initials.slice(0, 4).join(' ');
}

export function auditInput(toolName: string, input: unknown): string {
  let safe = input ?? {};
  if (toolName === 'get_user_lookup' && safe && typeof safe === 'object' && typeof (safe as { query?: unknown }).query === 'string') {
    safe = { ...(safe as object), query: maskQueryForAudit((safe as { query: string }).query) };
  } else if (toolName === 'get_user_lookup') {
    safe = {}; // malformed input: store nothing rather than a raw value
  }
  return JSON.stringify(safe).slice(0, 300);
}
