/**
 * i18n wave 2B — namespace `social`, keys `defaults.*` (MessageService.ts DEFAULT_MESSAGES).
 * Every key must equal the text recorded from origin/main BEFORE the extraction (the committed parity snapshot).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import he from '@/messages/he/social.json';
import { social } from '@/messages/ns/social';
import { makeT } from '../t';

const t = makeT('he', social);
const recorded = JSON.parse(
  readFileSync(path.resolve(__dirname, '../../../features/messages/services/__tests__/__snapshots__/message-service-i18n/default-messages.json'), 'utf8'),
) as Record<string, Array<{ id: string; text: string; subText?: string }>>;

describe('social defaults', () => {
  it('every recorded row renders from the catalog verbatim', () => {
    let n = 0;
    for (const rows of Object.values(recorded)) {
      for (const r of rows) {
        expect(t(`defaults.${r.id}.text` as never)).toBe(r.text);
        if (r.subText !== undefined) expect(t(`defaults.${r.id}.sub` as never)).toBe(r.subText);
        n++;
      }
    }
    expect(n).toBe(33);
    expect(Object.keys(he)).toHaveLength(66);
  });
});
