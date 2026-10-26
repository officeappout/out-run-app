/**
 * A short, PII-safe reason for a failed schedule read, for the turn log (never shown to users).
 * Keeps the error name and a trimmed message; paths, emails and long id-like tokens are masked.
 */
export function scheduleFailureReason(err: unknown): string {
  const name = err instanceof Error ? err.name : 'Error';
  const message = err instanceof Error ? err.message : String(err);
  return `${name}: ${message}`
    .replace(/\s+/g, ' ')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '<email>')
    .replace(/[\w.-]+(?:\/[\w.-]+)+/g, '<path>')
    .replace(/\b(?=[\w-]*\d)[\w-]{12,}\b/g, '<id>')
    .replace(/\b[A-Za-z0-9]{20,}\b/g, '<id>')
    .replace(/\d{6,}/g, '<n>')
    .slice(0, 160);
}
