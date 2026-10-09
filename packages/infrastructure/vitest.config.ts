import { defineConfig } from 'vitest/config';

export const config = defineConfig({
  test: {
    include: ['src/**/*.integration.test.ts'],
    globalSetup: ['./vitest.global-setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 180_000,
    fileParallelism: false,
  },
});

// Vitest exige un export par défaut pour son fichier de configuration.
// eslint-disable-next-line no-restricted-syntax
export default config;
