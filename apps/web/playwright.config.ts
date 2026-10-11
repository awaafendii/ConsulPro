import { defineConfig, devices } from '@playwright/test';

/**
 * Tests E2E sur l'application construite (`next start`), avec la base et Mailpit de
 * docker/compose.dev.yml. Prérequis : `pnpm db:up`, migrations appliquées, `pnpm build`.
 */
const PORT = 3100;
export const BASE_URL = `http://localhost:${PORT}`;

const config = defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: BASE_URL,
    locale: 'fr-FR',
    timezoneId: 'Africa/Abidjan',
    trace: 'retain-on-failure',
    storageState: 'e2e/.auth/owner.json',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `pnpm exec next start --port ${PORT}`,
    url: `${BASE_URL}/connexion`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      APP_URL: BASE_URL,
      NEXT_TELEMETRY_DISABLED: '1',
      CONSULPRO_DEMO_ENGINES: 'true',
      APP_ENV: 'test',
    },
  },
});

// Playwright exige un export par défaut pour ce fichier.
// eslint-disable-next-line no-restricted-syntax
export default config;
