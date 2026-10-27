/**
 * protocol-weights — how often each set protocol (straight / antagonist pairs / EMOM /
 * AMRAP) shows up, per program level (owner 27.10.2026). Pure.
 *
 * Each programLevelSettings doc may carry `protocolWeights` (percent, the rest is straight
 * sets). A session mixes several programs (push + pull + legs ...), so:
 *   - weakest link: a protocol is allowed only if EVERY scanned program allows it
 *     (weight > 0); a program without weights allows straight sets only;
 *   - the allowed weights are averaged across programs; what a gate removed moves to
 *     straight sets;
 *   - protocols the generator cannot build yet (amrap), disabled ones (pyramid) and
 *     tabata (its own track) never fire — their share is straight sets.
 */
export type ProtocolWeights = Partial<Record<string, number>>;

/** Protocols the set-type pipeline can actually apply today. */
export const WEIGHTED_PROTOCOLS = ['antagonist_pair', 'emom'] as const;

/** EMOM needs room for a few rounds; shorter sessions never get it. */
export const EMOM_MIN_SESSION_MINUTES = 20;

export interface ResolvedProtocolWeights {
  /** Weight per protocol as a 0..1 share of ALL sessions; the rest is straight sets. */
  shares: Record<string, number>;
  /** Total probability a protocol fires (sum of shares). */
  probability: number;
}

const pct = (n: unknown): number => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.min(n, 100) : 0);

export function resolveProtocolWeights(
  entries: ReadonlyArray<ProtocolWeights | null | undefined>,
  opts: { sessionMinutes?: number; canPair?: boolean } = {},
): ResolvedProtocolWeights {
  const shares: Record<string, number> = {};
  if (entries.length === 0) return { shares, probability: 0 };
  for (const p of WEIGHTED_PROTOCOLS) {
    if (p === 'emom' && opts.sessionMinutes != null && opts.sessionMinutes < EMOM_MIN_SESSION_MINUTES) continue;
    if (p === 'antagonist_pair' && opts.canPair === false) continue;
    const per = entries.map((e) => pct(e?.[p]));
    if (per.some((w) => w === 0)) continue; // weakest link
    shares[p] = per.reduce((a, b) => a + b, 0) / per.length / 100;
  }
  const total = Object.values(shares).reduce((a, b) => a + b, 0);
  if (total > 1) for (const k of Object.keys(shares)) shares[k] /= total;
  return { shares, probability: Math.min(1, total) };
}

/** Pick a protocol by weight among the non-straight ones (the caller already rolled "fire or not"). */
export function pickWeightedProtocol(shares: Record<string, number>, rand: () => number = Math.random): string | undefined {
  const keys = Object.keys(shares).filter((k) => shares[k] > 0);
  if (keys.length === 0) return undefined;
  const total = keys.reduce((a, k) => a + shares[k], 0);
  let r = rand() * total;
  for (const k of keys) { r -= shares[k]; if (r <= 0) return k; }
  return keys[keys.length - 1];
}

/**
 * The starting table (owner 27.10.2026), by program level. Used by the upload script;
 * the engine only ever reads what is stored on the docs.
 */
export function defaultProtocolWeightsForLevel(level: number): ProtocolWeights {
  if (level <= 5) return {};
  if (level <= 9) return { antagonist_pair: 25 };
  if (level <= 13) return { antagonist_pair: 30, emom: 10, amrap: 5 };
  return { antagonist_pair: 30, emom: 15, amrap: 15 };
}
