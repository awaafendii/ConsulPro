import { defineConfig } from 'vitest/config';

export const config = defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/__tests__/**', 'src/index.ts'],
      thresholds: { lines: 95, branches: 95, functions: 95, statements: 95 },
    },
  },
});

// Vitest exige un export par défaut pour son fichier de configuration.
// eslint-disable-next-line no-restricted-syntax
export default config;
