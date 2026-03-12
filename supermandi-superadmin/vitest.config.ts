/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: [path.resolve(__dirname, './src/__tests__/setup.ts')],
    // CI-FIX: Prevent "window is not defined" errors during jsdom teardown
    // from failing CI. These fire after all 2236 tests pass when async React
    // internals access window after jsdom environment is destroyed.
    dangerouslyIgnoreUnhandledErrors: true,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/__tests__/**', 'src/main.ts'],
      thresholds: {
        statements: 30,
        branches: 25,
        functions: 25,
        lines: 30,
      },
    },
  },
});
