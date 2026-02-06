/**
 * Safety Render Helpers
 * Prevents React Error #31 by safely extracting text from translation objects
 */

/**
 * Safely render text that might be a translation object or a string
 * @param val - Can be a string or a LocalizedText object {he: string, en: string, es?: string}
 * @returns A string safe for rendering
 */
export function safeRenderText(val: any): string {
  if (!val) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'object' && val !== null) {
    // CRITICAL: Console warning when intercepting an object (Error #31 prevention)
    console.warn("⚠️ ERROR #31 PREVENTED: Found object instead of string:", val);
    // Try to extract translation values
    const extracted = val.he || val.en || val.es;
    if (extracted) return extracted;
    // Last resort: JSON stringify if it's a complex object
    try {
      return JSON.stringify(val);
    } catch {
      return '';
    }
  }
  return String(val);
}
