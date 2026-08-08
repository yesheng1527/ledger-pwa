import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: ['p0-guest-offline.spec.ts', 'p0-p1-core.spec.ts', 'formal-connected.spec.ts'],
  outputDir: '.superpowers/sdd/live-results',
  timeout: 90_000,
  workers: 1,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'https://yesheng1527.github.io/ledger-pwa/',
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    serviceWorkers: 'allow',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
