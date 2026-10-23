/**
 * i18n wave 2A (namespace `push`): snapshots recorded from UNMODIFIED origin/main, BEFORE the push copy moved to
 * src/messages/he/push.json. The extraction must keep every one of them byte-identical.
 *
 *   - catalog.json        the whole PUSH_CATALOG (every default's title/body/gender/pair/conditions/audience/deepLink)
 *   - rows.json           defaultRowsFor() for every pushType (the exact rows the selector sees, ids included)
 *   - rendered.json       renderCopy() of EVERY default row with sample values for every recipient x subject gender
 *                         (title, body, ok, problems)
 *   - selection.json      selectPushCopy() with no library rows (= code defaults) for every pushType x recipient
 *                         gender (male / female / other / unset) x subject gender (male / female / unset) x condition
 *                         combination x 6 uids: the unique resolved copies + a hash of all outcomes in order
 *                         (rotation, specificity and fallbackOnly included)
 *   - preview.json        previewPushCopy() of every default (the panel's preview path)
 *
 * The clock is pinned (`now` is passed to every call; the time window / Israel-date rotation key depend on it).
 */
import { createHash } from 'crypto';
import { expect, it } from 'vitest';
import {
  PUSH_CATALOG,
  defaultRowsFor,
  previewPushCopy,
  renderCopy,
  sampleVarsFor,
  selectPushCopy,
  SAMPLE_LINK_PARAMS,
  type PushGender,
  type PushCopyContext,
} from '../push-library.core';

const NOW = new Date('2026-10-15T09:30:00.000Z');
const snap = (name: string) => `./__snapshots__/push-copy-i18n/${name}.json`;
const json = (v: unknown) => JSON.stringify(v, null, 2) + '\n';

const GENDERS: Array<PushGender | null> = ['male', 'female', null];

it('catalog (every default)', async () => {
  await expect(json(PUSH_CATALOG)).toMatchFileSnapshot(snap('catalog'));
});

it('default rows (ids, pairs, gender)', async () => {
  const out = Object.fromEntries(PUSH_CATALOG.map((e) => [e.pushType, defaultRowsFor(e.pushType)]));
  await expect(json(out)).toMatchFileSnapshot(snap('rows'));
});

it('every default row rendered with sample values', async () => {
  const out: Record<string, unknown[]> = {};
  for (const e of PUSH_CATALOG) {
    out[e.pushType] = defaultRowsFor(e.pushType).map((row) => {
      const byGender: Record<string, unknown> = {};
      for (const g of GENDERS) {
        for (const sg of GENDERS) {
          const vars = sampleVarsFor(e.pushType, { gender: g, subjectGender: sg });
          byGender[`${g ?? 'none'}/${sg ?? 'none'}`] = renderCopy(row, vars);
        }
      }
      return { id: row.id, byGender };
    });
  }
  await expect(json(out)).toMatchFileSnapshot(snap('rendered'));
});

it('preview of every default', async () => {
  const out: Record<string, unknown[]> = {};
  for (const e of PUSH_CATALOG) {
    out[e.pushType] = defaultRowsFor(e.pushType).map((row) => ({
      id: row.id,
      preview: previewPushCopy(
        { pushType: e.pushType, title: row.title, body: row.body, deepLink: row.deepLink, gender: row.gender, subjectGender: row.subjectGender },
      ),
    }));
  }
  await expect(json(out)).toMatchFileSnapshot(snap('preview'));
});

/** All combinations of a pushType's condition options, each key also "unset"; capped (singles beyond the cap). */
function conditionCombos(conds: ReadonlyArray<{ key: string; options: ReadonlyArray<{ value: string }> }> | undefined) {
  if (!conds || conds.length === 0) return [{}];
  const lists = conds.map((c) => [undefined, ...c.options.map((o) => o.value)] as Array<string | undefined>);
  const total = lists.reduce((n, l) => n * l.length, 1);
  const combos: Array<Record<string, string>> = [];
  if (total <= 600) {
    const rec = (i: number, cur: Record<string, string>) => {
      if (i === conds.length) return void combos.push({ ...cur });
      for (const v of lists[i]) {
        if (v === undefined) rec(i + 1, cur);
        else rec(i + 1, { ...cur, [conds[i].key]: v });
      }
    };
    rec(0, {});
  } else {
    combos.push({});
    conds.forEach((c) => c.options.forEach((o) => combos.push({ [c.key]: o.value })));
  }
  return combos;
}

it('selection from the code defaults', async () => {
  const uids = ['u1', 'u2', 'u3', 'user-4', 'abcDEF', 'zz9'];
  const out: Record<string, { outcomes: number; hash: string; unique: unknown[] }> = {};
  for (const e of PUSH_CATALOG) {
    const unique = new Map<string, unknown>();
    const hash = createHash('sha256');
    let n = 0;
    for (const g of [...GENDERS, 'other' as unknown as PushGender]) {
      for (const sg of GENDERS) {
        for (const conditions of conditionCombos(e.conditions)) {
          for (const uid of uids) {
            const ctx: PushCopyContext = {
              uid,
              now: NOW,
              audience: { gender: g, ageBand: '18_29' },
              subjectGender: sg,
              conditions,
              params: SAMPLE_LINK_PARAMS,
              vars: sampleVarsFor(e.pushType, { gender: g === ('other' as unknown) ? null : g, subjectGender: sg }),
            };
            const r = selectPushCopy(e.pushType, [], ctx);
            const s = JSON.stringify(r);
            hash.update(s + '\n');
            n++;
            unique.set(s, r);
          }
        }
      }
    }
    out[e.pushType] = {
      outcomes: n,
      hash: hash.digest('hex'),
      unique: [...unique.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([, v]) => v),
    };
  }
  await expect(json(out)).toMatchFileSnapshot(snap('selection'));
});
