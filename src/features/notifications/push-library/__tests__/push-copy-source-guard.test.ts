/**
 * i18n wave 2A tripwire. push-library.core.ts is NOT in src/lib/i18n/migrated-paths.txt (its admin labels,
 * descriptions and "when sent" notes are Hebrew-only by decision, so Check 5 would block legitimate edits), so
 * this test is the guard for the part that IS copy: every `defaults[].title|body` must be a `T('<pushType>.<i>.title|body')`
 * call whose key exists in src/messages/he/push.json — a Hebrew literal there fails the test — and every
 * catalog key must be used by exactly one default.
 */
import { readFileSync } from 'fs';
import path from 'path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import he from '@/messages/he/push.json';

const root = path.resolve(__dirname, '../../../../..');
const file = path.join(root, 'src/features/notifications/push-library/push-library.core.ts');
const sf = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);

const used: string[] = [];
const problems: string[] = [];
function visit(n: ts.Node) {
  if (ts.isPropertyAssignment(n) && n.name.getText() === 'defaults' && ts.isArrayLiteralExpression(n.initializer)) {
    const pt = (n.parent as ts.ObjectLiteralExpression).properties.find((p) => p.name?.getText() === 'pushType') as ts.PropertyAssignment;
    const pushType = (pt.initializer as ts.StringLiteral).text;
    n.initializer.elements.forEach((el, i) => {
      for (const p of (el as ts.ObjectLiteralExpression).properties as ts.NodeArray<ts.PropertyAssignment>) {
        const name = p.name.getText();
        if (name !== 'title' && name !== 'body') continue;
        const want = `${pushType}.${i}.${name}`;
        const init = p.initializer;
        const ok =
          ts.isCallExpression(init) && init.expression.getText() === 'T' && init.arguments.length === 1 &&
          ts.isStringLiteral(init.arguments[0]) && init.arguments[0].text === want;
        if (!ok) problems.push(`${want}: ${init.getText().slice(0, 60)}`);
        else used.push(want);
      }
    });
  }
  ts.forEachChild(n, visit);
}
visit(sf);

describe('push-library.core.ts defaults are catalog keys', () => {
  it('no Hebrew literal (or any non-T() value, or wrong key) in a default title/body', () => {
    expect(problems).toEqual([]);
    expect(used.length).toBeGreaterThan(300);
  });

  it('the catalog and the code use exactly the same keys', () => {
    expect([...used].sort()).toEqual(Object.keys(he).sort());
    expect(new Set(used).size).toBe(used.length);
  });
});
