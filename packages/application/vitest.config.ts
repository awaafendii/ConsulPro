import { defineConfig } from 'vitest/config';

export const config = defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/__tests__/**', 'src/index.ts'],
      // Seuil 95 % réservé aux moteurs de calcul (06-strategie-de-tests §3.2).
      thresholds: { lines: 90, branches: 90, functions: 90, statements: 90 },
    },
  },
});

// Vitest exige un export par défaut pour son fichier de configuration.
// eslint-disable-next-line no-restricted-syntax
export default config;
