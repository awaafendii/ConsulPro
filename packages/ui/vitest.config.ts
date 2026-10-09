import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export const config = defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./vitest.setup.ts'],
    css: false,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/*.stories.tsx',
        'src/**/__tests__/**',
        'src/index.ts',
      ],
      thresholds: { lines: 85, branches: 80, functions: 80, statements: 85 },
    },
  },
});

// Vitest exige un export par défaut pour son fichier de configuration.
// eslint-disable-next-line no-restricted-syntax
export default config;
