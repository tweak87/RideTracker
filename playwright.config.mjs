import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 45_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['line'],['html',{outputFolder:'playwright-report',open:'never'}]] : 'line',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: 'node scripts/web-e2e-server.mjs dist 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 20_000,
  },
  projects: [
    { name:'chromium-android', use:{...devices['Pixel 7'], browserName:'chromium'} },
    { name:'webkit-iphone', use:{...devices['iPhone 15'], browserName:'webkit'} },
    { name:'chromium-desktop', use:{...devices['Desktop Chrome'], browserName:'chromium'} },
  ],
});
