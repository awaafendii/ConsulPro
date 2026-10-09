import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export const config = defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    include: ['src/**/*.integration.test.ts'],
    globalSetup: ['./vitest.global-setup.ts'],
    testTimeout: 60_000,
    hookTimeout: 240_000,
    fileParallelism: false,
  },
});

// Vitest exige un export par défaut pour son fichier de configuration.
// eslint-disable-next-line no-restricted-syntax
export default config;
