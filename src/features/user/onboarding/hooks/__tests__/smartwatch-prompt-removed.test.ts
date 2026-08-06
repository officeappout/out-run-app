import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

/**
 * Regression guard for the SmartwatchPromptModal removal ("מוכנים
 * להתקדם?" — a vestigial leftover of an abandoned Bluetooth
 * smartwatch-pairing feature, repurposed into unrelated static copy).
 * Source-level, not a render test — this repo has no jsdom/component
 * harness (vitest.config.ts: "node" env only).
 */

const repoSrc = fileURLToPath(new URL('../../../../..', import.meta.url)); // .../src

const REMOVED_FILES = [
  'features/user/onboarding/components/SmartwatchPromptModal.tsx',
  'features/user/onboarding/hooks/useSmartwatchPrompt.ts',
  'features/user/onboarding/store/useSmartwatchPreferenceStore.ts',
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '__tests__') continue;
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

describe('SmartwatchPromptModal removal', () => {
  it('deletes the component, hook, and dedicated store', () => {
    for (const rel of REMOVED_FILES) {
      expect(existsSync(path.join(repoSrc, rel)), `${rel} should be deleted`).toBe(false);
    }
  });

  it('leaves no source reference to the removed component/hook/store anywhere in src/', () => {
    const needles = ['SmartwatchPromptModal', 'useSmartwatchPrompt', 'useSmartwatchPreferenceStore', 'smartwatchPrompt'];
    const offenders: string[] = [];
    for (const file of walk(repoSrc)) {
      // Exclude this guard test itself — it legitimately names the removed
      // symbols (in REMOVED_FILES / needles) to assert their absence.
      if (file.endsWith('smartwatch-prompt-removed.test.ts')) continue;
      const content = readFileSync(file, 'utf8');
      if (needles.some((n) => content.includes(n))) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it('startActiveWorkout pre-flight chain no longer calls openIfFirstRunner', () => {
    const useWorkoutSessionPath = path.join(repoSrc, 'features/parks/core/hooks/useWorkoutSession.ts');
    const content = readFileSync(useWorkoutSessionPath, 'utf8');
    expect(content).not.toContain('openIfFirstRunner');
    expect(content).toContain('_doStartActiveWorkout()');
  });

  it('MapShell no longer mounts the smartwatch modal', () => {
    const mapShellPath = path.join(repoSrc, 'app/map/MapShell.tsx');
    const content = readFileSync(mapShellPath, 'utf8');
    expect(content).not.toContain('SmartwatchPromptModal');
  });
});
