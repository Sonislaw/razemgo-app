import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './scripts/browser',
  workers: 1,
  timeout: 60000,
  expect: { timeout: 15000 },
  outputDir: '.expo/auth-web-results',
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:8085',
    viewport: { width: 390, height: 844 },
    locale: 'pl-PL',
    headless: true,
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node scripts/start-auth-qa.mjs',
    url: 'http://localhost:8085',
    timeout: 120000,
    reuseExistingServer: false,
  },
});
