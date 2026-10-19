/**
 * firestore-sanitize — undefined-stripping that never touches Firestore values.
 *
 * WHY (19.10.2026)
 * ────────────────
 * Hand-rolled "strip undefined" helpers recursed into EVERY object, copying
 * own keys into a fresh `{}`. A FieldValue sentinel is an object too: the web
 * SDK's `serverTimestamp()` is a class instance whose only own key is
 * `_methodName`, so the copy was the plain map `{ _methodName: 'serverTimestamp' }`
 * and THAT got written instead of the server time. Same for a Timestamp
 * (→ `{ seconds, nanoseconds }`) and a Date (→ `{}`). In production this hit
 * users.lastActive (452 of 802 users), onboardingCompletedAt,
 * marketingAttribution.capturedAt, createdAt, updatedAt, termsAcceptedAt
 * (onboarding-sync's sanitizeObject), parks.publishedAt (park import),
 * community_events / community_groups timestamps, exercises draft.savedAt.
 *
 * RULE: only PLAIN objects (prototype === Object.prototype or null) and arrays
 * are walked. Anything else (FieldValue sentinels of either SDK, Timestamp,
 * Date, GeoPoint, DocumentReference, Bytes) passes through by reference.
 *
 * A plain map that already LOOKS like a serialized sentinel (it went through
 * JSON somewhere upstream) can't be repaired here without knowing the SDK, so
 * it's never written: dropped with a console.error (default) or thrown on.
 *
 * Pure: no firebase import, usable from client code, API routes and scripts.
 */

export function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

/** A FieldValue sentinel that was copied/JSON'd into a plain map: `{ _methodName: '...' }`. */
export function isSerializedSentinel(v: unknown): boolean {
  return isPlainObject(v) && typeof v._methodName === 'string';
}

/** Dotted paths (arrays as `[i]`) of every serialized sentinel inside `v`. */
export function findSerializedSentinels(v: unknown, path = ''): string[] {
  if (isSerializedSentinel(v)) return [path || '(root)'];
  if (Array.isArray(v)) return v.flatMap((x, i) => findSerializedSentinels(x, `${path}[${i}]`));
  if (!isPlainObject(v)) return [];
  return Object.keys(v).flatMap((k) => findSerializedSentinels(v[k], path ? `${path}.${k}` : k));
}

export class SerializedSentinelError extends Error {
  constructor(public readonly paths: string[], label = 'payload') {
    super(`[firestore-sanitize] ${label} contains serialized FieldValue sentinel(s) at: ${paths.join(', ')}`);
    this.name = 'SerializedSentinelError';
  }
}

/** Throws SerializedSentinelError when `v` contains any `{ _methodName }` map. */
export function assertNoSerializedSentinels(v: unknown, label?: string): void {
  const paths = findSerializedSentinels(v);
  if (paths.length) throw new SerializedSentinelError(paths, label);
}

export interface StripUndefinedOptions {
  /** What an `undefined` object value becomes. Default 'omit' (key dropped). */
  undefinedValue?: 'omit' | 'null';
  /** A serialized sentinel map found in the input. Default 'drop' (key omitted + console.error). */
  onSerializedSentinel?: 'drop' | 'throw';
  /** Used in the log / error message. */
  label?: string;
}

const DROP = Symbol('drop');

/**
 * Deep-removes `undefined` for a Firestore write. Plain objects: undefined
 * keys omitted (or null). Arrays: undefined items → null (Firestore has no
 * holes). Everything that isn't a plain object/array is returned as-is.
 */
export function stripUndefinedDeep<T>(value: T, opts: StripUndefinedOptions = {}): T {
  const undefinedValue = opts.undefinedValue ?? 'omit';
  const onSentinel = opts.onSerializedSentinel ?? 'drop';
  const found: string[] = [];

  const walk = (v: unknown, path: string): unknown => {
    if (isSerializedSentinel(v)) {
      found.push(path || '(root)');
      return DROP;
    }
    if (Array.isArray(v)) {
      return v.map((x, i) => {
        if (x === undefined) return null;
        const out = walk(x, `${path}[${i}]`);
        return out === DROP ? null : out;
      });
    }
    if (!isPlainObject(v)) return v;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v)) {
      const child = v[k];
      if (child === undefined) {
        if (undefinedValue === 'null') out[k] = null;
        continue;
      }
      const w = walk(child, path ? `${path}.${k}` : k);
      if (w !== DROP) out[k] = w;
    }
    return out;
  };

  const result = walk(value, '');
  if (found.length) {
    if (onSentinel === 'throw') throw new SerializedSentinelError(found, opts.label);
    console.error(
      `[firestore-sanitize] dropped serialized FieldValue sentinel(s) from ${opts.label ?? 'payload'}: ${found.join(', ')}`,
    );
  }
  return (result === DROP ? null : result) as T;
}
