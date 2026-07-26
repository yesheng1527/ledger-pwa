import { defineConfig, devices } from '@playwright/test';

const baseURL = 'http://127.0.0.1:5173/ledger-pwa/';

export default defineConfig({
  testDir: './e2e',
  testMatch: 'candidate-home-transactions.spec.ts',
  outputDir: '.superpowers/sdd/candidate-playwright-results',
  snapshotPathTemplate: '.superpowers/sdd/home-transactions-previews/{arg}{ext}',
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
  },
  webServer: {
    command: 'npm.cmd run dev -- --mode test-e2e --host 127.0.0.1 --port 5173 --strictPort',
    url: baseURL,
  },
});
