import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';
const chromiumPath =
  process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
const externalOrigin = process.env.PAPERLIGHT_TEST_ORIGIN;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60000,
  expect: { timeout: 15000 },
  fullyParallel: true,
  workers: 2,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: externalOrigin || 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: externalOrigin
    ? undefined
    : {
        command:
          process.env.PAPERLIGHT_PREBUILT === '1'
            ? 'npm run preview -- --port 4173'
            : 'npm run build -- --logLevel error && npm run preview -- --port 4173',
        url: 'http://127.0.0.1:4173',
        reuseExistingServer: !process.env.CI,
        timeout: 120000,
      },
  projects: [
    {
      name: 'chromium',
      testIgnore: '**/mobile.spec.ts',
      use: { ...devices['Desktop Chrome'], launchOptions: { executablePath: chromiumPath } },
    },
    { name: 'firefox', testIgnore: '**/mobile.spec.ts', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', testIgnore: '**/mobile.spec.ts', use: { ...devices['Desktop Safari'] } },
    {
      name: 'mobile-chromium',
      use: {
        ...devices['Pixel 7'],
        defaultBrowserType: 'chromium',
        launchOptions: { executablePath: chromiumPath },
      },
      testMatch: '**/mobile.spec.ts',
    },
  ],
});
