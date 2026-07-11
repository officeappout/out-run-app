import { defineConfig } from 'vitest/config';
import path from 'path';

// Unit tests only (pure logic — engine rules, route-request mapping, schema
// contracts). No jsdom/component testing yet; that is a separate decision.
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  test: {
    include: ['src/**/__tests__/**/*.test.ts'],
    environment: 'node',
  },
});
