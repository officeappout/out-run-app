/**
 * i18n wave 2B (namespace `social`, keys `defaults.*`): DEFAULT_MESSAGES of MessageService.ts (the fallback smart
 * messages shown when Firestore has none; also what `seedDefaultMessages` writes). Snapshot recorded from UNMODIFIED
 * origin/main BEFORE the extraction; the extraction commit must pass it unchanged.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: () => ({}),
  doc: () => ({}),
  getDocs: async () => ({ docs: [] }),
  getDoc: async () => ({ exists: () => false }),
  addDoc: async () => ({ id: 'x' }),
  updateDoc: async () => undefined,
  deleteDoc: async () => undefined,
  query: () => ({}),
  where: () => ({}),
  orderBy: () => ({}),
  onSnapshot: () => () => undefined,
  serverTimestamp: () => null,
  Timestamp: { now: () => null },
}));

import { DEFAULT_MESSAGES, MESSAGE_TYPE_LABELS, messageMatchesGender } from '../MessageService';

describe('MessageService defaults parity', () => {
  it('DEFAULT_MESSAGES (every type, every row, key order)', async () => {
    await expect(JSON.stringify(DEFAULT_MESSAGES, null, 1)).toMatchFileSnapshot('./__snapshots__/message-service-i18n/default-messages.json');
  });

  it('gender filtering over the defaults', async () => {
    const lines: string[] = [];
    for (const [type, rows] of Object.entries(DEFAULT_MESSAGES)) {
      for (const gender of ['male', 'female', 'other', undefined] as const) {
        lines.push(`${type} | ${String(gender)}: ${rows.filter((r) => messageMatchesGender(r, gender)).map((r) => r.id).join(',')}`);
      }
    }
    lines.push(JSON.stringify(MESSAGE_TYPE_LABELS));
    await expect(lines.join('\n')).toMatchFileSnapshot('./__snapshots__/message-service-i18n/gender-and-labels.txt');
  });
});
