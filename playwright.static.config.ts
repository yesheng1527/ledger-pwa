import { defineConfig, devices } from '@playwright/test';

const baseURL = 'http://127.0.0.1:4174/ledger-pwa/';

export default defineConfig({
  testDir: './e2e',
  testMatch: 'static-recovery.spec.ts',
  outputDir: '.superpowers/sdd/static-recovery-results',
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node scripts/serve-dist.mjs',
    url: baseURL,
    reuseExistingServer: false,
    timeout: 30_000,
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
