import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  // Unit tests only; the e2e specs in e2e/ run with Playwright (`npm run e2e`).
  test: { include: ['src/**/*.test.ts'] },
});
