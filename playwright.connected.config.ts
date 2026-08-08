import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: 'formal-connected.spec.ts',
  outputDir: '.superpowers/sdd/connected-results',
  timeout: 90_000,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:4174/ledger-pwa/',
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    viewport: { width: 390, height: 844 },
    serviceWorkers: 'allow',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node scripts/serve-dist.mjs',
    url: 'http://127.0.0.1:4174/ledger-pwa/',
    reuseExistingServer: true,
    timeout: 30_000,
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
