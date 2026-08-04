import { defineConfig, devices } from '@playwright/test';

const baseURL = 'http://127.0.0.1:5173/ledger-pwa/';

export default defineConfig({
  testDir: './e2e',
  testMatch: 'candidate-seabreeze-phase-1.spec.ts',
  outputDir: '.superpowers/sdd/seabreeze-phase-1-playwright-results',
  snapshotPathTemplate: '.superpowers/sdd/seabreeze-phase-1-previews/{arg}{ext}',
  expect: {
    toHaveScreenshot: {
      animations: 'disabled',
    },
  },
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    reducedMotion: 'no-preference',
  },
  webServer: {
    command: 'npm.cmd run dev -- --mode test-e2e --host 127.0.0.1 --port 5173 --strictPort',
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
