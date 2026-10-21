import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { removeWorkDir } from '../lib/output.node';

// I1 review: the per-authority osmium cuts must not be left on disk after a run.
describe('removeWorkDir', () => {
  const roots: string[] = [];
  const mkRoot = () => {
    const r = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-work-'));
    roots.push(r);
    return r;
  };
  afterEach(() => {
    for (const r of roots.splice(0)) fs.rmSync(r, { recursive: true, force: true });
  });

  it('removes the authority dir and everything in it, leaving siblings', () => {
    const root = mkRoot();
    const dir = path.join(root, 'auth-1');
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'city.osm.pbf'), 'x');
    fs.mkdirSync(path.join(root, 'auth-2'));
    expect(removeWorkDir(dir, root)).toBe(true);
    expect(fs.existsSync(dir)).toBe(false);
    expect(fs.existsSync(path.join(root, 'auth-2'))).toBe(true);
  });

  it('is a no-op when the dir is already gone', () => {
    const root = mkRoot();
    expect(removeWorkDir(path.join(root, 'missing'), root)).toBe(false);
  });

  it('refuses the root itself and anything outside it', () => {
    const root = mkRoot();
    expect(() => removeWorkDir(root, root)).toThrow(/refusing/);
    expect(() => removeWorkDir(path.join(root, '..'), root)).toThrow(/refusing/);
    expect(() => removeWorkDir(path.join(root, '..', 'elsewhere'), root)).toThrow(/refusing/);
    expect(fs.existsSync(root)).toBe(true);
  });
});
