import { defineConfig } from 'vitest/config';

export default defineConfig({
  build: {
    assetsInlineLimit: 0,
  },
  test: {
    css: true,
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
  },
});
